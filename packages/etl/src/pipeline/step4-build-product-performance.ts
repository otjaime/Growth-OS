// ──────────────────────────────────────────────────────────────
// Growth OS — Step 4: Build Product Performance Mart
// Aggregates order line items into product-level performance
// metrics with ad fitness scoring.
// ──────────────────────────────────────────────────────────────

import { prisma, Prisma } from '@growth-os/database';
import { subDays } from 'date-fns';
import { CATEGORY_MARGINS } from '../types.js';
import { scoreAdFitness } from '../product-scoring.js';

interface LineItem {
  title?: string;
  product_type?: string;
  quantity?: number | string;
  price?: string;
  originalUnitPriceSet?: { shopMoney?: { amount?: string } };
  product?: { productType?: string; featuredImage?: { url?: string }; description?: string; onlineStoreUrl?: string };
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
}

export interface BuildProductPerformanceResult {
  readonly products: number;
}

/**
 * Build product performance mart by aggregating StgOrder line items.
 *
 * 1. Query stg_orders for last 30 days, parse lineItemsJson
 * 2. Group by (productTitle, productType) → compute aggregated metrics
 * 3. Score each product for ad fitness
 * 4. Upsert into ProductPerformance table
 */
export async function buildProductPerformance(
  organizationId?: string,
): Promise<BuildProductPerformanceResult> {
  const cutoff = subDays(new Date(), 30);

  // Query orders with line items
  const orders = await prisma.stgOrder.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      orderDate: { gte: cutoff },
      lineItemsJson: { not: Prisma.DbNull },
    },
    select: {
      organizationId: true,
      customerId: true,
      lineItemsJson: true,
    },
  });

  // Aggregate by product
  const productMap = new Map<string, ProductAgg>();
  // Track per-product buyers to compute repeat rate
  const productBuyers = new Map<string, Map<string, number>>(); // key → buyerId → purchase count

  for (const order of orders) {
    const lineItems = order.lineItemsJson as unknown as LineItem[] | null;
    if (!lineItems || !Array.isArray(lineItems)) continue;

    const buyerId = order.customerId ?? 'unknown';

    for (const item of lineItems) {
      const title = item.title ?? 'Unknown Product';
      const productType = (
        item.product_type ?? item.product?.productType ?? 'default'
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
      };

      agg.unitsSold += qty;
      agg.revenue += price * qty;
      agg.orderCount += 1;
      agg.prices.push(price);
      agg.buyerIds.add(buyerId);

      // Extract image/description from line item product data (Shopify GraphQL)
      if (!agg.imageUrl) {
        agg.imageUrl = item.image?.url ?? item.product?.featuredImage?.url;
      }
      if (!agg.description && item.product?.description) {
        agg.description = item.product.description;
      }
      if (!agg.productUrl && item.product?.onlineStoreUrl) {
        agg.productUrl = item.product.onlineStoreUrl;
      }

      productMap.set(key, agg);

      // Track buyer frequency
      const buyers = productBuyers.get(key) ?? new Map<string, number>();
      buyers.set(buyerId, (buyers.get(buyerId) ?? 0) + 1);
      productBuyers.set(key, buyers);
    }
  }

  // Look up existing product catalog data for enrichment (from raw_events)
  const catalogMap = new Map<string, { imageUrl?: string; description?: string; productId?: string; productUrl?: string }>();
  const catalogRecords = await prisma.rawEvent.findMany({
    where: {
      source: 'shopify',
      entity: 'products',
      ...(organizationId ? { organizationId } : {}),
    },
    select: { payloadJson: true },
    take: 500,
  });

  for (const rec of catalogRecords) {
    const payload = rec.payloadJson as Record<string, unknown>;
    const title = payload.title as string | undefined;
    if (!title) continue;

    const images = payload.images as Array<{ url?: string }> | undefined;
    catalogMap.set(title.toLowerCase(), {
      imageUrl: images?.[0]?.url ?? (payload.imageUrl as string | undefined),
      description: payload.descriptionText as string | undefined,
      productId: payload.id as string | undefined,
      productUrl: payload.onlineStoreUrl as string | undefined,
    });
  }

  // Upsert products
  let productCount = 0;
  const orgId = organizationId ?? null;

  for (const [key, agg] of productMap) {
    const [title, productType] = key.split('|||') as [string, string];
    const margin = CATEGORY_MARGINS[productType] ?? CATEGORY_MARGINS['default']!;
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

    // Catalog enrichment
    const catalog = catalogMap.get(title.toLowerCase());

    // Score ad fitness
    const fitness = scoreAdFitness({
      revenue30d: agg.revenue,
      grossProfit30d: grossProfit,
      estimatedMargin: margin,
      avgDailyUnits,
      repeatBuyerPct,
      avgPrice,
      hasImage: !!catalog?.imageUrl,
      hasDescription: !!catalog?.description,
    });

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
        adFitnessScore: fitness.score,
        shopifyProductId: catalog?.productId ?? null,
        imageUrl: catalog?.imageUrl ?? null,
        productUrl: catalog?.productUrl ?? null,
        description: catalog?.description ?? null,
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
        adFitnessScore: fitness.score,
        shopifyProductId: catalog?.productId ?? null,
        imageUrl: catalog?.imageUrl ?? null,
        productUrl: catalog?.productUrl ?? null,
        description: catalog?.description ?? null,
        lastComputedAt: new Date(),
      },
    });

    productCount++;
  }

  return { products: productCount };
}
