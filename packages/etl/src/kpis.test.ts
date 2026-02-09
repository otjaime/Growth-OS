// ──────────────────────────────────────────────────────────────
// Growth OS — KPI Unit Tests
// 30+ test cases covering every metric function
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  revenueGross,
  revenueNet,
  contributionMarginTotal,
  contributionMarginPct,
  blendedCac,
  channelCac,
  mer,
  roas,
  ltvAtDays,
  paybackDays,
  retentionRate,
  funnelCvr,
  percentChange,
  percentagePointChange,
  aov,
  newCustomerShare,
  cpc,
  cpm,
  ctr,
} from './kpis.js';

// ── Load Golden Fixtures ──────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(
  readFileSync(join(__dirname, '..', 'tests', 'fixtures', 'golden-kpis.json'), 'utf-8'),
);

// ── Golden Fixture Regression Tests ───────────────────────────
describe('Golden KPI Fixtures', () => {
  describe('blendedCac golden', () => {
    for (const sc of golden.scenarios.blendedCac) {
      it(sc.notes, () => {
        const result = blendedCac(sc.inputs.totalSpend, sc.inputs.newCustomers);
        expect(result).toBeCloseTo(sc.expected, 2);
      });
    }
  });

  describe('mer golden', () => {
    for (const sc of golden.scenarios.mer) {
      it(sc.notes, () => {
        const result = mer(sc.inputs.totalRevenue, sc.inputs.totalSpend);
        expect(result).toBeCloseTo(sc.expected, 2);
      });
    }
  });

  describe('contributionMarginPct golden', () => {
    for (const sc of golden.scenarios.contributionMarginPct) {
      it(sc.notes, () => {
        const result = contributionMarginPct(sc.inputs.cm, sc.inputs.revenueNet);
        expect(result).toBeCloseTo(sc.expected, sc.tolerance ? Math.round(-Math.log10(sc.tolerance)) : 4);
      });
    }
  });

  describe('aov golden', () => {
    for (const sc of golden.scenarios.aov) {
      it(sc.notes, () => {
        const result = aov(sc.inputs.totalRevenue, sc.inputs.orderCount);
        expect(result).toBeCloseTo(sc.expected, 2);
      });
    }
  });

  describe('paybackDays golden', () => {
    for (const sc of golden.scenarios.paybackDays) {
      it(sc.notes, () => {
        const result = paybackDays(sc.inputs.cac, sc.inputs.ltv30, sc.inputs.cmPct);
        if (sc.expected === null) {
          expect(result).toBeNull();
        } else {
          expect(result).toBe(sc.expected);
        }
      });
    }
  });

  describe('retentionRate golden', () => {
    for (const sc of golden.scenarios.retentionRate) {
      it(sc.notes, () => {
        const result = retentionRate(sc.inputs.repeatCustomers, sc.inputs.cohortSize);
        expect(result).toBeCloseTo(sc.expected, 4);
      });
    }
  });

  describe('newCustomerShare golden', () => {
    for (const sc of golden.scenarios.newCustomerShare) {
      it(sc.notes, () => {
        const result = newCustomerShare(sc.inputs.newCustomerOrders, sc.inputs.totalOrders);
        expect(result).toBeCloseTo(sc.expected, 4);
      });
    }
  });

  describe('percentChange golden', () => {
    for (const sc of golden.scenarios.percentChange) {
      it(sc.notes, () => {
        const result = percentChange(sc.inputs.current, sc.inputs.previous);
        expect(result).toBeCloseTo(sc.expected, 4);
      });
    }
  });

  describe('funnelCvr golden', () => {
    for (const sc of golden.scenarios.funnelCvr) {
      it(sc.notes, () => {
        const result = funnelCvr(sc.inputs);
        for (const [key, val] of Object.entries(sc.expected)) {
          expect(result[key as keyof typeof result]).toBeCloseTo(val as number, 4);
        }
      });
    }
  });

  describe('cpc golden', () => {
    for (const sc of golden.scenarios.cpc) {
      it(sc.notes, () => {
        expect(cpc(sc.inputs.spend, sc.inputs.clicks)).toBeCloseTo(sc.expected, 2);
      });
    }
  });

  describe('cpm golden', () => {
    for (const sc of golden.scenarios.cpm) {
      it(sc.notes, () => {
        expect(cpm(sc.inputs.spend, sc.inputs.impressions)).toBeCloseTo(sc.expected, 2);
      });
    }
  });
});

