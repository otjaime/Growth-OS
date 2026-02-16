// ──────────────────────────────────────────────────────────────
// Growth OS — Customer Segmentation (RFM Analysis)
// Recency, Frequency, Monetary scoring with quintile-based segments
// ──────────────────────────────────────────────────────────────

export type CustomerSegment = 'Champions' | 'Loyal' | 'Potential' | 'At Risk' | 'Dormant' | 'Lost';

export interface RFMScores {
  recency: number;    // 1-5 (5 = most recent)
  frequency: number;  // 1-5 (5 = most frequent)
  monetary: number;   // 1-5 (5 = highest spend)
}

export interface CustomerRFM {
  customerId: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rfmScores: RFMScores;
  segment: CustomerSegment;
}

export interface SegmentSummary {
  segment: CustomerSegment;
  count: number;
  totalRevenue: number;
  avgOrderValue: number;
  avgOrdersPerCustomer: number;
}

interface CustomerInput {
  customerId: string;
  lastOrderDate: Date | null;
  totalOrders: number;
  totalRevenue: number;
}

/**
 * Compute RFM scores for a list of customers using quintile-based scoring.
 * Each dimension (R, F, M) is scored 1-5 based on quintile ranking.
 */
export function computeRFMScores(
  customers: CustomerInput[],
  referenceDate?: Date,
): CustomerRFM[] {
  const refDate = referenceDate ?? new Date();

  // Filter out customers with no order history
  const validCustomers = customers.filter(
    (c) => c.lastOrderDate !== null && c.totalOrders > 0,
  );

  if (validCustomers.length === 0) return [];

  // Compute raw RFM values
  const rawData = validCustomers.map((c) => {
    const recencyDays = Math.max(
      0,
      Math.floor(
        (refDate.getTime() - c.lastOrderDate!.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    return {
      customerId: c.customerId,
      recencyDays,
      frequency: c.totalOrders,
      monetary: Number(c.totalRevenue),
    };
  });

  // Sort and assign quintile scores
  const recencyValues = rawData.map((d) => d.recencyDays).sort((a, b) => a - b);
  const frequencyValues = rawData.map((d) => d.frequency).sort((a, b) => a - b);
  const monetaryValues = rawData.map((d) => d.monetary).sort((a, b) => a - b);

  return rawData.map((d) => {
    // Recency: lower days = better = higher score (inverted)
    const rScore = 6 - assignQuintile(d.recencyDays, recencyValues);
    const fScore = assignQuintile(d.frequency, frequencyValues);
    const mScore = assignQuintile(d.monetary, monetaryValues);

    const rfmScores: RFMScores = {
      recency: rScore,
      frequency: fScore,
      monetary: mScore,
    };

    return {
      customerId: d.customerId,
      recencyDays: d.recencyDays,
      frequency: d.frequency,
      monetary: d.monetary,
      rfmScores,
      segment: classifySegment(rfmScores),
    };
  });
}

/**
 * Classify a customer into a segment based on RFM scores.
 */
export function classifySegment(scores: RFMScores): CustomerSegment {
  const { recency, frequency, monetary } = scores;

  // Champions: Top in all three dimensions
  if (recency >= 4 && frequency >= 4 && monetary >= 4) return 'Champions';

  // Loyal: Strong across the board (not already Champion)
  if (recency >= 3 && frequency >= 3 && monetary >= 3) return 'Loyal';

  // Potential: Recent but low purchase history
  if (recency >= 3 && frequency <= 3 && monetary <= 3) return 'Potential';

  // At Risk: Were good customers but haven't purchased recently
  if (recency <= 2 && frequency >= 3 && monetary >= 3) return 'At Risk';

  // Lost: Lowest recency and frequency
  if (recency === 1 && frequency === 1) return 'Lost';

  // Dormant: Everything else with low recency
  return 'Dormant';
}

/**
 * Compute segment distribution summary.
 */
export function getSegmentDistribution(rfmData: CustomerRFM[]): SegmentSummary[] {
  const segments: CustomerSegment[] = ['Champions', 'Loyal', 'Potential', 'At Risk', 'Dormant', 'Lost'];
  const grouped = new Map<CustomerSegment, { count: number; totalRevenue: number; totalOrders: number }>();

  for (const seg of segments) {
    grouped.set(seg, { count: 0, totalRevenue: 0, totalOrders: 0 });
  }

  for (const customer of rfmData) {
    const group = grouped.get(customer.segment)!;
    group.count++;
    group.totalRevenue += customer.monetary;
    group.totalOrders += customer.frequency;
  }

  return segments.map((segment) => {
    const group = grouped.get(segment)!;
    return {
      segment,
      count: group.count,
      totalRevenue: Math.round(group.totalRevenue * 100) / 100,
      avgOrderValue: group.totalOrders > 0
        ? Math.round((group.totalRevenue / group.totalOrders) * 100) / 100
        : 0,
      avgOrdersPerCustomer: group.count > 0
        ? Math.round((group.totalOrders / group.count) * 100) / 100
        : 0,
    };
  }).filter((s) => s.count > 0);
}

/**
 * Assign a quintile score (1-5) based on position in sorted array.
 */
function assignQuintile(value: number, sortedValues: number[]): number {
  const n = sortedValues.length;
  if (n === 0) return 3;

  // Find the position of the value
  let pos = 0;
  for (let i = 0; i < n; i++) {
    if (sortedValues[i]! <= value) pos = i;
  }

  const percentile = pos / (n - 1 || 1);

  if (percentile < 0.2) return 1;
  if (percentile < 0.4) return 2;
  if (percentile < 0.6) return 3;
  if (percentile < 0.8) return 4;
  return 5;
}
