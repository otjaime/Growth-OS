// ──────────────────────────────────────────────────────────────
// Growth OS — API Authentication
// Dual-mode: Clerk JWT (primary) + Bearer token (legacy/dev)
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { prisma } from '@growth-os/database';
import { verifyClerkToken, isClerkConfigured } from './clerk.js';

// Augment FastifyRequest with tenant context
declare module 'fastify' {
  interface FastifyRequest {
    organizationId?: string;
    userId?: string;
  }
}

// Paths that don't require authentication
const PUBLIC_PREFIXES = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/google',
  '/api/auth/shopify',
  '/api/webhooks/',
];

function isPublicPath(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

function safeCompare(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/** Register the POST /auth/login endpoint */
export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request) => {
    const { password } = (request.body ?? {}) as { password?: string };
    const expectedPassword = process.env.AUTH_PASSWORD ?? '';
    const apiSecret = process.env.AUTH_SECRET ?? '';

    if (!expectedPassword || expectedPassword === 'CHANGE_ME_use_a_strong_password') {
      return { success: false, message: 'AUTH_PASSWORD not configured on server.' };
    }

    if (!apiSecret || apiSecret === 'CHANGE_ME_generate_with_openssl_rand_hex_32') {
      return { success: false, message: 'AUTH_SECRET not configured on server.' };
    }

    if (!password) {
      return { success: false, message: 'Password is required.' };
    }

    if (safeCompare(password, expectedPassword)) {
      return { success: true, token: apiSecret };
    }

    return { success: false, message: 'Invalid password.' };
  });
}

/**
 * Try to authenticate via Clerk JWT.
 * Returns true if authenticated, false if token is not a Clerk JWT.
 */
async function tryClerkAuth(request: FastifyRequest): Promise<boolean> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7);
  const verified = await verifyClerkToken(token);
  if (!verified) return false;

  // Look up the user in our DB to get the organizationId
  const user = await prisma.user.findUnique({
    where: { clerkUserId: verified.clerkUserId },
    select: { id: true, organizationId: true },
  });

  if (user) {
    request.organizationId = user.organizationId;
    request.userId = user.id;
  } else if (verified.clerkOrgId) {
    // User doesn't exist yet in our DB (may be in the process of being created via webhook)
    // Try to find org by clerkOrgId
    const org = await prisma.organization.findUnique({
      where: { clerkOrgId: verified.clerkOrgId },
      select: { id: true },
    });
    if (org) {
      request.organizationId = org.id;
    }
  }

  return true;
}

/** Register a global onRequest hook that validates tokens (Clerk JWT or Bearer) */
export function registerAuthHook(app: FastifyInstance) {
  const apiSecret = process.env.AUTH_SECRET ?? '';
  const clerkEnabled = isClerkConfigured();
  const bearerEnabled = apiSecret && apiSecret !== 'CHANGE_ME_generate_with_openssl_rand_hex_32';

  // If neither auth method is configured, skip auth entirely (dev mode / tests)
  if (!clerkEnabled && !bearerEnabled) {
    app.log.warn('No auth configured (AUTH_SECRET + CLERK_ISSUER_URL both missing) — API authentication is DISABLED');
    return;
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublicPath(request.url)) return;

    // 1. Try Clerk JWT first (if configured)
    if (clerkEnabled) {
      const isClerk = await tryClerkAuth(request);
      if (isClerk) return; // Clerk auth succeeded
    }

    // 2. Fall back to Bearer token (legacy/dev mode)
    if (bearerEnabled) {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        if (safeCompare(token, apiSecret)) return; // Bearer auth succeeded
      }
    }

    // 3. No valid auth found
    return reply.status(401).send({ error: 'Unauthorized' });
  });

  const modes = [clerkEnabled && 'Clerk JWT', bearerEnabled && 'Bearer token'].filter(Boolean).join(' + ');
  app.log.info(`API authentication enabled — ${modes}`);
}
