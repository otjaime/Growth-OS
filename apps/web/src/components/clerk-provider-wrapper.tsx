'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { ClerkTokenSync } from '@/components/clerk-token-sync';

const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Conditionally wraps children with Clerk auth.
 *
 * When `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set → full Clerk auth + token sync.
 * When missing → passthrough (legacy Bearer-token / dev mode).
 */
export function ClerkProviderWrapper({ children }: { children: React.ReactNode }): React.ReactElement {
  if (!CLERK_KEY) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_KEY}
      appearance={{
        variables: { colorPrimary: '#0A84FF' },
      }}
    >
      <ClerkTokenSync />
      {children}
    </ClerkProvider>
  );
}
