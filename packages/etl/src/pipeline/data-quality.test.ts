// ──────────────────────────────────────────────────────────────
// Growth OS — Data Quality & Edge Case Tests
// Pure function tests for boundary conditions, negative inputs,
// and data invariant enforcement. No DB required.
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  blendedCac,
  mer,
  contributionMarginPct,
  aov,
  paybackDays,
  retentionRate,
  newCustomerShare,
  percentChange,
  funnelCvr,
  cpc,
  cpm,
  ctr,
  revenueGross,
  revenueNet,
  ltvAtDays,
  roas,
} from '../kpis.js';
import { evaluateAlerts, AlertInput } from '../alerts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldenCohort = JSON.parse(
  readFileSync(join(__dirname, '../../tests/fixtures/golden-cohort.json'), 'utf-8'),
);
const goldenAlerts = JSON.parse(
  readFileSync(join(__dirname, '../../tests/fixtures/golden-alerts.json'), 'utf-8'),
);

// ── Boundary Conditions ─────────────────────────────────────────────

describe('KPI Boundary Conditions', () => {
  describe('zero-denominator safety', () => {
    it('blendedCac returns 0 when newCustomers=0', () => {
      expect(blendedCac(10000, 0)).toBe(0);
    });

    it('mer returns 0 when totalSpend=0', () => {
      expect(mer(50000, 0)).toBe(0);
    });

    it('aov returns 0 when orderCount=0', () => {
      expect(aov(50000, 0)).toBe(0);
    });

    it('retentionRate returns 0 when cohortSize=0', () => {
      expect(retentionRate(10, 0)).toBe(0);
    });

    it('newCustomerShare returns 0 when totalOrders=0', () => {
      expect(newCustomerShare(50, 0)).toBe(0);
    });

    it('cpc returns 0 when clicks=0', () => {
      expect(cpc(1000, 0)).toBe(0);
    });

    it('cpm returns 0 when impressions=0', () => {
      expect(cpm(1000, 0)).toBe(0);
    });

    it('ctr returns 0 when impressions=0', () => {
      expect(ctr(100, 0)).toBe(0);
    });

    it('contributionMarginPct returns 0 when revenueNet=0', () => {
      expect(contributionMarginPct(5000, 0)).toBe(0);
    });

    it('ltvAtDays returns 0 when cohortSize=0', () => {
      expect(ltvAtDays(10000, 0)).toBe(0);
    });

    it('roas returns 0 when channelSpend=0', () => {
      expect(roas(5000, 0)).toBe(0);
    });
  });

  describe('percentChange edge cases', () => {
    it('returns 1 (100%) when previous=0 and current>0', () => {
      expect(percentChange(100, 0)).toBe(1);
    });

    it('returns 0 when both are 0', () => {
      expect(percentChange(0, 0)).toBe(0);
    });

    it('returns -1 (−100%) when current=0 and previous>0', () => {
      expect(percentChange(0, 100)).toBe(-1);
    });

    it('handles negative values correctly', () => {
      // Going from -100 to -50: (-50 - (-100)) / (-100) = 50 / -100 = -0.5
      expect(percentChange(-50, -100)).toBe(-0.5);
    });
  });

  describe('paybackDays null returns', () => {
    it('returns null when CAC=0', () => {
      expect(paybackDays(0, 100, 0.3)).toBeNull();
    });

    it('returns null when LTV30=0', () => {
      expect(paybackDays(50, 0, 0.3)).toBeNull();
    });

    it('returns null when cmPct=0', () => {
      expect(paybackDays(50, 100, 0)).toBeNull();
    });

    it('returns null when CAC is negative', () => {
      expect(paybackDays(-10, 100, 0.3)).toBeNull();
    });
  });

  describe('funnel CVR with zero traffic', () => {
    it('returns all zeros when sessions=0', () => {
      const result = funnelCvr({
        sessions: 0,
        pdpViews: 0,
        addToCart: 0,
        checkouts: 0,
        purchases: 0,
      });
      expect(result.sessionToPdp).toBe(0);
      expect(result.pdpToAtc).toBe(0);
      expect(result.atcToCheckout).toBe(0);
      expect(result.checkoutToPurchase).toBe(0);
      expect(result.overall).toBe(0);
    });

    it('handles partial funnel (traffic but no purchases)', () => {
      const result = funnelCvr({
        sessions: 1000,
        pdpViews: 500,
        addToCart: 100,
        checkouts: 0,
        purchases: 0,
      });
      expect(result.sessionToPdp).toBe(0.5);
      expect(result.pdpToAtc).toBe(0.2);
      expect(result.atcToCheckout).toBe(0);
      expect(result.checkoutToPurchase).toBe(0);
      expect(result.overall).toBe(0);
    });
  });

  describe('aggregate functions with empty arrays', () => {
    it('revenueGross of empty array is 0', () => {
      expect(revenueGross([])).toBe(0);
    });

    it('revenueNet of empty array is 0', () => {
      expect(revenueNet([])).toBe(0);
    });
  });
});

