import { describe, it, expect } from 'vitest';
import {
  selectTrigger,
  mapMetricToPsychSignal,
  inferAwarenessFromFunnel,
  TRIGGER_MATRIX,
  AWARENESS_LEVELS,
  EMOTIONAL_STATES,
  PSYCH_TRIGGERS,
  type AwarenessLevel,
  type EmotionalState,
  type PsychTrigger,
  type TriggerPerformanceData,
} from './trigger-selection.js';

// ── Matrix Completeness ──

describe('TRIGGER_MATRIX completeness', () => {
  it('has an entry for every awareness × emotion combination (40 cells)', () => {
    let count = 0;
    for (const awareness of AWARENESS_LEVELS) {
      for (const emotion of EMOTIONAL_STATES) {
        const entry = TRIGGER_MATRIX[awareness][emotion];
        expect(entry, `Missing: ${awareness} × ${emotion}`).toBeDefined();
        expect(entry.primary).toBeTruthy();
        expect(entry.secondary).toBeTruthy();
        count++;
      }
    }
    expect(count).toBe(40);
  });

  it('never uses REACTANCE as a primary trigger in the theoretical matrix', () => {
    for (const awareness of AWARENESS_LEVELS) {
      for (const emotion of EMOTIONAL_STATES) {
        const entry = TRIGGER_MATRIX[awareness][emotion];
        expect(entry.primary, `REACTANCE as primary at ${awareness} × ${emotion}`).not.toBe('REACTANCE');
      }
    }
  });

  it('primary and secondary are always different', () => {
    for (const awareness of AWARENESS_LEVELS) {
      for (const emotion of EMOTIONAL_STATES) {
        const entry = TRIGGER_MATRIX[awareness][emotion];
        expect(entry.primary, `Same primary/secondary at ${awareness} × ${emotion}`).not.toBe(entry.secondary);
      }
    }
  });
});

// ── selectTrigger — Theoretical Mode ──

describe('selectTrigger — theoretical (no empirical data)', () => {
  it.each<[AwarenessLevel, EmotionalState, PsychTrigger]>([
    ['UNAWARE', 'BORED', 'CURIOSITY_GAP'],
    ['UNAWARE', 'ASPIRATIONAL', 'IDENTITY_ASPIRATIONAL'],
    ['PAIN_AWARE', 'FRUSTRATED', 'LOSS_AVERSION'],
    ['PAIN_AWARE', 'ANXIOUS', 'COGNITIVE_EASE'],
    ['SOLUTION_AWARE', 'SKEPTICAL', 'SOCIAL_PROOF_SPECIFICITY'],
    ['SOLUTION_AWARE', 'CURIOUS', 'CONTRAST_EFFECT'],
    ['PRODUCT_AWARE', 'ANXIOUS', 'ENDOWMENT_EFFECT'],
    ['PRODUCT_AWARE', 'SKEPTICAL', 'SOCIAL_PROOF_SPECIFICITY'],
    ['MOST_AWARE', 'HOPEFUL', 'COMMITMENT_CONSISTENCY'],
    ['MOST_AWARE', 'ANXIOUS', 'SCARCITY'],
  ])('%s + %s → %s', (awareness, emotion, expectedPrimary) => {
    const result = selectTrigger({
      awarenessLevel: awareness,
      emotionalState: emotion,
      vertical: 'test',
      funnelStage: 'MOFU',
    });
    expect(result.primary).toBe(expectedPrimary);
    expect(result.source).toBe('theoretical_matrix');
    expect(result.confidence).toBe('LOW');
  });

  it('returns rationale mentioning FIELD CALIBRATION NEEDED', () => {
    const result = selectTrigger({
      awarenessLevel: 'UNAWARE',
      emotionalState: 'BORED',
      vertical: 'test',
      funnelStage: 'TOFU',
    });
    expect(result.rationale).toContain('FIELD CALIBRATION NEEDED');
  });
});

// ── selectTrigger — Empirical Override ──

