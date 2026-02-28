// ──────────────────────────────────────────────────────────────
// Growth OS — Ad Diagnosis Rules Engine
// Pure functions that evaluate Meta ad health and return diagnoses.
// Pattern mirrors alerts.ts: evaluateX(input): Result[]
// ──────────────────────────────────────────────────────────────

export type DiagnosisActionType =
  | 'GENERATE_COPY_VARIANTS'
  | 'PAUSE_AD'
  | 'REACTIVATE_AD'
  | 'INCREASE_BUDGET'
  | 'DECREASE_BUDGET'
  | 'REFRESH_CREATIVE'
  | 'NONE';

export type DiagnosisSeverityLevel = 'CRITICAL' | 'WARNING' | 'INFO';

export interface DiagnosisRuleInput {
  adId: string;
  adName: string;
  status: string;   // ACTIVE, PAUSED, DELETED, ARCHIVED
  createdAt: Date;   // ad creation date (for learning phase)

  // 7d metrics (current window)
  spend7d: number;
  impressions7d: number;
  clicks7d: number;
  conversions7d: number;
  revenue7d: number;
  roas7d: number | null;
  ctr7d: number | null;
  cpc7d: number | null;
  frequency7d: number | null;

  // 14d metrics (previous window for trend comparison)
  spend14d: number;
  impressions14d: number;
  clicks14d: number;
  conversions14d: number;
  revenue14d: number;
  roas14d: number | null;
  ctr14d: number | null;
  cpc14d: number | null;
  frequency14d: number | null;

  // Ad set context (for budget rules)
  adSetDailyBudget: number | null;
}

export interface DiagnosisResult {
  ruleId: string;
  severity: DiagnosisSeverityLevel;
  title: string;
  message: string;
  actionType: DiagnosisActionType;
  suggestedValue: Record<string, unknown> | null;
}

// ── Rule Definitions ─────────────────────────────────────────

/**
 * Rule 7: Learning Phase (checked FIRST — blocks all other rules)
 * Trigger: ad age < 48h AND impressions < 500
 * Both conditions must be true — an ad with real data (500+ impressions)
 * is past learning regardless of createdAt, and a new ad with enough
 * impressions has already gathered sufficient signal.
 */
function evaluateLearningPhase(input: DiagnosisRuleInput, now: Date): DiagnosisResult | null {
  // Learning phase only applies to ACTIVE ads — paused/archived ads aren't accumulating data
  if (input.status !== 'ACTIVE') return null;

  const ageMs = now.getTime() - input.createdAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const isNew = ageHours < 48;
  const lowImpressions = input.impressions7d < 500;

  // Both must be true: new AND low impressions
  if (isNew && lowImpressions) {
    return {
      ruleId: 'learning_phase',
      severity: 'INFO',
      title: 'Ad in Learning Phase',
      message: `${input.adName}: Ad is ${Math.round(ageHours)}h old with only ${input.impressions7d} impressions. Wait for more data before making changes.`,
      actionType: 'NONE',
      suggestedValue: null,
    };
  }
  return null;
}

/**
 * Rule 1: Creative Fatigue
 * Trigger: frequency > 4 AND CTR dropped > 20% (7d vs 14d)
 */
function evaluateCreativeFatigue(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.frequency7d === null || input.frequency7d <= 4) return null;
  if (input.ctr7d === null || input.ctr14d === null || input.ctr14d === 0) return null;

  const ctrDrop = (input.ctr14d - input.ctr7d) / input.ctr14d;
  if (ctrDrop <= 0.20) return null;

  return {
    ruleId: 'creative_fatigue',
    severity: 'WARNING',
    title: 'Creative Fatigue Detected',
    message: `${input.adName}: Frequency at ${input.frequency7d.toFixed(1)}x and CTR dropped ${(ctrDrop * 100).toFixed(0)}% (${(input.ctr14d * 100).toFixed(2)}% → ${(input.ctr7d * 100).toFixed(2)}%). Audience is seeing this ad too often with declining engagement.`,
    actionType: 'GENERATE_COPY_VARIANTS',
    suggestedValue: { currentFrequency: input.frequency7d, ctrDrop: Math.round(ctrDrop * 100) },
  };
}

/**
 * Rule 2: Negative ROAS
 * Trigger: ROAS < 1.0 AND spend > $50 (7d)
 */
function evaluateNegativeRoas(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.roas7d === null || input.roas7d >= 1.0) return null;
  if (input.spend7d <= 50) return null;

  return {
    ruleId: 'negative_roas',
    severity: 'CRITICAL',
    title: 'Negative ROAS — Losing Money',
    message: `${input.adName}: ROAS is ${input.roas7d.toFixed(2)}x on $${input.spend7d.toFixed(0)} spend (7d). This ad is unprofitable and burning budget.`,
    actionType: 'PAUSE_AD',
    suggestedValue: { currentRoas: input.roas7d, spend7d: input.spend7d },
  };
}

