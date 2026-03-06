// ──────────────────────────────────────────────────────────────
// Growth OS — Campaign Suggestion Engine
// Analyzes product performance data and generates campaign
// suggestions across multiple strategy types.
// Pure function: receives data, returns suggestions.
// ──────────────────────────────────────────────────────────────

import { getUpcomingEvents, matchProductsToEvent } from './seasonal-calendar.js';

export interface ProductForCampaign {
  readonly productTitle: string;
  readonly productType: string;
  readonly adFitnessScore: number;
  readonly revenue30d: number;
  readonly grossProfit30d: number;
  readonly estimatedMargin: number;
  readonly avgPrice: number;
  readonly avgDailyUnits: number;
  readonly repeatBuyerPct: number;
  readonly imageUrl: string | null;
  readonly productTier: string | null;
  readonly revenueTrend: number | null;
  readonly revenueShare: number | null;
  readonly daysSinceFirstSale: number | null;
  readonly collections: string[] | null;
  readonly tags: string[] | null;
  readonly topCrossSellProducts: { title: string; coOccurrence: number }[] | null;
}

export interface CampaignSuggestion {
  readonly name: string;
  readonly type: 'HERO_PRODUCT' | 'CATEGORY' | 'SEASONAL' | 'NEW_ARRIVAL' | 'CROSS_SELL';
  readonly productTitles: readonly string[];
  readonly estimatedRoas: number;
  readonly rationale: string;
  readonly dailyBudget: number;
  readonly targetAudience: string;
  readonly creativeDirection: string;
  readonly priority: number;  // higher = more important
}

export interface CampaignSuggestionInput {
  readonly products: readonly ProductForCampaign[];
  readonly totalDailyBudget: number;
  readonly existingCampaignProductTitles: ReadonlySet<string>;
  readonly daysAhead?: number;
  readonly referenceDate?: Date;
}

// Priority constants by campaign type
const PRIORITY_HERO_PRODUCT = 90;
const PRIORITY_SEASONAL = 80;
const PRIORITY_CATEGORY = 70;
const PRIORITY_NEW_ARRIVAL = 60;
const PRIORITY_CROSS_SELL = 50;

/**
 * Generates campaign suggestions based on product performance data.
 * Returns suggestions sorted by priority (hero > seasonal > category > new_arrival > cross_sell)
 * then by estimated ROAS descending.
 */
export function generateCampaignSuggestions(input: CampaignSuggestionInput): CampaignSuggestion[] {
  const { products, totalDailyBudget, existingCampaignProductTitles, daysAhead = 21, referenceDate } = input;

  if (products.length === 0 || totalDailyBudget <= 0) {
    return [];
  }

  // Filter out products already in active campaigns
  const availableProducts = products.filter(
    (p) => !existingCampaignProductTitles.has(p.productTitle),
  );

  const suggestions: CampaignSuggestion[] = [];

  // 1. Hero Product campaigns
  const heroSuggestions = generateHeroCampaigns(availableProducts, totalDailyBudget);
  suggestions.push(...heroSuggestions);

  // 2. Category campaigns
  const categorySuggestions = generateCategoryCampaigns(availableProducts, totalDailyBudget);
  suggestions.push(...categorySuggestions);

  // 3. Seasonal campaigns
  const seasonalSuggestions = generateSeasonalCampaigns(availableProducts, totalDailyBudget, daysAhead, referenceDate);
  suggestions.push(...seasonalSuggestions);

  // 4. New Arrival campaigns
  const newArrivalSuggestions = generateNewArrivalCampaigns(availableProducts, totalDailyBudget);
  suggestions.push(...newArrivalSuggestions);

  // 5. Cross-sell campaigns
  const crossSellSuggestions = generateCrossSellCampaigns(availableProducts, totalDailyBudget);
  suggestions.push(...crossSellSuggestions);

  // Sort by priority descending, then by estimatedRoas descending
  suggestions.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.estimatedRoas - a.estimatedRoas;
  });

  return suggestions;
}

