// ──────────────────────────────────────────────────────────────
// Growth OS — RFM Segmentation Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  computeRFMScores,
  classifySegment,
  getSegmentDistribution,
  type RFMScores,
  type CustomerSegment,
} from './segmentation.js';

const REF_DATE = new Date('2026-02-01');

describe('classifySegment', () => {
  it('classifies Champions: R>=4, F>=4, M>=4', () => {
    expect(classifySegment({ recency: 5, frequency: 5, monetary: 5 })).toBe('Champions');
    expect(classifySegment({ recency: 4, frequency: 4, monetary: 4 })).toBe('Champions');
    expect(classifySegment({ recency: 5, frequency: 4, monetary: 5 })).toBe('Champions');
  });

  it('classifies Loyal: R>=3, F>=3, M>=3 (not Champion)', () => {
    expect(classifySegment({ recency: 3, frequency: 3, monetary: 3 })).toBe('Loyal');
    expect(classifySegment({ recency: 3, frequency: 4, monetary: 3 })).toBe('Loyal');
    expect(classifySegment({ recency: 3, frequency: 3, monetary: 4 })).toBe('Loyal');
  });

  it('classifies Potential: R>=3, F<=3, M<=3', () => {
    expect(classifySegment({ recency: 4, frequency: 2, monetary: 2 })).toBe('Potential');
    expect(classifySegment({ recency: 5, frequency: 1, monetary: 1 })).toBe('Potential');
    expect(classifySegment({ recency: 3, frequency: 2, monetary: 3 })).toBe('Potential');
  });

  it('classifies At Risk: R<=2, F>=3, M>=3', () => {
    expect(classifySegment({ recency: 2, frequency: 4, monetary: 4 })).toBe('At Risk');
    expect(classifySegment({ recency: 1, frequency: 5, monetary: 5 })).toBe('At Risk');
    expect(classifySegment({ recency: 2, frequency: 3, monetary: 3 })).toBe('At Risk');
  });

  it('classifies Lost: R=1, F=1', () => {
    expect(classifySegment({ recency: 1, frequency: 1, monetary: 1 })).toBe('Lost');
    expect(classifySegment({ recency: 1, frequency: 1, monetary: 3 })).toBe('Lost');
    expect(classifySegment({ recency: 1, frequency: 1, monetary: 5 })).toBe('Lost');
  });

  it('classifies Dormant: everything else with low recency', () => {
    expect(classifySegment({ recency: 2, frequency: 2, monetary: 2 })).toBe('Dormant');
    expect(classifySegment({ recency: 1, frequency: 2, monetary: 2 })).toBe('Dormant');
    expect(classifySegment({ recency: 2, frequency: 1, monetary: 4 })).toBe('Dormant');
  });
});

