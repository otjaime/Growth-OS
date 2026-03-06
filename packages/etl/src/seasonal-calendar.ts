// ──────────────────────────────────────────────────────────────
// Growth OS — Seasonal Marketing Calendar
// Defines recurring events for DTC campaign planning.
// ──────────────────────────────────────────────────────────────

export interface SeasonalEvent {
  readonly id: string;
  readonly name: string;
  readonly startMonth: number;  // 1-12
  readonly startDay: number;
  readonly endMonth: number;
  readonly endDay: number;
  readonly tags: readonly string[];       // matching product tags/types
  readonly audienceHint: string;
  readonly budgetMultiplier: number;      // 1.0 = normal, 2.0 = double
}

export const DEFAULT_SEASONAL_EVENTS: readonly SeasonalEvent[] = [
  {
    id: 'super-bowl',
    name: 'Super Bowl',
    startMonth: 1,
    startDay: 25,
    endMonth: 2,
    endDay: 5,
    tags: ['snacks', 'party', 'gameday', 'food', 'beverages', 'entertaining', 'appetizers'],
    audienceHint: 'Sports fans, party hosts, snack lovers',
    budgetMultiplier: 1.5,
  },
  {
    id: 'valentines-day',
    name: "Valentine's Day",
    startMonth: 2,
    startDay: 7,
    endMonth: 2,
    endDay: 14,
    tags: ['gift', 'gifts', 'romance', 'valentines', 'chocolate', 'jewelry', 'flowers', 'date-night'],
    audienceHint: 'Couples, gift shoppers, romantics',
    budgetMultiplier: 1.3,
  },
  {
    id: 'mothers-day',
    name: "Mother's Day",
    startMonth: 5,
    startDay: 1,
    endMonth: 5,
    endDay: 12,
    tags: ['gift', 'gifts', 'mom', 'mothers-day', 'flowers', 'jewelry', 'beauty', 'spa', 'self-care'],
    audienceHint: 'Gift shoppers for mothers, adult children',
    budgetMultiplier: 1.4,
  },
  {
    id: 'memorial-day-bbq',
    name: 'Memorial Day / BBQ Kickoff',
    startMonth: 5,
    startDay: 20,
    endMonth: 5,
    endDay: 27,
    tags: ['bbq', 'grill', 'grilling', 'outdoor', 'patio', 'summer', 'meat', 'steak', 'burgers'],
    audienceHint: 'Grill enthusiasts, summer party hosts, outdoor entertainers',
    budgetMultiplier: 1.5,
  },
  {
    id: 'fathers-day',
    name: "Father's Day",
    startMonth: 6,
    startDay: 10,
    endMonth: 6,
    endDay: 17,
    tags: ['gift', 'gifts', 'dad', 'fathers-day', 'tools', 'grilling', 'bbq', 'gadgets', 'sports'],
    audienceHint: 'Gift shoppers for fathers, adult children',
    budgetMultiplier: 1.3,
  },
  {
    id: '4th-of-july',
    name: '4th of July',
    startMonth: 6,
    startDay: 27,
    endMonth: 7,
    endDay: 5,
    tags: ['summer', 'bbq', 'grill', 'patriotic', 'outdoor', 'party', 'fireworks', 'american'],
    audienceHint: 'Party hosts, patriotic shoppers, summer celebrants',
    budgetMultiplier: 1.4,
  },
  {
    id: 'labor-day',
    name: 'Labor Day',
    startMonth: 8,
    startDay: 29,
    endMonth: 9,
    endDay: 3,
    tags: ['summer', 'bbq', 'grill', 'outdoor', 'back-to-school', 'sale', 'end-of-summer'],
    audienceHint: 'End-of-summer shoppers, deal seekers, back-to-school parents',
    budgetMultiplier: 1.3,
  },
  {
    id: 'halloween',
    name: 'Halloween',
    startMonth: 10,
    startDay: 20,
    endMonth: 10,
    endDay: 31,
    tags: ['halloween', 'costume', 'candy', 'spooky', 'fall', 'autumn', 'party', 'trick-or-treat'],
    audienceHint: 'Parents, party hosts, candy buyers, costume shoppers',
    budgetMultiplier: 1.3,
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    startMonth: 11,
    startDay: 18,
    endMonth: 11,
    endDay: 28,
    tags: ['thanksgiving', 'turkey', 'feast', 'holiday', 'family', 'cooking', 'food', 'entertaining'],
    audienceHint: 'Home cooks, family gatherers, holiday hosts',
    budgetMultiplier: 1.5,
  },
  {
    id: 'black-friday-cyber-monday',
    name: 'Black Friday / Cyber Monday',
    startMonth: 11,
    startDay: 24,
    endMonth: 12,
    endDay: 2,
    tags: ['sale', 'deals', 'discount', 'holiday', 'gift', 'gifts', 'black-friday', 'cyber-monday'],
    audienceHint: 'Deal hunters, holiday gift shoppers, bargain seekers',
    budgetMultiplier: 2.0,
  },
  {
    id: 'christmas',
    name: 'Christmas',
    startMonth: 12,
    startDay: 10,
    endMonth: 12,
    endDay: 25,
    tags: ['christmas', 'holiday', 'gift', 'gifts', 'stocking-stuffer', 'winter', 'festive'],
    audienceHint: 'Gift shoppers, holiday celebrants, last-minute buyers',
    budgetMultiplier: 2.0,
  },
  {
    id: 'new-year',
    name: 'New Year',
    startMonth: 12,
    startDay: 26,
    endMonth: 1,
    endDay: 2,
    tags: ['new-year', 'resolution', 'party', 'celebration', 'fitness', 'health', 'wellness', 'sale'],
    audienceHint: 'Resolution setters, party hosts, health-conscious shoppers',
    budgetMultiplier: 1.3,
  },
] as const;

