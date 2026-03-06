import { describe, it, expect } from 'vitest';
import { generateCampaignSuggestions } from './campaign-suggestions.js';
import type { ProductForCampaign } from './campaign-suggestions.js';

function makeProduct(overrides: Partial<ProductForCampaign> = {}): ProductForCampaign {
  return {
    productTitle: 'Test Product',
    productType: 'meat',
    adFitnessScore: 75,
    revenue30d: 5000,
    grossProfit30d: 2250,
    estimatedMargin: 0.45,
    avgPrice: 50,
    avgDailyUnits: 3,
    repeatBuyerPct: 0.2,
    imageUrl: 'https://example.com/img.jpg',
    productTier: 'hero',
    revenueTrend: 0.1,
    revenueShare: 0.05,
    daysSinceFirstSale: 120,
    collections: null,
    tags: null,
    topCrossSellProducts: null,
    ...overrides,
  };
}

describe('campaign-suggestions', () => {
  describe('generateCampaignSuggestions', () => {
    it('returns empty for empty products', () => {
      const result = generateCampaignSuggestions({
        products: [],
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });
      expect(result).toEqual([]);
    });

    it('returns empty for zero budget', () => {
      const result = generateCampaignSuggestions({
        products: [makeProduct()],
        totalDailyBudget: 0,
        existingCampaignProductTitles: new Set(),
      });
      expect(result).toEqual([]);
    });

    it('generates hero product campaigns for high-scoring products', () => {
      const products = [
        makeProduct({ productTitle: 'Hero A', adFitnessScore: 85, productTier: 'hero' }),
        makeProduct({ productTitle: 'Hero B', adFitnessScore: 80, productTier: 'hero' }),
        makeProduct({ productTitle: 'Low Score', adFitnessScore: 30, productTier: 'filler' }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const heroCampaigns = result.filter((s) => s.type === 'HERO_PRODUCT');
      expect(heroCampaigns.length).toBe(2);
      expect(heroCampaigns[0]!.productTitles).toEqual(['Hero A']);
      expect(heroCampaigns[1]!.productTitles).toEqual(['Hero B']);
    });

    it('limits hero campaigns to top 3', () => {
      const products = Array.from({ length: 5 }, (_, i) =>
        makeProduct({
          productTitle: `Hero ${i}`,
          adFitnessScore: 90 - i,
          productTier: 'hero',
        }),
      );

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 200,
        existingCampaignProductTitles: new Set(),
      });

      const heroCampaigns = result.filter((s) => s.type === 'HERO_PRODUCT');
      expect(heroCampaigns.length).toBe(3);
    });

    it('generates hero campaigns even without image (notes missing image in creative direction)', () => {
      const products = [
        makeProduct({ productTitle: 'No Image', adFitnessScore: 90, imageUrl: null }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const heroCampaigns = result.filter((s) => s.type === 'HERO_PRODUCT');
      expect(heroCampaigns.length).toBe(1);
      expect(heroCampaigns[0]!.creativeDirection).toContain('not synced');
    });

    it('generates category campaigns when >= 3 products share a type with score >= 50', () => {
      const products = [
        makeProduct({ productTitle: 'Meat A', productType: 'meat', adFitnessScore: 60 }),
        makeProduct({ productTitle: 'Meat B', productType: 'meat', adFitnessScore: 55 }),
        makeProduct({ productTitle: 'Meat C', productType: 'meat', adFitnessScore: 52 }),
        makeProduct({ productTitle: 'Dessert A', productType: 'dessert', adFitnessScore: 40 }), // too low
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const categoryCampaigns = result.filter((s) => s.type === 'CATEGORY');
      expect(categoryCampaigns.length).toBe(1);
      expect(categoryCampaigns[0]!.name).toContain('Meat');
      expect(categoryCampaigns[0]!.productTitles).toHaveLength(3);
    });

    it('does not create category campaign with fewer than 3 products', () => {
      const products = [
        makeProduct({ productTitle: 'A', productType: 'spice', adFitnessScore: 60 }),
        makeProduct({ productTitle: 'B', productType: 'spice', adFitnessScore: 55 }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const categoryCampaigns = result.filter((s) => s.type === 'CATEGORY');
      expect(categoryCampaigns.length).toBe(0);
    });

    it('generates seasonal campaigns when products match upcoming events', () => {
      // Use a reference date near Valentine's Day
      const refDate = new Date(2026, 1, 5); // Feb 5, 2026

      const products = [
        makeProduct({
          productTitle: 'Chocolate Box',
          productType: 'chocolate',
          adFitnessScore: 40,
          tags: ['gift', 'chocolate'],
        }),
        makeProduct({
          productTitle: 'Gift Set',
          productType: 'bundle',
          adFitnessScore: 40,
          tags: ['gift', 'valentines'],
        }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
        daysAhead: 21,
        referenceDate: refDate,
      });

      const seasonalCampaigns = result.filter((s) => s.type === 'SEASONAL');
      expect(seasonalCampaigns.length).toBeGreaterThanOrEqual(1);
      expect(seasonalCampaigns[0]!.estimatedRoas).toBe(2.5);
    });

    it('does not generate seasonal campaign with fewer than 2 matching products', () => {
      const refDate = new Date(2026, 1, 5); // Feb 5

      const products = [
        makeProduct({
          productTitle: 'Single Gift',
          productType: 'electronics',
          adFitnessScore: 40,
          tags: ['gift'],
        }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
        daysAhead: 21,
        referenceDate: refDate,
      });

      const seasonalCampaigns = result.filter((s) => s.type === 'SEASONAL');
      expect(seasonalCampaigns.length).toBe(0);
    });

    it('generates new arrival campaigns for recent products', () => {
      const products = [
        makeProduct({
          productTitle: 'New Product A',
          daysSinceFirstSale: 10,
          estimatedMargin: 0.50,
          imageUrl: 'https://example.com/new-a.jpg',
        }),
        makeProduct({
          productTitle: 'New Product B',
          daysSinceFirstSale: 30,
          estimatedMargin: 0.40,
          imageUrl: 'https://example.com/new-b.jpg',
        }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const newArrivalCampaigns = result.filter((s) => s.type === 'NEW_ARRIVAL');
      expect(newArrivalCampaigns.length).toBe(1);
      expect(newArrivalCampaigns[0]!.productTitles).toHaveLength(2);
      expect(newArrivalCampaigns[0]!.estimatedRoas).toBe(2.0);
    });

    it('excludes new arrivals with low margin', () => {
      const products = [
        makeProduct({ productTitle: 'Cheap A', daysSinceFirstSale: 10, estimatedMargin: 0.20 }),
        makeProduct({ productTitle: 'Cheap B', daysSinceFirstSale: 20, estimatedMargin: 0.15 }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const newArrivalCampaigns = result.filter((s) => s.type === 'NEW_ARRIVAL');
      expect(newArrivalCampaigns.length).toBe(0);
    });

    it('generates cross-sell campaigns for products with strong co-occurrences', () => {
      const products = [
        makeProduct({
          productTitle: 'Main Product',
          topCrossSellProducts: [
            { title: 'Side Product', coOccurrence: 5 },
            { title: 'Another Side', coOccurrence: 3 },
          ],
        }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const crossSellCampaigns = result.filter((s) => s.type === 'CROSS_SELL');
      expect(crossSellCampaigns.length).toBe(1);
      expect(crossSellCampaigns[0]!.productTitles).toContain('Main Product');
      expect(crossSellCampaigns[0]!.productTitles).toContain('Side Product');
    });

    it('limits cross-sell campaigns to max 2', () => {
      const products = Array.from({ length: 5 }, (_, i) =>
        makeProduct({
          productTitle: `XSell ${i}`,
          adFitnessScore: 40,
          productTier: 'filler',
          topCrossSellProducts: [
            { title: `Partner ${i}`, coOccurrence: 10 - i },
            { title: `Partner2 ${i}`, coOccurrence: 5 },
          ],
        }),
      );

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const crossSellCampaigns = result.filter((s) => s.type === 'CROSS_SELL');
      expect(crossSellCampaigns.length).toBeLessThanOrEqual(2);
    });

    it('excludes products already in active campaigns', () => {
      const products = [
        makeProduct({ productTitle: 'Already Active', adFitnessScore: 95, productTier: 'hero' }),
        makeProduct({ productTitle: 'Available', adFitnessScore: 80, productTier: 'hero' }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(['Already Active']),
      });

      const heroCampaigns = result.filter((s) => s.type === 'HERO_PRODUCT');
      expect(heroCampaigns.length).toBe(1);
      expect(heroCampaigns[0]!.productTitles).toEqual(['Available']);
    });

    it('sorts by priority (hero > seasonal > category > new_arrival > cross_sell)', () => {
      const refDate = new Date(2026, 1, 5); // Feb 5

      const products = [
        // Hero candidate
        makeProduct({ productTitle: 'Hero X', adFitnessScore: 85, productTier: 'hero' }),
        // Category candidates (3 products in same type)
        makeProduct({ productTitle: 'Cat A', productType: 'spice', adFitnessScore: 55, productTier: 'growth' }),
        makeProduct({ productTitle: 'Cat B', productType: 'spice', adFitnessScore: 52, productTier: 'growth' }),
        makeProduct({ productTitle: 'Cat C', productType: 'spice', adFitnessScore: 50, productTier: 'growth' }),
        // New arrival candidates
        makeProduct({ productTitle: 'New A', daysSinceFirstSale: 10, estimatedMargin: 0.50, productTier: 'growth', adFitnessScore: 40 }),
        makeProduct({ productTitle: 'New B', daysSinceFirstSale: 20, estimatedMargin: 0.40, productTier: 'growth', adFitnessScore: 40 }),
        // Seasonal match for Valentine's
        makeProduct({ productTitle: 'Gift A', productType: 'gift', tags: ['gift', 'romance'], productTier: 'growth', adFitnessScore: 40 }),
        makeProduct({ productTitle: 'Gift B', productType: 'bundle', tags: ['gift', 'valentines'], productTier: 'growth', adFitnessScore: 40 }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 200,
        existingCampaignProductTitles: new Set(),
        daysAhead: 21,
        referenceDate: refDate,
      });

      // Verify ordering: hero first, then seasonal, then category, etc.
      const types = result.map((s) => s.type);
      const heroIdx = types.indexOf('HERO_PRODUCT');
      const seasonalIdx = types.indexOf('SEASONAL');
      const categoryIdx = types.indexOf('CATEGORY');

      if (heroIdx >= 0 && seasonalIdx >= 0) {
        expect(heroIdx).toBeLessThan(seasonalIdx);
      }
      if (seasonalIdx >= 0 && categoryIdx >= 0) {
        expect(seasonalIdx).toBeLessThan(categoryIdx);
      }
    });

    it('allocates budget across campaign types', () => {
      const products = [
        makeProduct({ productTitle: 'Hero', adFitnessScore: 85, productTier: 'hero' }),
      ];

      const result = generateCampaignSuggestions({
        products,
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      // Hero gets 40% of budget / number of hero campaigns
      const heroCampaign = result.find((s) => s.type === 'HERO_PRODUCT');
      expect(heroCampaign).toBeDefined();
      expect(heroCampaign!.dailyBudget).toBe(40);
    });

    it('uses higher ROAS multiplier for high-margin hero products', () => {
      const highMargin = makeProduct({
        productTitle: 'High Margin',
        estimatedMargin: 0.55,
        adFitnessScore: 85,
        productTier: 'hero',
      });
      const lowMargin = makeProduct({
        productTitle: 'Low Margin',
        estimatedMargin: 0.35,
        adFitnessScore: 80,
        productTier: 'hero',
      });

      const result = generateCampaignSuggestions({
        products: [highMargin, lowMargin],
        totalDailyBudget: 100,
        existingCampaignProductTitles: new Set(),
      });

      const heroCampaigns = result.filter((s) => s.type === 'HERO_PRODUCT');
      const highCampaign = heroCampaigns.find((c) => c.productTitles.includes('High Margin'));
      const lowCampaign = heroCampaigns.find((c) => c.productTitles.includes('Low Margin'));

      expect(highCampaign).toBeDefined();
      expect(lowCampaign).toBeDefined();

      // High margin (0.55 > 0.40) uses *4, low margin uses *3
      expect(highCampaign!.estimatedRoas).toBe(2.2);  // 0.55 * 4 = 2.2
      expect(lowCampaign!.estimatedRoas).toBe(1.05);   // 0.35 * 3 = 1.05
    });
  });
});