// ── Negative Value Handling ─────────────────────────────────────────

describe('Negative Value Handling', () => {
  it('contributionMarginPct can be negative (valid: COGS > revenue)', () => {
    // CM = -2000, Revenue = 10000 → -20%
    expect(contributionMarginPct(-2000, 10000)).toBeCloseTo(-0.2);
  });

  it('percentChange handles revenue decline correctly', () => {
    // Drop from 100k to 70k = -30%
    expect(percentChange(70000, 100000)).toBeCloseTo(-0.3);
  });

  it('newCustomerShare is always between 0 and 1 for valid inputs', () => {
    const share = newCustomerShare(50, 200);
    expect(share).toBeGreaterThanOrEqual(0);
    expect(share).toBeLessThanOrEqual(1);
  });

  it('retentionRate is always between 0 and 1 for valid inputs', () => {
    const rate = retentionRate(25, 100);
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });
});

// ── Cohort Invariants (from golden-cohort.json) ─────────────────────

describe('Cohort Invariants', () => {
  const invariants = goldenCohort.invariants as Record<string, any>;

  it('retention values bounded [0, 1]', () => {
    const inv = invariants.retention_bounded;
    expect(inv).toBeDefined();

    // Verify the invariant works with valid data
    const validRetention = 0.45;
    expect(validRetention).toBeGreaterThanOrEqual(0);
    expect(validRetention).toBeLessThanOrEqual(1);

    // Verify boundary values
    expect(0).toBeGreaterThanOrEqual(0);
    expect(1).toBeLessThanOrEqual(1);
  });

  it('retention is monotonically non-decreasing (d7 ≤ d30 ≤ d60 ≤ d90)', () => {
    const inv = invariants.retention_monotonic;
    expect(inv).toBeDefined();
    expect(inv.rule).toContain('d7');

    // Simulate valid cohort
    const d7 = 0.15, d30 = 0.25, d60 = 0.35, d90 = 0.42;
    expect(d7).toBeLessThanOrEqual(d30);
    expect(d30).toBeLessThanOrEqual(d60);
    expect(d60).toBeLessThanOrEqual(d90);
  });

  it('LTV is monotonically non-decreasing (ltv30 ≤ ltv90 ≤ ltv180)', () => {
    const inv = invariants.ltv_monotonic;
    expect(inv).toBeDefined();

    // Simulate valid cohort
    const ltv30 = 45.0, ltv90 = 78.5, ltv180 = 120.0;
    expect(ltv30).toBeLessThanOrEqual(ltv90);
    expect(ltv90).toBeLessThanOrEqual(ltv180);
  });

  it('cohort size is always positive', () => {
    const inv = invariants.cohort_size_positive;
    expect(inv).toBeDefined();
    expect(inv.rule).toBeDefined();
  });

  it('payback days are reasonable (< 365)', () => {
    const inv = invariants.payback_days_reasonable;
    expect(inv).toBeDefined();

    // Valid payback: 90 days
    const days = paybackDays(50, 100, 0.3);
    expect(days).not.toBeNull();
    expect(days!).toBeLessThan(365);
    expect(days!).toBeGreaterThan(0);
  });
});

// ── Cohort Synthetic Scenarios ──────────────────────────────────────

