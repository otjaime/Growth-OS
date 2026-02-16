// ──────────────────────────────────────────────────────────────
// Growth OS — Klaviyo Email Demo Data Generator
// Deterministic mock data matching Klaviyo API v2024-02-15
// Generates both campaigns (batch sends) and flows (automated)
// ──────────────────────────────────────────────────────────────

import { addDays, format } from 'date-fns';
import type { RawRecord } from '../types.js';
import type { DemoContext } from './demo-generator.js';
import { createContext, generateCustomers, randFloat, randInt, pick } from './demo-generator.js';

const DEMO_DAYS = parseInt(process.env.DEMO_DAYS ?? '180', 10);

const CAMPAIGN_TEMPLATES = [
  { name: 'Weekly_Newsletter', baseListSize: 18000 },
  { name: 'Flash_Sale', baseListSize: 12000 },
  { name: 'Product_Launch', baseListSize: 15000 },
  { name: 'VIP_Exclusive', baseListSize: 5000 },
];

const FLOW_DEFINITIONS = [
  { id: 'flow_welcome', name: 'Welcome_Series', avgDailySends: 45, openRate: 0.42, clickRate: 0.08, cvr: 0.05 },
  { id: 'flow_abandoned', name: 'Abandoned_Cart', avgDailySends: 80, openRate: 0.38, clickRate: 0.12, cvr: 0.12 },
  { id: 'flow_post_purchase', name: 'Post_Purchase', avgDailySends: 35, openRate: 0.48, clickRate: 0.06, cvr: 0.03 },
  { id: 'flow_winback', name: 'Win_Back', avgDailySends: 25, openRate: 0.22, clickRate: 0.04, cvr: 0.02 },
  { id: 'flow_browse', name: 'Browse_Abandonment', avgDailySends: 60, openRate: 0.30, clickRate: 0.07, cvr: 0.04 },
];

export function generateKlaviyoCampaigns(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? (() => { const cx = createContext(); generateCustomers(cx, 2400); return cx; })();
  const records: RawRecord[] = [];
  let campaignCounter = 1;

  // Generate ~2 campaigns per week (every 3-4 days)
  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    const dayOfWeek = date.getDay();

    // Send campaigns on Tuesdays (2) and Thursdays (4) — industry best practice
    if (dayOfWeek !== 2 && dayOfWeek !== 4) continue;

    const template = CAMPAIGN_TEMPLATES[campaignCounter % CAMPAIGN_TEMPLATES.length]!;
    const campaignId = `camp_klv_${String(campaignCounter).padStart(4, '0')}`;
    campaignCounter++;

    const growthFactor = 1 + (day / DEMO_DAYS) * 0.25;
    const sends = Math.round(template.baseListSize * growthFactor + randFloat(-500, 500, c.rng));
    // Open rate: 18-35%
    const openRate = randFloat(0.18, 0.35, c.rng);
    const opens = Math.round(sends * openRate);
    const uniqueOpens = Math.round(opens * randFloat(0.85, 0.95, c.rng));
    // Click rate: 2-6% of opens
    const clickRate = randFloat(0.02, 0.06, c.rng);
    const clicks = Math.round(opens * clickRate);
    const uniqueClicks = Math.round(clicks * randFloat(0.80, 0.92, c.rng));
    // Bounce rate: 0.5-2%
    const bounces = Math.round(sends * randFloat(0.005, 0.02, c.rng));
    // Unsubscribe: 0.1-0.5%
    const unsubscribes = Math.round(sends * randFloat(0.001, 0.005, c.rng));
    // Conversions: 3-8% of clickers
    const cvr = randFloat(0.03, 0.08, c.rng);
    const conversions = Math.round(uniqueClicks * cvr);
    const aov = randFloat(90, 130, c.rng);
    const revenue = Math.round(conversions * aov * 100) / 100;

    records.push({
      source: 'klaviyo',
      entity: 'campaigns',
      externalId: campaignId,
      cursor: format(date, 'yyyy-MM-dd'),
      payload: {
        id: campaignId,
        name: `${template.name}_${format(date, 'MMMdd')}`,
        campaign_type: 'campaign',
        send_time: format(date, "yyyy-MM-dd'T'10:00:00+00:00"),
        stats: {
          sends,
          opens,
          unique_opens: uniqueOpens,
          clicks,
          unique_clicks: uniqueClicks,
          bounces,
          unsubscribes,
          conversions,
          revenue,
        },
      } as unknown as Record<string, unknown>,
    });
  }

  return records;
}

export function generateKlaviyoFlows(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? (() => { const cx = createContext(); generateCustomers(cx, 2400); return cx; })();
  const records: RawRecord[] = [];

  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    const growthFactor = 1 + (day / DEMO_DAYS) * 0.30;
    const daysFromEnd = DEMO_DAYS - day;

    for (const flow of FLOW_DEFINITIONS) {
      const sends = Math.max(5, Math.round(flow.avgDailySends * growthFactor + randFloat(-10, 10, c.rng)));
      let openRate = flow.openRate + randFloat(-0.05, 0.05, c.rng);
      openRate = Math.max(0.10, Math.min(0.60, openRate));
      const opens = Math.round(sends * openRate);
      const uniqueOpens = Math.round(opens * randFloat(0.90, 0.98, c.rng));

      let clickRate = flow.clickRate + randFloat(-0.02, 0.02, c.rng);
      clickRate = Math.max(0.01, Math.min(0.20, clickRate));
      const clicks = Math.round(opens * clickRate);
      const uniqueClicks = Math.round(clicks * randFloat(0.85, 0.95, c.rng));
      const bounces = Math.round(sends * randFloat(0.003, 0.01, c.rng));
      const unsubscribes = Math.round(sends * randFloat(0.001, 0.003, c.rng));

      let cvr = flow.cvr + randFloat(-0.01, 0.01, c.rng);
      cvr = Math.max(0.005, Math.min(0.25, cvr));
      // Abandoned cart CVR drops in trailing anomaly
      if (daysFromEnd < 7 && flow.id === 'flow_abandoned') {
        cvr *= 0.6;
      }
      const conversions = Math.round(uniqueClicks * cvr);
      const aov = randFloat(85, 140, c.rng);
      const revenue = Math.round(conversions * aov * 100) / 100;

      records.push({
        source: 'klaviyo',
        entity: 'flows',
        externalId: `${flow.id}_${format(date, 'yyyy-MM-dd')}`,
        cursor: format(date, 'yyyy-MM-dd'),
        payload: {
          id: flow.id,
          name: flow.name,
          campaign_type: 'flow',
          send_time: format(date, "yyyy-MM-dd'T'00:00:00+00:00"),
          stats: {
            sends,
            opens,
            unique_opens: uniqueOpens,
            clicks,
            unique_clicks: uniqueClicks,
            bounces,
            unsubscribes,
            conversions,
            revenue,
          },
        } as unknown as Record<string, unknown>,
      });
    }
  }

  return records;
}
