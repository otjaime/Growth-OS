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
  | 'DUPLICATE_AD_SET'
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

  // Optional: weekly ROAS averages for trend acceleration (Rule 13)
  // Sorted oldest→newest, each entry is avg ROAS for that week
  weeklyRoasAvgs?: readonly number[];

  // Optional: creative decay projections for predictive alert (Rule 14)
  decayRecommendation?: string;
  decayEstimatedDaysToBreakeven?: number | null;
}

export interface DiagnosisResult {
  ruleId: string;
  severity: DiagnosisSeverityLevel;
  title: string;
  message: string;
  actionType: DiagnosisActionType;
  suggestedValue: Record<string, unknown> | null;
  confidence: number; // 0-100
}

export interface DiagnosisRuleConfig {
  targetRoas?: number;              // default 3.0 — used in winner_not_scaled
  topPerformerRoas?: number;        // default 2.0 — used in top_performer
  maxFrequency?: number;            // default 4.0 — used in creative_fatigue
  minCtr?: number;                  // default 0.008 (0.8%) — used in low_ctr
  wastedSpendThreshold?: number;    // default $100 — used in wasted_budget (Phase 3.1)
  cpcSpikeThreshold?: number;       // default 0.30 (30%) — used in cost_spike (Phase 3.1)
}

// ── Rule Definitions ─────────────────────────────────────────

/** Calculate confidence score based on data quality factors. */
function computeConfidence(base: number, input: DiagnosisRuleInput): number {
  let score = base;
  // Penalize low impression count
  if (input.impressions7d < 500) score -= 30;
  else if (input.impressions7d < 1000) score -= 20;
  // Penalize high week-over-week variance
  if (input.roas7d !== null && input.roas14d !== null && input.roas14d > 0) {
    const variance = Math.abs(input.roas7d - input.roas14d) / input.roas14d;
    if (variance > 0.5) score -= 15;
  }
  return Math.max(0, Math.min(100, score));
}

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

  // Either condition triggers learning phase
  if (isNew || lowImpressions) {
    return {
      ruleId: 'learning_phase',
      severity: 'INFO',
      title: 'Ad in Learning Phase',
      message: `${input.adName}: Ad is ${Math.round(ageHours)}h old with only ${input.impressions7d} impressions. Wait for more data before making changes.`,
      actionType: 'NONE',
      suggestedValue: null,
      confidence: 50,
    };
  }
  return null;
}

/**
 * Rule 1: Creative Fatigue
 * Trigger: frequency > maxFrequency AND CTR dropped > 20% (7d vs 14d)
 */
function evaluateCreativeFatigue(input: DiagnosisRuleInput, config?: DiagnosisRuleConfig): DiagnosisResult | null {
  const maxFreq = config?.maxFrequency ?? 4;
  if (input.status !== 'ACTIVE') return null;
  if (input.frequency7d === null || input.frequency7d <= maxFreq) return null;
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
    confidence: computeConfidence(70, input),
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
    confidence: computeConfidence(90, input),
  };
}

/**
 * Rule 3: Winner Not Scaled
 * Trigger: ROAS > targetRoas AND frequency < 2.0 AND budget has headroom
 * When adSetDailyBudget is null (lifetime budget, campaign-level budget),
 * we estimate daily spend from spend7d / 7 to still surface the opportunity.
 */
function evaluateWinnerNotScaled(input: DiagnosisRuleInput, config?: DiagnosisRuleConfig): DiagnosisResult | null {
  const targetRoas = config?.targetRoas ?? 3.0;
  if (input.status !== 'ACTIVE') return null;
  if (input.roas7d === null || input.roas7d <= targetRoas) return null;
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
      confidence: computeConfidence(75, input),
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
    confidence: computeConfidence(75, input),
  };
}

/**
 * Rule 4: Wasted Budget
 * Trigger: spend > wastedSpendThreshold AND conversions < 2 (7d)
 * Phase 3.1: wastedSpendThreshold is now configurable via dynamic thresholds
 */
