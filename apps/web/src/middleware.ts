import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Clerk middleware — only active when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set.
 * Otherwise, falls through to legacy Bearer-token auth.
 */

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api(.*)',
]);

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function legacyMiddleware(_request: NextRequest): NextResponse {
  return NextResponse.next();
}

export default CLERK_KEY
  ? clerkMiddleware(async (auth, request) => {
      // Allow public routes without auth
      if (isPublicRoute(request)) {
        return;
      }
      // Protect everything else — redirects to Clerk sign-in if unauthenticated
      await auth.protect();
    })
  : legacyMiddleware;

export const config = {
  matcher: [
    // Skip static files and Next.js internals
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes (Next.js API routes, not our Fastify API)
    '/(api|trpc)(.*)',
  ],
};