/**
 * Rule 3: Winner Not Scaled
 * Trigger: ROAS > 3.0 AND frequency < 2.0 AND budget has headroom
 * When adSetDailyBudget is null (lifetime budget, campaign-level budget),
 * we estimate daily spend from spend7d / 7 to still surface the opportunity.
 */
function evaluateWinnerNotScaled(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.roas7d === null || input.roas7d <= 3.0) return null;
  if (input.frequency7d === null || input.frequency7d >= 2.0) return null;

  // If we know the daily budget and it's already high ($200+), no scaling needed
  if (input.adSetDailyBudget !== null && input.adSetDailyBudget >= 200) return null;

  if (input.adSetDailyBudget !== null) {
    // Known budget path — suggest concrete 50% increase
    const suggestedBudget = Math.round(input.adSetDailyBudget * 1.5);
    return {
      ruleId: 'winner_not_scaled',
      severity: 'INFO',
      title: 'High-Performing Ad — Scale Opportunity',
      message: `${input.adName}: ROAS at ${input.roas7d.toFixed(2)}x with low frequency (${input.frequency7d.toFixed(1)}x). There's headroom to scale this ad set from $${input.adSetDailyBudget}/day to $${suggestedBudget}/day.`,
      actionType: 'INCREASE_BUDGET',
      suggestedValue: { currentBudget: input.adSetDailyBudget, suggestedBudget, currentRoas: input.roas7d },
    };
  }

  // No daily budget set — estimate from 7d spend
  const estimatedDaily = Math.round(input.spend7d / 7);
  const suggestedDaily = Math.round(estimatedDaily * 1.5);
  return {
    ruleId: 'winner_not_scaled',
    severity: 'INFO',
    title: 'High-Performing Ad — Scale Opportunity',
    message: `${input.adName}: ROAS at ${input.roas7d.toFixed(2)}x with low frequency (${input.frequency7d.toFixed(1)}x). Currently spending ~$${estimatedDaily}/day — consider increasing to ~$${suggestedDaily}/day to capture more conversions.`,
    actionType: 'INCREASE_BUDGET',
    suggestedValue: { estimatedDailySpend: estimatedDaily, suggestedBudget: suggestedDaily, currentRoas: input.roas7d },
  };
}

/**
 * Rule 4: Wasted Budget
 * Trigger: spend > $100 AND conversions < 2 (7d)
 */
function evaluateWastedBudget(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.spend7d <= 100) return null;
  if (input.conversions7d >= 2) return null;
  // Don't flag ads with strong ROAS — even with few conversions, they're profitable
  if (input.roas7d !== null && input.roas7d > 2.0) return null;

  return {
    ruleId: 'wasted_budget',
    severity: 'WARNING',
    title: 'Budget Wasted — No Conversions',
    message: `${input.adName}: Spent $${input.spend7d.toFixed(0)} in 7 days with only ${input.conversions7d} conversion(s). Consider pausing and reallocating budget to better-performing ads.`,
    actionType: 'PAUSE_AD',
    suggestedValue: { spend7d: input.spend7d, conversions7d: input.conversions7d },
  };
}

/**
 * Rule 5: Low CTR
 * Trigger: CTR < 0.8% AND impressions > 1000
 */
function evaluateLowCtr(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.ctr7d === null) return null;
  if (input.ctr7d >= 0.008) return null; // 0.8% as decimal
  if (input.impressions7d <= 1000) return null;

  return {
    ruleId: 'low_ctr',
    severity: 'WARNING',
    title: 'Low Click-Through Rate',
    message: `${input.adName}: CTR at ${(input.ctr7d * 100).toFixed(2)}% on ${input.impressions7d.toLocaleString()} impressions. The creative isn't resonating — consider new copy variants.`,
    actionType: 'GENERATE_COPY_VARIANTS',
    suggestedValue: { currentCtr: input.ctr7d, impressions7d: input.impressions7d },
  };
}

/**
 * Rule 6: Click No Buy (high CTR but low conversion)
 * Trigger: CTR > 2.0% AND conversion rate < 0.5%
 */