function evaluateWastedBudget(input: DiagnosisRuleInput, config?: DiagnosisRuleConfig): DiagnosisResult | null {
  const threshold = config?.wastedSpendThreshold ?? 100;
  if (input.status !== 'ACTIVE') return null;
  if (input.spend7d <= threshold) return null;
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
    confidence: computeConfidence(85, input),
  };
}

/**
 * Rule 5: Low CTR
 * Trigger: CTR < minCtr AND impressions > 1000
 */
function evaluateLowCtr(input: DiagnosisRuleInput, config?: DiagnosisRuleConfig): DiagnosisResult | null {
  const minCtr = config?.minCtr ?? 0.008; // 0.8% as decimal
  if (input.status !== 'ACTIVE') return null;
  if (input.ctr7d === null) return null;
  if (input.ctr7d >= minCtr) return null;
  if (input.impressions7d <= 1000) return null;

  return {
    ruleId: 'low_ctr',
    severity: 'WARNING',
    title: 'Low Click-Through Rate',
    message: `${input.adName}: CTR at ${(input.ctr7d * 100).toFixed(2)}% on ${input.impressions7d.toLocaleString()} impressions. The creative isn't resonating — consider new copy variants.`,
    actionType: 'GENERATE_COPY_VARIANTS',
    suggestedValue: { currentCtr: input.ctr7d, impressions7d: input.impressions7d },
    confidence: computeConfidence(65, input),
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
    confidence: computeConfidence(70, input),
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
    confidence: computeConfidence(60, input),
  };
}

/**
 * Rule 9: Top Performer (positive signal — double down)
 * Trigger: ROAS ≥ topPerformerRoas AND spend ≥ $100 AND frequency < 3.0
 * Does NOT fire when winner_not_scaled would fire (ROAS > targetRoas + freq < 2.0)
 * to avoid duplicate positive signals. This rule catches the "good but not
 * amazing" performers that still deserve more budget.
 */
function evaluateTopPerformer(input: DiagnosisRuleInput, config?: DiagnosisRuleConfig): DiagnosisResult | null {
  const topPerformerRoas = config?.topPerformerRoas ?? 2.0;
  const targetRoas = config?.targetRoas ?? 3.0;
  if (input.status !== 'ACTIVE') return null;
  if (input.roas7d === null || input.roas7d < topPerformerRoas) return null;
  if (input.spend7d < 100) return null;
  if (input.frequency7d !== null && input.frequency7d >= 3.0) return null;

  // Skip if winner_not_scaled would fire (avoids overlap)
  if (input.roas7d > targetRoas && (input.frequency7d === null || input.frequency7d < 2.0)) return null;

  const roasImproving = input.roas14d !== null && input.roas7d >= input.roas14d;
  const trend = roasImproving ? 'improving' : 'stable';

  const budgetSuggestion: Record<string, unknown> = { currentRoas: input.roas7d, revenue7d: input.revenue7d, spend7d: input.spend7d, trend };
  if (input.adSetDailyBudget !== null && input.adSetDailyBudget > 0) {
    // Suggest a % increase based on ROAS headroom: ROAS 2-3 → 20% increase, 3+ → 30%
    const pctIncrease = input.roas7d >= 3.0 ? 30 : 20;
    const newBudget = Math.round(input.adSetDailyBudget * (1 + pctIncrease / 100));
    budgetSuggestion.currentBudget = input.adSetDailyBudget;
    budgetSuggestion.newBudget = newBudget;
    budgetSuggestion.suggestedBudget = newBudget; // executor also checks this field
    budgetSuggestion.increasePct = pctIncrease;
  } else {
    // No daily budget known — estimate from 7d spend (same approach as winner_not_scaled)
    const estimatedDaily = Math.round(input.spend7d / 7);
    const pctIncrease = input.roas7d >= 3.0 ? 30 : 20;
    const suggestedBudget = Math.round(estimatedDaily * (1 + pctIncrease / 100));
    budgetSuggestion.estimatedDailySpend = estimatedDaily;
    budgetSuggestion.suggestedBudget = suggestedBudget;
    budgetSuggestion.newBudget = suggestedBudget;
    budgetSuggestion.increasePct = pctIncrease;
  }

  return {
    ruleId: 'top_performer',
    severity: 'INFO',
    title: 'Top Performer — Double Down',
    message: `${input.adName}: ROAS at ${input.roas7d.toFixed(2)}x generating $${input.revenue7d.toFixed(0)} revenue on $${input.spend7d.toFixed(0)} spend this week${roasImproving ? ' (trending up)' : ''}. This ad is profitable — consider increasing spend to maximize returns.`,
    actionType: 'INCREASE_BUDGET',
    suggestedValue: budgetSuggestion,
    confidence: computeConfidence(80, input),
  };
}

