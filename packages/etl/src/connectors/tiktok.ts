// ──────────────────────────────────────────────────────────────
// Growth OS — TikTok Ads Connector
// Fetches campaign insights from TikTok Marketing API
// ──────────────────────────────────────────────────────────────

import type { RawRecord, TikTokConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateTikTokInsights } from './demo-tiktok.js';

const log = createLogger('connector:tiktok');

export async function fetchTikTokInsights(
  config: TikTokConfig,
  _dateRange?: { since: string; until: string },
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock TikTok insights');
    return { records: generateTikTokInsights() };
  }

  throw new Error('TikTok live API not yet implemented');
}