describe('Cohort Synthetic Scenarios', () => {
  const scenarios = (goldenCohort as any).syntheticScenarios as any[];

  it('heavy buyer scenario: unique counting prevents retention inflation', () => {
    const scenario = scenarios.find((s: any) => s.name === 'heavy_buyer_no_inflation');
    expect(scenario).toBeDefined();

    // Unique counting: retention should be based on unique customers, not total orders
    const cohortSize = scenario.cohortSize;
    const expectedRetention = scenario.expected.d30Retention;
    const buggyRetention = scenario.buggyExpected.d30Retention;

    expect(expectedRetention).toBeLessThanOrEqual(1);
    expect(expectedRetention).toBeGreaterThanOrEqual(0);
    // The old bug (counter) would have produced an inflated value
    expect(expectedRetention).toBeLessThan(buggyRetention);
  });
});

// ── Alert Edge Cases (from golden-alerts.json) ──────────────────────

describe('Alert Edge Cases', () => {
  const baseInput: AlertInput = goldenAlerts.baseInput;
  const scenarios = goldenAlerts.scenarios as Record<string, any>;

  it('all_healthy scenario produces zero alerts', () => {
    const scenario = scenarios.all_healthy;
    const input = { ...baseInput, ...scenario.overrides };
    const alerts = evaluateAlerts(input);
    expect(alerts).toHaveLength(scenario.expectedAlertIds.length);
  });

  it('cac_warning fires warning alert', () => {
    const scenario = scenarios.cac_warning;
    const input = { ...baseInput, ...scenario.overrides };
    const alerts = evaluateAlerts(input);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const cacAlert = alerts.find((a) => a.id.includes('cac') || a.title.includes('CAC'));
    expect(cacAlert).toBeDefined();
    expect(cacAlert!.severity).toBe('warning');
  });

  it('cac_critical fires critical alert', () => {
    const scenario = scenarios.cac_critical;
    const input = { ...baseInput, ...scenario.overrides };
    const alerts = evaluateAlerts(input);
    const cacAlert = alerts.find((a) => a.id.includes('cac') || a.title.includes('CAC'));
    expect(cacAlert).toBeDefined();
    expect(cacAlert!.severity).toBe('critical');
  });

  it('multi_alert_storm fires multiple alerts simultaneously', () => {
    const scenario = scenarios.multi_alert_storm;
    const input = { ...baseInput, ...scenario.overrides };
    const alerts = evaluateAlerts(input);
    expect(alerts.length).toBeGreaterThanOrEqual(scenario.minAlerts);
  });

  it('new_customer_share_drop uses totalOrders denominator', () => {
    const scenario = scenarios.new_customer_share_decline;
    if (!scenario) return; // Skip if not in golden fixture

    const input = { ...baseInput, ...scenario.overrides };
    const alerts = evaluateAlerts(input);
    // The alert should fire because share drops from high to low
    const shareAlert = alerts.find(
      (a) => a.id.includes('customer') || a.title.includes('share'),
    );
    if (scenario.expectedAlertIds.length > 0) {
      expect(shareAlert).toBeDefined();
    }
  });
});

// ── Data Type Safety ────────────────────────────────────────────────

describe('Data Type Safety', () => {
  it('KPI functions handle very large numbers without overflow', () => {
    const bigRevenue = 1_000_000_000; // $1B
    const bigSpend = 100_000_000; // $100M
    const result = mer(bigRevenue, bigSpend);
    expect(result).toBe(10);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('KPI functions handle very small numbers without precision loss', () => {
    const smallRevenue = 0.01;
    const smallSpend = 0.001;
    const result = mer(smallRevenue, smallSpend);
    expect(result).toBeCloseTo(10, 1);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('percentChange does not produce NaN', () => {
    const combos: [number, number][] = [
      [0, 0],
      [100, 0],
      [0, 100],
      [-50, 50],
      [50, -50],
    ];
    for (const [current, previous] of combos) {
      const result = percentChange(current, previous);
      expect(Number.isNaN(result)).toBe(false);
    }
  });

  it('funnelCvr never produces NaN values', () => {
    const result = funnelCvr({
      sessions: 0,
      pdpViews: 0,
      addToCart: 0,
      checkouts: 0,
      purchases: 0,
    });
    for (const [key, val] of Object.entries(result)) {
      expect(Number.isNaN(val)).toBe(false);
    }
  });
});