/**
 * Rule 10: Budget Pacing (under-delivery detection)
 * Trigger: status = ACTIVE AND adSetDailyBudget known AND spend7d / 7 < 50% of budget
 * Indicates under-delivery — the ad set isn't spending its full budget.
 */
function evaluateBudgetPacing(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.adSetDailyBudget === null || input.adSetDailyBudget <= 0) return null;

  const avgDailySpend = input.spend7d / 7;
  const pacing = avgDailySpend / input.adSetDailyBudget;
  if (pacing >= 0.5) return null;
  // Need minimum impressions to be meaningful
  if (input.impressions7d < 200) return null;

  return {
    ruleId: 'budget_pacing',
    severity: 'WARNING',
    title: 'Under-Delivering — Budget Not Fully Spent',
    message: `${input.adName}: Only spending ~$${avgDailySpend.toFixed(0)}/day of $${input.adSetDailyBudget.toFixed(0)}/day budget (${(pacing * 100).toFixed(0)}% pacing). The ad set is under-delivering — check audience size and bid strategy.`,
    actionType: 'NONE',
    suggestedValue: { avgDailySpend: Math.round(avgDailySpend), dailyBudget: input.adSetDailyBudget, pacing: Math.round(pacing * 100) },
    confidence: computeConfidence(75, input),
  };
}

/**
 * Rule 11: Audience Saturation
 * Trigger: frequency > 3.0 AND CTR declining (7d vs 14d) but not as severe as creative_fatigue
 * Different from creative_fatigue (freq>4 + CTR drop>20%): this catches earlier-stage saturation.
 */
function evaluateAudienceSaturation(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.frequency7d === null || input.frequency7d <= 3.0) return null;
  // Don't overlap with creative_fatigue (which requires freq>4 and CTR drop>20%)
  if (input.frequency7d > 4 && input.ctr7d !== null && input.ctr14d !== null && input.ctr14d > 0) {
    const ctrDrop = (input.ctr14d - input.ctr7d) / input.ctr14d;
    if (ctrDrop > 0.20) return null; // creative_fatigue will handle this
  }
  if (input.impressions7d < 1000) return null;

  return {
    ruleId: 'audience_saturation',
    severity: 'WARNING',
    title: 'Audience Saturation Risk',
    message: `${input.adName}: Frequency at ${input.frequency7d.toFixed(1)}x — audience is seeing this ad frequently. Consider refreshing creative or broadening targeting before performance declines.`,
    actionType: 'REFRESH_CREATIVE',
    suggestedValue: { currentFrequency: input.frequency7d },
    confidence: computeConfidence(65, input),
  };
}

/**
 * Rule 12: Cost Spike (CPC increase WoW)
 * Trigger: CPC increased > cpcSpikeThreshold (7d vs 14d) AND spend > $50
 * Phase 3.1: cpcSpikeThreshold is now configurable via dynamic thresholds
 */
function evaluateCostSpike(input: DiagnosisRuleInput, config?: DiagnosisRuleConfig): DiagnosisResult | null {
  const spikeThreshold = config?.cpcSpikeThreshold ?? 0.30;
  if (input.status !== 'ACTIVE') return null;
  if (input.cpc7d === null || input.cpc14d === null || input.cpc14d === 0) return null;
  if (input.spend7d <= 50) return null;

  const cpcIncrease = (input.cpc7d - input.cpc14d) / input.cpc14d;
  if (cpcIncrease <= spikeThreshold) return null;

  return {
    ruleId: 'cost_spike',
    severity: 'WARNING',
    title: 'Cost Per Click Spiking',
    message: `${input.adName}: CPC increased ${(cpcIncrease * 100).toFixed(0)}% ($${input.cpc14d.toFixed(2)} → $${input.cpc7d.toFixed(2)}). Rising costs indicate audience fatigue or increased competition. Consider reducing budget until costs stabilize.`,
    actionType: 'DECREASE_BUDGET',
    suggestedValue: { cpc7d: input.cpc7d, cpc14d: input.cpc14d, cpcIncreasePct: Math.round(cpcIncrease * 100) },
    confidence: computeConfidence(75, input),
  };
}

