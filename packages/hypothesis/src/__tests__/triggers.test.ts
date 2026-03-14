import { describe, it, expect } from 'vitest';
import { TRIGGER_LIBRARY } from '../triggers.js';

const ALL_TRIGGERS = [
  'LOSS_AVERSION',
  'SOCIAL_PROOF_SPECIFICITY',
  'SOCIAL_PROOF_AUTHORITY',
  'IDENTITY_TRIBAL',
  'IDENTITY_ASPIRATIONAL',
  'COGNITIVE_EASE',
  'CURIOSITY_GAP',
  'ENDOWMENT_EFFECT',
  'REACTANCE',
  'RECIPROCITY',
  'CONTRAST_EFFECT',
  'PEAK_END_RULE',
  'SCARCITY',
  'COMMITMENT_CONSISTENCY',
  'AUTONOMY_BIAS',
  'SCARCITY_REAL',
  'SCARCITY_URGENCY',
  'SOCIAL_PROOF_SPECIFIC',
];

const VALID_AWARENESS_LEVELS = ['UNAWARE', 'PAIN_AWARE', 'SOLUTION_AWARE', 'PRODUCT_AWARE', 'MOST_AWARE'];
const VALID_FUNNEL_STAGES = ['TOFU', 'MOFU', 'BOFU', 'RETENTION'];
const VALID_VERTICALS = [
  'ECOMMERCE_DTC',
  'FOOD_BEVERAGE',
  'SAAS',
  'FITNESS',
  'BEAUTY',
  'HOME',
  'PETS',
  'OTHER',
];

describe('TRIGGER_LIBRARY', () => {
  it('contains all 18 triggers', () => {
    expect(Object.keys(TRIGGER_LIBRARY)).toHaveLength(18);
    for (const trigger of ALL_TRIGGERS) {
      expect(TRIGGER_LIBRARY[trigger]).toBeDefined();
    }
  });

  it.each(ALL_TRIGGERS)('%s has all required fields', (triggerId) => {
    const def = TRIGGER_LIBRARY[triggerId]!;
    expect(def).toBeDefined();
    expect(def.id).toBe(triggerId);
    expect(typeof def.name).toBe('string');
    expect(def.name.length).toBeGreaterThan(0);
    expect(typeof def.mechanism).toBe('string');
    expect(def.mechanism.length).toBeGreaterThan(20);
    expect(typeof def.failureMode).toBe('string');
    expect(def.failureMode.length).toBeGreaterThan(20);
  });

  it.each(ALL_TRIGGERS)('%s has 3-5 howToImplement entries', (triggerId) => {
    const def = TRIGGER_LIBRARY[triggerId]!;
    expect(def).toBeDefined();
    expect(def.howToImplement.length).toBeGreaterThanOrEqual(3);
    expect(def.howToImplement.length).toBeLessThanOrEqual(5);
    for (const item of def.howToImplement) {
      expect(typeof item).toBe('string');
      expect(item.length).toBeGreaterThan(10);
    }
  });

  it.each(ALL_TRIGGERS)('%s has non-empty bestFor arrays with valid values', (triggerId) => {
    const def = TRIGGER_LIBRARY[triggerId]!;
    expect(def).toBeDefined();

    expect(def.bestFor.awarenessLevels.length).toBeGreaterThan(0);
    for (const level of def.bestFor.awarenessLevels) {
      expect(VALID_AWARENESS_LEVELS).toContain(level);
    }

    expect(def.bestFor.funnelStages.length).toBeGreaterThan(0);
    for (const stage of def.bestFor.funnelStages) {
      expect(VALID_FUNNEL_STAGES).toContain(stage);
    }

    expect(def.bestFor.verticals.length).toBeGreaterThan(0);
    for (const vertical of def.bestFor.verticals) {
      expect(VALID_VERTICALS).toContain(vertical);
    }
  });

  it.each(ALL_TRIGGERS)('%s has non-empty antiPatterns', (triggerId) => {
    const def = TRIGGER_LIBRARY[triggerId]!;
    expect(def).toBeDefined();
    expect(def.antiPatterns.length).toBeGreaterThan(0);
    for (const pattern of def.antiPatterns) {
      expect(typeof pattern).toBe('string');
      expect(pattern.length).toBeGreaterThan(10);
    }
  });
});
