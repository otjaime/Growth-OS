'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { setAuthToken, clearAuthToken } from '@/lib/api';

/**
 * Bridge component: syncs Clerk session tokens into sessionStorage
 * so the existing `apiFetch()` picks them up transparently.
 *
 * Clerk tokens are short-lived (~60 s). This component refreshes
 * every 50 seconds and on sign-in state changes.
 *
 * Renders nothing — place inside <ClerkProvider>.
 */
export function ClerkTokenSync(): null {
  const { getToken, isSignedIn } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      clearAuthToken();
      return;
    }

    let mounted = true;

    const sync = async () => {
      try {
        const token = await getToken();
        if (mounted && token) {
          setAuthToken(token);
        }
      } catch {
        // Token fetch can fail during sign-out transitions — ignore
      }
    };

    // Immediate sync
    sync();

    // Refresh every 50 s (tokens expire ~60 s)
    intervalRef.current = setInterval(sync, 50_000);

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [getToken, isSignedIn]);

  return null;
}
