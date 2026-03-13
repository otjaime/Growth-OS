// ──────────────────────────────────────────────────────────────
// Growth OS — Product Ad Copy Generator (Agency Grade)
// Generates 3-5 copy variants using proven DTC frameworks
// (PAS, Before/After/Bridge, FOMO, Social Proof, Value)
// for products being advertised for the first time.
// Uses getClient() from ai.ts — never creates its own instance.
// ──────────────────────────────────────────────────────────────

import { getClient, isAIConfigured, AI_MODEL } from './ai.js';
import { buildTriggerPromptSection } from './trigger-copy-patterns.js';
import type { PsychTrigger, AwarenessLevel, EmotionalState } from '@growth-os/etl';

export type CopyAngle = 'benefit' | 'pain_point' | 'urgency' | 'social_proof' | 'value';

export interface ProductCopyInput {
  productTitle: string;
  productType: string;
  productDescription: string | null;
  avgPrice: number;
  margin: number;
  repeatBuyerPct: number;
  adFitnessScore: number;
  /** ISO language code for copy generation (e.g., 'es', 'en', 'pt'). Defaults to 'en'. */
  language?: string;
  /** Currency symbol for price display (e.g., '$', '€'). Defaults to '$'. */
  currencySymbol?: string;
  // Brand context for agency-grade copy
  /** Store/brand name (e.g., "Mr Pork"). */
  brandName?: string;
  /** Brand voice and positioning (e.g., "Premium, artisanal, family BBQ"). */
  brandVoice?: string;
  /** Target audience description (e.g., "Chilean families who love premium meat"). */
  targetAudience?: string;
  /** Seasonal or campaign context (e.g., "BBQ season, summer grilling"). */
  seasonalContext?: string;
  /** Product tags from Shopify (e.g., ["wagyu", "premium", "gift"]). */
  productTags?: string[];
  /** Collections the product belongs to (e.g., ["BBQ Collection", "Premium Cuts"]). */
  collections?: string[];
}

/**
 * Map currency codes to language + currency symbol for copy generation.
 * When the ad account uses CLP, we generate Spanish copy with "$" symbol, etc.
 */
export const CURRENCY_LANGUAGE_MAP: Record<string, { language: string; symbol: string; languageName: string }> = {
  CLP: { language: 'es', symbol: '$', languageName: 'Spanish' },
  ARS: { language: 'es', symbol: '$', languageName: 'Spanish' },
  MXN: { language: 'es', symbol: '$', languageName: 'Spanish' },
  COP: { language: 'es', symbol: '$', languageName: 'Spanish' },
  PEN: { language: 'es', symbol: 'S/', languageName: 'Spanish' },
  BRL: { language: 'pt', symbol: 'R$', languageName: 'Portuguese' },
  EUR: { language: 'en', symbol: '€', languageName: 'English' },
  GBP: { language: 'en', symbol: '£', languageName: 'English' },
  USD: { language: 'en', symbol: '$', languageName: 'English' },
  CAD: { language: 'en', symbol: 'CA$', languageName: 'English' },
  AUD: { language: 'en', symbol: 'A$', languageName: 'English' },
  JPY: { language: 'ja', symbol: '¥', languageName: 'Japanese' },
  KRW: { language: 'ko', symbol: '₩', languageName: 'Korean' },
};

export interface ProductCopyVariant {
  angle: CopyAngle;
  headline: string;
  primaryText: string;
  description: string;
}

/**
 * Select which copy angles to generate based on product data.
 * Always includes benefit + pain_point. Adds social_proof, urgency, or value
 * based on repeat buyer rate, seasonal context, and price positioning.
 */