function evaluateClickNoBuy(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.ctr7d === null || input.ctr7d <= 0.02) return null; // 2.0% as decimal
  if (input.clicks7d === 0) return null;

  const conversionRate = input.conversions7d / input.clicks7d;
  if (conversionRate >= 0.005) return null; // 0.5%

  return {
    ruleId: 'click_no_buy',
    severity: 'WARNING',
    title: 'High Clicks, Low Conversions',
    message: `${input.adName}: CTR is strong at ${(input.ctr7d * 100).toFixed(2)}% but conversion rate is only ${(conversionRate * 100).toFixed(2)}%. The ad attracts clicks but the landing page or offer isn't converting. Refresh the creative to better align expectations.`,
    actionType: 'REFRESH_CREATIVE',
    suggestedValue: { currentCtr: input.ctr7d, conversionRate, clicks7d: input.clicks7d, conversions7d: input.conversions7d },
  };
}

/**
 * Rule 8: Paused Positive (hidden winner)
 * Trigger: status = PAUSED AND previous ROAS > 2.0
 */
function evaluatePausedPositive(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'PAUSED') return null;
  // Use 14d metrics as the "previous" metrics from when ad was active
  if (input.roas14d === null || input.roas14d <= 2.0) return null;
  // Only suggest reactivation if it had meaningful spend
  if (input.spend14d <= 30) return null;

  return {
    ruleId: 'paused_positive',
    severity: 'INFO',
    title: 'Paused Ad With Strong Performance',
    message: `${input.adName}: This ad was paused but had ${input.roas14d.toFixed(2)}x ROAS on $${input.spend14d.toFixed(0)} spend. Consider reactivating it.`,
    actionType: 'REACTIVATE_AD',
    suggestedValue: { previousRoas: input.roas14d, previousSpend: input.spend14d },
  };
}

/**
 * Rule 9: Top Performer (positive signal — double down)
 * Trigger: ROAS ≥ 2.0 AND spend ≥ $100 AND frequency < 3.0
 * Does NOT fire when winner_not_scaled would fire (ROAS > 3.0 + freq < 2.0)
 * to avoid duplicate positive signals. This rule catches the "good but not
 * amazing" performers that still deserve more budget.
 */
function evaluateTopPerformer(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.roas7d === null || input.roas7d < 2.0) return null;
  if (input.spend7d < 100) return null;
  if (input.frequency7d !== null && input.frequency7d >= 3.0) return null;

  // Skip if winner_not_scaled would fire (avoids overlap)
  if (input.roas7d > 3.0 && (input.frequency7d === null || input.frequency7d < 2.0)) return null;

  const roasImproving = input.roas14d !== null && input.roas7d >= input.roas14d;
  const trend = roasImproving ? 'improving' : 'stable';

  return {
    ruleId: 'top_performer',
    severity: 'INFO',
    title: 'Top Performer — Double Down',
    message: `${input.adName}: ROAS at ${input.roas7d.toFixed(2)}x generating $${input.revenue7d.toFixed(0)} revenue on $${input.spend7d.toFixed(0)} spend this week${roasImproving ? ' (trending up)' : ''}. This ad is profitable — consider increasing spend to maximize returns.`,
    actionType: 'INCREASE_BUDGET',
    suggestedValue: { currentRoas: input.roas7d, revenue7d: input.revenue7d, spend7d: input.spend7d, trend },
  };
}

// ── Main Evaluator ───────────────────────────────────────────

/**
 * Evaluate all diagnosis rules for a single ad.
 * Rule 7 (learning phase) is checked first — if it fires, no other rules run.
 */
export function evaluateDiagnosisRules(
  input: DiagnosisRuleInput,
  now?: Date,
): DiagnosisResult[] {
  const referenceDate = now ?? new Date();

  // Rule 7 gates everything — if ad is in learning phase, return only that
  const learning = evaluateLearningPhase(input, referenceDate);
  if (learning) {
    return [learning];
  }

  const results: DiagnosisResult[] = [];

  // Active ad rules (1-6)
  const fatigue = evaluateCreativeFatigue(input);
  if (fatigue) results.push(fatigue);

  const negRoas = evaluateNegativeRoas(input);
  if (negRoas) results.push(negRoas);

  const winner = evaluateWinnerNotScaled(input);
  if (winner) results.push(winner);

  const wasted = evaluateWastedBudget(input);
  if (wasted) results.push(wasted);

  const lowCtr = evaluateLowCtr(input);
  if (lowCtr) results.push(lowCtr);

  const clickNoBuy = evaluateClickNoBuy(input);
  if (clickNoBuy) results.push(clickNoBuy);

  // Paused ad rule (8)
  const paused = evaluatePausedPositive(input);
  if (paused) results.push(paused);

  // Positive signal rules (9) — only if winner_not_scaled didn't fire
  if (!winner) {
    const topPerf = evaluateTopPerformer(input);
    if (topPerf) results.push(topPerf);
  }

  return results;
}
