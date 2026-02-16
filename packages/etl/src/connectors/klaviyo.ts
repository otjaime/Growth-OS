// ──────────────────────────────────────────────────────────────
// Growth OS — Klaviyo Email Connector
// Fetches campaign and flow metrics from Klaviyo API
// ──────────────────────────────────────────────────────────────

import type { RawRecord, KlaviyoConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateKlaviyoCampaigns, generateKlaviyoFlows } from './demo-klaviyo.js';

const log = createLogger('connector:klaviyo');

export async function fetchKlaviyoCampaigns(
  config: KlaviyoConfig,
  _dateRange?: { since: string; until: string },
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Klaviyo campaigns');
    return { records: generateKlaviyoCampaigns() };
  }

  throw new Error('Klaviyo live API not yet implemented');
}

export async function fetchKlaviyoFlows(
  config: KlaviyoConfig,
  _dateRange?: { since: string; until: string },
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Klaviyo flows');
    return { records: generateKlaviyoFlows() };
  }

  throw new Error('Klaviyo live API not yet implemented');
}
