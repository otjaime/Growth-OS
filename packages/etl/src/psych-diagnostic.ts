// ──────────────────────────────────────────────────────────────
// Growth OS — Psychology Diagnostic Tree
// When an ad underperforms, diagnose WHY from a psychology
// perspective. Pure function — no DB, no side effects.
// Implements Phase 5 of the Psychology Layer plan.
// ──────────────────────────────────────────────────────────────

import type { AwarenessLevel, PsychTrigger, EmotionalState } from './trigger-selection.js';

// ── Interfaces ───────────────────────────────────────────────

export interface PsychDiagnosticInput {
  /** Cost per 1000 impressions (in dollars). */
  readonly cpm?: number;
  /** Hook retention rate (video ads, 0-1). */
  readonly hookRetention?: number;
  /** Click-through rate (0-1). */
  readonly ctr?: number;
  /** Landing page conversion rate (0-1). */
  readonly landingCvr?: number;
  /** Checkout completion rate (0-1). */
  readonly checkoutCvr?: number;
  /** Return on ad spend. */
  readonly roas?: number;
  /** Ad frequency (times shown per person). */
  readonly frequency?: number;

  /** Benchmarks for comparison. null means "use defaults". */
  readonly benchmarks?: PsychBenchmarks;

  /** If a PsychHypothesis is attached, provide the original diagnosis. */
  readonly hypothesisContext?: {
    readonly awarenessLevel: AwarenessLevel;
    readonly emotionalState: EmotionalState;
    readonly primaryTrigger: PsychTrigger;
    readonly secondaryTrigger?: PsychTrigger;
    readonly primaryObjection: string;
  };
}

export interface PsychBenchmarks {
  readonly cpm?: number;
  readonly hookRetention?: number;
  readonly ctr?: number;
  readonly landingCvr?: number;
  readonly checkoutCvr?: number;
}

export interface PsychDiagnosticNode {
  /** Machine-readable diagnostic code. */
  readonly code: PsychDiagnosticCode;
  /** Human-readable explanation. */
  readonly explanation: string;
  /** Suggested next action. */
  readonly suggestedAction: string;
  /** Confidence in this diagnosis (0-1). */
  readonly confidence: number;
  /** Psychology-specific context if hypothesis exists. */
  readonly psychContext?: string;
}

export type PsychDiagnosticCode =
  | 'audience_mismatch'
  | 'creative_execution'
  | 'awareness_trigger_mismatch'
  | 'promise_mismatch'
  | 'commitment_friction'
  | 'frequency_fatigue'
  | 'healthy'
  | 'insufficient_data';

// ── Default Benchmarks ──────────────────────────────────────

const DEFAULT_BENCHMARKS: Required<PsychBenchmarks> = {
  cpm: 15,           // $15 CPM is average for DTC
  hookRetention: 0.25, // 25% hook retention is decent
  ctr: 0.01,         // 1% CTR
  landingCvr: 0.03,  // 3% landing conversion
  checkoutCvr: 0.50, // 50% checkout completion
};

// ── Core Diagnostic Function ─────────────────────────────────

/**
 * Diagnose an underperforming ad from a psychology perspective.
 *
 * Decision tree:
 * 1. High CPM → audience_mismatch (wrong awareness level assumed)
 * 2. Low hook retention → creative_execution (trigger implementation failed)
 * 3. Good hook, low CTR → awareness_trigger_mismatch (wrong trigger for state)
 * 4. Good CTR, low landing CVR → promise_mismatch (ad ≠ landing page)
 * 5. Good landing, low checkout → commitment_friction (price/risk/trust)
 * 6. High frequency → frequency_fatigue
 * 7. All OK → healthy
 */
