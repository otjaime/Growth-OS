// ──────────────────────────────────────────────────────────────
// Growth OS — Ad Image Manager
// Handles image preparation for proactive ad creation:
//   1. Primary: download product image from Shopify URL → upload to Meta
//   2. Secondary: generate image via OpenAI → upload to Meta
// ──────────────────────────────────────────────────────────────

import { getClient, isAIConfigured, AI_MODEL } from './ai.js';

const META_API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface ImageUploadResult {
  success: boolean;
  imageHash?: string;
  imageUrl?: string;
  source: 'shopify' | 'ai_generated' | 'demo';
  error?: string;
}

/**
 * Upload an image to Meta ad account media library from a URL.
 * Returns the image_hash for use in ad creatives.
 */
export async function uploadImageToMeta(
  accessToken: string,
  adAccountId: string,
  imageUrl: string,
): Promise<ImageUploadResult> {
  try {
    // Download image
    const imageResp = await fetch(imageUrl);
    if (!imageResp.ok) {
      return { success: false, source: 'shopify', error: `Failed to download image: HTTP ${imageResp.status}` };
    }

    const imageBuffer = Buffer.from(await imageResp.arrayBuffer());
    const base64 = imageBuffer.toString('base64');

    // Upload to Meta
    const formData = new URLSearchParams();
    formData.append('access_token', accessToken);
    formData.append('bytes', base64);

    const uploadResp = await fetch(`${META_BASE}/act_${adAccountId}/adimages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const uploadBody = await uploadResp.json() as {
      images?: Record<string, { hash?: string; url?: string }>;
      error?: { message?: string };
    };

    if (!uploadResp.ok || uploadBody.error) {
      return {
        success: false,
        source: 'shopify',
        error: `Meta image upload failed: ${uploadBody.error?.message ?? uploadResp.statusText}`,
      };
    }

    // Meta returns { images: { [hash]: { hash, url } } }
    const images = uploadBody.images;
    if (!images) {
      return { success: false, source: 'shopify', error: 'No images returned from Meta' };
    }

    const firstImage = Object.values(images)[0];
    if (!firstImage?.hash) {
      return { success: false, source: 'shopify', error: 'No image hash returned from Meta' };
    }

    return {
      success: true,
      imageHash: firstImage.hash,
      imageUrl: firstImage.url,
      source: 'shopify',
    };
  } catch (err) {
    return {
      success: false,
      source: 'shopify',
      error: `Image upload error: ${(err as Error).message}`,
    };
  }
}

/**
 * Generate a product ad image using OpenAI's image API.
 * Only called when useAIImages is enabled and no product image exists.
 */
export async function generateProductImage(
  productTitle: string,
  productType: string,
  productDescription: string | null,
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  if (!isAIConfigured()) {
    return { success: false, error: 'AI not configured — set OPENAI_API_KEY' };
  }

  const ai = getClient();

  const prompt = `Professional product photograph of "${productTitle}" (${productType}). Clean white background, studio lighting, high-quality commercial product shot suitable for a Facebook/Instagram ad. Photorealistic, no text or watermarks.${
    productDescription ? ` Product: ${productDescription.slice(0, 100)}` : ''
  }`;

  try {
    const response = await ai.images.generate({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      return { success: false, error: 'No image URL returned from OpenAI' };
    }

    return { success: true, imageUrl };
  } catch (err) {
    return { success: false, error: `Image generation failed: ${(err as Error).message}` };
  }
}

/**
 * Prepare an image for a proactive ad.
 * Strategy:
 *   1. If product has a Shopify image → upload directly to Meta
 *   2. If useAIImages is on and no image → generate via OpenAI → upload to Meta
 *   3. Otherwise → return demo placeholder
 */
export async function prepareAdImage(
  accessToken: string | null,
  adAccountId: string | null,
  productImageUrl: string | null,
  productTitle: string,
  productType: string,
  productDescription: string | null,
  useAIImages: boolean,
): Promise<ImageUploadResult> {
  // Demo mode: no Meta credentials
  if (!accessToken || !adAccountId) {
    return {
      success: true,
      imageHash: 'demo_hash',
      imageUrl: productImageUrl ?? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
      source: 'demo',
    };
  }

  // Path 1: Existing product image
  if (productImageUrl) {
    return uploadImageToMeta(accessToken, adAccountId, productImageUrl);
  }

  // Path 2: AI-generated image (opt-in)
  if (useAIImages) {
    const generated = await generateProductImage(productTitle, productType, productDescription);
    if (generated.success && generated.imageUrl) {
      return uploadImageToMeta(accessToken, adAccountId, generated.imageUrl);
    }
    return { success: false, source: 'ai_generated', error: generated.error };
  }

  // Path 3: No image available
  return { success: false, source: 'shopify', error: 'No product image available and AI images not enabled' };
}
