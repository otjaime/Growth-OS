// ──────────────────────────────────────────────────────────────
// Growth OS — Shopify Connector
// Uses GraphQL Admin API for orders (includes customerJourneySummary
// for accurate channel attribution matching Shopify's own analytics)
// Supports both real API and demo mode
// ──────────────────────────────────────────────────────────────

import type { RawRecord, ShopifyConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateShopifyOrders, generateShopifyCustomers } from './demo-generator.js';

const log = createLogger('connector:shopify');

const ORDERS_QUERY = `
  query OrdersQuery($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          updatedAt
          totalPriceSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount } }
          sourceName
          landingPageUrl
          referrerUrl
          tags
          customer { id email }
          shippingAddress { provinceCode }
          lineItems(first: 50) {
            edges {
              node {
                title
                quantity
                originalUnitPriceSet { shopMoney { amount } }
                variant { product { productType } }
              }
            }
          }
          customerJourneySummary {
            firstVisit {
              source
              sourceType
              utmParameters { source medium campaign }
            }
            lastVisit {
              source
              sourceType
              utmParameters { source medium campaign }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
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

  const graphqlUrl = `https://${config.shopDomain}/admin/api/2024-01/graphql.json`;
  const records: RawRecord[] = [];
  let retries = 0;
  const MAX_RETRIES = 5;

  // Build query filter for incremental sync
  const queryFilter = afterCursor ? `updated_at:>'${afterCursor}'` : null;

  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    try {
      const resp = await fetch(graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.accessToken,
        },
        body: JSON.stringify({
          query: ORDERS_QUERY,
          variables: {
            first: 250,
            after: cursor,
            query: queryFilter,
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
        throw new Error(`Shopify GraphQL error: ${resp.status} ${resp.statusText}`);
      }

      const json = (await resp.json()) as {
        data?: {
          orders?: {
            edges: Array<{ cursor: string; node: Record<string, unknown> }>;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (json.errors?.length) {
        const messages = json.errors.map((e) => e.message).join('; ');
        throw new Error(`Shopify GraphQL errors: ${messages}`);
      }

      const ordersData = json.data?.orders;
      if (!ordersData) {
        log.warn('No orders data in GraphQL response');
        break;
      }

      for (const edge of ordersData.edges) {
        const node = edge.node;
        records.push({
          source: 'shopify',
          entity: 'orders',
          externalId: node.id as string,
          cursor: node.updatedAt as string,
          payload: node,
        });
      }

      retries = 0;
      hasNextPage = ordersData.pageInfo.hasNextPage;
      cursor = ordersData.pageInfo.endCursor;
    } catch (err) {
      log.error({ err }, 'Error fetching Shopify orders');
      throw err;
    }
  }

  log.info({ count: records.length }, 'Fetched Shopify orders (GraphQL)');
  const lastRecord = records[records.length - 1];
  return { records, nextCursor: lastRecord ? lastRecord.cursor : undefined };
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
