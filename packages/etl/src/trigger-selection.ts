// ──────────────────────────────────────────────────────────────
// Growth OS — Psychology Layer: Trigger Selection Engine
// Pure function module (no DB, no side effects).
// Maps (awarenessLevel × emotionalState) → recommended triggers
// with empirical override when performance data is available.
// ──────────────────────────────────────────────────────────────

// ── Types ──

export type AwarenessLevel = 'UNAWARE' | 'PAIN_AWARE' | 'SOLUTION_AWARE' | 'PRODUCT_AWARE' | 'MOST_AWARE';

export type PsychTrigger =
  | 'LOSS_AVERSION'
  | 'SOCIAL_PROOF_SPECIFICITY'
  | 'SOCIAL_PROOF_AUTHORITY'
  | 'IDENTITY_TRIBAL'
  | 'IDENTITY_ASPIRATIONAL'
  | 'COGNITIVE_EASE'
  | 'CURIOSITY_GAP'
  | 'ENDOWMENT_EFFECT'
  | 'REACTANCE'
  | 'RECIPROCITY'
  | 'CONTRAST_EFFECT'
  | 'PEAK_END_RULE'
  | 'SCARCITY'
  | 'COMMITMENT_CONSISTENCY';

export type EmotionalState =
  | 'FRUSTRATED'
  | 'HOPEFUL'
  | 'SKEPTICAL'
  | 'CURIOUS'
  | 'PROUD'
  | 'ANXIOUS'
  | 'BORED'
  | 'ASPIRATIONAL';

export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU' | 'RETENTION';

export type TriggerConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TriggerPerformanceData {
  readonly trigger: PsychTrigger;
  readonly sampleSize: number;
  readonly winRate: number;
  readonly avgRoasDelta: number;
  readonly confidenceLevel: TriggerConfidenceLevel;
}

export interface TriggerSelectionInput {
  readonly awarenessLevel: AwarenessLevel;
  readonly emotionalState: EmotionalState;
  readonly vertical: string;
  readonly funnelStage: FunnelStage;
  readonly performanceRecords?: readonly TriggerPerformanceData[];
}

export interface TriggerRecommendation {
  readonly primary: PsychTrigger;
  readonly secondary: PsychTrigger | null;
  readonly source: 'theoretical_matrix' | 'empirical_override' | 'blended';
  readonly confidence: TriggerConfidenceLevel;
  readonly rationale: string;
}

interface MatrixEntry {
  readonly primary: PsychTrigger;
  readonly secondary: PsychTrigger;
}

// ── Constants ──

const MIN_SAMPLES_FOR_MEDIUM = 10;
const MIN_SAMPLES_FOR_HIGH = 30;
const MIN_WIN_RATE_FOR_OVERRIDE = 0.40;
const THEORETICAL_WEIGHT = 0.60;
const EMPIRICAL_WEIGHT = 0.40;

// ── Theoretical Trigger Matrix ──
// Derived from the Psychology Layer document (Schwartz awareness spectrum × emotional states).
// Each cell is marked [FIELD CALIBRATION NEEDED] — empirical data overrides these defaults.