describe('selectTrigger — empirical override (HIGH confidence)', () => {
  it('overrides theoretical when HIGH confidence + 30+ samples + good win rate', () => {
    const records: TriggerPerformanceData[] = [
      { trigger: 'RECIPROCITY', sampleSize: 35, winRate: 0.65, avgRoasDelta: 0.4, confidenceLevel: 'HIGH' },
    ];
    const result = selectTrigger({
      awarenessLevel: 'UNAWARE',
      emotionalState: 'BORED',
      vertical: 'premium_food',
      funnelStage: 'TOFU',
      performanceRecords: records,
    });
    expect(result.primary).toBe('RECIPROCITY');
    expect(result.source).toBe('empirical_override');
    expect(result.confidence).toBe('HIGH');
  });

  it('picks the highest win rate among HIGH confidence records', () => {
    const records: TriggerPerformanceData[] = [
      { trigger: 'RECIPROCITY', sampleSize: 35, winRate: 0.55, avgRoasDelta: 0.3, confidenceLevel: 'HIGH' },
      { trigger: 'LOSS_AVERSION', sampleSize: 40, winRate: 0.70, avgRoasDelta: 0.5, confidenceLevel: 'HIGH' },
    ];
    const result = selectTrigger({
      awarenessLevel: 'UNAWARE',
      emotionalState: 'BORED',
      vertical: 'test',
      funnelStage: 'TOFU',
      performanceRecords: records,
    });
    expect(result.primary).toBe('LOSS_AVERSION');
  });

  it('does NOT override if win rate is below 40%', () => {
    const records: TriggerPerformanceData[] = [
      { trigger: 'RECIPROCITY', sampleSize: 35, winRate: 0.30, avgRoasDelta: -0.1, confidenceLevel: 'HIGH' },
    ];
    const result = selectTrigger({
      awarenessLevel: 'UNAWARE',
      emotionalState: 'BORED',
      vertical: 'test',
      funnelStage: 'TOFU',
      performanceRecords: records,
    });
    expect(result.source).toBe('theoretical_matrix');
  });

  it('never overrides with REACTANCE even if it has the best win rate', () => {
    const records: TriggerPerformanceData[] = [
      { trigger: 'REACTANCE', sampleSize: 50, winRate: 0.90, avgRoasDelta: 1.0, confidenceLevel: 'HIGH' },
    ];
    const result = selectTrigger({
      awarenessLevel: 'SOLUTION_AWARE',
      emotionalState: 'FRUSTRATED',
      vertical: 'test',
      funnelStage: 'MOFU',
      performanceRecords: records,
    });
    expect(result.primary).not.toBe('REACTANCE');
  });
});

// ── selectTrigger — Blended Mode ──

describe('selectTrigger — blended (MEDIUM confidence)', () => {
  it('blends when MEDIUM confidence and high win rate', () => {
    const records: TriggerPerformanceData[] = [
      { trigger: 'RECIPROCITY', sampleSize: 20, winRate: 0.70, avgRoasDelta: 0.5, confidenceLevel: 'MEDIUM' },
    ];
    const result = selectTrigger({
      awarenessLevel: 'UNAWARE',
      emotionalState: 'BORED',
      vertical: 'test',
      funnelStage: 'TOFU',
      performanceRecords: records,
    });
    // RECIPROCITY has 0.70 * 0.40 = 0.28 empirical score
    // theoretical baseline 0.50 * 0.60 = 0.30
    // 0.28 < 0.30 → should NOT override
    expect(result.source).toBe('theoretical_matrix');
  });

  it('overrides in blended mode when empirical score beats theoretical', () => {
    const records: TriggerPerformanceData[] = [
      { trigger: 'RECIPROCITY', sampleSize: 25, winRate: 0.85, avgRoasDelta: 0.8, confidenceLevel: 'MEDIUM' },
    ];
    const result = selectTrigger({
      awarenessLevel: 'UNAWARE',
      emotionalState: 'BORED',
      vertical: 'test',
      funnelStage: 'TOFU',
      performanceRecords: records,
    });
    // 0.85 * 0.40 = 0.34 > 0.50 * 0.60 = 0.30 → should override
    expect(result.primary).toBe('RECIPROCITY');
    expect(result.source).toBe('blended');
    expect(result.confidence).toBe('MEDIUM');
  });

  it('uses theoretical primary as secondary when blending', () => {
    const records: TriggerPerformanceData[] = [
      { trigger: 'RECIPROCITY', sampleSize: 25, winRate: 0.85, avgRoasDelta: 0.8, confidenceLevel: 'MEDIUM' },
    ];
    const result = selectTrigger({
      awarenessLevel: 'UNAWARE',
      emotionalState: 'BORED',
      vertical: 'test',
      funnelStage: 'TOFU',
      performanceRecords: records,
    });
    // Theoretical primary for UNAWARE + BORED = CURIOSITY_GAP
    expect(result.secondary).toBe('CURIOSITY_GAP');
  });

  it('does not blend when empirical matches theoretical primary', () => {
    // CURIOSITY_GAP is already the theoretical primary for UNAWARE + BORED
    const records: TriggerPerformanceData[] = [
      { trigger: 'CURIOSITY_GAP', sampleSize: 20, winRate: 0.85, avgRoasDelta: 0.6, confidenceLevel: 'MEDIUM' },
    ];
    const result = selectTrigger({
      awarenessLevel: 'UNAWARE',
      emotionalState: 'BORED',
      vertical: 'test',
      funnelStage: 'TOFU',
      performanceRecords: records,
    });
    // Same trigger as theoretical primary → no blend needed
    expect(result.source).toBe('theoretical_matrix');
  });
});

