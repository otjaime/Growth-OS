// ──────────────────────────────────────────────────────────────
// Growth OS — Hypothesis Creative Brief Generator
// Takes a CampaignHypothesis + Client and produces a complete
// CreativeBrief with copy variants, targeting, and budget.
// ──────────────────────────────────────────────────────────────

import type { CampaignHypothesis, Client, PrismaClient } from '@growth-os/database';
import type { ProductCopyVariant } from './product-copy-generator.js';
import { generatePsychDrivenCopy, CURRENCY_LANGUAGE_MAP } from './product-copy-generator.js';
import type { AdSetTargeting } from './meta-executor.js';
import { CURRENCY_COUNTRY_MAP } from './meta-executor.js';
import type { PsychTrigger, EmotionalState } from '@growth-os/etl';

export interface CreativeBrief {
  readonly copyVariants: ProductCopyVariant[];
  readonly targeting: AdSetTargeting;
  readonly dailyBudget: number;
  readonly totalBudget: number;
  readonly durationDays: number;
  readonly currency: string;
  readonly pixelId?: string;
  readonly linkUrl?: string;
  readonly imageHash?: string;
}

export async function generateHypothesisBrief(
  hypothesis: CampaignHypothesis,
  client: Client,
  db: PrismaClient,
): Promise<CreativeBrief> {
  // 1. Get currency from Meta credential metadata
  const credential = await db.connectorCredential.findFirst({
    where: { connectorType: 'meta', organizationId: client.organizationId },
  });

  let currency = 'USD';
  let pixelId: string | undefined;
  if (credential?.metadata) {
    const meta = credential.metadata as Record<string, unknown>;
    if (meta.currency) currency = String(meta.currency);
    if (meta.pixelId) pixelId = String(meta.pixelId);
  }

  // 2. Determine language and symbol from currency
  const langMap = CURRENCY_LANGUAGE_MAP[currency] ?? { language: 'en', symbol: '$', languageName: 'English' };

  // 3. Determine targeting country
  const country = CURRENCY_COUNTRY_MAP[currency] ?? 'US';

  // 4. Calculate daily budget
  const dailyBudget = hypothesis.budgetUSD / Math.max(hypothesis.durationDays, 1);

  // 5. Build PsychCopyInput from hypothesis data
  const copyInput = {
    productTitle: hypothesis.title,
    productType: hypothesis.creativeAngle || 'product',
    productDescription: hypothesis.triggerMechanism,
    avgPrice: 0, // Not applicable for hypothesis-driven copy
    margin: 0.5,
    repeatBuyerPct: 0,
    adFitnessScore: hypothesis.conviction * 20, // 1-5 → 20-100
    language: langMap.language,
    currencySymbol: langMap.symbol,
    brandName: client.name,
    targetAudience: hypothesis.audience,
    // Psychology-specific fields
    psychTrigger: hypothesis.trigger as unknown as PsychTrigger,
    awarenessLevel: hypothesis.awarenessLevel,
    emotionalState: (hypothesis.primaryEmotion || 'FRUSTRATED') as EmotionalState,
    primaryObjection: hypothesis.primaryObjection,
  };

  // 6. Generate copy variants using the psychology-driven generator
  const copyVariants = await generatePsychDrivenCopy(copyInput);

  // 7. Build targeting
  const targeting: AdSetTargeting = {
    countries: [country],
    ageMin: 18,
    ageMax: 65,
    advantagePlus: true, // Agency best practice
  };

  return {
    copyVariants,
    targeting,
    dailyBudget,
    totalBudget: hypothesis.budgetUSD,
    durationDays: hypothesis.durationDays,
    currency,
    pixelId,
  };
}