// ── Revenue ───────────────────────────────────────────────────
describe('revenueGross', () => {
  it('sums gross revenue from orders', () => {
    const orders = [
      { revenueGross: 100 },
      { revenueGross: 200 },
      { revenueGross: 50 },
    ];
    expect(revenueGross(orders)).toBe(350);
  });

  it('returns 0 for empty array', () => {
    expect(revenueGross([])).toBe(0);
  });

  it('handles single order', () => {
    expect(revenueGross([{ revenueGross: 42.5 }])).toBe(42.5);
  });
});

describe('revenueNet', () => {
  it('sums net revenue from orders', () => {
    const orders = [
      { revenueNet: 90 },
      { revenueNet: 180 },
      { revenueNet: 45 },
    ];
    expect(revenueNet(orders)).toBe(315);
  });

  it('returns 0 for empty array', () => {
    expect(revenueNet([])).toBe(0);
  });
});

// ── Contribution Margin ──────────────────────────────────────
describe('contributionMarginTotal', () => {
  it('sums contribution margins', () => {
    const orders = [
      { contributionMargin: 30 },
      { contributionMargin: 60 },
      { contributionMargin: 15 },
    ];
    expect(contributionMarginTotal(orders)).toBe(105);
  });

  it('returns 0 for empty array', () => {
    expect(contributionMarginTotal([])).toBe(0);
  });
});

describe('contributionMarginPct', () => {
  it('calculates CM%', () => {
    expect(contributionMarginPct(100, 500)).toBeCloseTo(0.2);
  });

  it('returns 0 when revenue is 0', () => {
    expect(contributionMarginPct(100, 0)).toBe(0);
  });

  it('handles 100% margin', () => {
    expect(contributionMarginPct(500, 500)).toBeCloseTo(1.0);
  });
});

// ── CAC ──────────────────────────────────────────────────────
describe('blendedCac', () => {
  it('calculates blended CAC', () => {
    expect(blendedCac(10000, 100)).toBe(100);
  });

  it('returns 0 when no new customers', () => {
    expect(blendedCac(10000, 0)).toBe(0);
  });

  it('handles fractional result', () => {
    expect(blendedCac(1000, 3)).toBeCloseTo(333.33, 1);
  });
});

describe('channelCac', () => {
  it('calculates channel-level CAC', () => {
    expect(channelCac(5000, 50)).toBe(100);
  });

  it('returns 0 when no new customers', () => {
    expect(channelCac(5000, 0)).toBe(0);
  });
});

// ── MER ──────────────────────────────────────────────────────
describe('mer', () => {
  it('calculates marketing efficiency ratio', () => {
    expect(mer(50000, 10000)).toBe(5);
  });

  it('returns 0 when no spend', () => {
    expect(mer(50000, 0)).toBe(0);
  });

  it('handles low efficiency', () => {
    expect(mer(5000, 10000)).toBe(0.5);
  });
});

// ── ROAS ─────────────────────────────────────────────────────
describe('roas', () => {
  it('calculates channel ROAS', () => {
    expect(roas(20000, 5000)).toBe(4);
  });

  it('returns 0 when no spend', () => {
    expect(roas(20000, 0)).toBe(0);
  });

  it('handles negative ROI', () => {
    expect(roas(3000, 5000)).toBeCloseTo(0.6);
  });
});

// ── LTV ──────────────────────────────────────────────────────
describe('ltvAtDays', () => {
  it('calculates LTV per customer', () => {
    expect(ltvAtDays(50000, 100)).toBe(500);
  });

  it('returns 0 for empty cohort', () => {
    expect(ltvAtDays(50000, 0)).toBe(0);
  });

  it('handles small cohort', () => {
    expect(ltvAtDays(750, 5)).toBe(150);
  });
});

// ── Payback Days ─────────────────────────────────────────────
describe('paybackDays', () => {
  it('calculates payback days', () => {
    // CAC=100, LTV30=150, CM%=0.4
    // dailyCM = (150 * 0.4) / 30 = 2.0
    // payback = 100 / 2.0 = 50
    expect(paybackDays(100, 150, 0.4)).toBe(50);
  });

  it('returns null when CAC is 0', () => {
    expect(paybackDays(0, 150, 0.4)).toBeNull();
  });

  it('returns null when LTV is 0', () => {
    expect(paybackDays(100, 0, 0.4)).toBeNull();
  });

  it('returns null when CM% is 0', () => {
    expect(paybackDays(100, 150, 0)).toBeNull();
  });

  it('returns null for negative CAC', () => {
    expect(paybackDays(-50, 150, 0.4)).toBeNull();
  });

  it('rounds to nearest day', () => {
    // CAC=80, LTV30=100, CM%=0.5
    // dailyCM = (100 * 0.5) / 30 = 1.6667
    // payback = 80 / 1.6667 = 48
    expect(paybackDays(80, 100, 0.5)).toBe(48);
  });
});

