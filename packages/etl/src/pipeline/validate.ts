// ──────────────────────────────────────────────────────────────
// Growth OS — Data Validation
// Quality checks on marts data
// ──────────────────────────────────────────────────────────────

import { prisma } from '@growth-os/database';
import { createLogger } from '../logger.js';

const log = createLogger('pipeline:validate');

export interface ValidationResult {
  check: string;
  passed: boolean;
  message: string;
}

export async function validateData(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // 1. No negative spend
  const negSpend = await prisma.factSpend.count({
    where: { spend: { lt: 0 } },
  });
  results.push({
    check: 'no_negative_spend',
    passed: negSpend === 0,
    message: negSpend === 0 ? 'All spend values >= 0' : `Found ${negSpend} negative spend records`,
  });

  // 2. revenue_net <= revenue_gross
  const badRevenue = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint as count FROM fact_orders
    WHERE revenue_net > revenue_gross
  `;
  const badRevCount = Number(badRevenue[0]?.count ?? 0);
  results.push({
    check: 'revenue_net_lte_gross',
    passed: badRevCount === 0,
    message:
      badRevCount === 0
        ? 'All revenue_net <= revenue_gross'
        : `Found ${badRevCount} orders where revenue_net > revenue_gross`,
  });

  // 3. Continuous dates in dim_date
  const dateGaps = await prisma.$queryRaw<Array<{ gap_date: Date }>>`
    WITH date_range AS (
      SELECT generate_series(
        (SELECT MIN(date) FROM dim_date),
        (SELECT MAX(date) FROM dim_date),
        '1 day'::interval
      )::date as expected_date
    )
    SELECT expected_date as gap_date
    FROM date_range
    WHERE expected_date NOT IN (SELECT date FROM dim_date)
    LIMIT 10
  `;
  results.push({
    check: 'continuous_dates',
    passed: dateGaps.length === 0,
    message:
      dateGaps.length === 0
        ? 'dim_date has continuous dates'
        : `Found ${dateGaps.length} date gaps in dim_date`,
  });

  // 4. Referential integrity: fact_orders.channel_id exists in dim_channel
  const orphanChannelOrders = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint as count FROM fact_orders fo
    WHERE fo.channel_id IS NOT NULL
    AND fo.channel_id NOT IN (SELECT id FROM dim_channel)
  `;
  const orphanChCount = Number(orphanChannelOrders[0]?.count ?? 0);
  results.push({
    check: 'fk_orders_channel',
    passed: orphanChCount === 0,
    message:
      orphanChCount === 0
        ? 'All fact_orders.channel_id reference valid dim_channel'
        : `Found ${orphanChCount} orphan channel refs`,
  });

  // 5. Referential integrity: fact_spend.channel_id
  const orphanSpendChannel = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint as count FROM fact_spend fs
    WHERE fs.channel_id NOT IN (SELECT id FROM dim_channel)
  `;
  const orphanSpendCount = Number(orphanSpendChannel[0]?.count ?? 0);
  results.push({
    check: 'fk_spend_channel',
    passed: orphanSpendCount === 0,
    message:
      orphanSpendCount === 0
        ? 'All fact_spend.channel_id reference valid dim_channel'
        : `Found ${orphanSpendCount} orphan channel refs in spend`,
  });

  // 6. fact_orders has rows
  const orderCount = await prisma.factOrder.count();
  results.push({
    check: 'orders_not_empty',
    passed: orderCount > 0,
    message: orderCount > 0 ? `fact_orders has ${orderCount} rows` : 'fact_orders is empty',
  });

  // 7. fact_spend has rows
  const spendCount = await prisma.factSpend.count();
  results.push({
    check: 'spend_not_empty',
    passed: spendCount > 0,
    message: spendCount > 0 ? `fact_spend has ${spendCount} rows` : 'fact_spend is empty',
  });

  // 8. fact_traffic has rows
  const trafficCount = await prisma.factTraffic.count();
  results.push({
    check: 'traffic_not_empty',
    passed: trafficCount > 0,
    message:
      trafficCount > 0 ? `fact_traffic has ${trafficCount} rows` : 'fact_traffic is empty',
  });

  // 9. cohorts has rows
  const cohortCount = await prisma.cohort.count();
  results.push({
    check: 'cohorts_not_empty',
    passed: cohortCount > 0,
    message: cohortCount > 0 ? `cohorts has ${cohortCount} rows` : 'cohorts is empty',
  });

  // 10. No duplicate order_ids in fact_orders
  const dupOrders = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint as count FROM (
      SELECT order_id FROM fact_orders GROUP BY order_id HAVING COUNT(*) > 1
    ) dups
  `;
  const dupCount = Number(dupOrders[0]?.count ?? 0);
  results.push({
    check: 'no_duplicate_orders',
    passed: dupCount === 0,
    message:
      dupCount === 0 ? 'No duplicate order_ids' : `Found ${dupCount} duplicate order_ids`,
  });

  return results;
}
