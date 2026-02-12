// ──────────────────────────────────────────────────────────────
// Growth OS — Shopify Connector
// Supports both real API (GraphQL) and demo mode
// ──────────────────────────────────────────────────────────────

import type { RawRecord, ShopifyConfig } from '../types.js';
import { createLogger } from '../logger.js';
import { generateShopifyOrders, generateShopifyCustomers } from './demo-generator.js';

const log = createLogger('connector:shopify');

const ORDER_FIELDS = `
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
`;

const JOURNEY_FIELDS = `
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
`;

function buildOrdersQuery(includeJourney: boolean): string {
  return `
query ($cursor: String, $query: String) {
  orders(first: 50, after: $cursor, query: $query, sortKey: UPDATED_AT) {
    edges {
      cursor
      node {
${ORDER_FIELDS}${includeJourney ? JOURNEY_FIELDS : ''}
      }
    }
    pageInfo { hasNextPage }
  }
}
`;
}

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

  // Try with customerJourneySummary first; discover on the first page whether it works
  let useJourney = true;
  let isFirstPage = true;

  while (hasNext) {
    try {
      const query = buildOrdersQuery(useJourney);
      const result = await fetchGraphQL(url, config.accessToken, query, {
        cursor,
        query: afterCursor ? `updated_at:>'${afterCursor}'` : null,
      });

      // On the first page, check if customerJourneySummary caused errors
      if (isFirstPage && useJourney && result.errors) {
        const needsFallback = !result.data || result.errors.some((e: { message: string }) =>
          e.message.toLowerCase().includes('customerjourneysummary') ||
          e.message.toLowerCase().includes('access denied') ||
          e.message.toLowerCase().includes('field') ||
          e.message.toLowerCase().includes('does not exist')
        );
        if (needsFallback) {
          log.warn({ errors: result.errors.map((e: { message: string }) => e.message) },
            'customerJourneySummary not available — retrying without it');
          useJourney = false;
          // Re-fetch this page without the journey field
          const fallback = await fetchGraphQL(url, config.accessToken, buildOrdersQuery(false), {
            cursor,
            query: afterCursor ? `updated_at:>'${afterCursor}'` : null,
          });
          if (fallback.errors && !fallback.data) {
            throw new Error(`Shopify GraphQL errors: ${fallback.errors.map((e: { message: string }) => e.message).join('; ')}`);
          }
          isFirstPage = false;
          const orders = fallback.data?.orders;
          if (!orders) throw new Error('Shopify response missing orders data');
          for (const edge of orders.edges) {
            records.push({ source: 'shopify', entity: 'orders', externalId: String(edge.node.id), cursor: edge.cursor, payload: edge.node });
            cursor = edge.cursor;
          }
          hasNext = orders.pageInfo.hasNextPage;
          continue;
        }
      }

      if (result.errors && !result.data) {
        throw new Error(`Shopify GraphQL errors: ${result.errors.map((e: { message: string }) => e.message).join('; ')}`);
      }

      if (result.errors) {
        log.warn({ errors: result.errors.map((e: { message: string }) => e.message) }, 'Shopify GraphQL partial errors');
      }

      isFirstPage = false;
      const orders = result.data?.orders;
      if (!orders) throw new Error('Shopify response missing orders data');

      for (const edge of orders.edges) {
        records.push({ source: 'shopify', entity: 'orders', externalId: String(edge.node.id), cursor: edge.cursor, payload: edge.node });
        cursor = edge.cursor;
      }

      hasNext = orders.pageInfo.hasNextPage;
    } catch (err) {
      log.error({ err }, 'Error fetching Shopify orders');
      throw err;
    }
  }

  log.info({ count: records.length, useJourney }, 'Fetched Shopify orders');
  return { records, nextCursor: cursor };
}

async function fetchGraphQL(
  url: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{
  data?: {
    orders: {
      edges: Array<{ cursor: string; node: Record<string, unknown> }>;
      pageInfo: { hasNextPage: boolean };
    };
  };
  errors?: Array<{ message: string }>;
}> {
  let retries = 0;
  const MAX_RETRIES = 5;

  while (true) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
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

    return (await resp.json()) as {
      data?: {
        orders: {
          edges: Array<{ cursor: string; node: Record<string, unknown> }>;
          pageInfo: { hasNextPage: boolean };
        };
      };
      errors?: Array<{ message: string }>;
    };
  }
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
