import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  isAIConfigured: vi.fn(),
  getClient: vi.fn(),
  AI_MODEL: 'gpt-4o-mini',
  mockFetch: vi.fn(),
}));

vi.mock('./ai.js', () => ({
  isAIConfigured: mocks.isAIConfigured,
  getClient: mocks.getClient,
  AI_MODEL: mocks.AI_MODEL,
}));

vi.stubGlobal('fetch', mocks.mockFetch);

import { prepareAdImage, uploadImageToMeta, generateProductImage } from './ad-image-manager.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('prepareAdImage', () => {
  it('returns demo result with deterministic data when no credentials provided', async () => {
    const result = await prepareAdImage(
      null, // no accessToken
      null, // no adAccountId
      'https://example.com/product.jpg',
      'Serum X',
      'beauty',
      'A great serum',
      false,
    );

    expect(result.success).toBe(true);
    expect(result.source).toBe('demo');
    expect(result.imageHash).toBe('demo_hash');
    expect(result.imageUrl).toBe('https://example.com/product.jpg');
  });

  it('returns demo result with fallback unsplash URL when no product image', async () => {
    const result = await prepareAdImage(
      null,
      null,
      null, // no product image
      'Widget',
      'gadget',
      null,
      false,
    );

    expect(result.success).toBe(true);
    expect(result.source).toBe('demo');
    expect(result.imageUrl).toContain('unsplash.com');
  });

  it('returns error when no product image and AI images disabled (live mode)', async () => {
    const result = await prepareAdImage(
      'tok_abc',
      'act_123',
      null, // no product image
      'Widget',
      'gadget',
      null,
      false, // AI images disabled
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No product image available');
  });
});

describe('uploadImageToMeta', () => {
  it('downloads product image then uploads to Meta, returning image hash', async () => {
    // Mock image download
    mocks.mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    // Mock Meta upload
    mocks.mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        images: {
          abc123: { hash: 'abc123', url: 'https://meta.com/img/abc123.jpg' },
        },
      }),
    });

    const result = await uploadImageToMeta(
      'tok_abc',
      'act_123',
      'https://example.com/product.jpg',
    );

    expect(result.success).toBe(true);
    expect(result.imageHash).toBe('abc123');
    expect(result.source).toBe('shopify');
    expect(mocks.mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns error when image download fails', async () => {
    mocks.mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await uploadImageToMeta(
      'tok_abc',
      'act_123',
      'https://example.com/missing.jpg',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to download image');
    expect(result.error).toContain('404');
  });

  it('returns error when Meta upload fails', async () => {
    // Image download succeeds
    mocks.mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    // Meta upload fails
    mocks.mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({
        error: { message: 'Invalid image format' },
      }),
    });

    const result = await uploadImageToMeta(
      'tok_abc',
      'act_123',
      'https://example.com/product.jpg',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Meta image upload failed');
  });

  it('sends base64-encoded image as form-urlencoded body', async () => {
    // Image download
    mocks.mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(10),
    });

    // Meta upload
    mocks.mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        images: { hash1: { hash: 'hash1', url: 'https://meta.com/img.jpg' } },
      }),
    });

    await uploadImageToMeta('tok_abc', 'act_123', 'https://example.com/img.jpg');

    // Verify the second fetch call (Meta upload) has form-urlencoded content type
    const metaCall = mocks.mockFetch.mock.calls[1]!;
    expect(metaCall[0]).toContain('act_act_123/adimages');
    expect(metaCall[1].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    // Body should contain access_token and bytes
    const body = metaCall[1].body as string;
    expect(body).toContain('access_token=tok_abc');
    expect(body).toContain('bytes=');
  });
});

describe('generateProductImage', () => {
  it('returns error when AI is not configured', async () => {
    mocks.isAIConfigured.mockReturnValue(false);

    const result = await generateProductImage('Widget', 'gadget', null);

    expect(result.success).toBe(false);
    expect(result.error).toContain('AI not configured');
  });

  it('calls OpenAI images.generate with correct prompt when AI is configured', async () => {
    mocks.isAIConfigured.mockReturnValue(true);

    const mockGenerate = vi.fn().mockResolvedValueOnce({
      data: [{ url: 'https://oai.com/generated-image.png' }],
    });
    mocks.getClient.mockReturnValue({
      images: { generate: mockGenerate },
    });

    const result = await generateProductImage('Glow Serum', 'beauty', 'Vitamin C serum');

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe('https://oai.com/generated-image.png');
    expect(mockGenerate).toHaveBeenCalledOnce();
    const prompt = mockGenerate.mock.calls[0]![0].prompt;
    expect(prompt).toContain('Glow Serum');
    expect(prompt).toContain('beauty');
  });
});
