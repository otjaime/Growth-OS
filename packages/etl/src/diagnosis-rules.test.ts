// ──────────────────────────────────────────────────────────────
// Growth OS — Diagnosis Rules Engine Tests
// Golden fixtures with hand-calculated expected values.
// Covers all 8 rules + Rule 7 blocking behavior.
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { evaluateDiagnosisRules } from './diagnosis-rules.js';
import type { DiagnosisRuleInput } from './diagnosis-rules.js';

const NOW = new Date('2026-02-25T12:00:00Z');

function baseInput(overrides: Partial<DiagnosisRuleInput> = {}): DiagnosisRuleInput {
  return {
    adId: 'ad-1',
    adName: 'Test Ad',
    status: 'ACTIVE',
    createdAt: new Date('2026-02-20T12:00:00Z'), // 5 days old, past learning
    spend7d: 200,
    impressions7d: 10000,
    clicks7d: 300,
    conversions7d: 10,
    revenue7d: 800,
    roas7d: 4.0,
    ctr7d: 0.03,     // 3%
    cpc7d: 0.67,
    frequency7d: 2.0,
    spend14d: 180,
    impressions14d: 9000,
    clicks14d: 280,
    conversions14d: 9,
    revenue14d: 720,
    roas14d: 4.0,
    ctr14d: 0.031,    // 3.1%
    cpc14d: 0.64,
    frequency14d: 1.8,
    adSetDailyBudget: 100,
    ...overrides,
  };
}

// ── Rule 7: Learning Phase (blocks all others) ───────────────