/**
 * Returns seasonal events that fall within the next `daysAhead` days from today.
 * An event is considered "upcoming" if any part of its date range overlaps
 * with the lookahead window.
 */
export function getUpcomingEvents(daysAhead: number = 21, referenceDate?: Date): readonly SeasonalEvent[] {
  const today = referenceDate ?? new Date();
  const currentYear = today.getFullYear();

  const windowStart = new Date(today);
  windowStart.setHours(0, 0, 0, 0);

  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + daysAhead);

  const results: SeasonalEvent[] = [];

  for (const event of DEFAULT_SEASONAL_EVENTS) {
    // Check the event in the current year, next year, and previous year
    // (to handle year-crossing events like New Year)
    for (const yearOffset of [0, 1, -1]) {
      const baseYear = currentYear + yearOffset;

      let eventStart: Date;
      let eventEnd: Date;

      if (event.endMonth < event.startMonth ||
          (event.endMonth === event.startMonth && event.endDay < event.startDay)) {
        // Event crosses year boundary (e.g., New Year: Dec 26 - Jan 2)
        eventStart = new Date(baseYear, event.startMonth - 1, event.startDay);
        eventEnd = new Date(baseYear + 1, event.endMonth - 1, event.endDay, 23, 59, 59);
      } else {
        eventStart = new Date(baseYear, event.startMonth - 1, event.startDay);
        eventEnd = new Date(baseYear, event.endMonth - 1, event.endDay, 23, 59, 59);
      }

      // Check if event range overlaps with our lookahead window
      if (eventStart <= windowEnd && eventEnd >= windowStart) {
        results.push(event);
        break; // Don't add the same event twice
      }
    }
  }

  return results;
}

interface ProductForMatch {
  readonly productType: string;
  readonly tags?: readonly string[] | null;
  readonly collections?: readonly string[] | null;
}

/**
 * Filters products that match an event's tags.
 * Matching is case-insensitive on product tags, collections, or productType.
 */
export function matchProductsToEvent<T extends ProductForMatch>(
  event: SeasonalEvent,
  products: readonly T[],
): T[] {
  const eventTagsLower = event.tags.map((t) => t.toLowerCase());

  return products.filter((product) => {
    // Check productType
    const typeLower = product.productType.toLowerCase();
    if (eventTagsLower.some((t) => typeLower.includes(t) || t.includes(typeLower))) {
      return true;
    }

    // Check product tags
    if (product.tags) {
      const productTags = product.tags.map((t) => t.toLowerCase());
      if (productTags.some((pt) => eventTagsLower.some((et) => pt.includes(et) || et.includes(pt)))) {
        return true;
      }
    }

    // Check collections
    if (product.collections) {
      const productCollections = product.collections.map((c) => c.toLowerCase());
      if (productCollections.some((pc) => eventTagsLower.some((et) => pc.includes(et) || et.includes(pc)))) {
        return true;
      }
    }

    return false;
  });
}
