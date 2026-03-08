// ──────────────────────────────────────────────────────────────
// Growth OS — Product Ad Copy Generator
// Generates 3 copy variants (benefit, pain_point, urgency)
// for a product that has never been advertised before.
// Uses getClient() from ai.ts — never creates its own instance.
// ──────────────────────────────────────────────────────────────

import { getClient, isAIConfigured, AI_MODEL } from './ai.js';

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
  angle: 'benefit' | 'pain_point' | 'urgency';
  headline: string;
  primaryText: string;
  description: string;
}

function buildSystemPrompt(language: string): string {
  const langInstruction = language !== 'en'
    ? `\n\nCRITICAL: Write ALL copy (headlines, primary text, descriptions) in ${getLanguageName(language)}. The target audience speaks ${getLanguageName(language)} — do NOT write in English.`
    : '';

  return `You are a senior performance copywriter for Meta (Facebook/Instagram) ads. You specialize in DTC ecommerce product launches.

Your task: Generate 3 ad copy variants for a product that is being advertised for the first time. Each variant uses a different persuasion angle.

Rules:
- Headline: MAX 40 characters. Short, punchy, scroll-stopping.
- Primary text: MAX 125 characters for the hook (first line). Can be up to 3 lines total but the hook must grab attention.
- Description: MAX 30 characters. CTA-supporting text.
- Never use ALL CAPS for entire words (except brand names).
- Never use more than one emoji per variant.
- Write in second person ("you", "your" / "tú", "tu").
- Be specific to the product — reference actual features, materials, benefits.
- Each angle must feel distinctly different — not just rewording the same message.

Angles:
1. "benefit" — Lead with the positive outcome/transformation the customer gets
2. "pain_point" — Lead with the problem/frustration the customer currently has
3. "urgency" — Lead with scarcity, time pressure, or FOMO
${langInstruction}

Output ONLY valid JSON. No markdown, no code fences, no explanation. The JSON must be an array of exactly 3 objects with keys: angle, headline, primaryText, description.`;
}

/** Get human-readable language name from ISO code. */
function getLanguageName(lang: string): string {
  const names: Record<string, string> = {
    es: 'Spanish', pt: 'Portuguese', en: 'English', ja: 'Japanese',
    ko: 'Korean', fr: 'French', de: 'German', it: 'Italian',
  };
  return names[lang] ?? 'English';
}

/** Demo fallback copy by language. */
const DEMO_COPY: Record<string, (input: ProductCopyInput) => ProductCopyVariant[]> = {
  es: (input) => [
    {
      angle: 'benefit',
      headline: `Lo mejor en ${input.productType}`,
      primaryText: `${input.productTitle} — la mejora que mereces. Calidad premium, precio justo.`,
      description: 'Comprar ahora',
    },
    {
      angle: 'pain_point',
      headline: `¿Cansado de lo mismo?`,
      primaryText: `Deja de conformarte. ${input.productTitle} resuelve lo que otros no pueden.`,
      description: 'Pruébalo hoy',
    },
    {
      angle: 'urgency',
      headline: `${input.productTitle} se agota rápido`,
      primaryText: `Nuestro más vendido no durará. Consigue el tuyo antes de que se acabe.`,
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
 * Generate 3 copy variants for a product that has never been advertised.
 * Returns hardcoded demo variants when AI is not configured.
 * When `language` is provided (e.g., 'es' for Spanish), copy is generated in that language.
 */
export async function generateProductCopy(input: ProductCopyInput): Promise<ProductCopyVariant[]> {
  const lang = input.language ?? 'en';
  const currencySymbol = input.currencySymbol ?? '$';

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

  const repeatContext = input.repeatBuyerPct > 0.1
    ? `${(input.repeatBuyerPct * 100).toFixed(0)}% of buyers come back — strong product-market fit.`
    : '';

  const langNote = lang !== 'en'
    ? `\n\nIMPORTANT: Write ALL ad copy in ${getLanguageName(lang)}. The target market speaks ${getLanguageName(lang)}.`
    : '';

  const userPrompt = `Product to advertise:
- Name: ${input.productTitle}
- Category: ${input.productType}
- Price: ${currencySymbol}${input.avgPrice.toFixed(0)}
- Description: ${input.productDescription ?? '(no description available)'}
- Margin: ${(input.margin * 100).toFixed(0)}%
- Ad Fitness Score: ${input.adFitnessScore.toFixed(0)}/100
${repeatContext}${langNote}

This is the product's FIRST ad campaign. Generate 3 copy variants using the benefit, pain_point, and urgency angles. Output as JSON array.`;

  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: 'system', content: buildSystemPrompt(lang) },
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

  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error(`Expected 3 copy variants, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`);
  }

  return (parsed as Record<string, string>[]).map((v) => ({
    angle: v.angle as ProductCopyVariant['angle'],
    headline: (v.headline ?? '').slice(0, 40),
    primaryText: v.primaryText ?? '',
    description: (v.description ?? '').slice(0, 30),
  }));
}
