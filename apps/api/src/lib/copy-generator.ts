// ──────────────────────────────────────────────────────────────
// Growth OS — AI Ad Copy Generator
// Generates 3 copy variants (benefit, pain_point, urgency)
// using OpenAI. Uses getClient() from ai.ts — never creates
// its own OpenAI instance.
// ──────────────────────────────────────────────────────────────

import { getClient, isAIConfigured, AI_MODEL } from './ai.js';

export interface CopyGeneratorInput {
  originalHeadline: string | null;
  originalPrimaryText: string | null;
  originalDescription: string | null;
  diagnosisRule: string;
  diagnosisMessage: string;
  adMetrics: {
    spend7d: number;
    roas7d: number | null;
    ctr7d: number | null;
    frequency7d: number | null;
    conversions7d: number;
  };
}

export interface GeneratedCopy {
  angle: 'benefit' | 'pain_point' | 'urgency';
  headline: string;
  primaryText: string;
  description: string;
}

const SYSTEM_PROMPT = `You are a senior performance copywriter for Meta (Facebook/Instagram) ads. You specialize in DTC ecommerce growth.

Your task: Generate 3 ad copy variants for a Meta ad that needs a creative refresh. Each variant uses a different persuasion angle.

Rules:
- Headline: MAX 40 characters. Short, punchy, scroll-stopping.
- Primary text: MAX 125 characters for the hook (first line). Can be up to 3 lines total but the hook must grab attention.
- Description: MAX 30 characters. CTA-supporting text.
- Never use ALL CAPS for entire words (except brand names).
- Never use more than one emoji per variant.
- Write in second person ("you", "your").
- Be specific, not generic. Reference the product/benefit concretely.
- Each angle must feel distinctly different — not just rewording the same message.

Angles:
1. "benefit" — Lead with the positive outcome/transformation the customer gets
2. "pain_point" — Lead with the problem/frustration the customer currently has
3. "urgency" — Lead with scarcity, time pressure, or FOMO

Output ONLY valid JSON. No markdown, no code fences, no explanation. The JSON must be an array of exactly 3 objects with keys: angle, headline, primaryText, description.`;

export async function generateCopyVariants(input: CopyGeneratorInput): Promise<GeneratedCopy[]> {
  if (!isAIConfigured()) {
    throw new Error('AI is not configured — set OPENAI_API_KEY to generate copy variants');
  }

  const ai = getClient();

  const metricsContext = [
    `Spend (7d): $${input.adMetrics.spend7d.toFixed(0)}`,
    input.adMetrics.roas7d !== null ? `ROAS: ${input.adMetrics.roas7d.toFixed(2)}x` : null,
    input.adMetrics.ctr7d !== null ? `CTR: ${(input.adMetrics.ctr7d * 100).toFixed(2)}%` : null,
    input.adMetrics.frequency7d !== null ? `Frequency: ${input.adMetrics.frequency7d.toFixed(1)}x` : null,
    `Conversions (7d): ${input.adMetrics.conversions7d}`,
  ].filter(Boolean).join(' | ');

  const userPrompt = `Current ad copy:
- Headline: ${input.originalHeadline ?? '(none)'}
- Primary text: ${input.originalPrimaryText ?? '(none)'}
- Description: ${input.originalDescription ?? '(none)'}

Diagnosis: ${input.diagnosisRule} — ${input.diagnosisMessage}

Performance: ${metricsContext}

Generate 3 fresh copy variants using the benefit, pain_point, and urgency angles. Output as JSON array.`;

  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? '[]';

  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse AI copy response as JSON: ${raw.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error(`Expected 3 copy variants, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`);
  }

  return (parsed as Record<string, string>[]).map((v) => ({
    angle: v.angle as GeneratedCopy['angle'],
    headline: (v.headline ?? '').slice(0, 40),
    primaryText: v.primaryText ?? '',
    description: (v.description ?? '').slice(0, 30),
  }));
}
