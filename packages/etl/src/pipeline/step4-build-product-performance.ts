// ──────────────────────────────────────────────────────────────
// Growth OS — Step 4: Build Product Performance Mart
// Aggregates order line items into product-level performance
// metrics with DTC scoring v2.
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';
import { subDays } from 'date-fns';
import { CATEGORY_MARGINS } from '../types.js';
import { scoreDtcProduct } from '../product-scoring-v2.js';

interface LineItem {
  title?: string;
  product_type?: string;
  quantity?: number | string;
  price?: string;
  originalUnitPriceSet?: { shopMoney?: { amount?: string } };
  product?: { productType?: string; featuredImage?: { url?: string }; description?: string; onlineStoreUrl?: string };
  variant?: { product?: { productType?: string; featuredImage?: { url?: string }; description?: string; onlineStoreUrl?: string } };
  image?: { url?: string };
}

interface ProductAgg {
  unitsSold: number;
  revenue: number;
  orderCount: number;
  prices: number[];
  buyerIds: Set<string>;
  repeatBuyerCount: number;
  imageUrl?: string;
  description?: string;
  productUrl?: string;
  orderIds: Set<string>;
}

interface PrevPeriodAgg {
  unitsSold: number;
  revenue: number;
}

interface CatalogEntry {
  imageUrl?: string;
  description?: string;
  productId?: string;
  productUrl?: string;
  collections?: string[];
  tags?: string[];
}

export interface BuildProductPerformanceResult {
  readonly products: number;
}

/**
 * Aggregate line items from orders into per-product maps.
 * Returns the product map, buyer map, and per-order product sets (for cross-sell).
 */
function aggregateLineItems(
  orders: readonly { organizationId: string | null; customerId: string | null; orderId: string; lineItemsJson: Prisma.JsonValue }[],
): {
  productMap: Map<string, ProductAgg>;
  productBuyers: Map<string, Map<string, number>>;
  orderProductSets: Map<string, Set<string>>;
} {
  const productMap = new Map<string, ProductAgg>();
  const productBuyers = new Map<string, Map<string, number>>();
  const orderProductSets = new Map<string, Set<string>>();

  for (const order of orders) {
    const lineItems = order.lineItemsJson as unknown as LineItem[] | null;
    if (!lineItems || !Array.isArray(lineItems)) continue;

    const buyerId = order.customerId ?? 'unknown';
    const orderId = order.orderId;
    const orderProducts = orderProductSets.get(orderId) ?? new Set<string>();

    for (const item of lineItems) {
      const title = item.title ?? 'Unknown Product';
      const productType = (
        item.product_type ?? item.product?.productType ?? item.variant?.product?.productType ?? 'default'
      ).toLowerCase();
      const qty = typeof item.quantity === 'string'
        ? parseInt(item.quantity, 10)
        : (item.quantity ?? 1);
      const price = parseFloat(
        item.originalUnitPriceSet?.shopMoney?.amount ?? item.price ?? '0',
      );

      const key = `${title}|||${productType}`;
      const agg = productMap.get(key) ?? {
        unitsSold: 0,
        revenue: 0,
        orderCount: 0,
        prices: [],
        buyerIds: new Set<string>(),
        repeatBuyerCount: 0,
        orderIds: new Set<string>(),
      };

      agg.unitsSold += qty;
      agg.revenue += price * qty;
      agg.orderCount += 1;
      agg.prices.push(price);
      agg.buyerIds.add(buyerId);
      agg.orderIds.add(orderId);

      // Extract image/description from line item product data (Shopify GraphQL)
      const variantProduct = item.variant?.product;
      if (!agg.imageUrl) {
        agg.imageUrl = item.image?.url ?? item.product?.featuredImage?.url ?? variantProduct?.featuredImage?.url;
      }
      if (!agg.description) {
        agg.description = item.product?.description ?? variantProduct?.description ?? undefined;
      }
      if (!agg.productUrl) {
        agg.productUrl = item.product?.onlineStoreUrl ?? variantProduct?.onlineStoreUrl ?? undefined;
      }

      productMap.set(key, agg);
      orderProducts.add(key);

      // Track buyer frequency
      const buyers = productBuyers.get(key) ?? new Map<string, number>();
      buyers.set(buyerId, (buyers.get(buyerId) ?? 0) + 1);
      productBuyers.set(key, buyers);
    }

    orderProductSets.set(orderId, orderProducts);
  }

  return { productMap, productBuyers, orderProductSets };
}