export function selectAngles(input: ProductCopyInput): CopyAngle[] {
  const angles: CopyAngle[] = ['benefit', 'pain_point'];

  // Social proof when product has strong repeat buyers — proves product-market fit
  if (input.repeatBuyerPct > 0.1) {
    angles.push('social_proof');
  }

  // Urgency when there's a seasonal hook or high fitness score
  if (input.seasonalContext || input.adFitnessScore >= 70) {
    angles.push('urgency');
  }

  // Value angle when product is premium (justify the price)
  if (input.avgPrice > 0 && input.margin > 0.3) {
    angles.push('value');
  }

  // Ensure at least 3, at most 5 angles
  if (angles.length < 3) {
    if (!angles.includes('urgency')) angles.push('urgency');
    if (angles.length < 3 && !angles.includes('value')) angles.push('value');
  }

  return angles.slice(0, 5);
}

/** Get human-readable language name from ISO code. */
function getLanguageName(lang: string): string {
  const names: Record<string, string> = {
    es: 'Spanish', pt: 'Portuguese', en: 'English', ja: 'Japanese',
    ko: 'Korean', fr: 'French', de: 'German', it: 'Italian',
  };
  return names[lang] ?? 'English';
}

function buildSystemPrompt(input: ProductCopyInput, angles: CopyAngle[]): string {
  const lang = input.language ?? 'en';
  const langName = getLanguageName(lang);

  const langInstruction = lang !== 'en'
    ? `\n\nCRITICAL LANGUAGE RULE: Write ALL copy (headlines, primary text, descriptions) in ${langName}. The target audience speaks ${langName} natively — write like a native speaker, NOT like a translation. Use natural ${langName} expressions, idioms, and phrasing.`
    : '';

  const brandContext = input.brandName
    ? `\nBRAND: ${input.brandName}${input.brandVoice ? ` — ${input.brandVoice}` : ''}`
    : '';

  const audienceContext = input.targetAudience
    ? `\nTARGET AUDIENCE: ${input.targetAudience}`
    : '';

  const seasonContext = input.seasonalContext
    ? `\nSEASON/CONTEXT: ${input.seasonalContext} — reference this naturally in urgency/benefit angles.`
    : '';

  const tagContext = input.productTags?.length
    ? `\nPRODUCT TAGS: ${input.productTags.join(', ')} — use these as creative hooks.`
    : '';

  const collectionContext = input.collections?.length
    ? `\nCOLLECTIONS: ${input.collections.join(', ')}`
    : '';

  // Build angle instructions dynamically
  const angleInstructions = angles.map((a, i) => {
    switch (a) {
      case 'benefit':
        return `${i + 1}. "benefit" → Before/After/Bridge framework. Show the transformation: what life looks like AFTER using this product. Lead with the outcome, not the feature.`;
      case 'pain_point':
        return `${i + 1}. "pain_point" → PAS framework (Problem → Agitate → Solve). Name the specific frustration the customer has RIGHT NOW. Make them feel seen, then present the product as the solution.`;
      case 'urgency':
        return `${i + 1}. "urgency" → FOMO + scarcity. Why buy NOW? ${input.seasonalContext ? `Use the "${input.seasonalContext}" context.` : 'Use limited availability, trending status, or seasonal timing.'} Never use fake urgency — ground it in a real reason.`;
      case 'social_proof':
        return `${i + 1}. "social_proof" → Testimonial-style hook. ${input.repeatBuyerPct > 0.1 ? `${(input.repeatBuyerPct * 100).toFixed(0)}% of buyers come back — use this stat.` : 'Reference customer satisfaction.'} Write the hook as if a real customer is recommending it.`;
      case 'value':
        return `${i + 1}. "value" → Price anchoring + quality justification. Frame the price as an investment. Compare to alternatives, highlight what makes it worth ${input.currencySymbol ?? '$'}${input.avgPrice.toFixed(0)}. Quality over quantity narrative.`;
    }
  }).join('\n');

  return `You are a top-performing DTC performance copywriter managing Meta (Facebook/Instagram) ads${input.brandName ? ` for ${input.brandName}` : ''}. You write ads that outperform agencies — scroll-stopping hooks, precise targeting, real conversion drivers.
${brandContext}${audienceContext}${seasonContext}${tagContext}${collectionContext}

Your task: Generate ${angles.length} ad copy variants for a product launch. Each variant uses a DIFFERENT persuasion framework.

META AD FORMAT RULES (mobile-first — 85% of impressions are mobile):
- Headline: MAX 40 characters. Appears BELOW the image in bold. Must be a clear, specific value proposition. Not clickbait.
- Primary text: First line is the HOOK — MAX 125 characters before Meta shows "...See More".
  Write 2-3 lines total. The hook MUST stop the scroll. Everything above the fold matters most.
- Description: MAX 30 characters. Appears next to the "Shop Now" CTA button. Reinforce urgency or trust (e.g., "Envío gratis", "Free shipping", "Limited edition").

PERSUASION FRAMEWORKS — use exactly one per variant:
${angleInstructions}

COPY RULES:
- Reference the ACTUAL product by name and specific attributes — never write generic copy.
- Each variant must feel like a completely DIFFERENT ad — different hook, different angle, different emotional trigger.
- One emoji MAX per variant. Use it strategically to draw the eye, not decoratively.
- Never ALL CAPS for entire words (brand names excepted).
- Write in second person ("tú"/"you") — speak directly to the customer.
- Be specific: "Tu próximo asado premium" is better than "Mejora tu vida".
- Include a concrete detail in every hook: price, stat, product feature, or seasonal reference.
${langInstruction}

Output ONLY valid JSON. No markdown, no code fences, no explanation. The JSON must be an array of exactly ${angles.length} objects with keys: angle, headline, primaryText, description.`;
}

