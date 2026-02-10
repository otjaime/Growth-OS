// ──────────────────────────────────────────────────────────────
// Growth OS — Google Ads Connector
// Fetches campaign performance from Google Ads API
// Supports both direct client accounts and Manager (MCC) accounts
// ──────────────────────────────────────────────────────────────

import type { RawRecord, GoogleAdsConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateGoogleAdsInsights } from './demo-generator.js';

const log = createLogger('connector:google-ads');

const API_VERSION = 'v23';

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

  const accessToken = await refreshGoogleToken(config);
  const loginCustomerId = config.managerAccountId?.replace(/-/g, '') || config.customerId;

  const query = dateRange
    ? GAQL_QUERY.replace(
        'DURING LAST_30_DAYS',
        `BETWEEN '${dateRange.startDate}' AND '${dateRange.endDate}'`,
      )
    : GAQL_QUERY;

  // Try fetching directly first; if we get REQUESTED_METRICS_FOR_MANAGER,
  // list child accounts and query each one.
  const records: RawRecord[] = [];

  try {
    const result = await queryCustomer(config.customerId, accessToken, config.developerToken, loginCustomerId, query);
    records.push(...result);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('REQUESTED_METRICS_FOR_MANAGER')) {
      log.info('Customer ID is a manager account, listing child accounts...');
      const childIds = await listClientAccounts(config.customerId, accessToken, config.developerToken, loginCustomerId);
      log.info({ count: childIds.length }, 'Found child accounts under manager');

      for (const childId of childIds) {
        try {
          const result = await queryCustomer(childId, accessToken, config.developerToken, loginCustomerId, query);
          records.push(...result);
        } catch (childErr) {
          log.warn({ childId, err: childErr }, 'Failed to query child account, skipping');
        }
      }
    } else {
      throw err;
    }
  }

  log.info({ count: records.length }, 'Fetched Google Ads insights');
  return { records };
}

async function listClientAccounts(
  managerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
): Promise<string[]> {
  const query = `SELECT customer_client.id, customer_client.manager, customer_client.status FROM customer_client WHERE customer_client.manager = false AND customer_client.status = 'ENABLED'`;
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${managerId}/googleAds:searchStream`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'login-customer-id': loginCustomerId,
    },
    body: JSON.stringify({ query }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to list client accounts: ${resp.status} — ${body.substring(0, 300)}`);
  }

  const data = (await resp.json()) as Array<{
    results: Array<{ customerClient: { id: string } }>;
  }>;

  const ids: string[] = [];
  for (const batch of data) {
    for (const row of batch.results) {
      ids.push(String(row.customerClient.id));
    }
  }
  return ids;
}

async function queryCustomer(
  customerId: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  query: string,
): Promise<RawRecord[]> {
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`;
  let retries = 0;
  const MAX_RETRIES = 5;
  const records: RawRecord[] = [];

  while (retries <= MAX_RETRIES) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId,
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
      throw new Error(`Google Ads API error: ${resp.status} — ${body.substring(0, 300)}`);
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
          externalId: `${customerId}_${campaign.id}_${segments.date}`,
          cursor: segments.date,
          payload: { ...row, _customerId: customerId },
        });
      }
    }

    break; // success
  }

  return records;
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
