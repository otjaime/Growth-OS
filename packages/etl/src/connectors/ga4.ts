// ──────────────────────────────────────────────────────────────
// Growth OS — GA4 Connector
// Fetches sessions & funnel events from Google Analytics Data API
// ──────────────────────────────────────────────────────────────

import type { RawRecord, GA4Config } from '../types.js';
import { createLogger } from '../logger.js';
import { generateGA4Traffic } from './demo-generator.js';

const log = createLogger('connector:ga4');

export async function fetchGA4Traffic(
  config: GA4Config,
  dateRange?: { startDate: string; endDate: string },
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock GA4 traffic');
    return { records: generateGA4Traffic() };
  }

  // Refresh token
  const accessToken = await refreshGoogleToken(config);

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`;
  const records: RawRecord[] = [];
  let retries = 0;
  const MAX_RETRIES = 5;

  while (retries <= MAX_RETRIES) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          dateRanges: [
            {
              startDate: dateRange?.startDate ?? '30daysAgo',
              endDate: dateRange?.endDate ?? 'today',
            },
          ],
          dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
          metrics: [
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'addToCarts' },
            { name: 'checkouts' },
            { name: 'ecommercePurchases' },
          ],
          limit: 10000,
        }),
      });

      if (resp.status === 429) {
        const backoff = Math.pow(2, retries) * 1000;
        log.warn({ backoff }, 'Rate limited by GA4, backing off');
        await sleep(backoff);
        retries++;
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`GA4 API error: ${resp.status} — ${body}`);
      }

      const data = (await resp.json()) as {
        rows?: Array<{
          dimensionValues: Array<{ value: string }>;
          metricValues: Array<{ value: string }>;
        }>;
      };

      if (data.rows) {
        for (const row of data.rows) {
          const dateVal = row.dimensionValues[0]?.value ?? '';
          const formattedDate = `${dateVal.slice(0, 4)}-${dateVal.slice(4, 6)}-${dateVal.slice(6, 8)}`;
          const channel = row.dimensionValues[1]?.value ?? 'Other';

          records.push({
            source: 'ga4',
            entity: 'traffic',
            externalId: `${formattedDate}_${channel}`,
            cursor: formattedDate,
            payload: {
              date: formattedDate,
              sessionDefaultChannelGroup: channel,
              sessions: row.metricValues[0]?.value ?? '0',
              screenPageViews: row.metricValues[1]?.value ?? '0',
              addToCarts: row.metricValues[2]?.value ?? '0',
              checkouts: row.metricValues[3]?.value ?? '0',
              ecommercePurchases: row.metricValues[4]?.value ?? '0',
            },
          });
        }
      }

      break; // success
    } catch (err) {
      log.error({ err }, 'Error fetching GA4 traffic');
      throw err;
    }
  }

  log.info({ count: records.length }, 'Fetched GA4 traffic');
  return { records };
}

async function refreshGoogleToken(config: GA4Config): Promise<string> {
  if (!config.refreshToken) return config.accessToken;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    log.warn('Failed to refresh Google token, using existing');
    return config.accessToken;
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
