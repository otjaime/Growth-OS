// ──────────────────────────────────────────────────────────────
// Growth OS — Alert Engine Tests
// Tests all 7 alert rules with edge cases
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { evaluateAlerts, type AlertInput } from './alerts.js';

function baseInput(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    currentRevenue: 100000,
    currentSpend: 20000,
    currentNewCustomers: 200,
    currentTotalOrders: 500,
    currentContributionMargin: 30000,
    currentRevenueNet: 90000,
    currentD30Retention: 0.25,

    previousRevenue: 100000,
    previousSpend: 20000,
    previousNewCustomers: 200,
    previousTotalOrders: 500,
    previousContributionMargin: 30000,
    previousRevenueNet: 90000,
    previousD30Retention: 0.25,
    baselineD30Retention: 0.25,

    ...overrides,
  };
}

describe('evaluateAlerts', () => {
  // ── Rule 1: CAC increase > 15% WoW ──
  describe('CAC increase alert', () => {
    it('fires warning when CAC increases >15%', () => {
      // Previous CAC = 20000/200 = 100, Current CAC = 20000/150 = 133.33, change = 33.3%
      const input = baseInput({ currentNewCustomers: 150 });
      const alerts = evaluateAlerts(input);
      const cacAlert = alerts.find((a) => a.id === 'cac_increase');
      expect(cacAlert).toBeDefined();
      expect(cacAlert!.severity).toBe('critical'); // 33% > 30%
    });

    it('fires warning (not critical) when CAC increases 16-30%', () => {
      // Previous CAC = 100, Current CAC ≈ 117, change ≈ 17%
      const input = baseInput({ currentNewCustomers: 171 });
      const alerts = evaluateAlerts(input);
      const cacAlert = alerts.find((a) => a.id === 'cac_increase');
      expect(cacAlert).toBeDefined();
      expect(cacAlert!.severity).toBe('warning');
    });

    it('does NOT fire when CAC is stable', () => {
      const input = baseInput();
      const alerts = evaluateAlerts(input);
      const cacAlert = alerts.find((a) => a.id === 'cac_increase');
      expect(cacAlert).toBeUndefined();
    });

    it('does NOT fire when CAC decreases', () => {
      const input = baseInput({ currentNewCustomers: 250 });
      const alerts = evaluateAlerts(input);
      const cacAlert = alerts.find((a) => a.id === 'cac_increase');
      expect(cacAlert).toBeUndefined();
    });
  });

  // ── Rule 2: CM% down > 3pp WoW ──
  describe('CM% decline alert', () => {
    it('fires warning when CM% drops >3pp', () => {
      // Previous CM% = 30000/90000 = 33.3%, Current CM% = 25000/90000 = 27.8%, drop = 5.6pp
      const input = baseInput({ currentContributionMargin: 25000 });
      const alerts = evaluateAlerts(input);
      const cmAlert = alerts.find((a) => a.id === 'cm_decrease');
      expect(cmAlert).toBeDefined();
      expect(cmAlert!.severity).toBe('warning');
    });

    it('fires critical when CM% drops >6pp', () => {
      // Previous CM% = 33.3%, Current CM% = 20000/90000 = 22.2%, drop = 11.1pp
      const input = baseInput({ currentContributionMargin: 20000 });
      const alerts = evaluateAlerts(input);
      const cmAlert = alerts.find((a) => a.id === 'cm_decrease');
      expect(cmAlert).toBeDefined();
      expect(cmAlert!.severity).toBe('critical');
    });

    it('does NOT fire when CM% is stable', () => {
      const input = baseInput();
      const alerts = evaluateAlerts(input);
      const cmAlert = alerts.find((a) => a.id === 'cm_decrease');
      expect(cmAlert).toBeUndefined();
    });
  });

  // ── Rule 3: D30 Retention drop > 5pp vs baseline ──
  describe('D30 retention alert', () => {
    it('fires warning when retention drops >5pp vs baseline', () => {
      const input = baseInput({
        currentD30Retention: 0.18,
        baselineD30Retention: 0.25,
      });
      const alerts = evaluateAlerts(input);
      const retAlert = alerts.find((a) => a.id === 'retention_drop');
      expect(retAlert).toBeDefined();
      expect(retAlert!.severity).toBe('warning');
    });

    it('fires critical when retention drops >10pp', () => {
      const input = baseInput({
        currentD30Retention: 0.12,
        baselineD30Retention: 0.25,
      });
      const alerts = evaluateAlerts(input);
      const retAlert = alerts.find((a) => a.id === 'retention_drop');
      expect(retAlert).toBeDefined();
      expect(retAlert!.severity).toBe('critical');
    });

    it('does NOT fire when retention is at baseline', () => {
      const input = baseInput();
      const alerts = evaluateAlerts(input);
      const retAlert = alerts.find((a) => a.id === 'retention_drop');
      expect(retAlert).toBeUndefined();
    });
  });

  // ── Rule 4: MER deterioration ──
  describe('MER deterioration alert', () => {
    it('fires when spend up but revenue flat', () => {
      // Spend up 20% (20k → 24k), revenue flat (100k → 101k), MER drops
      // Previous MER = 100k/20k = 5.0, Current MER = 101k/24k = 4.21, change = -15.8%
      const input = baseInput({
        currentSpend: 24000,
        currentRevenue: 101000,
        // Need to keep new customers enough to avoid CAC alert
        currentNewCustomers: 200,
      });
      const alerts = evaluateAlerts(input);
      const merAlert = alerts.find((a) => a.id === 'mer_deterioration');
      expect(merAlert).toBeDefined();
      expect(merAlert!.severity).toBe('warning');
    });

    it('does NOT fire when revenue grows with spend', () => {
      const input = baseInput({
        currentSpend: 24000,
        currentRevenue: 130000,
        currentNewCustomers: 240,
      });
      const alerts = evaluateAlerts(input);
      const merAlert = alerts.find((a) => a.id === 'mer_deterioration');
      expect(merAlert).toBeUndefined();
    });
  });

  // ── Rule 5: Per-channel CAC spikes ──
  describe('Per-channel CAC alerts', () => {
    it('fires when channel CAC spikes >25%', () => {
      const input = baseInput({
        channels: [
          {
            name: 'Meta Ads',
            currentSpend: 8000,
            currentRevenue: 30000,
            previousSpend: 5000,
            previousRevenue: 30000,
            currentNewCustomers: 40,
            previousNewCustomers: 50,
          },
        ],
      });
      const alerts = evaluateAlerts(input);
      const chAlert = alerts.find((a) => a.id === 'channel_cac_meta ads');
      expect(chAlert).toBeDefined();
    });

    it('does NOT fire for low-spend channels', () => {
      const input = baseInput({
        channels: [
          {
            name: 'Organic',
            currentSpend: 100,
            currentRevenue: 5000,
            previousSpend: 50,
            previousRevenue: 5000,
            currentNewCustomers: 1,
            previousNewCustomers: 2,
          },
        ],
      });
      const alerts = evaluateAlerts(input);
      const chAlert = alerts.find((a) => a.id === 'channel_cac_organic');
      expect(chAlert).toBeUndefined();
    });
  });

  // ── Rule 6: Revenue declining ──
  describe('Revenue decline alert', () => {
    it('fires warning when revenue drops >10%', () => {
      const input = baseInput({ currentRevenue: 85000 });
      const alerts = evaluateAlerts(input);
      const revAlert = alerts.find((a) => a.id === 'revenue_decline');
      expect(revAlert).toBeDefined();
      expect(revAlert!.severity).toBe('warning');
    });

    it('fires critical when revenue drops >20%', () => {
      const input = baseInput({ currentRevenue: 75000 });
      const alerts = evaluateAlerts(input);
      const revAlert = alerts.find((a) => a.id === 'revenue_decline');
      expect(revAlert).toBeDefined();
      expect(revAlert!.severity).toBe('critical');
    });

    it('does NOT fire when revenue is stable', () => {
      const input = baseInput();
      const alerts = evaluateAlerts(input);
      const revAlert = alerts.find((a) => a.id === 'revenue_decline');
      expect(revAlert).toBeUndefined();
    });
  });

  // ── Rule 7: New customer acquisition slowing ──
  describe('New customer acquisition alert', () => {
    it('fires when new customer share drops > 8pp', () => {
      // Current share = 100/500 = 20%, Previous share = 200/500 = 40%, drop = 20pp
      const input = baseInput({
        currentNewCustomers: 100,
        currentTotalOrders: 500,
        previousNewCustomers: 200,
        previousTotalOrders: 500,
      });
      const alerts = evaluateAlerts(input);
      const acqAlert = alerts.find((a) => a.id === 'new_customer_decline');
      expect(acqAlert).toBeDefined();
      expect(acqAlert!.severity).toBe('info');
    });

    it('does NOT fire when acquisition is stable', () => {
      const input = baseInput();
      const alerts = evaluateAlerts(input);
      const acqAlert = alerts.find((a) => a.id === 'new_customer_decline');
      expect(acqAlert).toBeUndefined();
    });
  });

  // ── Composite ──
  describe('multiple alerts', () => {
    it('can fire multiple alerts at once', () => {
      // Revenue down 15%, CM% down 5pp, CAC up
      const input = baseInput({
        currentRevenue: 85000,
        currentNewCustomers: 150,
        currentContributionMargin: 25000,
      });
      const alerts = evaluateAlerts(input);
      expect(alerts.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty when all metrics are healthy', () => {
      const input = baseInput();
      const alerts = evaluateAlerts(input);
      expect(alerts.length).toBe(0);
    });
  });
});