/** Demo fallback copy by language. */
const DEMO_COPY: Record<string, (input: ProductCopyInput) => ProductCopyVariant[]> = {
  es: (input) => [
    {
      angle: 'benefit',
      headline: `Tu ${input.productType} premium`,
      primaryText: `${input.productTitle} — el upgrade que tu mesa merece. Calidad que se nota en cada bocado.`,
      description: 'Comprar ahora',
    },
    {
      angle: 'pain_point',
      headline: `¿Cansado de lo mismo?`,
      primaryText: `Deja de conformarte con cortes mediocres. ${input.productTitle}: sabor real, entrega rápida.`,
      description: 'Pruébalo hoy',
    },
    {
      angle: 'urgency',
      headline: `${input.productTitle} — últimas unidades`,
      primaryText: `Nuestro más vendido no dura. Pedido hoy, en tu puerta mañana. 🔥`,
      description: 'Stock limitado',
    },
  ],
  pt: (input) => [
    {
      angle: 'benefit',
      headline: `O melhor em ${input.productType}`,
      primaryText: `${input.productTitle} — a melhoria que você merece. Qualidade premium, preço justo.`,
      description: 'Compre agora',
    },
    {
      angle: 'pain_point',
      headline: `Cansado do mesmo de sempre?`,
      primaryText: `Pare de se contentar. ${input.productTitle} resolve o que outros não conseguem.`,
      description: 'Experimente hoje',
    },
    {
      angle: 'urgency',
      headline: `${input.productTitle} está esgotando`,
      primaryText: `Nosso mais vendido não vai durar. Garanta o seu antes que acabe.`,
      description: 'Estoque limitado',
    },
  ],
};

/**
 * Generate copy variants for a product being advertised for the first time.
 * Returns 3-5 variants using proven DTC copywriting frameworks.
 * Falls back to hardcoded demo variants when AI is not configured.
 * Language auto-detected from ad account currency (e.g., CLP → Spanish).
 */