export const TRIGGER_MATRIX: Record<AwarenessLevel, Record<EmotionalState, MatrixEntry>> = {
  UNAWARE: {
    FRUSTRATED: { primary: 'COGNITIVE_EASE', secondary: 'CURIOSITY_GAP' },
    HOPEFUL: { primary: 'IDENTITY_ASPIRATIONAL', secondary: 'CURIOSITY_GAP' },
    SKEPTICAL: { primary: 'CURIOSITY_GAP', secondary: 'SOCIAL_PROOF_AUTHORITY' },
    CURIOUS: { primary: 'CURIOSITY_GAP', secondary: 'COGNITIVE_EASE' },
    PROUD: { primary: 'IDENTITY_TRIBAL', secondary: 'CURIOSITY_GAP' },
    ANXIOUS: { primary: 'COGNITIVE_EASE', secondary: 'RECIPROCITY' },
    BORED: { primary: 'CURIOSITY_GAP', secondary: 'IDENTITY_TRIBAL' },
    ASPIRATIONAL: { primary: 'IDENTITY_ASPIRATIONAL', secondary: 'CURIOSITY_GAP' },
  },
  PAIN_AWARE: {
    FRUSTRATED: { primary: 'LOSS_AVERSION', secondary: 'COGNITIVE_EASE' },
    HOPEFUL: { primary: 'COGNITIVE_EASE', secondary: 'SOCIAL_PROOF_SPECIFICITY' },
    SKEPTICAL: { primary: 'SOCIAL_PROOF_SPECIFICITY', secondary: 'LOSS_AVERSION' },
    CURIOUS: { primary: 'LOSS_AVERSION', secondary: 'RECIPROCITY' },
    PROUD: { primary: 'IDENTITY_TRIBAL', secondary: 'LOSS_AVERSION' },
    ANXIOUS: { primary: 'COGNITIVE_EASE', secondary: 'RECIPROCITY' },
    BORED: { primary: 'LOSS_AVERSION', secondary: 'CURIOSITY_GAP' },
    ASPIRATIONAL: { primary: 'IDENTITY_ASPIRATIONAL', secondary: 'LOSS_AVERSION' },
  },
  SOLUTION_AWARE: {
    FRUSTRATED: { primary: 'SOCIAL_PROOF_SPECIFICITY', secondary: 'COGNITIVE_EASE' },
    HOPEFUL: { primary: 'SOCIAL_PROOF_SPECIFICITY', secondary: 'CONTRAST_EFFECT' },
    SKEPTICAL: { primary: 'SOCIAL_PROOF_SPECIFICITY', secondary: 'SOCIAL_PROOF_AUTHORITY' },
    CURIOUS: { primary: 'CONTRAST_EFFECT', secondary: 'SOCIAL_PROOF_SPECIFICITY' },
    PROUD: { primary: 'IDENTITY_TRIBAL', secondary: 'SOCIAL_PROOF_AUTHORITY' },
    ANXIOUS: { primary: 'SOCIAL_PROOF_AUTHORITY', secondary: 'COGNITIVE_EASE' },
    BORED: { primary: 'CONTRAST_EFFECT', secondary: 'CURIOSITY_GAP' },
    ASPIRATIONAL: { primary: 'IDENTITY_ASPIRATIONAL', secondary: 'SOCIAL_PROOF_SPECIFICITY' },
  },
  PRODUCT_AWARE: {
    FRUSTRATED: { primary: 'ENDOWMENT_EFFECT', secondary: 'LOSS_AVERSION' },
    HOPEFUL: { primary: 'ENDOWMENT_EFFECT', secondary: 'COMMITMENT_CONSISTENCY' },
    SKEPTICAL: { primary: 'SOCIAL_PROOF_SPECIFICITY', secondary: 'CONTRAST_EFFECT' },
    CURIOUS: { primary: 'ENDOWMENT_EFFECT', secondary: 'RECIPROCITY' },
    PROUD: { primary: 'IDENTITY_TRIBAL', secondary: 'ENDOWMENT_EFFECT' },
    ANXIOUS: { primary: 'ENDOWMENT_EFFECT', secondary: 'SCARCITY' },
    BORED: { primary: 'SCARCITY', secondary: 'LOSS_AVERSION' },
    ASPIRATIONAL: { primary: 'IDENTITY_ASPIRATIONAL', secondary: 'ENDOWMENT_EFFECT' },
  },
  MOST_AWARE: {
    FRUSTRATED: { primary: 'SCARCITY', secondary: 'LOSS_AVERSION' },
    HOPEFUL: { primary: 'COMMITMENT_CONSISTENCY', secondary: 'SCARCITY' },
    SKEPTICAL: { primary: 'SCARCITY', secondary: 'SOCIAL_PROOF_SPECIFICITY' },
    CURIOUS: { primary: 'COMMITMENT_CONSISTENCY', secondary: 'RECIPROCITY' },
    PROUD: { primary: 'IDENTITY_TRIBAL', secondary: 'RECIPROCITY' },
    ANXIOUS: { primary: 'SCARCITY', secondary: 'COMMITMENT_CONSISTENCY' },
    BORED: { primary: 'SCARCITY', secondary: 'LOSS_AVERSION' },
    ASPIRATIONAL: { primary: 'COMMITMENT_CONSISTENCY', secondary: 'IDENTITY_ASPIRATIONAL' },
  },
};

