import { describe, it, expect } from 'vitest';
import { allocateBudget } from './budget-allocator.js';

describe('budget-allocator', () => {
  describe('allocateBudget', () => {
    it('returns empty for empty campaigns', () => {
      const result = allocateBudget({
        totalDailyBudget: 100,
        campaigns: [],
      });
      expect(result).toEqual([]);
    });

    it('returns empty for zero budget', () => {
      const result = allocateBudget({
        totalDailyBudget: 0,
        campaigns: [{ type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: null, actualSpend: 0, productCount: 1 }],
      });
      expect(result).toEqual([]);
    });

    it('allocates by base type percentages', () => {
      const result = allocateBudget({
        totalDailyBudget: 100,
        campaigns: [
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: null, actualSpend: 0, productCount: 1 },
          { type: 'CATEGORY', estimatedRoas: 2, actualRoas: null, actualSpend: 0, productCount: 3 },
          { type: 'SEASONAL', estimatedRoas: 2.5, actualRoas: null, actualSpend: 0, productCount: 2 },
          { type: 'NEW_ARRIVAL', estimatedRoas: 2, actualRoas: null, actualSpend: 0, productCount: 2 },
          { type: 'CROSS_SELL', estimatedRoas: 2, actualRoas: null, actualSpend: 0, productCount: 2 },
        ],
      });

      expect(result).toHaveLength(5);

      // Total should not exceed budget
      const total = result.reduce((sum, r) => sum + r.allocatedBudget, 0);
      expect(total).toBeCloseTo(100, 0);

      // HERO_PRODUCT should get roughly 40%
      const hero = result.find((r) => r.campaignIndex === 0);
      expect(hero).toBeDefined();
      expect(hero!.allocatedBudget).toBeGreaterThan(30);
    });

    it('boosts allocation for high-ROAS campaigns', () => {
      const result = allocateBudget({
        totalDailyBudget: 100,
        campaigns: [
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: 3.5, actualSpend: 200, productCount: 1 },
          { type: 'CATEGORY', estimatedRoas: 2, actualRoas: 1.2, actualSpend: 100, productCount: 3 },
        ],
      });

      const hero = result.find((r) => r.campaignIndex === 0);
      expect(hero).toBeDefined();

      // Hero with ROAS 3.5 should get more than its base 40%
      // because it gets boosted and also receives redistributed excess
      expect(hero!.allocatedBudget).toBeGreaterThan(40);
      expect(hero!.reason).toContain('Boosted');
    });

    it('penalizes allocation for low-ROAS campaigns with significant spend', () => {
      const result = allocateBudget({
        totalDailyBudget: 100,
        campaigns: [
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: 0.5, actualSpend: 200, productCount: 1 },
          { type: 'CATEGORY', estimatedRoas: 2, actualRoas: null, actualSpend: 0, productCount: 3 },
        ],
      });

      const hero = result.find((r) => r.campaignIndex === 0);
      expect(hero).toBeDefined();

      // Hero with ROAS 0.5 and $200 spend should be penalized
      expect(hero!.reason).toContain('Reduced');
    });

    it('does not penalize low-ROAS campaigns with low spend', () => {
      const result = allocateBudget({
        totalDailyBudget: 100,
        campaigns: [
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: 0.5, actualSpend: 50, productCount: 1 },
          { type: 'CATEGORY', estimatedRoas: 2, actualRoas: null, actualSpend: 0, productCount: 3 },
        ],
      });

      const hero = result.find((r) => r.campaignIndex === 0);
      expect(hero).toBeDefined();

      // Low ROAS but only $50 spend — should not be penalized
      expect(hero!.reason).not.toContain('Reduced');
    });

    it('enforces minimum $5/day per campaign', () => {
      const result = allocateBudget({
        totalDailyBudget: 15,
        campaigns: [
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: null, actualSpend: 0, productCount: 1 },
          { type: 'CATEGORY', estimatedRoas: 2, actualRoas: null, actualSpend: 0, productCount: 3 },
          { type: 'SEASONAL', estimatedRoas: 2.5, actualRoas: null, actualSpend: 0, productCount: 2 },
        ],
      });

      for (const allocation of result) {
        expect(allocation.allocatedBudget).toBeGreaterThanOrEqual(5);
      }
    });

    it('never exceeds total budget', () => {
      const result = allocateBudget({
        totalDailyBudget: 50,
        campaigns: [
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: 4.0, actualSpend: 300, productCount: 1 },
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: 3.0, actualSpend: 200, productCount: 1 },
          { type: 'CATEGORY', estimatedRoas: 2, actualRoas: 2.5, actualSpend: 150, productCount: 3 },
          { type: 'SEASONAL', estimatedRoas: 2.5, actualRoas: 2.0, actualSpend: 100, productCount: 2 },
        ],
      });

      const total = result.reduce((sum, r) => sum + r.allocatedBudget, 0);
      expect(total).toBeLessThanOrEqual(50.01); // Allow tiny rounding
    });

    it('redistributes excess to high performers', () => {
      const result = allocateBudget({
        totalDailyBudget: 100,
        campaigns: [
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: 5.0, actualSpend: 300, productCount: 1 },
          { type: 'CATEGORY', estimatedRoas: 2, actualRoas: 0.8, actualSpend: 200, productCount: 3 },
        ],
      });

      const hero = result.find((r) => r.campaignIndex === 0);
      const category = result.find((r) => r.campaignIndex === 1);
      expect(hero).toBeDefined();
      expect(category).toBeDefined();

      // Hero (high ROAS) should get the lion's share
      expect(hero!.allocatedBudget).toBeGreaterThan(category!.allocatedBudget);
    });

    it('splits budget evenly among campaigns of the same type', () => {
      const result = allocateBudget({
        totalDailyBudget: 100,
        campaigns: [
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: null, actualSpend: 0, productCount: 1 },
          { type: 'HERO_PRODUCT', estimatedRoas: 3, actualRoas: null, actualSpend: 0, productCount: 1 },
        ],
      });

      // Both hero campaigns should get roughly equal shares
      const budgets = result.map((r) => r.allocatedBudget);
      expect(Math.abs(budgets[0]! - budgets[1]!)).toBeLessThan(1);
    });

    it('handles unknown campaign types gracefully with default allocation', () => {
      const result = allocateBudget({
        totalDailyBudget: 100,
        campaigns: [
          { type: 'UNKNOWN_TYPE', estimatedRoas: 2, actualRoas: null, actualSpend: 0, productCount: 1 },
        ],
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.allocatedBudget).toBeGreaterThanOrEqual(5);
    });
  });
});