export function diagnosePsychology(
  input: PsychDiagnosticInput,
): PsychDiagnosticNode {
  const b = {
    cpm: input.benchmarks?.cpm ?? DEFAULT_BENCHMARKS.cpm,
    hookRetention: input.benchmarks?.hookRetention ?? DEFAULT_BENCHMARKS.hookRetention,
    ctr: input.benchmarks?.ctr ?? DEFAULT_BENCHMARKS.ctr,
    landingCvr: input.benchmarks?.landingCvr ?? DEFAULT_BENCHMARKS.landingCvr,
    checkoutCvr: input.benchmarks?.checkoutCvr ?? DEFAULT_BENCHMARKS.checkoutCvr,
  };

  const hyp = input.hypothesisContext;

  // Sanitize metrics: treat NaN/Infinity/negative as undefined
  const sanitize = (v: number | undefined, allowZero = true): number | undefined => {
    if (v == null) return undefined;
    if (!isFinite(v)) return undefined;
    if (v < 0) return undefined;
    if (!allowZero && v === 0) return undefined;
    return v;
  };
  const cpm = sanitize(input.cpm);
  const hookRetention = sanitize(input.hookRetention);
  const ctr = sanitize(input.ctr);
  const landingCvr = sanitize(input.landingCvr);
  const checkoutCvr = sanitize(input.checkoutCvr);
  const frequency = sanitize(input.frequency);

  // Need at least CPM or CTR to diagnose
  if (cpm == null && ctr == null && hookRetention == null) {
    return {
      code: 'insufficient_data',
      explanation: 'Not enough metrics available to run psychology diagnostic. Need at least CPM, CTR, or hook retention data.',
      suggestedAction: 'Wait for more data or check metric collection.',
      confidence: 0,
    };
  }

  // ── Node 1: High CPM → Audience Mismatch ──────────────────
  if (cpm != null && cpm > b.cpm * 1.5) {
    const psychContext = hyp
      ? `The audience was diagnosed as ${hyp.awarenessLevel}, but high CPM suggests the targeting is reaching people at a different awareness level. ${hyp.awarenessLevel === 'UNAWARE' ? 'UNAWARE audiences require broader targeting — the current targeting may be too narrow.' : hyp.awarenessLevel === 'MOST_AWARE' ? 'MOST_AWARE targeting should be narrow and cheap — high CPM indicates audience saturation.' : 'Consider whether the actual audience matches the assumed awareness level.'}`
      : undefined;

    return {
      code: 'audience_mismatch',
      explanation: `CPM ($${cpm!.toFixed(2)}) is ${((cpm! / b.cpm - 1) * 100).toFixed(0)}% above benchmark ($${b.cpm}). The ad is reaching the wrong audience segment — the assumed awareness level likely doesn't match the actual audience being served.`,
      suggestedAction: 'Re-evaluate audience targeting. Check if the awareness level assumption is correct. Consider broadening (TOFU) or narrowing (BOFU) targeting.',
      confidence: 0.7,
      psychContext,
    };
  }

  // ── Node 2: Low Hook Retention → Creative Execution ───────
  if (hookRetention != null && hookRetention < b.hookRetention * 0.6) {
    const psychContext = hyp
      ? `The ${hyp.primaryTrigger} trigger was supposed to create an attention hook, but retention is only ${(hookRetention * 100).toFixed(1)}%. The trigger mechanism itself may be correctly chosen, but its creative execution failed to land. ${hyp.emotionalState === 'BORED' ? 'For BORED audiences, the pattern-interrupt must happen in the first 1-2 seconds.' : hyp.emotionalState === 'FRUSTRATED' ? 'FRUSTRATED audiences need immediate pain recognition — the hook should name their exact frustration.' : 'Review whether the hook implements the trigger mechanism correctly.'}`
      : undefined;

    return {
      code: 'creative_execution',
      explanation: `Hook retention (${(hookRetention * 100).toFixed(1)}%) is well below benchmark (${(b.hookRetention * 100).toFixed(1)}%). The creative failed to capture attention in the first 3 seconds. The trigger mechanism may be correct, but its execution in the creative didn't land.`,
      suggestedAction: 'Rework the creative hook execution. The first 3 seconds must activate the trigger mechanism. Test different visual/copy approaches for the same trigger.',
      confidence: 0.8,
      psychContext,
    };
  }

  // ── Node 3: Good Hook, Low CTR → Awareness-Trigger Mismatch
  if (
    ctr != null &&
    ctr < b.ctr * 0.6 &&
    (hookRetention == null || hookRetention >= b.hookRetention * 0.6)
  ) {
    const psychContext = hyp
      ? `People watched the ad (hook worked) but didn't click. The ${hyp.primaryTrigger} trigger may not be the right mechanism for ${hyp.awarenessLevel} + ${hyp.emotionalState} audiences. Their objection "${hyp.primaryObjection}" may require a different approach.`
      : undefined;

    return {
      code: 'awareness_trigger_mismatch',
      explanation: `CTR (${(ctr * 100).toFixed(2)}%) is ${((1 - ctr / b.ctr) * 100).toFixed(0)}% below benchmark (${(b.ctr * 100).toFixed(2)}%). The audience is seeing the ad but not engaging. The psychological trigger doesn't match what this audience needs to hear at their current awareness state.`,
      suggestedAction: 'Test a different trigger for the same awareness level. The message resonance is off — the audience sees the ad but isn\'t motivated to act.',
      confidence: 0.7,
      psychContext,
    };
  }

  // ── Node 4: Good CTR, Low Landing CVR → Promise Mismatch ──
  if (
    landingCvr != null &&
    landingCvr < b.landingCvr * 0.5 &&
    (ctr == null || ctr >= b.ctr * 0.6)
  ) {
    const psychContext = hyp
      ? `The ad using ${hyp.primaryTrigger} got clicks, but the landing page doesn't continue the psychological arc. The promise made in the ad isn't fulfilled on the landing page. Ensure the landing page addresses "${hyp.primaryObjection}" with the same trigger mechanism.`
      : undefined;

    return {
      code: 'promise_mismatch',
      explanation: `Landing page CVR (${(landingCvr * 100).toFixed(2)}%) is ${((1 - landingCvr / b.landingCvr) * 100).toFixed(0)}% below benchmark (${(b.landingCvr * 100).toFixed(2)}%). People click the ad but don't convert on the landing page. The emotional arc opened by the ad is broken — the landing page doesn't deliver on the ad's promise.`,
      suggestedAction: 'Align the landing page with the ad\'s psychological trigger. The emotional continuity between ad and landing page is broken.',
      confidence: 0.75,
      psychContext,
    };
  }

  // ── Node 5: Good Landing, Low Checkout → Commitment Friction
  if (
    checkoutCvr != null &&
    checkoutCvr < b.checkoutCvr * 0.6 &&
    (landingCvr == null || landingCvr >= b.landingCvr * 0.5)
  ) {
    const psychContext = hyp
      ? `The ad-to-landing flow works, but checkout friction is killing conversions. This suggests price/risk/trust barriers that ${hyp.primaryTrigger} alone can't overcome. Consider adding ENDOWMENT_EFFECT (ownership language) or RECIPROCITY (free trial/sample) to reduce commitment friction.`
      : undefined;

    return {
      code: 'commitment_friction',
      explanation: `Checkout CVR (${(checkoutCvr * 100).toFixed(1)}%) is ${((1 - checkoutCvr / b.checkoutCvr) * 100).toFixed(0)}% below benchmark (${(b.checkoutCvr * 100).toFixed(1)}%). Users add to cart but abandon at checkout. This is a commitment/risk issue — price sensitivity, trust gaps, or friction in the purchase flow.`,
      suggestedAction: 'Address commitment barriers: add trust signals, simplify checkout, consider money-back guarantee, or reduce perceived risk with trial/sample offers.',
      confidence: 0.75,
      psychContext,
    };
  }

  // ── Node 6: High Frequency → Fatigue ──────────────────────
  if (frequency != null && frequency > 3.5) {
    const psychContext = hyp
      ? `Audience has seen this ad ${frequency.toFixed(1)} times. Even a well-executed ${hyp.primaryTrigger} trigger loses effectiveness with repetition. The psychological mechanism becomes predictable and loses its power.`
      : undefined;

    return {
      code: 'frequency_fatigue',
      explanation: `Ad frequency (${frequency.toFixed(1)}) is high — the audience has seen this ad too many times. Psychological triggers lose effectiveness with repetition as the brain habituates to the pattern.`,
      suggestedAction: 'Rotate creative with a fresh trigger mechanism. Same trigger with new execution, or test a different trigger entirely.',
      confidence: 0.85,
      psychContext,
    };
  }

  // ── Healthy ───────────────────────────────────────────────
  return {
    code: 'healthy',
    explanation: 'All available metrics are within acceptable ranges. No psychology-level issues detected.',
    suggestedAction: 'Continue monitoring. Consider incremental optimization rather than trigger changes.',
    confidence: 0.5,
  };
}