// ── Core Selection Function ──

/**
 * Select the recommended psychological trigger for a given audience state.
 *
 * 1. Look up the theoretical matrix for (awarenessLevel, emotionalState).
 * 2. If empirical data exists with HIGH confidence (≥30 samples), override.
 * 3. If MEDIUM confidence (10-29), blend theoretical + empirical.
 * 4. REACTANCE is never returned as primary (anti-pattern guard).
 */
export function selectTrigger(input: TriggerSelectionInput): TriggerRecommendation {
  const { awarenessLevel, emotionalState, performanceRecords } = input;

  // Step 1: Theoretical baseline — validate inputs
  const awarenessRow = TRIGGER_MATRIX[awarenessLevel];
  if (!awarenessRow) {
    // Invalid awareness level — fall back to SOLUTION_AWARE (middle of spectrum)
    const fallback = TRIGGER_MATRIX['SOLUTION_AWARE']['CURIOUS'];
    return {
      primary: fallback.primary,
      secondary: fallback.secondary,
      source: 'theoretical_matrix',
      confidence: 'LOW',
      rationale: `Invalid awareness level "${awarenessLevel}" — falling back to SOLUTION_AWARE + CURIOUS default.`,
    };
  }
  const theoretical = awarenessRow[emotionalState];
  if (!theoretical) {
    // Invalid emotional state — fall back to CURIOUS for this awareness level
    const fallback = awarenessRow['CURIOUS'];
    return {
      primary: fallback.primary,
      secondary: fallback.secondary,
      source: 'theoretical_matrix',
      confidence: 'LOW',
      rationale: `Invalid emotional state "${emotionalState}" — falling back to ${awarenessLevel} + CURIOUS default.`,
    };
  }

  // Step 2: Check for empirical override
  if (performanceRecords && performanceRecords.length > 0) {
    // Find the best-performing trigger with sufficient data
    const highConfidence = performanceRecords
      .filter(r => r.confidenceLevel === 'HIGH' && r.sampleSize >= MIN_SAMPLES_FOR_HIGH)
      .filter(r => r.winRate >= MIN_WIN_RATE_FOR_OVERRIDE)
      .filter(r => r.trigger !== 'REACTANCE');

    if (highConfidence.length > 0) {
      const best = highConfidence.reduce((a, b) => a.winRate > b.winRate ? a : b);
      return {
        primary: best.trigger,
        secondary: best.trigger === theoretical.primary ? theoretical.secondary : theoretical.primary,
        source: 'empirical_override',
        confidence: 'HIGH',
        rationale: `Empirical winner: ${best.trigger} has ${(best.winRate * 100).toFixed(0)}% win rate over ${best.sampleSize} tests. Overrides theoretical default (${theoretical.primary}).`,
      };
    }

    // Step 3: Check for medium-confidence blending
    const mediumConfidence = performanceRecords
      .filter(r => r.confidenceLevel === 'MEDIUM' && r.sampleSize >= MIN_SAMPLES_FOR_MEDIUM)
      .filter(r => r.winRate >= MIN_WIN_RATE_FOR_OVERRIDE)
      .filter(r => r.trigger !== 'REACTANCE');

    if (mediumConfidence.length > 0) {
      const best = mediumConfidence.reduce((a, b) => a.winRate > b.winRate ? a : b);

      // Blend: if empirical winner is different from theoretical, use empirical
      // only if its weighted score beats the theoretical baseline
      const empiricalScore = best.winRate * EMPIRICAL_WEIGHT;
      const theoreticalBaselineWinRate = 0.50; // Assume 50% baseline for theoretical
      const theoreticalScore = theoreticalBaselineWinRate * THEORETICAL_WEIGHT;

      if (empiricalScore > theoreticalScore && best.trigger !== theoretical.primary) {
        return {
          primary: best.trigger,
          secondary: theoretical.primary,
          source: 'blended',
          confidence: 'MEDIUM',
          rationale: `Blended: ${best.trigger} shows ${(best.winRate * 100).toFixed(0)}% win rate (${best.sampleSize} tests, MEDIUM confidence). Weighted over theoretical default (${theoretical.primary}).`,
        };
      }
    }
  }

  // Step 4: Return theoretical default
  return {
    primary: theoretical.primary,
    secondary: theoretical.secondary,
    source: 'theoretical_matrix',
    confidence: 'LOW',
    rationale: `Theoretical default for ${awarenessLevel} + ${emotionalState}. No empirical data available — [FIELD CALIBRATION NEEDED].`,
  };
}