/**
 * Compute cross-sell co-occurrences: for each product key,
 * find the top 3 other products that appear in the same orders.
 */
function computeCrossSell(
  productMap: Map<string, ProductAgg>,
  orderProductSets: Map<string, Set<string>>,
): Map<string, Array<{ title: string; coOccurrence: number }>> {
  const crossSellMap = new Map<string, Array<{ title: string; coOccurrence: number }>>();

  for (const [productKey, agg] of productMap) {
    const coOccurrences = new Map<string, number>();

    for (const orderId of agg.orderIds) {
      const productsInOrder = orderProductSets.get(orderId);
      if (!productsInOrder) continue;

      for (const otherKey of productsInOrder) {
        if (otherKey === productKey) continue;
        coOccurrences.set(otherKey, (coOccurrences.get(otherKey) ?? 0) + 1);
      }
    }

    // Sort by co-occurrence count, take top 3
    const top3 = [...coOccurrences.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count]) => ({
        title: key.split('|||')[0] ?? key,
        coOccurrence: count,
      }));

    if (top3.length > 0) {
      crossSellMap.set(productKey, top3);
    }
  }

  return crossSellMap;
}

/**
 * Build product performance mart by aggregating StgOrder line items.
 *
 * 1. Query stg_orders for last 30 days + previous 30 days, parse lineItemsJson
 * 2. Group by (productTitle, productType) → compute aggregated metrics
 * 3. Compute trend, cross-sell, revenue share, product tier
 * 4. Score each product with DTC v2 scoring
 * 5. Upsert into ProductPerformance table
 */
