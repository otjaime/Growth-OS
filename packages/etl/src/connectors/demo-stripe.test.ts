// ──────────────────────────────────────────────────────────────
// Growth OS — Stripe Demo Data Generator Tests
// ──────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { generateStripeCharges, generateStripeRefunds } from './demo-stripe.js';
import { createContext, generateCustomers, generateShopifyOrders } from './demo-generator.js';

function makeCtx() {
  const ctx = createContext();
  generateCustomers(ctx, 100);
  return ctx;
}

describe('generateStripeCharges', () => {
  it('returns deterministic output with same context', () => {
    const r1 = generateStripeCharges(makeCtx());
    const r2 = generateStripeCharges(makeCtx());
    expect(r1.length).toBe(r2.length);
    // First few records should match exactly
    if (r1.length > 0) {
      expect(r1[0]!.externalId).toBe(r2[0]!.externalId);
    }
  });

  it('all records have source=stripe and entity=charges', () => {
    const records = generateStripeCharges(makeCtx());
    for (const r of records) {
      expect(r.source).toBe('stripe');
      expect(r.entity).toBe('charges');
    }
  });

  it('payload has Stripe charge shape', () => {
    const records = generateStripeCharges(makeCtx());
    if (records.length === 0) return;
    const payload = records[0]!.payload as Record<string, unknown>;

    expect(payload).toHaveProperty('id');
    expect(payload).toHaveProperty('amount');
    expect(payload).toHaveProperty('currency', 'usd');
    expect(payload).toHaveProperty('status');
    expect(payload).toHaveProperty('payment_method_details');
    expect(payload).toHaveProperty('created');
    expect(payload).toHaveProperty('metadata');
  });

  it('amounts are in cents (positive integers)', () => {
    const records = generateStripeCharges(makeCtx());
    for (const r of records) {
      const amount = (r.payload as Record<string, unknown>).amount as number;
      expect(amount).toBeGreaterThan(0);
      expect(Number.isInteger(amount)).toBe(true);
    }
  });

  it('status is one of succeeded, failed, pending', () => {
    const records = generateStripeCharges(makeCtx());
    const validStatuses = ['succeeded', 'failed', 'pending'];
    for (const r of records) {
      const status = (r.payload as Record<string, unknown>).status as string;
      expect(validStatuses).toContain(status);
    }
  });

  it('majority of charges succeed (~95%)', () => {
    const records = generateStripeCharges(makeCtx());
    if (records.length < 10) return;
    const succeeded = records.filter(
      (r) => (r.payload as Record<string, unknown>).status === 'succeeded',
    ).length;
    const rate = succeeded / records.length;
    // Allow tolerance: 85%-100%
    expect(rate).toBeGreaterThan(0.85);
    expect(rate).toBeLessThanOrEqual(1.0);
  });

  it('failed charges have failure_code', () => {
    const records = generateStripeCharges(makeCtx());
    const failed = records.filter(
      (r) => (r.payload as Record<string, unknown>).status === 'failed',
    );
    for (const r of failed) {
      const code = (r.payload as Record<string, unknown>).failure_code;
      expect(code).toBeTruthy();
      expect(typeof code).toBe('string');
    }
  });

  it('succeeded charges have amount_captured = amount', () => {
    const records = generateStripeCharges(makeCtx());
    const succeeded = records.filter(
      (r) => (r.payload as Record<string, unknown>).status === 'succeeded',
    );
    for (const r of succeeded) {
      const payload = r.payload as Record<string, unknown>;
      expect(payload.amount_captured).toBe(payload.amount);
    }
  });
});

describe('generateStripeRefunds', () => {
  it('returns deterministic output with same context', () => {
    const r1 = generateStripeRefunds(makeCtx());
    const r2 = generateStripeRefunds(makeCtx());
    expect(r1.length).toBe(r2.length);
  });

  it('all records have source=stripe and entity=refunds', () => {
    const records = generateStripeRefunds(makeCtx());
    for (const r of records) {
      expect(r.source).toBe('stripe');
      expect(r.entity).toBe('refunds');
    }
  });

  it('payload has Stripe refund shape', () => {
    const records = generateStripeRefunds(makeCtx());
    if (records.length === 0) return;
    const payload = records[0]!.payload as Record<string, unknown>;

    expect(payload).toHaveProperty('id');
    expect(payload).toHaveProperty('amount');
    expect(payload).toHaveProperty('currency', 'usd');
    expect(payload).toHaveProperty('status', 'succeeded');
    expect(payload).toHaveProperty('reason');
    expect(payload).toHaveProperty('charge');
  });

  it('refund reason is valid', () => {
    const records = generateStripeRefunds(makeCtx());
    const validReasons = ['requested_by_customer', 'product_defective', 'duplicate'];
    for (const r of records) {
      const reason = (r.payload as Record<string, unknown>).reason as string;
      expect(validReasons).toContain(reason);
    }
  });

  it('generates a reasonable number of refunds', () => {
    const records = generateStripeRefunds(makeCtx());
    // 181 days × ~1-4 per day × ~60% chance = ~100-400 refunds
    expect(records.length).toBeGreaterThan(50);
    expect(records.length).toBeLessThan(600);
  });
});

describe('generateStripeCharges with orders', () => {
  it('generates one charge per order when orders provided', () => {
    const ctx = makeCtx();
    const orders = generateShopifyOrders(ctx);
    const ctx2 = makeCtx();
    const charges = generateStripeCharges(ctx2, orders);
    expect(charges.length).toBe(orders.length);
  });

  it('charge amounts match order total_price in cents', () => {
    const ctx = makeCtx();
    const orders = generateShopifyOrders(ctx);
    const ctx2 = makeCtx();
    const charges = generateStripeCharges(ctx2, orders);

    for (let i = 0; i < Math.min(20, orders.length); i++) {
      const orderPayload = orders[i]!.payload as Record<string, unknown>;
      const chargePayload = charges[i]!.payload as Record<string, unknown>;
      const expectedCents = Math.round(parseFloat(orderPayload.total_price as string) * 100);
      expect(chargePayload.amount).toBe(expectedCents);
    }
  });
});
