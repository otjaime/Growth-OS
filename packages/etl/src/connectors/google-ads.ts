// ──────────────────────────────────────────────────────────────
// Growth OS — Google Ads Connector
// Fetches campaign performance from Google Ads API
// ──────────────────────────────────────────────────────────────

import type { RawRecord, GoogleAdsConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateGoogleAdsInsights } from './demo-generator.js';

const log = createLogger('connector:google-ads');

const GAQL_QUERY = `
SELECT
  campaign.id,
  campaign.name,
  segments.date,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.conversions_value
FROM campaign
WHERE segments.date DURING LAST_30_DAYS
ORDER BY segments.date DESC
`;

export async function fetchGoogleAdsInsights(
  config: GoogleAdsConfig,
  dateRange?: { startDate: string; endDate: string },
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Google Ads insights');
    return { records: generateGoogleAdsInsights() };
  }

  // Refresh access token if needed
  const accessToken = await refreshGoogleToken(config);

  const records: RawRecord[] = [];
  const url = `https://googleads.googleapis.com/v18/customers/${config.customerId}/googleAds:searchStream`;
  let retries = 0;
  const MAX_RETRIES = 5;

  const query = dateRange
    ? GAQL_QUERY.replace(
        'DURING LAST_30_DAYS',
        `BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'`,
      )
    : GAQL_QUERY;

  while (retries <= MAX_RETRIES) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'developer-token': config.developerToken,
          'login-customer-id': config.customerId,
        },
        body: JSON.stringify({ query }),
      });

      if (resp.status === 429) {
        const backoff = Math.pow(2, retries) * 1000;
        log.warn({ backoff }, 'Rate limited by Google Ads, backing off');
        await sleep(backoff);
        retries++;
        continue;
      }

      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Google Ads API error: ${resp.status} — ${body}`);
      }

      const data = (await resp.json()) as Array<{
        results: Array<Record<string, unknown>>;
      }>;

      for (const batch of data) {
        for (const row of batch.results) {
          const campaign = row.campaign as { id: string; name: string };
          const segments = row.segments as { date: string };
          records.push({
            source: 'google_ads',
            entity: 'campaign_performance',
            externalId: `${campaign.id}_${segments.date}`,
            cursor: segments.date,
            payload: row,
          });
        }
      }

      break; // success
    } catch (err) {
      log.error({ err }, 'Error fetching Google Ads insights');
      throw err;
    }
  }

  log.info({ count: records.length }, 'Fetched Google Ads insights');
  return { records };
}

async function refreshGoogleToken(config: GoogleAdsConfig): Promise<string> {
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
    log.warn('Failed to refresh Google token, using existing access token');
    return config.accessToken;
  }

  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