export async function buildProductPerformance(
  organizationId?: string,
  customMargins?: Record<string, number>,
): Promise<BuildProductPerformanceResult> {
  const now = new Date();
  const cutoff30d = subDays(now, 30);
  const cutoff60d = subDays(now, 60);

  const orgFilter = organizationId ? { organizationId } : {};

  // ── Query current period (0-30 days ago) ─────────────────
  const currentOrders = await prisma.stgOrder.findMany({
    where: {
      ...orgFilter,
      orderDate: { gte: cutoff30d },
      lineItemsJson: { not: Prisma.DbNull },
    },
    select: {
      organizationId: true,
      customerId: true,
      orderId: true,
      lineItemsJson: true,
    },
  });

  // ── Query previous period (30-60 days ago) for trend calc ─
  const prevOrders = await prisma.stgOrder.findMany({
    where: {
      ...orgFilter,
      orderDate: { gte: cutoff60d, lt: cutoff30d },
      lineItemsJson: { not: Prisma.DbNull },
    },
    select: {
      organizationId: true,
      customerId: true,
      orderId: true,
      lineItemsJson: true,
    },
  });

  // ── Query earliest order per product (for firstSeenAt) ────
  const earliestOrders = await prisma.stgOrder.findMany({
    where: {
      ...orgFilter,
      lineItemsJson: { not: Prisma.DbNull },
    },
    select: {
      orderDate: true,
      lineItemsJson: true,
    },
    orderBy: { orderDate: 'asc' },
    take: 5000,
  });

  // Build firstSeenAt map
  const firstSeenMap = new Map<string, Date>();
  for (const order of earliestOrders) {
    const lineItems = order.lineItemsJson as unknown as LineItem[] | null;
    if (!lineItems || !Array.isArray(lineItems)) continue;
    for (const item of lineItems) {
      const title = item.title ?? 'Unknown Product';
      const productType = (
        item.product_type ?? item.product?.productType ?? item.variant?.product?.productType ?? 'default'
      ).toLowerCase();
      const key = `${title}|||${productType}`;
      if (!firstSeenMap.has(key)) {
        firstSeenMap.set(key, order.orderDate);
      }
    }
  }

  // ── Aggregate current period ──────────────────────────────
  const { productMap, productBuyers, orderProductSets } = aggregateLineItems(currentOrders);

  // ── Aggregate previous period for trend ───────────────────
  const prevProductMap = new Map<string, PrevPeriodAgg>();
  for (const order of prevOrders) {
    const lineItems = order.lineItemsJson as unknown as LineItem[] | null;
    if (!lineItems || !Array.isArray(lineItems)) continue;

    for (const item of lineItems) {
      const title = item.title ?? 'Unknown Product';
      const productType = (
        item.product_type ?? item.product?.productType ?? item.variant?.product?.productType ?? 'default'
      ).toLowerCase();
      const qty = typeof item.quantity === 'string'
        ? parseInt(item.quantity, 10)
        : (item.quantity ?? 1);
      const price = parseFloat(
        item.originalUnitPriceSet?.shopMoney?.amount ?? item.price ?? '0',
      );

      const key = `${title}|||${productType}`;
      const prev = prevProductMap.get(key) ?? { unitsSold: 0, revenue: 0 };
      prev.unitsSold += qty;
      prev.revenue += price * qty;
      prevProductMap.set(key, prev);
    }
  }

  // ── Cross-sell computation ────────────────────────────────
  const crossSellMap = computeCrossSell(productMap, orderProductSets);

  // ── Total org revenue for revenue share ───────────────────
  let totalOrgRevenue = 0;
  for (const agg of productMap.values()) {
    totalOrgRevenue += agg.revenue;
  }

  // ── Look up product catalog data for enrichment ───────────
  const catalogMap = new Map<string, CatalogEntry>();
  const catalogRecords = await prisma.rawEvent.findMany({
    where: {
      source: 'shopify',
      entity: 'products',
      ...orgFilter,
    },
    select: { payloadJson: true },
    take: 500,
  });

  for (const rec of catalogRecords) {
    const payload = rec.payloadJson as Record<string, unknown>;
    const title = payload.title as string | undefined;
    if (!title) continue;

    const images = payload.images as Array<{ url?: string }> | undefined;
    const rawCollections = payload.collections as string[] | undefined;
    const rawTags = payload.tags as string[] | undefined;

    catalogMap.set(title.toLowerCase(), {
      imageUrl: images?.[0]?.url ?? (payload.imageUrl as string | undefined),
      description: payload.descriptionText as string | undefined,
      productId: payload.id as string | undefined,
      productUrl: payload.onlineStoreUrl as string | undefined,
      collections: rawCollections,
      tags: rawTags,
    });
  }

  // ── Query ad history (historical ROAS + times advertised) ─
  const adHistoryMap = new Map<string, { totalRoas: number; count: number }>();
  const adJobs = await prisma.proactiveAdJob.findMany({
    where: {
      ...orgFilter,
      status: { in: ['WINNER', 'PUBLISHED'] },
    },
    select: {
      productTitle: true,
      productType: true,
      adFitnessScore: true,
    },
  });

  for (const job of adJobs) {
    const key = `${job.productTitle}|||${job.productType}`;
    const entry = adHistoryMap.get(key) ?? { totalRoas: 0, count: 0 };
    // Use adFitnessScore as a proxy for ROAS if available (actual ROAS
    // would need spend + revenue tracking from MetaAdSnapshot — Phase 3)
    entry.count += 1;
    entry.totalRoas += Number(job.adFitnessScore) / 25; // rough proxy: score/25 ~ ROAS range
    adHistoryMap.set(key, entry);
  }

  // ── Upsert products ───────────────────────────────────────
  let productCount = 0;
  const orgId = organizationId ?? null;

  for (const [key, agg] of productMap) {
    const [title, productType] = key.split('|||') as [string, string];
    const margin = customMargins?.[productType] ?? CATEGORY_MARGINS[productType] ?? CATEGORY_MARGINS['default']!;
    const avgPrice = agg.prices.length > 0
      ? agg.prices.reduce((s, p) => s + p, 0) / agg.prices.length
      : 0;
    const grossProfit = agg.revenue * margin;
    const avgDailyUnits = agg.unitsSold / 30;

    // Compute repeat buyer percentage
    const buyers = productBuyers.get(key);
    let repeatBuyerPct = 0;
    if (buyers && buyers.size > 0) {
      let repeats = 0;
      for (const count of buyers.values()) {
        if (count > 1) repeats++;
      }
      repeatBuyerPct = repeats / buyers.size;
    }

    // ── Trend metrics ─────────────────────────────────────
    const prevAgg = prevProductMap.get(key);
    const revenuePrev30d = prevAgg?.revenue ?? null;
    let revenueTrend: number | null = null;
    let unitsTrend: number | null = null;

    if (prevAgg && prevAgg.revenue > 0) {
      revenueTrend = (agg.revenue - prevAgg.revenue) / prevAgg.revenue;
    } else if (prevAgg && prevAgg.revenue === 0 && agg.revenue > 0) {
      revenueTrend = 1; // new product with no previous revenue → 100% growth
    }

    if (prevAgg && prevAgg.unitsSold > 0) {
      unitsTrend = (agg.unitsSold - prevAgg.unitsSold) / prevAgg.unitsSold;
    } else if (prevAgg && prevAgg.unitsSold === 0 && agg.unitsSold > 0) {
      unitsTrend = 1;
    }

    // ── Revenue share ─────────────────────────────────────
    const revenueShare = totalOrgRevenue > 0
      ? agg.revenue / totalOrgRevenue
      : null;

    // ── First seen + days since first sale ─────────────────
    const firstSeenAt = firstSeenMap.get(key) ?? null;
    const daysSinceFirstSale = firstSeenAt
      ? Math.floor((now.getTime() - firstSeenAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // ── Cross-sell ────────────────────────────────────────
    const crossSell = crossSellMap.get(key) ?? null;

    // ── Collections/tags from catalog ─────────────────────
    const catalog = catalogMap.get(title.toLowerCase());
    const collections = catalog?.collections ?? null;
    const tags = catalog?.tags ?? null;

    // ── Ad history ────────────────────────────────────────
    const adHistory = adHistoryMap.get(key);
    const timesAdvertised = adHistory?.count ?? 0;
    const historicalRoas = adHistory && adHistory.count > 0
      ? adHistory.totalRoas / adHistory.count
      : null;

    // ── Determine image/description availability ──────────
    const hasImage = !!(agg.imageUrl ?? catalog?.imageUrl);
    const hasDescription = !!(agg.description ?? catalog?.description);
    const hasCollections = !!collections && Array.isArray(collections) && collections.length > 0;

    // ── Score with DTC v2 ─────────────────────────────────
    const dtcResult = scoreDtcProduct({
      revenue30d: agg.revenue,
      grossProfit30d: grossProfit,
      estimatedMargin: margin,
      avgDailyUnits,
      avgPrice,
      repeatBuyerPct,
      revenueShare: revenueShare ?? 0,
      revenueTrend: revenueTrend ?? 0,
      daysSinceFirstSale: daysSinceFirstSale ?? 365,
      hasImage,
      hasDescription,
      hasCollections,
      historicalRoas,
      timesAdvertised,
    });

    // ── Product tier ──────────────────────────────────────
    const productTier = dtcResult.tier;

    await prisma.productPerformance.upsert({
      where: {
        organizationId_productTitle_productType: {
          organizationId: orgId ?? '',
          productTitle: title,
          productType,
        },
      },
      create: {
        organizationId: orgId,
        productTitle: title,
        productType,
        unitsSold30d: agg.unitsSold,
        revenue30d: agg.revenue,
        orderCount30d: agg.orderCount,
        avgPrice,
        estimatedMargin: margin,
        grossProfit30d: grossProfit,
        avgDailyUnits,
        repeatBuyerPct,
        adFitnessScore: dtcResult.score,
        shopifyProductId: catalog?.productId ?? null,
        imageUrl: catalog?.imageUrl ?? agg.imageUrl ?? null,
        productUrl: catalog?.productUrl ?? agg.productUrl ?? null,
        description: catalog?.description ?? agg.description ?? null,
        // v2 fields
        revenuePrev30d: revenuePrev30d,
        revenueTrend,
        unitsTrend,
        firstSeenAt,
        daysSinceFirstSale,
        revenueShare,
        topCrossSellProducts: crossSell ?? Prisma.DbNull,
        collections: collections ?? Prisma.DbNull,
        tags: tags ?? Prisma.DbNull,
        historicalRoas,
        timesAdvertised,
        productTier,
        lastComputedAt: new Date(),
      },
      update: {
        unitsSold30d: agg.unitsSold,
        revenue30d: agg.revenue,
        orderCount30d: agg.orderCount,
        avgPrice,
        estimatedMargin: margin,
        grossProfit30d: grossProfit,
        avgDailyUnits,
        repeatBuyerPct,
        adFitnessScore: dtcResult.score,
        shopifyProductId: catalog?.productId ?? null,
        imageUrl: catalog?.imageUrl ?? agg.imageUrl ?? null,
        productUrl: catalog?.productUrl ?? agg.productUrl ?? null,
        description: catalog?.description ?? agg.description ?? null,
        // v2 fields
        revenuePrev30d: revenuePrev30d,
        revenueTrend,
        unitsTrend,
        firstSeenAt,
        daysSinceFirstSale,
        revenueShare,
        topCrossSellProducts: crossSell ?? Prisma.DbNull,
        collections: collections ?? Prisma.DbNull,
        tags: tags ?? Prisma.DbNull,
        historicalRoas,
        timesAdvertised,
        productTier,
        lastComputedAt: new Date(),
      },
    });

    productCount++;
  }

  return { products: productCount };
}