export async function generateProductCopy(input: ProductCopyInput): Promise<ProductCopyVariant[]> {
  const lang = input.language ?? 'en';
  const currencySymbol = input.currencySymbol ?? '$';
  const angles = selectAngles(input);

  if (!isAIConfigured()) {
    // Deterministic demo fallback — use localized version if available
    const localizedDemo = DEMO_COPY[lang];
    if (localizedDemo) {
      return localizedDemo(input);
    }
    // English fallback
    return [
      {
        angle: 'benefit',
        headline: `Get the best ${input.productType}`,
        primaryText: `${input.productTitle} — the upgrade your routine deserves. Premium quality, fair price.`,
        description: 'Shop now',
      },
      {
        angle: 'pain_point',
        headline: `Tired of bad ${input.productType}?`,
        primaryText: `Stop settling. ${input.productTitle} solves what others can't. Join happy customers.`,
        description: 'Try it today',
      },
      {
        angle: 'urgency',
        headline: `${input.productTitle} is selling fast`,
        primaryText: `Our best-seller won't last. Get yours before it's gone — free shipping this week.`,
        description: 'Limited stock',
      },
    ];
  }

  const ai = getClient();

  // Build rich product context for the AI
  const contextLines: string[] = [
    `- Name: ${input.productTitle}`,
    `- Category: ${input.productType}`,
    `- Price: ${currencySymbol}${input.avgPrice.toFixed(0)}`,
    `- Description: ${input.productDescription ?? '(no description available)'}`,
    `- Margin: ${(input.margin * 100).toFixed(0)}%`,
    `- Ad Fitness Score: ${input.adFitnessScore.toFixed(0)}/100`,
  ];

  if (input.repeatBuyerPct > 0.1) {
    contextLines.push(`- Repeat buyer rate: ${(input.repeatBuyerPct * 100).toFixed(0)}% — customers love this product`);
  }
  if (input.productTags?.length) {
    contextLines.push(`- Tags: ${input.productTags.join(', ')}`);
  }
  if (input.collections?.length) {
    contextLines.push(`- Collections: ${input.collections.join(', ')}`);
  }
  if (input.seasonalContext) {
    contextLines.push(`- Campaign context: ${input.seasonalContext}`);
  }

  const langNote = lang !== 'en'
    ? `\n\nIMPORTANT: Write ALL ad copy in ${getLanguageName(lang)}. The target market speaks ${getLanguageName(lang)} natively.`
    : '';

  const angleList = angles.map((a) => `"${a}"`).join(', ');

  const userPrompt = `Product to advertise:
${contextLines.join('\n')}
${langNote}

This is the product's FIRST ad campaign. Generate exactly ${angles.length} copy variants using these angles: ${angleList}. Each variant must use a different persuasion framework as specified. Output as JSON array.`;

  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.7,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: buildSystemPrompt(input, angles) },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '[]';

  let parsed: unknown;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse AI copy response as JSON: ${raw.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error(`Expected ${angles.length} copy variants, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`);
  }

  return (parsed as Record<string, string>[]).map((v) => ({
    angle: v.angle as CopyAngle,
    headline: (v.headline ?? '').slice(0, 40),
    primaryText: v.primaryText ?? '',
    description: (v.description ?? '').slice(0, 30),
  }));
}

// ──────────────────────────────────────────────────────────────
// Psychology-Driven Copy Generation
// Uses trigger-specific implementation patterns instead of
// generic angle frameworks (PAS, Before/After, FOMO).
// ──────────────────────────────────────────────────────────────

export interface PsychCopyInput extends ProductCopyInput {
  readonly psychTrigger: PsychTrigger;
  readonly secondaryTrigger?: PsychTrigger;
  readonly awarenessLevel: AwarenessLevel;
  readonly emotionalState: EmotionalState;
  readonly primaryObjection: string;
}

/**
 * Generate copy variants driven by a specific psychological trigger.
 * Produces 3 variants:
 *   - Variants 1-2: primary trigger only
 *   - Variant 3: primary + secondary trigger combined
 * All variants address the stated primary objection.
 *
 * Falls back to demo copy when AI is not configured.
 */