// ── Metric → Psychology Signal Mapper ──

export interface PsychSignal {
  readonly metric: string;
  readonly psychologicalMeaning: string;
  readonly suggestedInvestigation: string;
}

/**
 * Translate a metric delta into a psychological signal.
 * Maps surface-level performance metrics to underlying audience psychology.
 *
 * @param metric — metric name (e.g., 'cpm', 'ctr', 'roas')
 * @param delta — fractional change as a ratio, e.g., 0.15 means +15%, -0.25 means -25%.
 *               NOT a percentage — use 0.15 not 15.
 */
export function mapMetricToPsychSignal(metric: string, delta: number): PsychSignal {
  const absDelta = Math.abs(delta);

  switch (metric) {
    case 'cpm':
      return delta > 0
        ? {
            metric: 'cpm',
            psychologicalMeaning: 'Audience segment is harder to reach — likely targeting mismatch with assumed awareness level.',
            suggestedInvestigation: 'Verify the awareness level assumption. If CPM is rising, the audience definition may be too narrow or misaligned.',
          }
        : {
            metric: 'cpm',
            psychologicalMeaning: 'Audience is cheaper to reach — targeting may be well-calibrated or competition is lower.',
            suggestedInvestigation: 'Monitor CTR to confirm the cheaper impressions are converting to engagement.',
          };

    case 'hook_retention':
      return delta < 0
        ? {
            metric: 'hook_retention',
            psychologicalMeaning: 'Pattern interrupt failed — the creative does not activate the intended trigger within the first 3 seconds.',
            suggestedInvestigation: 'The trigger selection may be correct but the creative execution failed. Test same trigger with different visual/hook.',
          }
        : {
            metric: 'hook_retention',
            psychologicalMeaning: 'Hook is landing — the visual or first line creates enough resonance to stop the scroll.',
            suggestedInvestigation: 'If CTR is also up, the full message aligns. If CTR is flat, the body copy may not follow through on the hook.',
          };

    case 'ctr':
      return delta < 0
        ? {
            metric: 'ctr',
            psychologicalMeaning: absDelta > 0.25
              ? 'Severe message-awareness mismatch: the copy does not connect with where this audience is in their journey.'
              : 'Moderate message drift: the trigger may not resonate with the actual emotional state of this audience.',
            suggestedInvestigation: 'Two possible causes: (a) wrong awareness level — copy is too advanced or too basic, (b) wrong trigger — the mechanism assumed does not apply.',
          }
        : {
            metric: 'ctr',
            psychologicalMeaning: 'Message-awareness alignment is strong — the trigger is activating as intended.',
            suggestedInvestigation: 'Validate with landing page CVR. High CTR + low CVR = ad promise not honored on landing page.',
          };

    case 'landing_cvr':
      return delta < 0
        ? {
            metric: 'landing_cvr',
            psychologicalMeaning: 'Ad-to-page disconnect: the psychological state created by the ad is not being honored on the landing page.',
            suggestedInvestigation: 'The trigger worked (they clicked) but the landing page breaks the emotional arc. Review if the landing page matches the trigger mechanism.',
          }
        : {
            metric: 'landing_cvr',
            psychologicalMeaning: 'Full-funnel alignment: the trigger, copy, and landing page maintain psychological coherence.',
            suggestedInvestigation: 'Strong signal that the psychological model is correct for this audience.',
          };

    case 'checkout_cvr':
      return delta < 0
        ? {
            metric: 'checkout_cvr',
            psychologicalMeaning: 'Commitment friction at the final step — price perception, risk aversion, or cognitive overload at checkout.',
            suggestedInvestigation: 'Apply endowment effect (they already "own" it in their cart) and risk reversal (guarantees, free returns).',
          }
        : {
            metric: 'checkout_cvr',
            psychologicalMeaning: 'The commitment barrier has been cleared — the audience trusts enough to complete the transaction.',
            suggestedInvestigation: 'Capture this winning combination in the trigger performance record.',
          };

    case 'roas':
      return delta < 0
        ? {
            metric: 'roas',
            psychologicalMeaning: 'End-to-end model failure: the psychological framework for this audience may be fundamentally misaligned.',
            suggestedInvestigation: 'Run the full diagnostic tree: which stage (hook→CTR→landing→checkout) is the primary drop-off?',
          }
        : {
            metric: 'roas',
            psychologicalMeaning: 'The causal model is correct: trigger selection, copy execution, and funnel alignment are working together.',
            suggestedInvestigation: 'Document this combination as a validated pattern in the trigger performance library.',
          };

    case 'frequency':
      return delta > 0
        ? {
            metric: 'frequency',
            psychologicalMeaning: 'Audience saturation — repeated exposure shifts from cognitive ease (familiarity) to reactance (irritation).',
            suggestedInvestigation: 'Monitor CTR trend alongside frequency. If CTR is declining, the audience has moved past the effective exposure window.',
          }
        : {
            metric: 'frequency',
            psychologicalMeaning: 'Fresh audience exposure — the trigger is reaching people who have not habituated to the message.',
            suggestedInvestigation: 'Optimal window for trigger effectiveness. Track at what frequency the CTR begins to decline.',
          };

    default:
      return {
        metric,
        psychologicalMeaning: `Metric ${metric} changed by ${(delta * 100).toFixed(1)}%. No specific psychological mapping available.`,
        suggestedInvestigation: 'Review in context of the full funnel diagnostic tree.',
      };
  }
}

