// ──────────────────────────────────────────────────────────────
// Growth OS — Shopify Connector
// Uses REST API for orders (landing_site preserves gclid/UTM params)
// Supports both real API and demo mode
// ──────────────────────────────────────────────────────────────

import type { RawRecord, ShopifyConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateShopifyOrders, generateShopifyCustomers } from './demo-generator.js';

const log = createLogger('connector:shopify');

export async function fetchShopifyOrders(
  config: ShopifyConfig,
  afterCursor?: string,
): Promise<{ records: RawRecord[]; nextCursor?: string }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Shopify orders');
    return { records: generateShopifyOrders(), nextCursor: undefined };
  }

  const baseUrl = `https://${config.shopDomain}/admin/api/2024-01/orders.json`;
  const records: RawRecord[] = [];
  let retries = 0;
  const MAX_RETRIES = 5;

  // Build initial URL with params
  const params = new URLSearchParams({
    limit: '250',
    status: 'any',
    order: 'updated_at asc',
  });
  let nextUrl: string | null = `${baseUrl}?${params.toString()}`;

  while (nextUrl) {
    try {
      const resp = await fetch(nextUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.accessToken,
        },
      });

      if (resp.status === 429) {
        const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '2', 10);
        log.warn({ retryAfter }, 'Rate limited by Shopify, backing off');
        await sleep(retryAfter * 1000 * Math.pow(2, retries));
        retries++;
        if (retries > MAX_RETRIES) throw new Error('Max retries exceeded for Shopify');
        continue;
      }

      if (!resp.ok) {
        throw new Error(`Shopify API error: ${resp.status} ${resp.statusText}`);
      }

      const data = (await resp.json()) as {
        orders: Array<Record<string, unknown>>;
      };

      for (const order of data.orders) {
        records.push({
          source: 'shopify',
          entity: 'orders',
          externalId: `gid://shopify/Order/${order.id}`,
          cursor: String(order.updated_at),
          payload: order,
        });
      }

      retries = 0;

      // Pagination: Shopify REST uses Link header
      const linkHeader = resp.headers.get('Link');
      nextUrl = parseLinkNext(linkHeader);
    } catch (err) {
      log.error({ err }, 'Error fetching Shopify orders');
      throw err;
    }
  }

  log.info({ count: records.length }, 'Fetched Shopify orders (REST)');
  const lastRecord = records[records.length - 1];
  return { records, nextCursor: lastRecord ? lastRecord.cursor : undefined };
}

function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Format: <https://...>; rel="next", <https://...>; rel="previous"
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1] ?? null;
  }
  return null;
}

export async function fetchShopifyCustomers(
  config: ShopifyConfig,
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Shopify customers');
    return { records: generateShopifyCustomers() };
  }

  // Real implementation would use similar REST pagination
  log.warn('Real Shopify customer fetch not fully implemented; use demo mode');
  return { records: [] };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