describe('computeRFMScores', () => {
  it('returns empty array for no customers', () => {
    expect(computeRFMScores([], REF_DATE)).toEqual([]);
  });

  it('returns empty array when all customers have null lastOrderDate', () => {
    const customers = [
      { customerId: 'c1', lastOrderDate: null, totalOrders: 0, totalRevenue: 0 },
    ];
    expect(computeRFMScores(customers, REF_DATE)).toEqual([]);
  });

  it('assigns quintile scores 1-5 for a spread of customers', () => {
    // Create 10 customers with diverse recency, frequency, monetary
    const customers = Array.from({ length: 10 }, (_, i) => ({
      customerId: `c${i}`,
      lastOrderDate: new Date(REF_DATE.getTime() - (i + 1) * 10 * 24 * 60 * 60 * 1000), // 10-100 days ago
      totalOrders: 10 - i, // 10 down to 1
      totalRevenue: (10 - i) * 100, // $1000 down to $100
    }));

    const results = computeRFMScores(customers, REF_DATE);
    expect(results).toHaveLength(10);

    // All scores should be between 1 and 5
    for (const r of results) {
      expect(r.rfmScores.recency).toBeGreaterThanOrEqual(1);
      expect(r.rfmScores.recency).toBeLessThanOrEqual(5);
      expect(r.rfmScores.frequency).toBeGreaterThanOrEqual(1);
      expect(r.rfmScores.frequency).toBeLessThanOrEqual(5);
      expect(r.rfmScores.monetary).toBeGreaterThanOrEqual(1);
      expect(r.rfmScores.monetary).toBeLessThanOrEqual(5);
    }
  });

  it('most recent customer gets highest recency score', () => {
    const customers = [
      { customerId: 'recent', lastOrderDate: new Date('2026-01-30'), totalOrders: 3, totalRevenue: 300 },
      { customerId: 'old1', lastOrderDate: new Date('2025-12-01'), totalOrders: 3, totalRevenue: 300 },
      { customerId: 'old2', lastOrderDate: new Date('2025-10-01'), totalOrders: 3, totalRevenue: 300 },
      { customerId: 'old3', lastOrderDate: new Date('2025-08-01'), totalOrders: 3, totalRevenue: 300 },
      { customerId: 'old4', lastOrderDate: new Date('2025-06-01'), totalOrders: 3, totalRevenue: 300 },
    ];

    const results = computeRFMScores(customers, REF_DATE);
    const recent = results.find((r) => r.customerId === 'recent')!;
    const oldest = results.find((r) => r.customerId === 'old4')!;

    // Most recent should have higher recency score than oldest
    expect(recent.rfmScores.recency).toBeGreaterThan(oldest.rfmScores.recency);
  });

  it('highest spender gets highest monetary score', () => {
    const customers = [
      { customerId: 'big', lastOrderDate: new Date('2026-01-15'), totalOrders: 5, totalRevenue: 5000 },
      { customerId: 'med', lastOrderDate: new Date('2026-01-15'), totalOrders: 5, totalRevenue: 500 },
      { customerId: 'sm1', lastOrderDate: new Date('2026-01-15'), totalOrders: 5, totalRevenue: 100 },
      { customerId: 'sm2', lastOrderDate: new Date('2026-01-15'), totalOrders: 5, totalRevenue: 50 },
      { customerId: 'sm3', lastOrderDate: new Date('2026-01-15'), totalOrders: 5, totalRevenue: 25 },
    ];

    const results = computeRFMScores(customers, REF_DATE);
    const big = results.find((r) => r.customerId === 'big')!;
    const sm3 = results.find((r) => r.customerId === 'sm3')!;

    expect(big.rfmScores.monetary).toBeGreaterThan(sm3.rfmScores.monetary);
  });

  it('assigns a segment to each customer', () => {
    const customers = Array.from({ length: 20 }, (_, i) => ({
      customerId: `c${i}`,
      lastOrderDate: new Date(REF_DATE.getTime() - (i * 5 + 1) * 24 * 60 * 60 * 1000),
      totalOrders: Math.max(1, 20 - i),
      totalRevenue: Math.max(10, (20 - i) * 50),
    }));

    const results = computeRFMScores(customers, REF_DATE);
    const validSegments: CustomerSegment[] = ['Champions', 'Loyal', 'Potential', 'At Risk', 'Dormant', 'Lost'];

    for (const r of results) {
      expect(validSegments).toContain(r.segment);
    }
  });

  it('computes recencyDays correctly', () => {
    const customers = [
      { customerId: 'c1', lastOrderDate: new Date('2026-01-25'), totalOrders: 1, totalRevenue: 100 },
    ];
    const results = computeRFMScores(customers, REF_DATE);
    expect(results[0]!.recencyDays).toBe(7); // Feb 1 - Jan 25 = 7 days
  });

  it('handles single customer', () => {
    const customers = [
      { customerId: 'solo', lastOrderDate: new Date('2026-01-15'), totalOrders: 5, totalRevenue: 500 },
    ];
    const results = computeRFMScores(customers, REF_DATE);
    expect(results).toHaveLength(1);
    // Single customer: quintile assigns to 1 for frequency/monetary (no spread),
    // recency is inverted: 6 - 1 = 5
    expect(results[0]!.rfmScores.recency).toBe(5);
    expect(results[0]!.rfmScores.frequency).toBe(1);
    expect(results[0]!.rfmScores.monetary).toBe(1);
    expect(results[0]!.segment).toBe('Potential'); // R>=3, F<=3, M<=3
  });
});

describe('getSegmentDistribution', () => {
  it('returns empty array for empty input', () => {
    expect(getSegmentDistribution([])).toEqual([]);
  });

  it('aggregates customers by segment', () => {
    const rfmData = [
      { customerId: 'c1', recencyDays: 5, frequency: 10, monetary: 1000, rfmScores: { recency: 5, frequency: 5, monetary: 5 }, segment: 'Champions' as CustomerSegment },
      { customerId: 'c2', recencyDays: 3, frequency: 8, monetary: 800, rfmScores: { recency: 5, frequency: 4, monetary: 4 }, segment: 'Champions' as CustomerSegment },
      { customerId: 'c3', recencyDays: 30, frequency: 5, monetary: 500, rfmScores: { recency: 3, frequency: 3, monetary: 3 }, segment: 'Loyal' as CustomerSegment },
    ];

    const dist = getSegmentDistribution(rfmData);
    const champs = dist.find((d) => d.segment === 'Champions')!;
    const loyal = dist.find((d) => d.segment === 'Loyal')!;

    expect(champs.count).toBe(2);
    expect(champs.totalRevenue).toBe(1800);
    expect(loyal.count).toBe(1);
    expect(loyal.totalRevenue).toBe(500);
  });

  it('filters out segments with zero customers', () => {
    const rfmData = [
      { customerId: 'c1', recencyDays: 100, frequency: 1, monetary: 50, rfmScores: { recency: 1, frequency: 1, monetary: 1 }, segment: 'Lost' as CustomerSegment },
    ];

    const dist = getSegmentDistribution(rfmData);
    // Should only have 'Lost', not all 6 segments
    expect(dist).toHaveLength(1);
    expect(dist[0]!.segment).toBe('Lost');
  });

  it('computes avgOrderValue and avgOrdersPerCustomer correctly', () => {
    const rfmData = [
      { customerId: 'c1', recencyDays: 5, frequency: 4, monetary: 400, rfmScores: { recency: 5, frequency: 5, monetary: 5 }, segment: 'Champions' as CustomerSegment },
      { customerId: 'c2', recencyDays: 3, frequency: 6, monetary: 600, rfmScores: { recency: 5, frequency: 5, monetary: 5 }, segment: 'Champions' as CustomerSegment },
    ];

    const dist = getSegmentDistribution(rfmData);
    const champs = dist.find((d) => d.segment === 'Champions')!;

    // avgOrderValue = totalRevenue / totalOrders = 1000 / 10 = 100
    expect(champs.avgOrderValue).toBe(100);
    // avgOrdersPerCustomer = totalOrders / count = 10 / 2 = 5
    expect(champs.avgOrdersPerCustomer).toBe(5);
  });
});
