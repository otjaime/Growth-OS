// ──────────────────────────────────────────────────────────────
// Growth OS — Billing Routes
// Stripe checkout, portal, webhook, and plan status.
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { prisma } from '@growth-os/database';
import { getOrgId } from '../lib/tenant.js';
import {
  isStripeConfigured,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  extractSubscriptionData,
  PLAN_CONFIGS,
} from '../lib/stripe.js';

export async function billingRoutes(app: FastifyInstance) {
  // ── GET /billing/status — current plan info ───────────────────
  app.get('/billing/status', {
    schema: {
      tags: ['billing'],
      summary: 'Get billing status',
      description: 'Returns the current organization plan, Stripe customer ID, and trial info.',
    },
  }, async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) {
      reply.status(400);
      return { error: 'Organization context required' };
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
      },
    });

    if (!org) {
      reply.status(404);
      return { error: 'Organization not found' };
    }

    return {
      plan: org.plan,
      stripeConfigured: isStripeConfigured(),
      hasStripeCustomer: !!org.stripeCustomerId,
      hasSubscription: !!org.stripeSubscriptionId,
      trialEndsAt: org.trialEndsAt,
      plans: PLAN_CONFIGS,
    };
  });

  // ── POST /billing/checkout — create checkout session ──────────
  app.post('/billing/checkout', {
    schema: {
      tags: ['billing'],
      summary: 'Create Stripe checkout session',
      description: 'Creates a Stripe Checkout session for the specified plan. Returns a redirect URL.',
    },
  }, async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) {
      reply.status(400);
      return { error: 'Organization context required' };
    }

    if (!isStripeConfigured()) {
      reply.status(400);
      return { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in environment.' };
    }

    const { plan } = request.body as { plan?: string };
    if (!plan || !['STARTER', 'GROWTH', 'SCALE'].includes(plan.toUpperCase())) {
      reply.status(400);
      return { error: 'Plan must be STARTER, GROWTH, or SCALE' };
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    try {
      const { sessionUrl } = await createCheckoutSession({
        organizationId: orgId,
        plan: plan.toUpperCase(),
        customerId: org?.stripeCustomerId ?? undefined,
        successUrl: `${frontendUrl}/settings?billing=success`,
        cancelUrl: `${frontendUrl}/settings?billing=cancelled`,
      });

      return { url: sessionUrl };
    } catch (err) {
      app.log.error({ error: (err as Error).message }, 'Stripe checkout failed');
      reply.status(500);
      return { error: `Checkout failed: ${(err as Error).message}` };
    }
  });

  // ── POST /billing/portal — create customer portal session ─────
  app.post('/billing/portal', {
    schema: {
      tags: ['billing'],
      summary: 'Create Stripe customer portal session',
      description: 'Creates a Stripe portal session for managing subscription, invoices, and payment methods.',
    },
  }, async (request, reply) => {
    const orgId = getOrgId(request);
    if (!orgId) {
      reply.status(400);
      return { error: 'Organization context required' };
    }

    if (!isStripeConfigured()) {
      reply.status(400);
      return { error: 'Stripe is not configured' };
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    });

    if (!org?.stripeCustomerId) {
      reply.status(400);
      return { error: 'No Stripe customer found. Subscribe to a plan first.' };
    }

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    try {
      const { portalUrl } = await createPortalSession({
        customerId: org.stripeCustomerId,
        returnUrl: `${frontendUrl}/settings`,
      });

      return { url: portalUrl };
    } catch (err) {
      app.log.error({ error: (err as Error).message }, 'Stripe portal failed');
      reply.status(500);
      return { error: `Portal failed: ${(err as Error).message}` };
    }
  });

  // ── POST /webhooks/stripe — Stripe webhook handler ────────────
  app.post('/webhooks/stripe', {
    config: {
      rawBody: true,
    },
    schema: {
      tags: ['billing'],
      summary: 'Stripe webhook',
      description: 'Handles Stripe subscription events (checkout completed, subscription updated/deleted).',
    },
  }, async (request, reply) => {
    if (!isStripeConfigured()) {
      reply.status(400);
      return { error: 'Stripe not configured' };
    }

    const signature = request.headers['stripe-signature'] as string;
    if (!signature) {
      reply.status(400);
      return { error: 'Missing stripe-signature header' };
    }

    let event;
    try {
      // Fastify raw body — request.body may already be a buffer or string
      const body = typeof request.body === 'string'
        ? Buffer.from(request.body)
        : Buffer.isBuffer(request.body)
          ? request.body
          : Buffer.from(JSON.stringify(request.body));
      event = constructWebhookEvent(body, signature);
    } catch (err) {
      app.log.warn({ error: (err as Error).message }, 'Stripe webhook signature verification failed');
      reply.status(400);
      return { error: `Webhook verification failed: ${(err as Error).message}` };
    }

    app.log.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook received');

    const data = extractSubscriptionData(event);
    if (!data) {
      // Event type not handled — acknowledge anyway
      return { received: true, handled: false };
    }

    // Find the organization
    let orgId = data.organizationId;
    if (!orgId && data.customerId) {
      const org = await prisma.organization.findFirst({
        where: { stripeCustomerId: data.customerId },
        select: { id: true },
      });
      orgId = org?.id;
    }

    if (!orgId) {
      app.log.warn({ customerId: data.customerId, event: event.type }, 'Stripe webhook: organization not found');
      return { received: true, handled: false, error: 'Organization not found' };
    }

    // Update the organization
    const updateData: Record<string, unknown> = {};
    if (data.customerId) updateData.stripeCustomerId = data.customerId;
    if (data.subscriptionId) updateData.stripeSubscriptionId = data.subscriptionId;
    if (data.plan) updateData.plan = data.plan;

    // Set trial end date if new subscription
    if (event.type === 'checkout.session.completed') {
      updateData.trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }

    // On deletion, clear subscription and downgrade to FREE
    if (event.type === 'customer.subscription.deleted') {
      updateData.plan = 'FREE';
      updateData.stripeSubscriptionId = null;
      updateData.trialEndsAt = null;
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: updateData,
    });

    app.log.info({
      orgId,
      event: event.type,
      plan: data.plan,
      customerId: data.customerId,
    }, 'Stripe webhook processed');

    return { received: true, handled: true };
  });
}
