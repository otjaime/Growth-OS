// ──────────────────────────────────────────────────────────────
// Growth OS — Stripe Payments Demo Data Generator
// Deterministic mock data matching Stripe API v2024-06-20
// Generates charges and refunds from existing order data
// ──────────────────────────────────────────────────────────────

import { addDays, format } from 'date-fns';
import type { RawRecord } from '../types.js';
import type { DemoContext } from './demo-generator.js';
import { createContext, generateCustomers, randFloat, randInt, pick } from './demo-generator.js';

const DEMO_DAYS = parseInt(process.env.DEMO_DAYS ?? '180', 10);

const PAYMENT_METHODS: readonly { type: string; weight: number }[] = [
  { type: 'card_visa', weight: 0.45 },
  { type: 'card_mastercard', weight: 0.25 },
  { type: 'apple_pay', weight: 0.15 },
  { type: 'google_pay', weight: 0.10 },
  { type: 'card_amex', weight: 0.05 },
];

function pickPaymentMethod(rng: () => number): string {
  const r = rng();
  let cumWeight = 0;
  for (const pm of PAYMENT_METHODS) {
    cumWeight += pm.weight;
    if (r < cumWeight) return pm.type;
  }
  return 'card_visa';
}

export function generateStripeCharges(ctx?: DemoContext, orders?: RawRecord[]): RawRecord[] {
  const c = ctx ?? (() => { const cx = createContext(); generateCustomers(cx, 2400); return cx; })();
  const records: RawRecord[] = [];
  let chargeCounter = 1;

  // If orders are provided, generate one charge per order with matching amounts
  if (orders && orders.length > 0) {
    for (const order of orders) {
      chargeCounter++;
      const payload = order.payload as Record<string, unknown>;
      const totalPrice = parseFloat(payload.total_price as string);
      const amount = Math.round(totalPrice * 100); // Stripe uses cents
      const orderNumber = payload.order_number as number;
      const customer = payload.customer as Record<string, unknown>;
      const paymentMethod = pickPaymentMethod(c.rng);

      // 95% succeeded, 3% failed, 2% pending
      const statusRoll = c.rng();
      const status = statusRoll < 0.95 ? 'succeeded' : statusRoll < 0.98 ? 'failed' : 'pending';
      const failureCode = status === 'failed'
        ? pick(['card_declined', 'insufficient_funds', 'expired_card'], c.rng)
        : null;

      const created = payload.created_at as string;
      const createdDate = new Date(created);

      records.push({
        source: 'stripe',
        entity: 'charges',
        externalId: `ch_demo_${String(chargeCounter).padStart(8, '0')}`,
        cursor: format(createdDate, 'yyyy-MM-dd'),
        payload: {
          id: `ch_demo_${String(chargeCounter).padStart(8, '0')}`,
          amount,
          amount_captured: status === 'succeeded' ? amount : 0,
          currency: 'usd',
          status,
          payment_method_details: {
            type: paymentMethod.startsWith('card_') ? 'card' : paymentMethod,
            card: paymentMethod.startsWith('card_') ? { brand: paymentMethod.replace('card_', '') } : undefined,
          },
          failure_code: failureCode,
          created: Math.floor(createdDate.getTime() / 1000),
          metadata: {
            order_id: `order_${orderNumber}`,
            customer_id: customer?.id ?? `unknown`,
          },
        } as unknown as Record<string, unknown>,
      });
    }
    return records;
  }

  // Fallback: generate charges independently (for standalone testing)
  const repeatSchedule = new Map<string, Date[]>();
  for (const customer of c.customers) {
    const dates: Date[] = [];
    if (c.rng() < 0.05) {
      const d = addDays(customer.firstOrderDate, randInt(1, 7, c.rng));
      if (d <= c.endDate) dates.push(d);
    }
    if (c.rng() < 0.10) {
      const d = addDays(customer.firstOrderDate, randInt(8, 30, c.rng));
      if (d <= c.endDate) dates.push(d);
    }
    if (c.rng() < 0.06) {
      const d = addDays(customer.firstOrderDate, randInt(31, 60, c.rng));
      if (d <= c.endDate) dates.push(d);
    }
    if (c.rng() < 0.04) {
      const d = addDays(customer.firstOrderDate, randInt(61, 90, c.rng));
      if (d <= c.endDate) dates.push(d);
    }
    if (dates.length > 0) repeatSchedule.set(customer.id, dates);
  }

  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    const newToday = c.customers.filter((cu) => cu.firstOrderDate.getTime() === date.getTime());
    const repeatsToday = c.customers.filter((cu) => {
      const dates = repeatSchedule.get(cu.id);
      return dates?.some((d) => d.getTime() === date.getTime()) ?? false;
    });

    const ordersToday = [...repeatsToday, ...newToday];

    for (const customer of ordersToday) {
      chargeCounter++;
      const amount = Math.round(randFloat(25, 350, c.rng) * 100); // Stripe uses cents
      const paymentMethod = pickPaymentMethod(c.rng);

      // 95% succeeded, 3% failed, 2% pending
      const statusRoll = c.rng();
      const status = statusRoll < 0.95 ? 'succeeded' : statusRoll < 0.98 ? 'failed' : 'pending';
      const failureCode = status === 'failed'
        ? pick(['card_declined', 'insufficient_funds', 'expired_card'], c.rng)
        : null;

      records.push({
        source: 'stripe',
        entity: 'charges',
        externalId: `ch_demo_${String(chargeCounter).padStart(8, '0')}`,
        cursor: format(date, 'yyyy-MM-dd'),
        payload: {
          id: `ch_demo_${String(chargeCounter).padStart(8, '0')}`,
          amount,
          amount_captured: status === 'succeeded' ? amount : 0,
          currency: 'usd',
          status,
          payment_method_details: {
            type: paymentMethod.startsWith('card_') ? 'card' : paymentMethod,
            card: paymentMethod.startsWith('card_') ? { brand: paymentMethod.replace('card_', '') } : undefined,
          },
          failure_code: failureCode,
          created: Math.floor(date.getTime() / 1000),
          metadata: {
            order_id: `order_${chargeCounter}`,
            customer_id: customer.id,
          },
        } as unknown as Record<string, unknown>,
      });
    }
  }

  return records;
}

