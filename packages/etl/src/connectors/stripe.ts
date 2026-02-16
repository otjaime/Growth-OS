// ──────────────────────────────────────────────────────────────
// Growth OS — Stripe Payments Connector
// Fetches charges and refunds from Stripe API
// ──────────────────────────────────────────────────────────────

import type { RawRecord, StripeConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateStripeCharges, generateStripeRefunds } from './demo-stripe.js';

const log = createLogger('connector:stripe');

export async function fetchStripeCharges(
  config: StripeConfig,
  _dateRange?: { since: string; until: string },
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Stripe charges');
    return { records: generateStripeCharges() };
  }

  throw new Error('Stripe live API not yet implemented');
}

export async function fetchStripeRefunds(
  config: StripeConfig,
  _dateRange?: { since: string; until: string },
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Stripe refunds');
    return { records: generateStripeRefunds() };
  }

  throw new Error('Stripe live API not yet implemented');
}
