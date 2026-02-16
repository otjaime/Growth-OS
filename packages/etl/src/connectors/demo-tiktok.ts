// ──────────────────────────────────────────────────────────────
// Growth OS — TikTok Ads Demo Data Generator
// Deterministic mock data matching TikTok Marketing API v1.3
// ──────────────────────────────────────────────────────────────

import { addDays, format } from 'date-fns';
import type { RawRecord } from '../types.js';
import type { DemoContext } from './demo-generator.js';
import { createContext, generateCustomers, randFloat, randInt } from './demo-generator.js';

const TIKTOK_CAMPAIGNS = [
  { id: 'tt_camp_001', name: 'Spark_UGC_Retarget' },
  { id: 'tt_camp_002', name: 'TopView_Awareness' },
  { id: 'tt_camp_003', name: 'Lead_Gen_Lookalike' },
];

const DEMO_DAYS = parseInt(process.env.DEMO_DAYS ?? '180', 10);

export function generateTikTokInsights(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? (() => { const cx = createContext(); generateCustomers(cx, 2400); return cx; })();
  const records: RawRecord[] = [];

  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    const weekNum = Math.floor(day / 7);
    const growthFactor = 1 + (day / DEMO_DAYS) * 0.40;
    const daysFromEnd = DEMO_DAYS - day;

    for (const camp of TIKTOK_CAMPAIGNS) {
      // TikTok: $40-$180/day per campaign, higher CPMs, lower CTR
      let baseSpend = randFloat(40, 180, c.rng) * growthFactor;

      // Anomaly: week 12-14 spend spike (viral video trend exhaustion)
      if (weekNum >= 12 && weekNum <= 14 && camp.id === 'tt_camp_001') {
        baseSpend *= 2.2;
      }
      // Trailing anomaly: slight spend increase in last 7 days
      if (daysFromEnd < 7) {
        baseSpend *= 1.15;
      }

      const spend = Math.round(baseSpend * 100) / 100;
      // TikTok CPMs: $12-$40 (higher than Meta/Google)
      const cpm = randFloat(12, 40, c.rng);
      const impressions = Math.round((spend / cpm) * 1000);
      // TikTok CTR: 0.3-1.2% (lower than Meta)
      const ctr = randFloat(0.003, 0.012, c.rng);
      const clicks = Math.round(impressions * ctr);
      // Conversion rates vary by campaign type
      let cvr = camp.name.includes('Retarget')
        ? randFloat(0.015, 0.04, c.rng)
        : camp.name.includes('Lookalike')
          ? randFloat(0.008, 0.02, c.rng)
          : randFloat(0.003, 0.01, c.rng);

      // Trailing anomaly: CVR drops
      if (daysFromEnd < 7) {
        cvr *= 0.6;
      }

      const conversions = Math.max(0, Math.round(clicks * cvr));
      const conversionCost = conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0;

      records.push({
        source: 'tiktok',
        entity: 'insights',
        externalId: `${camp.id}_${format(date, 'yyyy-MM-dd')}`,
        cursor: format(date, 'yyyy-MM-dd'),
        payload: {
          advertiser_id: 'adv_demo_tiktok_001',
          campaign_id: camp.id,
          campaign_name: camp.name,
          stat_time_day: format(date, 'yyyy-MM-dd'),
          spend: String(spend),
          impressions: String(impressions),
          clicks: String(clicks),
          conversions: String(conversions),
          conversion_cost: String(conversionCost),
        } as unknown as Record<string, unknown>,
      });
    }
  }

  return records;
}