describe('Rule 7: Learning Phase', () => {
  it('fires for ad younger than 48h', () => {
    const input = baseInput({
      createdAt: new Date('2026-02-25T00:00:00Z'), // 12h old
      roas7d: 0.5, // Would trigger negative ROAS, but learning should block it
      spend7d: 200,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('learning_phase');
    expect(results[0]!.actionType).toBe('NONE');
  });

  it('fires for ad with fewer than 500 impressions', () => {
    const input = baseInput({
      impressions7d: 300,
      roas7d: 0.3, // Would trigger negative ROAS
      spend7d: 100,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('learning_phase');
  });

  it('blocks ALL other rules when in learning phase', () => {
    const input = baseInput({
      createdAt: new Date('2026-02-25T06:00:00Z'), // 6h old
      // These would normally fire multiple rules:
      roas7d: 0.5,    // negative ROAS
      spend7d: 200,    // wasted budget
      conversions7d: 0,
      ctr7d: 0.002,   // low CTR
      frequency7d: 5.0, // creative fatigue
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results).toHaveLength(1);
    expect(results[0]!.ruleId).toBe('learning_phase');
  });

  it('does NOT fire for mature ad with sufficient impressions', () => {
    const input = baseInput(); // 5 days old, 10000 impressions
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.every((r) => r.ruleId !== 'learning_phase')).toBe(true);
  });
});

// ── Rule 1: Creative Fatigue ─────────────────────────────────

describe('Rule 1: Creative Fatigue', () => {
  it('fires when frequency > 4 AND CTR dropped > 20%', () => {
    // CTR dropped from 0.03 → 0.02 = 33.3% drop
    const input = baseInput({
      frequency7d: 5.0,
      ctr7d: 0.02,
      ctr14d: 0.03,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const fatigue = results.find((r) => r.ruleId === 'creative_fatigue');
    expect(fatigue).toBeDefined();
    expect(fatigue!.severity).toBe('WARNING');
    expect(fatigue!.actionType).toBe('GENERATE_COPY_VARIANTS');
  });

  it('does NOT fire if frequency <= 4', () => {
    const input = baseInput({
      frequency7d: 3.5,
      ctr7d: 0.02,
      ctr14d: 0.03,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'creative_fatigue')).toBeUndefined();
  });

  it('does NOT fire if CTR drop <= 20%', () => {
    // 0.03 → 0.025 = 16.7% drop (< 20%)
    const input = baseInput({
      frequency7d: 5.0,
      ctr7d: 0.025,
      ctr14d: 0.03,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'creative_fatigue')).toBeUndefined();
  });
});

// ── Rule 2: Negative ROAS ────────────────────────────────────

describe('Rule 2: Negative ROAS', () => {
  it('fires when ROAS < 1.0 AND spend > $50', () => {
    const input = baseInput({
      roas7d: 0.6,
      spend7d: 150,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const negRoas = results.find((r) => r.ruleId === 'negative_roas');
    expect(negRoas).toBeDefined();
    expect(negRoas!.severity).toBe('CRITICAL');
    expect(negRoas!.actionType).toBe('PAUSE_AD');
  });

  it('does NOT fire if ROAS >= 1.0', () => {
    const input = baseInput({
      roas7d: 1.0,
      spend7d: 200,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'negative_roas')).toBeUndefined();
  });

  it('does NOT fire if spend <= $50', () => {
    const input = baseInput({
      roas7d: 0.5,
      spend7d: 40,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'negative_roas')).toBeUndefined();
  });
});

// ── Rule 3: Winner Not Scaled ────────────────────────────────

describe('Rule 3: Winner Not Scaled', () => {
  it('fires when ROAS > 3.0, frequency < 2.0, budget < $200', () => {
    const input = baseInput({
      roas7d: 4.5,
      frequency7d: 1.5,
      adSetDailyBudget: 100,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const winner = results.find((r) => r.ruleId === 'winner_not_scaled');
    expect(winner).toBeDefined();
    expect(winner!.severity).toBe('INFO');
    expect(winner!.actionType).toBe('INCREASE_BUDGET');
    expect((winner!.suggestedValue as Record<string, number>).suggestedBudget).toBe(150);
  });

  it('does NOT fire if budget >= $200', () => {
    const input = baseInput({
      roas7d: 4.5,
      frequency7d: 1.5,
      adSetDailyBudget: 250,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'winner_not_scaled')).toBeUndefined();
  });

  it('does NOT fire if frequency >= 2.0', () => {
    const input = baseInput({
      roas7d: 4.5,
      frequency7d: 2.5,
      adSetDailyBudget: 100,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'winner_not_scaled')).toBeUndefined();
  });
});

// ── Rule 4: Wasted Budget ────────────────────────────────────

describe('Rule 4: Wasted Budget', () => {
  it('fires when spend > $100 AND conversions < 2 AND low ROAS', () => {
    const input = baseInput({
      spend7d: 250,
      conversions7d: 1,
      roas7d: 0.5,
      revenue7d: 125,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const wasted = results.find((r) => r.ruleId === 'wasted_budget');
    expect(wasted).toBeDefined();
    expect(wasted!.severity).toBe('WARNING');
    expect(wasted!.actionType).toBe('PAUSE_AD');
  });

  it('does NOT fire if conversions >= 2', () => {
    const input = baseInput({
      spend7d: 250,
      conversions7d: 5,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'wasted_budget')).toBeUndefined();
  });

  it('does NOT fire if ROAS > 2x despite low conversions', () => {
    const input = baseInput({
      spend7d: 250,
      conversions7d: 1,
      roas7d: 5.19,
      revenue7d: 1298,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'wasted_budget')).toBeUndefined();
  });

  it('fires when ROAS is null despite high spend', () => {
    const input = baseInput({
      spend7d: 300,
      conversions7d: 0,
      roas7d: null,
      revenue7d: 0,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const wasted = results.find((r) => r.ruleId === 'wasted_budget');
    expect(wasted).toBeDefined();
  });
});

// ── Rule 5: Low CTR ──────────────────────────────────────────

describe('Rule 5: Low CTR', () => {
  it('fires when CTR < 0.8% AND impressions > 1000', () => {
    const input = baseInput({
      ctr7d: 0.005,       // 0.5%
      impressions7d: 5000,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const lowCtr = results.find((r) => r.ruleId === 'low_ctr');
    expect(lowCtr).toBeDefined();
    expect(lowCtr!.severity).toBe('WARNING');
    expect(lowCtr!.actionType).toBe('GENERATE_COPY_VARIANTS');
  });

  it('does NOT fire if CTR >= 0.8%', () => {
    const input = baseInput({
      ctr7d: 0.01,        // 1.0%
      impressions7d: 5000,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'low_ctr')).toBeUndefined();
  });

  it('does NOT fire if impressions <= 1000', () => {
    const input = baseInput({
      ctr7d: 0.005,
      impressions7d: 800,
    });
    // 800 impressions < 500 threshold would trigger learning phase, so bump createdAt
    // Actually 800 > 500 so learning won't fire. Let me check: Rule 5 requires impressions7d > 1000
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'low_ctr')).toBeUndefined();
  });
});

// ── Rule 6: Click No Buy ─────────────────────────────────────

describe('Rule 6: Click No Buy', () => {
  it('fires when CTR > 2% AND conversion rate < 0.5%', () => {
    const input = baseInput({
      ctr7d: 0.025,         // 2.5%
      clicks7d: 500,
      conversions7d: 1,     // conversion rate = 1/500 = 0.2%
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const clickNoBuy = results.find((r) => r.ruleId === 'click_no_buy');
    expect(clickNoBuy).toBeDefined();
    expect(clickNoBuy!.severity).toBe('WARNING');
    expect(clickNoBuy!.actionType).toBe('REFRESH_CREATIVE');
  });

  it('does NOT fire if conversion rate >= 0.5%', () => {
    const input = baseInput({
      ctr7d: 0.025,
      clicks7d: 500,
      conversions7d: 10,    // 10/500 = 2%
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'click_no_buy')).toBeUndefined();
  });
});

// ── Rule 8: Paused Positive ──────────────────────────────────

describe('Rule 8: Paused Positive', () => {
  it('fires when status=PAUSED AND previous ROAS > 2.0', () => {
    const input = baseInput({
      status: 'PAUSED',
      roas14d: 3.5,
      spend14d: 200,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const paused = results.find((r) => r.ruleId === 'paused_positive');
    expect(paused).toBeDefined();
    expect(paused!.severity).toBe('INFO');
    expect(paused!.actionType).toBe('REACTIVATE_AD');
  });

  it('does NOT fire if status=ACTIVE', () => {
    const input = baseInput({
      status: 'ACTIVE',
      roas14d: 3.5,
      spend14d: 200,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'paused_positive')).toBeUndefined();
  });

  it('does NOT fire if previous ROAS <= 2.0', () => {
    const input = baseInput({
      status: 'PAUSED',
      roas14d: 1.5,
      spend14d: 200,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'paused_positive')).toBeUndefined();
  });

  it('does NOT fire if previous spend too low', () => {
    const input = baseInput({
      status: 'PAUSED',
      roas14d: 3.5,
      spend14d: 20,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results.find((r) => r.ruleId === 'paused_positive')).toBeUndefined();
  });
});

// ── Multi-rule interactions ──────────────────────────────────

describe('Multi-rule interactions', () => {
  it('healthy ad triggers zero diagnoses', () => {
    const input = baseInput(); // defaults: good ROAS, reasonable frequency, decent CTR
    const results = evaluateDiagnosisRules(input, NOW);
    expect(results).toHaveLength(0);
  });

  it('multiple rules can fire for same ad', () => {
    // Low ROAS + wasted budget + low CTR
    const input = baseInput({
      roas7d: 0.4,
      spend7d: 250,
      conversions7d: 0,
      ctr7d: 0.003,
      impressions7d: 5000,
      clicks7d: 15,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    const ruleIds = results.map((r) => r.ruleId);
    expect(ruleIds).toContain('negative_roas');
    expect(ruleIds).toContain('wasted_budget');
    expect(ruleIds).toContain('low_ctr');
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('paused ads only trigger paused_positive rule', () => {
    const input = baseInput({
      status: 'PAUSED',
      roas7d: 0.5,      // would trigger negative ROAS if active
      spend7d: 200,      // would trigger wasted budget if active
      conversions7d: 0,
      roas14d: 3.0,
      spend14d: 100,
    });
    const results = evaluateDiagnosisRules(input, NOW);
    // All active-only rules should be skipped; only paused_positive may fire
    const activeRules = results.filter((r) => ['negative_roas', 'wasted_budget', 'low_ctr', 'creative_fatigue', 'click_no_buy', 'winner_not_scaled'].includes(r.ruleId));
    expect(activeRules).toHaveLength(0);
  });
});
