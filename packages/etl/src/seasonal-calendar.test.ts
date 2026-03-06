import { describe, it, expect } from 'vitest';
import { getUpcomingEvents, matchProductsToEvent, DEFAULT_SEASONAL_EVENTS } from './seasonal-calendar.js';
import type { SeasonalEvent } from './seasonal-calendar.js';

describe('seasonal-calendar', () => {
  describe('getUpcomingEvents', () => {
    it('returns events within the default 21-day window', () => {
      // Feb 8 should pick up Valentine's Day (Feb 7-14)
      const ref = new Date(2026, 1, 8); // Feb 8, 2026
      const events = getUpcomingEvents(21, ref);
      const names = events.map((e) => e.name);
      expect(names).toContain("Valentine's Day");
    });

    it('returns events when the window overlaps event start', () => {
      // 7 days before Memorial Day (May 20): May 13 with 21-day lookahead
      const ref = new Date(2026, 4, 13); // May 13, 2026
      const events = getUpcomingEvents(21, ref);
      const names = events.map((e) => e.name);
      expect(names).toContain('Memorial Day / BBQ Kickoff');
    });

    it('returns empty when no events are within window', () => {
      // March 10 with a short 3-day window — no events near
      const ref = new Date(2026, 2, 10); // Mar 10, 2026
      const events = getUpcomingEvents(3, ref);
      expect(events.length).toBe(0);
    });

    it('handles year-crossing events (New Year)', () => {
      // Dec 27 should pick up New Year (Dec 26 - Jan 2)
      const ref = new Date(2026, 11, 27); // Dec 27, 2026
      const events = getUpcomingEvents(7, ref);
      const names = events.map((e) => e.name);
      expect(names).toContain('New Year');
    });

    it('picks up Christmas when reference is in December', () => {
      const ref = new Date(2026, 11, 12); // Dec 12, 2026
      const events = getUpcomingEvents(21, ref);
      const names = events.map((e) => e.name);
      expect(names).toContain('Christmas');
    });

    it('picks up multiple overlapping events', () => {
      // Late November: Thanksgiving + Black Friday / Cyber Monday can overlap
      const ref = new Date(2026, 10, 20); // Nov 20, 2026
      const events = getUpcomingEvents(21, ref);
      const names = events.map((e) => e.name);
      expect(names).toContain('Thanksgiving');
      expect(names).toContain('Black Friday / Cyber Monday');
    });

    it('uses longer lookahead window', () => {
      // Jan 1 with 60-day window should reach Valentine's Day (Feb 7-14)
      const ref = new Date(2026, 0, 1); // Jan 1, 2026
      const events = getUpcomingEvents(60, ref);
      const names = events.map((e) => e.name);
      expect(names).toContain("Valentine's Day");
    });
  });

  describe('matchProductsToEvent', () => {
    // Find events with explicit assertions
    function findEvent(id: string): SeasonalEvent {
      const event = DEFAULT_SEASONAL_EVENTS.find((e) => e.id === id);
      if (!event) throw new Error(`Event ${id} not found`);
      return event;
    }

    const bbqEvent = findEvent('memorial-day-bbq');
    const valentinesEvent = findEvent('valentines-day');

    it('matches products by tags (case-insensitive)', () => {
      const products = [
        { productType: 'meat', tags: ['BBQ', 'Premium'] as string[], collections: null },
        { productType: 'dessert', tags: ['sweet', 'cake'] as string[], collections: null },
      ];

      const matched = matchProductsToEvent(bbqEvent, products);
      expect(matched).toHaveLength(1);
      expect(matched[0]!.productType).toBe('meat');
    });

    it('matches products by collections', () => {
      const products = [
        { productType: 'accessories', tags: null, collections: ['Grilling Collection'] as string[] },
        { productType: 'kitchenware', tags: null, collections: ['Indoor Cooking'] as string[] },
      ];

      const matched = matchProductsToEvent(bbqEvent, products);
      expect(matched).toHaveLength(1);
      expect(matched[0]!.productType).toBe('accessories');
    });

    it('matches products by productType', () => {
      const products = [
        { productType: 'steak', tags: null, collections: null },
        { productType: 'dessert', tags: null, collections: null },
      ];

      const matched = matchProductsToEvent(bbqEvent, products);
      expect(matched).toHaveLength(1);
      expect(matched[0]!.productType).toBe('steak');
    });

    it('returns empty when no products match', () => {
      const products = [
        { productType: 'electronics', tags: ['laptop', 'computer'] as string[], collections: ['Tech'] as string[] },
        { productType: 'software', tags: ['app'] as string[], collections: null },
      ];

      const matched = matchProductsToEvent(bbqEvent, products);
      expect(matched).toHaveLength(0);
    });

    it('matches across multiple criteria', () => {
      const products = [
        { productType: 'chocolate', tags: null, collections: null }, // matches valentines tag
        { productType: 'clothing', tags: ['gift'] as string[], collections: null }, // matches valentines tag
        { productType: 'electronics', tags: ['tech'] as string[], collections: null }, // no match
      ];

      const matched = matchProductsToEvent(valentinesEvent, products);
      expect(matched).toHaveLength(2);
    });

    it('handles null tags and collections gracefully', () => {
      const products = [
        { productType: 'widget', tags: null, collections: null },
      ];

      const matched = matchProductsToEvent(bbqEvent, products);
      expect(matched).toHaveLength(0);
    });
  });

  describe('DEFAULT_SEASONAL_EVENTS', () => {
    it('contains 12 events', () => {
      expect(DEFAULT_SEASONAL_EVENTS).toHaveLength(12);
    });

    it('all events have required fields', () => {
      for (const event of DEFAULT_SEASONAL_EVENTS) {
        expect(event.id).toBeTruthy();
        expect(event.name).toBeTruthy();
        expect(event.startMonth).toBeGreaterThanOrEqual(1);
        expect(event.startMonth).toBeLessThanOrEqual(12);
        expect(event.endMonth).toBeGreaterThanOrEqual(1);
        expect(event.endMonth).toBeLessThanOrEqual(12);
        expect(event.tags.length).toBeGreaterThan(0);
        expect(event.audienceHint).toBeTruthy();
        expect(event.budgetMultiplier).toBeGreaterThan(0);
      }
    });
  });
});