function generateHeroCampaigns(
  products: readonly ProductForCampaign[],
  totalDailyBudget: number,
): CampaignSuggestion[] {
  // Find top 3 hero-eligible products
  const heroEligible = products
    .filter((p) =>
      (p.productTier === 'hero' || p.adFitnessScore >= 70) &&
      p.imageUrl !== null,
    )
    .sort((a, b) => b.adFitnessScore - a.adFitnessScore)
    .slice(0, 3);

  if (heroEligible.length === 0) return [];

  const budgetPerCampaign = Math.max(5, (totalDailyBudget * 0.40) / heroEligible.length);

  return heroEligible.map((product): CampaignSuggestion => {
    const estimatedRoas = product.estimatedMargin > 0.40
      ? product.estimatedMargin * 4
      : product.estimatedMargin * 3;

    return {
      name: `Hero — ${product.productTitle}`,
      type: 'HERO_PRODUCT',
      productTitles: [product.productTitle],
      estimatedRoas: Math.round(estimatedRoas * 100) / 100,
      rationale: `Top performer with ad fitness score of ${product.adFitnessScore.toFixed(0)}. ` +
        `Generates $${product.revenue30d.toFixed(0)}/month with ${(product.estimatedMargin * 100).toFixed(0)}% margin. ` +
        `Strong candidate for standalone hero campaign.`,
      dailyBudget: Math.round(budgetPerCampaign * 100) / 100,
      targetAudience: product.repeatBuyerPct > 0.3
        ? 'Lookalike audiences based on repeat buyers + interest targeting'
        : 'Broad interest targeting + DPA for product category',
      creativeDirection: `Single-product spotlight with lifestyle imagery. ` +
        `Lead with $${product.avgPrice.toFixed(0)} price point. ` +
        `Highlight key benefits and social proof.`,
      priority: PRIORITY_HERO_PRODUCT,
    };
  });
}

function generateCategoryCampaigns(
  products: readonly ProductForCampaign[],
  totalDailyBudget: number,
): CampaignSuggestion[] {
  // Group by productType, find types with >= 3 qualifying products (score >= 50)
  const typeGroups = new Map<string, ProductForCampaign[]>();

  for (const product of products) {
    if (product.adFitnessScore >= 50) {
      const existing = typeGroups.get(product.productType) ?? [];
      existing.push(product);
      typeGroups.set(product.productType, existing);
    }
  }

  const qualifyingTypes = Array.from(typeGroups.entries())
    .filter(([, prods]) => prods.length >= 3);

  if (qualifyingTypes.length === 0) return [];

  const budgetPerCampaign = Math.max(5, (totalDailyBudget * 0.25) / qualifyingTypes.length);

  return qualifyingTypes.map(([productType, prods]): CampaignSuggestion => {
    const avgMargin = prods.reduce((sum, p) => sum + p.estimatedMargin, 0) / prods.length;
    const estimatedRoas = avgMargin * 3;
    const totalRevenue = prods.reduce((sum, p) => sum + p.revenue30d, 0);

    return {
      name: `Category — ${productType}`,
      type: 'CATEGORY',
      productTitles: prods.map((p) => p.productTitle),
      estimatedRoas: Math.round(estimatedRoas * 100) / 100,
      rationale: `${prods.length} products in "${productType}" category with avg fitness score ` +
        `of ${(prods.reduce((s, p) => s + p.adFitnessScore, 0) / prods.length).toFixed(0)}. ` +
        `Combined revenue of $${totalRevenue.toFixed(0)}/month. Category campaigns allow ` +
        `Meta to optimize delivery across the product set.`,
      dailyBudget: Math.round(budgetPerCampaign * 100) / 100,
      targetAudience: `Interest targeting for ${productType} shoppers + lookalike audiences`,
      creativeDirection: `Carousel ad showcasing ${prods.length} products. ` +
        `Category-level messaging highlighting variety and value. ` +
        `DPA catalog ads for retargeting.`,
      priority: PRIORITY_CATEGORY,
    };
  });
}

function generateSeasonalCampaigns(
  products: readonly ProductForCampaign[],
  totalDailyBudget: number,
  daysAhead: number,
  referenceDate?: Date,
): CampaignSuggestion[] {
  const upcomingEvents = getUpcomingEvents(daysAhead, referenceDate);
  if (upcomingEvents.length === 0) return [];

  const suggestions: CampaignSuggestion[] = [];
  const seasonalBudgetTotal = totalDailyBudget * 0.20;

  for (const event of upcomingEvents) {
    const matchingProducts = matchProductsToEvent(event, products);

    if (matchingProducts.length < 2) continue;

    const firstProduct = matchingProducts[0];
    if (!firstProduct) continue;

    const budgetForEvent = Math.max(
      5,
      (seasonalBudgetTotal * event.budgetMultiplier) / upcomingEvents.length,
    );

    suggestions.push({
      name: `${event.name} — ${firstProduct.productType}`,
      type: 'SEASONAL',
      productTitles: matchingProducts.map((p) => p.productTitle),
      estimatedRoas: 2.5,
      rationale: `${event.name} is approaching. ${matchingProducts.length} products match ` +
        `this seasonal event. Built-in consumer demand drives higher conversion rates ` +
        `during seasonal peaks.`,
      dailyBudget: Math.round(budgetForEvent * 100) / 100,
      targetAudience: event.audienceHint,
      creativeDirection: `Seasonal-themed creative for ${event.name}. ` +
        `Feature ${matchingProducts.length} relevant products with event-specific messaging. ` +
        `Time-sensitive CTAs emphasizing urgency.`,
      priority: PRIORITY_SEASONAL,
    });
  }

  return suggestions;
}

