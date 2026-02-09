// ──────────────────────────────────────────────────────────────
// Growth OS — Meta Ads Connector
// Fetches campaign insights from Meta Marketing API
// ──────────────────────────────────────────────────────────────

import type { RawRecord, MetaConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateMetaInsights } from './demo-generator.js';

const log = createLogger('connector:meta');

const INSIGHTS_FIELDS = [
  'campaign_id', 'campaign_name', 'spend', 'impressions', 'clicks',
  'actions', 'action_values', 'date_start', 'date_stop',
].join(',');

export async function fetchMetaInsights(
  config: MetaConfig,
  dateRange?: { since: string; until: string },
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Meta insights');
    return { records: generateMetaInsights() };
  }

  const records: RawRecord[] = [];
  let url = `https://graph.facebook.com/v19.0/${config.adAccountId}/insights?` +
    `fields=${INSIGHTS_FIELDS}&level=campaign&time_increment=1` +
    (dateRange ? `&time_range={"since":"${dateRange.since}","until":"${dateRange.until}"}` : '') +
    `&access_token=${config.accessToken}&limit=500`;

  let retries = 0;
  const MAX_RETRIES = 5;

  while (url) {
    try {
      const resp = await fetch(url);

      if (resp.status === 429) {
        const backoff = Math.pow(2, retries) * 1000;
        log.warn({ backoff }, 'Rate limited by Meta, backing off');
        await sleep(backoff);
        retries++;
        if (retries > MAX_RETRIES) throw new Error('Max retries exceeded for Meta');
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Meta API error: ${resp.status} — ${body}`);
      }

      const data = (await resp.json()) as {
        data: Array<Record<string, unknown>>;
        paging?: { next?: string };
      };

      for (const row of data.data) {
        records.push({
          source: 'meta',
          entity: 'insights',
          externalId: `${row.campaign_id}_${row.date_start}`,
          cursor: String(row.date_start),
          payload: row,
        });
      }

      url = data.paging?.next ?? '';
      retries = 0;
    } catch (err) {
      log.error({ err }, 'Error fetching Meta insights');
      throw err;
    }
  }

  log.info({ count: records.length }, 'Fetched Meta insights');
  return { records };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
