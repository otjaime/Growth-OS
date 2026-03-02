// ──────────────────────────────────────────────────────────────
// Growth OS — Campaign Health Scoring
// Composite 0-100 health score with A-F grading for campaigns
// Pure functions — no side effects, no DB access
// ──────────────────────────────────────────────────────────────

// ── Interfaces ────────────────────────────────────────────────

export interface AdSetHealth {
  adSetId: string;
  spend7d: number;
  revenue7d: number;
  roas7d: number | null;
  ctr7d: number | null;
  frequency7d: number | null;
  roas14d: number | null;
  ctr14d: number | null;
  roasValues?: readonly number[];
}

export interface CampaignMetrics {
  campaignId: string;
  campaignName: string;
  adSets: readonly AdSetHealth[];
}

export interface CampaignHealthScore {
  campaignId: string;
  campaignName: string;
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: {
    roasScore: number;
    efficiencyScore: number;
    scaleScore: number;
    stabilityScore: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  topIssue: string | null;
}

export interface CampaignHealthConfig {
  targetRoas?: number;
}

// ── Constants ─────────────────────────────────────────────────

const DEFAULT_TARGET_ROAS = 2.0;
const MAX_COMPONENT_SCORE = 25;
const DEFAULT_STABILITY_SCORE = 15;

const GRADE_THRESHOLDS: readonly { grade: 'A' | 'B' | 'C' | 'D' | 'F'; min: number }[] = [
  { grade: 'A', min: 80 },
  { grade: 'B', min: 65 },
  { grade: 'C', min: 50 },
  { grade: 'D', min: 35 },
  { grade: 'F', min: 0 },
];

const TREND_IMPROVEMENT_THRESHOLD = 0.10;
const TREND_DECLINE_THRESHOLD = -0.10;

// ── Helpers ───────────────────────────────────────────────────

/**
 * Compute the spend-weighted average of a nullable metric across ad sets.
 * Returns null if all values are null or total spend is zero.
 */
function spendWeightedAverage(
  adSets: readonly AdSetHealth[],
  getValue: (as: AdSetHealth) => number | null,
  getWeight: (as: AdSetHealth) => number,
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const as of adSets) {
    const value = getValue(as);
    const weight = getWeight(as);
    if (value !== null && weight > 0) {
      weightedSum += value * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Compute coefficient of variation (stdDev / mean) for an array of values.
 * Returns null if fewer than 2 values or mean is zero.
 */
function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 2) return null;

  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;

  if (Math.abs(mean) < 1e-10) return null;

  let sumSquaredDiffs = 0;
  for (const v of values) {
    const diff = v - mean;
    sumSquaredDiffs += diff * diff;
  }
  const stdDev = Math.sqrt(sumSquaredDiffs / values.length);

  return stdDev / Math.abs(mean);
}

/**
 * Compute the ROAS component score (0-25).
 * At or above target ROAS: 25 pts. Scales linearly from 0 at ROAS=0.
 */
function computeRoasScore(blendedRoas: number | null, targetRoas: number): number {
  if (blendedRoas === null || blendedRoas <= 0) return 0;
  if (blendedRoas >= targetRoas) return MAX_COMPONENT_SCORE;
  return Math.round((blendedRoas / targetRoas) * MAX_COMPONENT_SCORE * 10) / 10;
}

/**
 * Compute the efficiency trend score (0-25).
 * Compares 7d vs 14d ROAS (weighted average).
 */
function computeEfficiencyScore(roas7d: number | null, roas14d: number | null): number {
  if (roas7d === null || roas14d === null || roas14d <= 0) return MAX_COMPONENT_SCORE * 0.6; // default 15
  const change = (roas7d - roas14d) / roas14d;
  if (change > 0.10) return MAX_COMPONENT_SCORE;   // improving
  if (change >= -0.10) return 15;                    // stable
  return 5;                                          // declining
}

/**
 * Compute the scale/frequency headroom score (0-25).
 * Lower frequency = more headroom = higher score.
 */
function computeScaleScore(avgFrequency: number | null): number {
  if (avgFrequency === null) return MAX_COMPONENT_SCORE * 0.6; // default 15
  if (avgFrequency < 1.5) return 25;
  if (avgFrequency < 2.5) return 20;
  if (avgFrequency < 3.5) return 12;
  if (avgFrequency < 4.5) return 5;
  return 0;
}

/**
 * Compute the stability score (0-25).
 * Based on coefficient of variation of daily ROAS values.
 */
function computeStabilityScore(adSets: readonly AdSetHealth[]): number {
  // Collect all ROAS values from ad sets that provide them
  const allValues: number[] = [];
  for (const as of adSets) {
    if (as.roasValues && as.roasValues.length > 0) {
      allValues.push(...as.roasValues);
    }
  }

  if (allValues.length === 0) return DEFAULT_STABILITY_SCORE;

  const cv = coefficientOfVariation(allValues);
  if (cv === null) return DEFAULT_STABILITY_SCORE;

  if (cv < 0.15) return 25;
  if (cv < 0.3) return 18;
  if (cv < 0.5) return 10;
  return 5;
}

/**
 * Determine the trend label based on 7d vs 14d blended ROAS.
 */
function determineTrend(roas7d: number | null, roas14d: number | null): 'improving' | 'stable' | 'declining' {
  if (roas7d === null || roas14d === null || roas14d <= 0) return 'stable';
  const change = (roas7d - roas14d) / roas14d;
  if (change > TREND_IMPROVEMENT_THRESHOLD) return 'improving';
  if (change < TREND_DECLINE_THRESHOLD) return 'declining';
  return 'stable';
}

/**
 * Identify the top issue based on the lowest-scoring component.
 */
function identifyTopIssue(components: CampaignHealthScore['components']): string | null {
  const entries: { name: string; score: number; issue: string }[] = [
    { name: 'roas', score: components.roasScore, issue: 'ROAS is below target. Review ad creative and audience targeting.' },
    { name: 'efficiency', score: components.efficiencyScore, issue: 'Efficiency is declining. Check for audience fatigue or increased competition.' },
    { name: 'scale', score: components.scaleScore, issue: 'High frequency limits scaling headroom. Expand audiences or rotate creatives.' },
    { name: 'stability', score: components.stabilityScore, issue: 'Performance is volatile. Investigate inconsistent spend delivery or external factors.' },
  ];

  // Find minimum score
  let minEntry = entries[0]!;
  for (const entry of entries) {
    if (entry.score < minEntry.score) {
      minEntry = entry;
    }
  }

  // Only flag if the component is actually underperforming
  if (minEntry.score >= MAX_COMPONENT_SCORE * 0.8) return null;
  return minEntry.issue;
}

// ── Main Export ───────────────────────────────────────────────

/**
 * Score a campaign's overall health on a 0-100 scale with letter grade.
 *
 * Scoring breakdown (25 pts each):
 * - ROAS Score: Weighted average ROAS vs target (linear scale to 25pts)
 * - Efficiency Score: 7d vs 14d ROAS trend (improving=25, stable=15, declining=5)
 * - Scale Score: Average frequency headroom (lower freq = higher score)
 * - Stability Score: Coefficient of variation of daily ROAS values
 *
 * @param campaign - Campaign with its ad set metrics
 * @param config - Optional configuration (target ROAS)
 * @returns Health score with grade, component breakdown, trend, and top issue
 */
export function scoreCampaignHealth(
  campaign: CampaignMetrics,
  config?: CampaignHealthConfig,
): CampaignHealthScore {
  const targetRoas = config?.targetRoas ?? DEFAULT_TARGET_ROAS;
  const { adSets } = campaign;

  // Edge case: no ad sets
  if (adSets.length === 0) {
    return {
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      overallScore: 0,
      grade: 'F',
      components: {
        roasScore: 0,
        efficiencyScore: 0,
        scaleScore: 0,
        stabilityScore: 0,
      },
      trend: 'stable',
      topIssue: 'No ad sets found for this campaign.',
    };
  }

  // Compute weighted averages
  const blendedRoas7d = spendWeightedAverage(adSets, (as) => as.roas7d, (as) => as.spend7d);
  const blendedRoas14d = spendWeightedAverage(adSets, (as) => as.roas14d, (as) => as.spend7d);
  const avgFrequency = spendWeightedAverage(adSets, (as) => as.frequency7d, (as) => as.spend7d);

  // Compute component scores
  const roasScore = computeRoasScore(blendedRoas7d, targetRoas);
  const efficiencyScore = computeEfficiencyScore(blendedRoas7d, blendedRoas14d);
  const scaleScore = computeScaleScore(avgFrequency);
  const stabilityScore = computeStabilityScore(adSets);

  const overallScore = Math.round(roasScore + efficiencyScore + scaleScore + stabilityScore);

  // Determine grade
  let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'F';
  for (const threshold of GRADE_THRESHOLDS) {
    if (overallScore >= threshold.min) {
      grade = threshold.grade;
      break;
    }
  }

  const components = {
    roasScore: Math.round(roasScore * 10) / 10,
    efficiencyScore: Math.round(efficiencyScore * 10) / 10,
    scaleScore: Math.round(scaleScore * 10) / 10,
    stabilityScore: Math.round(stabilityScore * 10) / 10,
  };

  const trend = determineTrend(blendedRoas7d, blendedRoas14d);
  const topIssue = identifyTopIssue(components);

  return {
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    overallScore,
    grade,
    components,
    trend,
    topIssue,
  };
}
