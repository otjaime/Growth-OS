// ──────────────────────────────────────────────────────────────
// Growth OS — Clerk JWT Verification
// Lightweight JWKS-based verification using jose
// ──────────────────────────────────────────────────────────────

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

interface ClerkJWTPayload extends JWTPayload {
  sub: string;           // Clerk user ID (user_xxx)
  org_id?: string;       // Clerk organization ID (org_xxx) — present when user has an org
  email?: string;
  first_name?: string;
  last_name?: string;
}

export interface VerifiedClerkToken {
  clerkUserId: string;
  clerkOrgId: string | undefined;
  email: string | undefined;
  name: string | undefined;
}

// JWKS endpoint — lazily initialized from env
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (jwks) return jwks;

  const issuer = process.env.CLERK_ISSUER_URL;
  if (!issuer) {
    throw new Error('CLERK_ISSUER_URL env var is required for Clerk JWT verification');
  }

  // Clerk JWKS endpoint: https://<clerk-domain>/.well-known/jwks.json
  const jwksUrl = new URL('/.well-known/jwks.json', issuer);
  jwks = createRemoteJWKSet(jwksUrl);
  return jwks;
}

/**
 * Verify a Clerk-issued JWT token.
 * Returns the decoded payload or null if verification fails.
 */
export async function verifyClerkToken(token: string): Promise<VerifiedClerkToken | null> {
  try {
    const keySet = getJWKS();
    const issuer = process.env.CLERK_ISSUER_URL ?? '';

    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      // Clerk uses the Clerk Frontend API URL as audience when configured
      // If CLERK_JWT_AUDIENCE is set, validate it; otherwise skip audience check
      ...(process.env.CLERK_JWT_AUDIENCE ? { audience: process.env.CLERK_JWT_AUDIENCE } : {}),
    }) as { payload: ClerkJWTPayload };

    const firstName = payload.first_name ?? '';
    const lastName = payload.last_name ?? '';
    const name = [firstName, lastName].filter(Boolean).join(' ') || undefined;

    return {
      clerkUserId: payload.sub,
      clerkOrgId: payload.org_id,
      email: payload.email,
      name,
    };
  } catch {
    return null;
  }
}

/**
 * Check if Clerk auth is configured (CLERK_ISSUER_URL is set).
 */
export function isClerkConfigured(): boolean {
  return Boolean(process.env.CLERK_ISSUER_URL);
}