/**
 * Rule 13: Trend Acceleration (accelerating ROAS decline)
 * Trigger: ≥3 weekly ROAS averages AND week-over-week delta is increasing
 * negatively (decline is accelerating, not stabilizing).
 * Phase 3.2: Uses snapshot-derived weeklyRoasAvgs from run-diagnosis.ts.
 */
function evaluateTrendAcceleration(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (!input.weeklyRoasAvgs || input.weeklyRoasAvgs.length < 3) return null;

  const weeks = input.weeklyRoasAvgs;
  // Compute deltas between consecutive weeks
  const deltas: number[] = [];
  for (let i = 1; i < weeks.length; i++) {
    deltas.push(weeks[i]! - weeks[i - 1]!);
  }

  // Check if ROAS is declining (last delta negative)
  const lastDelta = deltas[deltas.length - 1]!;
  if (lastDelta >= 0) return null; // ROAS isn't declining

  // Check if decline is accelerating (each delta more negative than the previous)
  let accelerating = true;
  for (let i = 1; i < deltas.length; i++) {
    if (deltas[i]! >= deltas[i - 1]!) {
      accelerating = false;
      break;
    }
  }
  if (!accelerating) return null;

  // Compute acceleration metric (how much worse the decline got)
  const firstDelta = deltas[0]!;
  const acceleration = lastDelta - firstDelta; // more negative = faster decline

  return {
    ruleId: 'trend_acceleration',
    severity: 'WARNING',
    title: 'ROAS Decline Accelerating',
    message: `${input.adName}: ROAS is declining at an accelerating pace over ${weeks.length} weeks (${weeks.map((r) => r.toFixed(2) + 'x').join(' → ')}). The decline is getting worse, not stabilizing. Consider reducing budget before performance collapses.`,
    actionType: 'DECREASE_BUDGET',
    suggestedValue: {
      weeklyRoas: weeks.map((r) => Math.round(r * 100) / 100),
      weeklyDeltas: deltas.map((d) => Math.round(d * 100) / 100),
      acceleration: Math.round(acceleration * 100) / 100,
    },
    confidence: computeConfidence(70, input),
  };
}

/**
 * Rule 14: Predictive ROAS Decline (proactive creative refresh)
 * Trigger: current ROAS > 1.0 BUT creative decay analysis projects breakeven
 * within 14 days. Catches problems BEFORE they become critical.
 * Phase 3.3: Uses decay analysis from Phase 1.3.
 */
function evaluatePredictiveRoasDecline(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.roas7d === null || input.roas7d <= 1.0) return null; // already unprofitable — other rules handle it
  if (!input.decayRecommendation) return null;
  if (input.decayEstimatedDaysToBreakeven === null || input.decayEstimatedDaysToBreakeven === undefined) return null;

  // Only fire if decay projects breakeven within 14 days
  if (input.decayEstimatedDaysToBreakeven <= 0 || input.decayEstimatedDaysToBreakeven > 14) return null;

  // Don't fire if decay analysis says the ad is healthy
  if (input.decayRecommendation === 'healthy') return null;

  return {
    ruleId: 'predictive_roas_decline',
    severity: 'WARNING',
    title: 'ROAS Projected to Drop Below Breakeven',
    message: `${input.adName}: Currently profitable (${input.roas7d.toFixed(2)}x ROAS) but creative decay analysis projects breakeven in ~${Math.round(input.decayEstimatedDaysToBreakeven)} days. Proactively refresh creative before performance crashes.`,
    actionType: 'REFRESH_CREATIVE',
    suggestedValue: {
      currentRoas: input.roas7d,
      estimatedDaysToBreakeven: Math.round(input.decayEstimatedDaysToBreakeven),
      decayRecommendation: input.decayRecommendation,
    },
    confidence: computeConfidence(65, input), // 65 base — predictive = less certain
  };
}