// ── Awareness Level helpers ──

/**
 * Maps a funnel stage to the most likely awareness levels.
 * Useful when awareness level must be inferred from funnel position.
 */
export function inferAwarenessFromFunnel(funnelStage: FunnelStage): readonly AwarenessLevel[] {
  switch (funnelStage) {
    case 'TOFU':
      return ['UNAWARE', 'PAIN_AWARE'] as const;
    case 'MOFU':
      return ['PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE'] as const;
    case 'BOFU':
      return ['PRODUCT_AWARE', 'MOST_AWARE'] as const;
    case 'RETENTION':
      return ['MOST_AWARE'] as const;
  }
}

/**
 * Returns all awareness levels as an ordered array (for iteration).
 */
export const AWARENESS_LEVELS: readonly AwarenessLevel[] = [
  'UNAWARE', 'PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE',
] as const;

/**
 * Returns all emotional states as an ordered array (for iteration).
 */
export const EMOTIONAL_STATES: readonly EmotionalState[] = [
  'FRUSTRATED', 'HOPEFUL', 'SKEPTICAL', 'CURIOUS', 'PROUD', 'ANXIOUS', 'BORED', 'ASPIRATIONAL',
] as const;

/**
 * Returns all psych triggers as an ordered array (for iteration/display).
 */
export const PSYCH_TRIGGERS: readonly PsychTrigger[] = [
  'LOSS_AVERSION', 'SOCIAL_PROOF_SPECIFICITY', 'SOCIAL_PROOF_AUTHORITY',
  'IDENTITY_TRIBAL', 'IDENTITY_ASPIRATIONAL', 'COGNITIVE_EASE', 'CURIOSITY_GAP',
  'ENDOWMENT_EFFECT', 'REACTANCE', 'RECIPROCITY', 'CONTRAST_EFFECT',
  'PEAK_END_RULE', 'SCARCITY', 'COMMITMENT_CONSISTENCY',
] as const;