// ── Retention ────────────────────────────────────────────────
describe('retentionRate', () => {
  it('calculates retention rate', () => {
    expect(retentionRate(25, 100)).toBe(0.25);
  });

  it('returns 0 for empty cohort', () => {
    expect(retentionRate(10, 0)).toBe(0);
  });

  it('handles 100% retention', () => {
    expect(retentionRate(50, 50)).toBe(1.0);
  });
});

// ── Funnel CVR ───────────────────────────────────────────────
describe('funnelCvr', () => {
  it('calculates all funnel stages', () => {
    const traffic = {
      sessions: 10000,
      pdpViews: 4000,
      addToCart: 1000,
      checkouts: 500,
      purchases: 200,
    };
    const result = funnelCvr(traffic);

    expect(result.sessionToPdp).toBeCloseTo(0.4);
    expect(result.pdpToAtc).toBeCloseTo(0.25);
    expect(result.atcToCheckout).toBeCloseTo(0.5);
    expect(result.checkoutToPurchase).toBeCloseTo(0.4);
    expect(result.sessionToPurchase).toBeCloseTo(0.02);
  });

  it('handles zero sessions', () => {
    const traffic = {
      sessions: 0,
      pdpViews: 0,
      addToCart: 0,
      checkouts: 0,
      purchases: 0,
    };
    const result = funnelCvr(traffic);
    expect(result.sessionToPdp).toBe(0);
    expect(result.sessionToPurchase).toBe(0);
  });

  it('handles perfect funnel', () => {
    const traffic = {
      sessions: 100,
      pdpViews: 100,
      addToCart: 100,
      checkouts: 100,
      purchases: 100,
    };
    const result = funnelCvr(traffic);
    expect(result.sessionToPurchase).toBe(1.0);
  });
});

// ── Period Comparison ────────────────────────────────────────
describe('percentChange', () => {
  it('calculates positive change', () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2);
  });

  it('calculates negative change', () => {
    expect(percentChange(80, 100)).toBeCloseTo(-0.2);
  });

  it('returns 0 when previous is 0 and current is 0', () => {
    expect(percentChange(0, 0)).toBe(0);
  });

  it('returns 1 when previous is 0 and current is positive', () => {
    expect(percentChange(100, 0)).toBe(1);
  });

  it('handles doubling', () => {
    expect(percentChange(200, 100)).toBeCloseTo(1.0);
  });
});

describe('percentagePointChange', () => {
  it('calculates pp change', () => {
    expect(percentagePointChange(0.55, 0.50)).toBeCloseTo(0.05);
  });

  it('calculates negative pp change', () => {
    expect(percentagePointChange(0.45, 0.50)).toBeCloseTo(-0.05);
  });
});

// ── AOV ──────────────────────────────────────────────────────
describe('aov', () => {
  it('calculates average order value', () => {
    expect(aov(50000, 500)).toBe(100);
  });

  it('returns 0 for no orders', () => {
    expect(aov(50000, 0)).toBe(0);
  });
});

// ── New Customer Share ───────────────────────────────────────
describe('newCustomerShare', () => {
  it('calculates share of new customers', () => {
    expect(newCustomerShare(60, 100)).toBe(0.6);
  });

  it('returns 0 for no orders', () => {
    expect(newCustomerShare(0, 0)).toBe(0);
  });
});

// ── CPC / CPM / CTR ─────────────────────────────────────────
describe('cpc', () => {
  it('calculates cost per click', () => {
    expect(cpc(5000, 2500)).toBe(2);
  });

  it('returns 0 for no clicks', () => {
    expect(cpc(5000, 0)).toBe(0);
  });
});

describe('cpm', () => {
  it('calculates cost per thousand impressions', () => {
    expect(cpm(5000, 1_000_000)).toBe(5);
  });

  it('returns 0 for no impressions', () => {
    expect(cpm(5000, 0)).toBe(0);
  });

  it('handles small impression count', () => {
    expect(cpm(10, 2000)).toBe(5);
  });
});

describe('ctr', () => {
  it('calculates click-through rate', () => {
    expect(ctr(500, 10000)).toBeCloseTo(0.05);
  });

  it('returns 0 for no impressions', () => {
    expect(ctr(500, 0)).toBe(0);
  });
});