function generateNewArrivalCampaigns(
  products: readonly ProductForCampaign[],
  totalDailyBudget: number,
): CampaignSuggestion[] {
  const newArrivals = products.filter(
    (p) =>
      p.daysSinceFirstSale !== null &&
      p.daysSinceFirstSale < 45 &&
      p.imageUrl !== null &&
      p.estimatedMargin >= 0.30,
  );

  if (newArrivals.length < 2) return [];

  const budget = Math.max(5, totalDailyBudget * 0.15);

  return [
    {
      name: 'New Arrivals Collection',
      type: 'NEW_ARRIVAL',
      productTitles: newArrivals.map((p) => p.productTitle),
      estimatedRoas: 2.0,
      rationale: `${newArrivals.length} new products launched in the last 45 days with ` +
        `healthy margins (>=30%). New arrival campaigns drive curiosity-based ` +
        `clicks and help establish product-market fit early.`,
      dailyBudget: Math.round(budget * 100) / 100,
      targetAudience: 'Existing customers + engaged site visitors + interest-based targeting',
      creativeDirection: `"Just In" or "New Arrival" messaging. ` +
        `Carousel format showcasing all ${newArrivals.length} products. ` +
        `Emphasize freshness and exclusivity.`,
      priority: PRIORITY_NEW_ARRIVAL,
    },
  ];
}

function generateCrossSellCampaigns(
  products: readonly ProductForCampaign[],
  totalDailyBudget: number,
): CampaignSuggestion[] {
  // Find products with strong cross-sell relationships
  const crossSellCandidates = products.filter(
    (p) =>
      p.topCrossSellProducts !== null &&
      p.topCrossSellProducts.length >= 2 &&
      p.topCrossSellProducts.some((cs) => cs.coOccurrence >= 3),
  );

  if (crossSellCandidates.length === 0) return [];

  // Sort by total co-occurrence strength
  const sorted = [...crossSellCandidates].sort((a, b) => {
    const aStrength = (a.topCrossSellProducts ?? []).reduce((s, c) => s + c.coOccurrence, 0);
    const bStrength = (b.topCrossSellProducts ?? []).reduce((s, c) => s + c.coOccurrence, 0);
    return bStrength - aStrength;
  });

  // Max 2 cross-sell campaigns
  const topCandidates = sorted.slice(0, 2);
  const budgetPerCampaign = Math.max(
    5,
    (totalDailyBudget * 0.15) / topCandidates.length,
  );

  return topCandidates.map((product): CampaignSuggestion => {
    const crossSellList = product.topCrossSellProducts ?? [];
    const topPartner = crossSellList[0];
    const partnerTitle = topPartner?.title ?? 'Unknown';
    const partnerCoOccurrence = topPartner?.coOccurrence ?? 0;
    const bundleProducts = [
      product.productTitle,
      partnerTitle,
    ];

    return {
      name: `Bundle — ${product.productTitle} + ${partnerTitle}`,
      type: 'CROSS_SELL',
      productTitles: bundleProducts,
      estimatedRoas: Math.round(product.estimatedMargin * 2.5 * 100) / 100,
      rationale: `"${product.productTitle}" and "${partnerTitle}" are frequently bought ` +
        `together (${partnerCoOccurrence} co-occurrences). Cross-sell campaigns increase ` +
        `AOV and leverage proven purchase patterns.`,
      dailyBudget: Math.round(budgetPerCampaign * 100) / 100,
      targetAudience: `Purchasers of either product + lookalikes of multi-product buyers`,
      creativeDirection: `"Better Together" or "Complete the Set" messaging. ` +
        `Side-by-side product imagery showing complementary use. ` +
        `Bundle discount CTA if applicable.`,
      priority: PRIORITY_CROSS_SELL,
    };
  });
}
