import { describe, it, expect } from 'vitest';
import { diagnosePsychology } from './psych-diagnostic.js';
import type { PsychDiagnosticInput } from './psych-diagnostic.js';

describe('diagnosePsychology', () => {
  // ── Insufficient Data ─────────────────────────────────────
  it('returns insufficient_data when no metrics provided', () => {
    const result = diagnosePsychology({});
    expect(result.code).toBe('insufficient_data');
    expect(result.confidence).toBe(0);
  });

  // ── Node 1: High CPM → Audience Mismatch ──────────────────
  it('diagnoses audience_mismatch when CPM is >1.5x benchmark', () => {
    const result = diagnosePsychology({ cpm: 30 }); // default benchmark 15
    expect(result.code).toBe('audience_mismatch');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.explanation).toContain('CPM');
  });

  it('does not flag audience_mismatch when CPM is within range', () => {
    const result = diagnosePsychology({ cpm: 12, ctr: 0.015 });
    expect(result.code).not.toBe('audience_mismatch');
  });

  it('includes psychContext for audience_mismatch with hypothesis', () => {
    const result = diagnosePsychology({
      cpm: 35,
      hypothesisContext: {
        awarenessLevel: 'UNAWARE',
        emotionalState: 'BORED',
        primaryTrigger: 'CURIOSITY_GAP',
        primaryObjection: "I don't know I have this problem",
      },
    });
    expect(result.code).toBe('audience_mismatch');
    expect(result.psychContext).toBeDefined();
    expect(result.psychContext).toContain('UNAWARE');
  });

  // ── Node 2: Low Hook Retention → Creative Execution ───────
  it('diagnoses creative_execution when hook retention is low', () => {
    const result = diagnosePsychology({ hookRetention: 0.08 }); // benchmark 0.25, threshold 0.15
    expect(result.code).toBe('creative_execution');
    expect(result.explanation).toContain('Hook retention');
  });

  it('includes psychContext for creative_execution with BORED audience', () => {
    const result = diagnosePsychology({
      hookRetention: 0.05,
      hypothesisContext: {
        awarenessLevel: 'UNAWARE',
        emotionalState: 'BORED',
        primaryTrigger: 'CURIOSITY_GAP',
        primaryObjection: 'Not paying attention',
      },
    });
    expect(result.code).toBe('creative_execution');
    expect(result.psychContext).toContain('BORED');
  });

  // ── Node 3: Good Hook, Low CTR → Awareness-Trigger Mismatch
  it('diagnoses awareness_trigger_mismatch when CTR is low but hook OK', () => {
    const result = diagnosePsychology({
      hookRetention: 0.30, // good
      ctr: 0.003,          // bad (benchmark 0.01, threshold 0.006)
    });
    expect(result.code).toBe('awareness_trigger_mismatch');
    expect(result.explanation).toContain('CTR');
  });

  it('diagnoses awareness_trigger_mismatch with CTR only (no hook data)', () => {
    const result = diagnosePsychology({ ctr: 0.003 });
    expect(result.code).toBe('awareness_trigger_mismatch');
  });

  // ── Node 4: Good CTR, Low Landing CVR → Promise Mismatch ──
  it('diagnoses promise_mismatch when landing CVR is low but CTR OK', () => {
    const result = diagnosePsychology({
      ctr: 0.015,        // good
      landingCvr: 0.008, // bad (benchmark 0.03, threshold 0.015)
    });
    expect(result.code).toBe('promise_mismatch');
    expect(result.explanation).toContain('Landing page');
  });

  // ── Node 5: Good Landing, Low Checkout → Commitment Friction
  it('diagnoses commitment_friction when checkout CVR is low but landing OK', () => {
    const result = diagnosePsychology({
      ctr: 0.015,
      landingCvr: 0.04,   // good
      checkoutCvr: 0.20,  // bad (benchmark 0.50, threshold 0.30)
    });
    expect(result.code).toBe('commitment_friction');
    expect(result.explanation).toContain('Checkout');
  });

  // ── Node 6: High Frequency → Fatigue ──────────────────────
  it('diagnoses frequency_fatigue when frequency is high', () => {
    const result = diagnosePsychology({
      cpm: 12,
      ctr: 0.015,
      frequency: 5.0,
    });
    expect(result.code).toBe('frequency_fatigue');
    expect(result.explanation).toContain('frequency');
  });

  // ── Healthy ───────────────────────────────────────────────
  it('returns healthy when all metrics are within range', () => {
    const result = diagnosePsychology({
      cpm: 12,
      hookRetention: 0.30,
      ctr: 0.015,
      landingCvr: 0.04,
      checkoutCvr: 0.55,
      frequency: 2.0,
    });
    expect(result.code).toBe('healthy');
  });

  // ── Custom Benchmarks ─────────────────────────────────────
  it('uses custom benchmarks when provided', () => {
    // With default benchmarks, CPM=20 wouldn't trigger (threshold 22.5)
    // With custom benchmark CPM=10, threshold is 15, so 20 triggers
    const result = diagnosePsychology({
      cpm: 20,
      benchmarks: { cpm: 10 },
    });
    expect(result.code).toBe('audience_mismatch');
  });

  // ── Decision tree priority ────────────────────────────────
  it('prioritizes CPM over other issues (tree order)', () => {
    const result = diagnosePsychology({
      cpm: 40,          // triggers audience_mismatch
      hookRetention: 0.05, // would trigger creative_execution
      ctr: 0.002,       // would trigger awareness_trigger_mismatch
    });
    expect(result.code).toBe('audience_mismatch');
  });

  it('prioritizes hook retention over CTR when CPM is OK', () => {
    const result = diagnosePsychology({
      cpm: 10,           // OK
      hookRetention: 0.05, // triggers creative_execution
      ctr: 0.002,        // would trigger mismatch
    });
    expect(result.code).toBe('creative_execution');
  });

  // ── Hypothesis context enrichment ─────────────────────────
  it('provides trigger-specific psychContext for promise_mismatch', () => {
    const result = diagnosePsychology({
      ctr: 0.015,
      landingCvr: 0.005,
      hypothesisContext: {
        awarenessLevel: 'SOLUTION_AWARE',
        emotionalState: 'SKEPTICAL',
        primaryTrigger: 'SOCIAL_PROOF_SPECIFICITY',
        primaryObjection: "How do I know it works?",
      },
    });
    expect(result.code).toBe('promise_mismatch');
    expect(result.psychContext).toContain('SOCIAL_PROOF_SPECIFICITY');
    expect(result.psychContext).toContain('How do I know it works?');
  });

  it('provides psychContext for commitment_friction', () => {
    const result = diagnosePsychology({
      ctr: 0.015,
      landingCvr: 0.04,
      checkoutCvr: 0.15,
      hypothesisContext: {
        awarenessLevel: 'PRODUCT_AWARE',
        emotionalState: 'ANXIOUS',
        primaryTrigger: 'ENDOWMENT_EFFECT',
        primaryObjection: "What if it doesn't work for me?",
      },
    });
    expect(result.code).toBe('commitment_friction');
    expect(result.psychContext).toContain('ENDOWMENT_EFFECT');
    expect(result.psychContext).toContain('RECIPROCITY');
  });

  // ── Edge Cases: NaN / Infinity / Negative ───────────────
  it('treats NaN inputs as missing → insufficient_data', () => {
    const result = diagnosePsychology({ cpm: NaN, ctr: NaN, hookRetention: NaN });
    expect(result.code).toBe('insufficient_data');
  });

  it('treats Infinity inputs as missing → insufficient_data', () => {
    const result = diagnosePsychology({ cpm: Infinity, ctr: -Infinity });
    expect(result.code).toBe('insufficient_data');
  });

  it('treats negative metric values as missing → insufficient_data', () => {
    const result = diagnosePsychology({ cpm: -10, ctr: -0.5, hookRetention: -1 });
    expect(result.code).toBe('insufficient_data');
  });

  it('treats negative CPM as missing and evaluates other metrics', () => {
    const result = diagnosePsychology({ cpm: -5, ctr: 0.003 });
    expect(result.code).toBe('awareness_trigger_mismatch');
  });

  // ── Boundary values ─────────────────────────────────────
  it('CPM exactly at 1.5x benchmark does NOT trigger audience_mismatch', () => {
    // Default benchmark 15, threshold = 15 * 1.5 = 22.5 (strict >)
    const result = diagnosePsychology({ cpm: 22.5 });
    expect(result.code).not.toBe('audience_mismatch');
  });

  it('frequency exactly at 3.5 does NOT trigger frequency_fatigue', () => {
    const result = diagnosePsychology({ cpm: 12, ctr: 0.015, frequency: 3.5 });
    expect(result.code).not.toBe('frequency_fatigue');
  });

  it('hookRetention exactly at 0.6x benchmark passes to CTR check', () => {
    // benchmark 0.25, 0.6x = 0.15. At exactly 0.15, Node 2 does NOT fire (strict <)
    const result = diagnosePsychology({ hookRetention: 0.15, ctr: 0.003 });
    expect(result.code).toBe('awareness_trigger_mismatch');
  });

  it('zero CTR fires awareness_trigger_mismatch', () => {
    const result = diagnosePsychology({ ctr: 0 });
    expect(result.code).toBe('awareness_trigger_mismatch');
  });

  it('frequency alone returns insufficient_data (gate requires cpm/ctr/hookRetention)', () => {
    const result = diagnosePsychology({ frequency: 5.0 });
    // insufficient_data gate fires because cpm/ctr/hookRetention are all null
    expect(result.code).toBe('insufficient_data');
  });

  it('frequency with at least cpm passes the gate and fires frequency_fatigue', () => {
    const result = diagnosePsychology({ cpm: 12, ctr: 0.015, frequency: 5.0 });
    expect(result.code).toBe('frequency_fatigue');
  });

  it('only CPM within range returns healthy', () => {
    const result = diagnosePsychology({ cpm: 12 });
    expect(result.code).toBe('healthy');
  });

  // ── MOST_AWARE psychContext branch ──────────────────────
  it('includes MOST_AWARE-specific psychContext for audience_mismatch', () => {
    const result = diagnosePsychology({
      cpm: 35,
      hypothesisContext: {
        awarenessLevel: 'MOST_AWARE',
        emotionalState: 'PROUD',
        primaryTrigger: 'COMMITMENT_CONSISTENCY',
        primaryObjection: 'Already bought from competitor',
      },
    });
    expect(result.code).toBe('audience_mismatch');
    expect(result.psychContext).toContain('MOST_AWARE');
    expect(result.psychContext).toContain('saturation');
  });

  // ── Priority: frequency vs promise_mismatch ──────────────
  it('promise_mismatch fires before frequency_fatigue', () => {
    const result = diagnosePsychology({
      cpm: 12,
      ctr: 0.015,
      landingCvr: 0.005, // low → promise_mismatch
      frequency: 5.0,     // high → would be fatigue
    });
    expect(result.code).toBe('promise_mismatch');
  });
});