/**
 * Rule 15: Duplicate Winner (scale via audience duplication)
 * Trigger: ROAS > 3.0 AND frequency > 2.5 AND spend > $100 (7d)
 * Does NOT overlap with winner_not_scaled (which requires freq < 2.0).
 * High frequency means the current audience is saturated — duplicating the
 * ad set to fresh lookalike audiences captures incremental revenue without
 * inflating frequency further.
 */
function evaluateDuplicateWinner(input: DiagnosisRuleInput): DiagnosisResult | null {
  if (input.status !== 'ACTIVE') return null;
  if (input.roas7d === null || input.roas7d <= 3.0) return null;
  if (input.frequency7d === null || input.frequency7d <= 2.5) return null;
  if (input.spend7d <= 100) return null;

  return {
    ruleId: 'duplicate_winner',
    severity: 'INFO',
    title: 'Scale to new audiences',
    message: `${input.adName} has ${input.roas7d.toFixed(1)}x ROAS but ${input.frequency7d.toFixed(1)}x frequency — duplicate to fresh audiences instead of increasing budget.`,
    actionType: 'DUPLICATE_AD_SET',
    suggestedValue: { currentRoas: input.roas7d, frequency: input.frequency7d },
    confidence: computeConfidence(65, input),
  };
}

// ── Main Evaluator ───────────────────────────────────────────

/**
 * Evaluate all diagnosis rules for a single ad.
 * Rule 7 (learning phase) is checked first — if it fires, no other rules run.
 * Optional config overrides default thresholds (e.g., from AutopilotConfig).
 */
export function evaluateDiagnosisRules(
  input: DiagnosisRuleInput,
  now?: Date,
  config?: DiagnosisRuleConfig,
): DiagnosisResult[] {
  const referenceDate = now ?? new Date();

  // Rule 7 gates everything — if ad is in learning phase, return only that
  const learning = evaluateLearningPhase(input, referenceDate);
  if (learning) {
    return [learning];
  }

  const results: DiagnosisResult[] = [];

  // Active ad rules (1-6)
  const fatigue = evaluateCreativeFatigue(input, config);
  if (fatigue) results.push(fatigue);

  const negRoas = evaluateNegativeRoas(input);
  if (negRoas) results.push(negRoas);

  const winner = evaluateWinnerNotScaled(input, config);
  if (winner) results.push(winner);

  const wasted = evaluateWastedBudget(input, config);
  if (wasted) results.push(wasted);

  const lowCtr = evaluateLowCtr(input, config);
  if (lowCtr) results.push(lowCtr);

  const clickNoBuy = evaluateClickNoBuy(input);
  if (clickNoBuy) results.push(clickNoBuy);

  const pacing = evaluateBudgetPacing(input);
  if (pacing) results.push(pacing);

  const saturation = evaluateAudienceSaturation(input);
  if (saturation) results.push(saturation);

  const costSpike = evaluateCostSpike(input, config);
  if (costSpike) results.push(costSpike);

  // Phase 3.2: Trend acceleration (requires snapshot-derived weeklyRoasAvgs)
  const trendAccel = evaluateTrendAcceleration(input);
  if (trendAccel) results.push(trendAccel);

  // Phase 3.3: Predictive ROAS decline (requires creative decay projections)
  const predictive = evaluatePredictiveRoasDecline(input);
  if (predictive) results.push(predictive);

  // Paused ad rule (8)
  const paused = evaluatePausedPositive(input);
  if (paused) results.push(paused);

  // Positive signal rules (9) — only if winner_not_scaled didn't fire
  if (!winner) {
    const topPerf = evaluateTopPerformer(input, config);
    if (topPerf) results.push(topPerf);
  }

  // Rule 15: Duplicate winner — only if winner_not_scaled didn't fire
  // (winner_not_scaled requires freq < 2.0; duplicate_winner requires freq > 2.5 — no overlap)
  if (!winner) {
    const dupWinner = evaluateDuplicateWinner(input);
    if (dupWinner) results.push(dupWinner);
  }

  return results;
}
