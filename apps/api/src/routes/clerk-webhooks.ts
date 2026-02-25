// ──────────────────────────────────────────────────────────────
// Growth OS — Clerk Webhook Handler
// Syncs Clerk user/org events to our Organization + User tables
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { prisma } from '@growth-os/database';

interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

interface ClerkUserData {
  id: string;                  // user_xxx
  email_addresses: Array<{ email_address: string; id: string }>;
  first_name: string | null;
  last_name: string | null;
  organization_memberships?: Array<{
    organization: { id: string; name: string };
    role: string;
  }>;
}

interface ClerkOrgData {
  id: string;                  // org_xxx
  name: string;
  slug: string | null;
}

/**
 * Verify Clerk webhook signature using Svix.
 * Clerk uses Svix under the hood for webhook delivery.
 */
function verifyWebhookSignature(
  payload: string,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
): boolean {
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestamp = Array.isArray(svixTimestamp) ? svixTimestamp[0] : svixTimestamp;
  const signatures = Array.isArray(svixSignature) ? svixSignature[0] : svixSignature;
  if (!timestamp || !signatures) return false;

  // Check timestamp is within 5 minutes
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  // Decode the base64 secret (Clerk prefixes with "whsec_")
  const secretBytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');

  // Compute expected signature
  const signedContent = `${svixId}.${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // Compare against each signature in the header (space-separated, prefixed with version)
  const sigs = signatures.split(' ');
  for (const sig of sigs) {
    // Format: "v1,<base64>"
    const parts = sig.split(',');
    if (parts.length === 2 && parts[1] === expectedSignature) {
      return true;
    }
  }

  return false;
}

export async function clerkWebhookRoutes(app: FastifyInstance) {
  // Webhook endpoint: POST /api/webhooks/clerk
  app.post('/webhooks/clerk', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      app.log.warn('CLERK_WEBHOOK_SECRET not configured — rejecting webhook');
      return reply.status(500).send({ error: 'Webhook secret not configured' });
    }

    // Verify signature
    const rawBody = typeof request.body === 'string'
      ? request.body
      : JSON.stringify(request.body);

    const isValid = verifyWebhookSignature(
      rawBody,
      request.headers as Record<string, string | string[] | undefined>,
      webhookSecret,
    );

    if (!isValid) {
      app.log.warn('Clerk webhook signature verification failed');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const event = (typeof request.body === 'string' ? JSON.parse(request.body) : request.body) as ClerkWebhookEvent;
    app.log.info({ type: event.type }, 'Clerk webhook received');

    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await handleUserEvent(event.data as unknown as ClerkUserData, app);
        break;

      case 'organization.created':
      case 'organization.updated':
        await handleOrgEvent(event.data as unknown as ClerkOrgData, app);
        break;

      case 'user.deleted': {
        const deletedUserId = (event.data as { id?: string }).id;
        if (deletedUserId) {
          await prisma.user.deleteMany({ where: { clerkUserId: deletedUserId } });
          app.log.info({ clerkUserId: deletedUserId }, 'Deleted user via webhook');
        }
        break;
      }

      default:
        app.log.debug({ type: event.type }, 'Unhandled Clerk webhook event type');
    }

    return { received: true };
  });
}

async function handleUserEvent(data: ClerkUserData, app: FastifyInstance): Promise<void> {
  const email = data.email_addresses?.[0]?.email_address;
  if (!email) {
    app.log.warn({ clerkUserId: data.id }, 'Clerk user has no email — skipping');
    return;
  }

  const firstName = data.first_name ?? '';
  const lastName = data.last_name ?? '';
  const name = [firstName, lastName].filter(Boolean).join(' ') || null;

  // Check if user's org already exists; if not, create one
  const orgMembership = data.organization_memberships?.[0];
  let organizationId: string;

  if (orgMembership) {
    // User belongs to a Clerk organization
    const org = await prisma.organization.upsert({
      where: { clerkOrgId: orgMembership.organization.id },
      create: {
        name: orgMembership.organization.name,
        clerkOrgId: orgMembership.organization.id,
      },
      update: {
        name: orgMembership.organization.name,
      },
    });
    organizationId = org.id;
  } else {
    // Personal account — create a personal organization
    const existingUser = await prisma.user.findUnique({
      where: { clerkUserId: data.id },
      select: { organizationId: true },
    });

    if (existingUser) {
      organizationId = existingUser.organizationId;
    } else {
      const org = await prisma.organization.create({
        data: { name: `${name ?? email}'s Organization` },
      });
      organizationId = org.id;
    }
  }

  await prisma.user.upsert({
    where: { clerkUserId: data.id },
    create: {
      clerkUserId: data.id,
      email,
      name,
      organizationId,
      role: orgMembership?.role === 'admin' ? 'OWNER' : 'MEMBER',
    },
    update: {
      email,
      name,
      role: orgMembership?.role === 'admin' ? 'OWNER' : 'MEMBER',
    },
  });

  app.log.info({ clerkUserId: data.id, email, organizationId }, 'Synced user from Clerk');
}

async function handleOrgEvent(data: ClerkOrgData, app: FastifyInstance): Promise<void> {
  await prisma.organization.upsert({
    where: { clerkOrgId: data.id },
    create: {
      name: data.name,
      clerkOrgId: data.id,
    },
    update: {
      name: data.name,
    },
  });

  app.log.info({ clerkOrgId: data.id, name: data.name }, 'Synced organization from Clerk');
}