// ── mapMetricToPsychSignal ──

describe('mapMetricToPsychSignal', () => {
  it.each([
    ['cpm', 0.30, 'targeting mismatch'],
    ['hook_retention', -0.20, 'Pattern interrupt failed'],
    ['ctr', -0.30, 'Severe message-awareness mismatch'],
    ['ctr', -0.15, 'Moderate message drift'],
    ['landing_cvr', -0.10, 'Ad-to-page disconnect'],
    ['checkout_cvr', -0.15, 'Commitment friction'],
    ['roas', -0.20, 'End-to-end model failure'],
    ['frequency', 0.50, 'saturation'],
  ])('%s with delta %s contains "%s"', (metric, delta, expectedSubstring) => {
    const signal = mapMetricToPsychSignal(metric, delta);
    expect(signal.psychologicalMeaning).toContain(expectedSubstring);
    expect(signal.suggestedInvestigation).toBeTruthy();
  });

  it('handles unknown metrics gracefully', () => {
    const signal = mapMetricToPsychSignal('unknown_metric', 0.15);
    expect(signal.metric).toBe('unknown_metric');
    expect(signal.psychologicalMeaning).toContain('No specific psychological mapping');
  });

  it('handles positive deltas for ctr', () => {
    const signal = mapMetricToPsychSignal('ctr', 0.20);
    expect(signal.psychologicalMeaning).toContain('alignment is strong');
  });
});

// ── inferAwarenessFromFunnel ──

describe('inferAwarenessFromFunnel', () => {
  it('TOFU maps to UNAWARE and PAIN_AWARE', () => {
    expect(inferAwarenessFromFunnel('TOFU')).toEqual(['UNAWARE', 'PAIN_AWARE']);
  });

  it('MOFU maps to PAIN_AWARE through PRODUCT_AWARE', () => {
    expect(inferAwarenessFromFunnel('MOFU')).toEqual(['PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE']);
  });

  it('BOFU maps to PRODUCT_AWARE and MOST_AWARE', () => {
    expect(inferAwarenessFromFunnel('BOFU')).toEqual(['PRODUCT_AWARE', 'MOST_AWARE']);
  });

  it('RETENTION maps to MOST_AWARE', () => {
    expect(inferAwarenessFromFunnel('RETENTION')).toEqual(['MOST_AWARE']);
  });
});

// ── Constants ──

describe('constants', () => {
  it('AWARENESS_LEVELS has 5 entries', () => {
    expect(AWARENESS_LEVELS).toHaveLength(5);
  });

  it('EMOTIONAL_STATES has 8 entries', () => {
    expect(EMOTIONAL_STATES).toHaveLength(8);
  });

  it('PSYCH_TRIGGERS has 14 entries', () => {
    expect(PSYCH_TRIGGERS).toHaveLength(14);
  });
});
