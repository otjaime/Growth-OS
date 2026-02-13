// ──────────────────────────────────────────────────────────────
// Growth OS — API Authentication
// Bearer-token auth middleware + login endpoint
// ──────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';

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

/** Register a global onRequest hook that validates Bearer tokens */
export function registerAuthHook(app: FastifyInstance) {
  const apiSecret = process.env.AUTH_SECRET ?? '';

  // If AUTH_SECRET is not configured, skip auth entirely (dev mode)
  if (!apiSecret || apiSecret === 'CHANGE_ME_generate_with_openssl_rand_hex_32') {
    app.log.warn('AUTH_SECRET not configured — API authentication is DISABLED');
    return;
  }

  app.addHook('onRequest', async (request, reply) => {
    if (isPublicPath(request.url)) return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    if (!safeCompare(token, apiSecret)) {
      return reply.status(401).send({ error: 'Invalid token' });
    }
  });

  app.log.info('API authentication enabled — Bearer token required on all protected endpoints');
}
