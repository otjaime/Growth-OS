// ──────────────────────────────────────────────────────────────
// Growth OS — Stripe Billing Integration
// Checkout, portal, webhook, and plan management.
// ──────────────────────────────────────────────────────────────

import Stripe from 'stripe';
import type { Plan } from '@growth-os/database';

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    stripeClient = new Stripe(key, { apiVersion: '2026-02-25.clover' });
  }
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// ── Price mapping ───────────────────────────────────────────────
// Maps Stripe Price IDs to plan tiers. Set via environment variables.

interface PlanConfig {
  plan: Plan;
  name: string;
  monthlyPrice: number;
  maxAdAccounts: number;
}

const PLAN_CONFIGS: Record<string, PlanConfig> = {
  STARTER: { plan: 'STARTER', name: 'Starter', monthlyPrice: 149, maxAdAccounts: 1 },
  GROWTH: { plan: 'GROWTH', name: 'Growth', monthlyPrice: 299, maxAdAccounts: 3 },
  SCALE: { plan: 'SCALE', name: 'Scale', monthlyPrice: 499, maxAdAccounts: 999 },
};

function getPriceId(plan: string): string | undefined {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}`;
  return process.env[key];
}

function planFromPriceId(priceId: string): Plan | undefined {
  for (const [plan, _config] of Object.entries(PLAN_CONFIGS)) {
    if (getPriceId(plan) === priceId) return plan as Plan;
  }
  return undefined;
}

// ── Checkout ────────────────────────────────────────────────────

export async function createCheckoutSession(params: {
  organizationId: string;
  plan: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionUrl: string }> {
  const stripe = getStripe();
  const priceId = getPriceId(params.plan);
  if (!priceId) throw new Error(`No Stripe price configured for plan: ${params.plan}`);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    subscription_data: {
      trial_period_days: 14,
      metadata: { organizationId: params.organizationId, plan: params.plan },
    },
    metadata: { organizationId: params.organizationId, plan: params.plan },
  };

  if (params.customerId) {
    sessionParams.customer = params.customerId;
  } else {
    sessionParams.customer_creation = 'always';
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return { sessionUrl: session.url };
}

// ── Customer Portal ─────────────────────────────────────────────

export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ portalUrl: string }> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return { portalUrl: session.url };
}

// ── Webhook Event Construction ──────────────────────────────────

export function constructWebhookEvent(
  body: Buffer,
  signature: string,
): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  return stripe.webhooks.constructEvent(body, signature, secret);
}

// ── Event Handlers ──────────────────────────────────────────────

export interface WebhookResult {
  handled: boolean;
  event: string;
  plan?: Plan;
  customerId?: string;
  subscriptionId?: string;
}

export function extractSubscriptionData(event: Stripe.Event): {
  customerId: string;
  subscriptionId: string;
  plan: Plan | undefined;
  organizationId: string | undefined;
  status: string;
} | null {
  if (!['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    return null;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orgId = session.metadata?.organizationId;
    const planStr = session.metadata?.plan;
    return {
      customerId: (typeof session.customer === 'string' ? session.customer : session.customer?.id) ?? '',
      subscriptionId: (typeof session.subscription === 'string' ? session.subscription : (session.subscription as Stripe.Subscription)?.id) ?? '',
      plan: planStr ? (planStr.toUpperCase() as Plan) : undefined,
      organizationId: orgId,
      status: 'active',
    };
  }

  const sub = event.data.object as Stripe.Subscription;
  const priceId = sub.items.data[0]?.price.id ?? '';
  return {
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    subscriptionId: sub.id,
    plan: event.type === 'customer.subscription.deleted' ? 'FREE' as Plan : planFromPriceId(priceId),
    organizationId: sub.metadata?.organizationId,
    status: sub.status,
  };
}

export { PLAN_CONFIGS, getStripe };