export async function generatePsychDrivenCopy(input: PsychCopyInput): Promise<ProductCopyVariant[]> {
  const lang = input.language ?? 'en';
  const currencySymbol = input.currencySymbol ?? '$';

  if (!isAIConfigured()) {
    // Deterministic fallback — reuse the locale-appropriate demo copy
    const localizedDemo = DEMO_COPY[lang];
    if (localizedDemo) return localizedDemo(input);
    return [
      {
        angle: 'benefit',
        headline: `Get the best ${input.productType}`,
        primaryText: `${input.productTitle} — the upgrade your routine deserves. Premium quality, fair price.`,
        description: 'Shop now',
      },
      {
        angle: 'pain_point',
        headline: `Tired of bad ${input.productType}?`,
        primaryText: `Stop settling. ${input.productTitle} solves what others can't.`,
        description: 'Try it today',
      },
      {
        angle: 'urgency',
        headline: `${input.productTitle} is selling fast`,
        primaryText: `Our best-seller won't last. Get yours before it's gone.`,
        description: 'Limited stock',
      },
    ];
  }

  const ai = getClient();
  const langName = getLanguageName(lang);

  const langInstruction = lang !== 'en'
    ? `\n\nCRITICAL LANGUAGE RULE: Write ALL copy in ${langName}. The target audience speaks ${langName} natively — write like a native speaker, NOT like a translation.`
    : '';

  const brandContext = input.brandName
    ? `\nBRAND: ${input.brandName}${input.brandVoice ? ` — ${input.brandVoice}` : ''}`
    : '';

  const audienceContext = input.targetAudience
    ? `\nTARGET AUDIENCE: ${input.targetAudience}`
    : '';

  // Build the trigger-specific prompt section
  const triggerSection = buildTriggerPromptSection(
    input.psychTrigger,
    input.secondaryTrigger,
    input.awarenessLevel,
    input.emotionalState,
    input.primaryObjection,
  );

  const systemPrompt = `You are a top-performing DTC performance copywriter who uses behavioral psychology to write ads that convert. You don't just write copy — you engineer specific psychological responses.
${brandContext}${audienceContext}

META AD FORMAT RULES (mobile-first):
- Headline: MAX 40 characters. Clear, specific value prop. Not clickbait.
- Primary text: Hook in first 125 characters (before "...See More"). 2-3 lines total.
- Description: MAX 30 characters. Reinforces urgency or trust.

${triggerSection}

COPY RULES:
- Reference the ACTUAL product by name — never generic copy.
- Each variant must feel like a DIFFERENT execution of the trigger — same mechanism, different creative expression.
- One emoji MAX per variant.
- Write in second person ("tú"/"you") — speak directly to the customer.
- Be specific with every hook: price, stat, product feature, or concrete detail.
${langInstruction}

Output ONLY valid JSON. No markdown, no code fences. Array of exactly 3 objects with keys: angle, headline, primaryText, description.
The "angle" field should describe the trigger implementation (e.g., "loss_aversion_cost", "loss_aversion_time", "loss_aversion_combined").`;

  const contextLines: string[] = [
    `- Name: ${input.productTitle}`,
    `- Category: ${input.productType}`,
    `- Price: ${currencySymbol}${input.avgPrice.toFixed(0)}`,
    `- Description: ${input.productDescription ?? '(no description)'}`,
  ];
  if (input.repeatBuyerPct > 0.1) {
    contextLines.push(`- ${(input.repeatBuyerPct * 100).toFixed(0)}% repeat buyer rate`);
  }
  if (input.productTags?.length) {
    contextLines.push(`- Tags: ${input.productTags.join(', ')}`);
  }

  const userPrompt = `Product:
${contextLines.join('\n')}

Audience objection to address: "${input.primaryObjection}"
Trigger to use: ${input.psychTrigger}${input.secondaryTrigger ? ` (combine with ${input.secondaryTrigger} in variant 3)` : ''}

Generate 3 psychology-driven ad copy variants. Output as JSON array.`;

  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.7,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '[]';

  let parsed: unknown;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse AI psych copy response: ${raw.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error(`Expected 3 psych copy variants, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`);
  }

  return (parsed as Record<string, string>[]).map((v) => ({
    angle: (v.angle ?? 'benefit') as CopyAngle,
    headline: (v.headline ?? '').slice(0, 40),
    primaryText: v.primaryText ?? '',
    description: (v.description ?? '').slice(0, 30),
  }));
}