export function generateStripeRefunds(ctx?: DemoContext): RawRecord[] {
  const c = ctx ?? (() => { const cx = createContext(); generateCustomers(cx, 2400); return cx; })();
  const records: RawRecord[] = [];
  let refundCounter = 1;

  const refundReasons = ['requested_by_customer', 'product_defective', 'duplicate'];
  const reasonWeights = [0.60, 0.25, 0.15];

  // ~8% of days get a few refunds
  for (let day = 0; day <= DEMO_DAYS; day++) {
    const date = addDays(c.startDate, day);
    // Spread refunds across the period: 1-4 per day
    const refundsToday = randInt(1, 4, c.rng);

    for (let r = 0; r < refundsToday; r++) {
      // Only generate ~60% of the time to simulate variance
      if (c.rng() > 0.60) continue;
      refundCounter++;

      const amount = Math.round(randFloat(20, 250, c.rng) * 100);
      const roll = c.rng();
      let cumWeight = 0;
      let reason = 'requested_by_customer';
      for (let j = 0; j < reasonWeights.length; j++) {
        cumWeight += reasonWeights[j]!;
        if (roll < cumWeight) {
          reason = refundReasons[j]!;
          break;
        }
      }

      records.push({
        source: 'stripe',
        entity: 'refunds',
        externalId: `re_demo_${String(refundCounter).padStart(8, '0')}`,
        cursor: format(date, 'yyyy-MM-dd'),
        payload: {
          id: `re_demo_${String(refundCounter).padStart(8, '0')}`,
          amount,
          currency: 'usd',
          status: 'succeeded',
          reason,
          created: Math.floor(date.getTime() / 1000),
          charge: `ch_demo_${String(randInt(1000, refundCounter + 1000, c.rng)).padStart(8, '0')}`,
          metadata: {},
        } as unknown as Record<string, unknown>,
      });
    }
  }

  return records;
}
