// ──────────────────────────────────────────────────────────────
// Growth OS — Shopify Connector
// Supports both real API (GraphQL) and demo mode
// ──────────────────────────────────────────────────────────────

import type { RawRecord, ShopifyConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateShopifyOrders, generateShopifyCustomers } from './demo-generator.js';

const log = createLogger('connector:shopify');

const ORDERS_QUERY = `
query ($cursor: String, $query: String) {
  orders(first: 50, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        updatedAt
        totalPriceSet { shopMoney { amount currencyCode } }
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        customer { id email firstName lastName }
        lineItems(first: 50) {
          edges {
            node {
              id title quantity
              originalUnitPriceSet { shopMoney { amount } }
              product { productType }
            }
          }
        }
        shippingAddress { provinceCode countryCode }
        sourceName
        landingPageUrl
        referrerUrl
        tags
        customerJourneySummary {
          firstVisit {
            source
            sourceType
            utmParameters {
              source
              medium
              campaign
            }
          }
          lastVisit {
            source
            sourceType
            utmParameters {
              source
              medium
              campaign
            }
          }
        }
      }
    }
    pageInfo { hasNextPage }
  }
}
`;

export async function fetchShopifyOrders(
  config: ShopifyConfig,
  afterCursor?: string,
): Promise<{ records: RawRecord[]; nextCursor?: string }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Shopify orders');
    return { records: generateShopifyOrders(), nextCursor: undefined };
  }

  const url = `https://${config.shopDomain}/admin/api/2024-01/graphql.json`;
  const records: RawRecord[] = [];
  let cursor = afterCursor;
  let hasNext = true;
  let retries = 0;
  const MAX_RETRIES = 5;

  while (hasNext) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.accessToken,
        },
        body: JSON.stringify({
          query: ORDERS_QUERY,
          variables: {
            cursor,
            query: afterCursor ? `updated_at:>'${afterCursor}'` : null,
          },
        }),
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
        data: {
          orders: {
            edges: Array<{ cursor: string; node: Record<string, unknown> }>;
            pageInfo: { hasNextPage: boolean };
          };
        };
      };

      for (const edge of data.data.orders.edges) {
        records.push({
          source: 'shopify',
          entity: 'orders',
          externalId: String(edge.node.id),
          cursor: edge.cursor,
          payload: edge.node,
        });
        cursor = edge.cursor;
      }

      hasNext = data.data.orders.pageInfo.hasNextPage;
      retries = 0;
    } catch (err) {
      log.error({ err }, 'Error fetching Shopify orders');
      throw err;
    }
  }

  log.info({ count: records.length }, 'Fetched Shopify orders');
  return { records, nextCursor: cursor };
}

export async function fetchShopifyCustomers(
  config: ShopifyConfig,
): Promise<{ records: RawRecord[] }> {
  if (config.isDemoMode) {
    log.info('Running in DEMO mode — generating mock Shopify customers');
    return { records: generateShopifyCustomers() };
  }

  // Real implementation would use similar GraphQL pagination
  log.warn('Real Shopify customer fetch not fully implemented; use demo mode');
  return { records: [] };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
