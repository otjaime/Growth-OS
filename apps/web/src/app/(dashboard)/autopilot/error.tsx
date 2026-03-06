'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AutopilotError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Autopilot] Page error:', error);
  }, [error]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--foreground)]">Meta Copilot</h1>
      <div className="card border-apple-red/30 flex flex-col items-center justify-center h-64 gap-4 px-6">
        <div className="w-12 h-12 rounded-full bg-[var(--tint-red)] flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-apple-red" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--foreground)]">Something went wrong</p>
          <p className="text-xs text-[var(--foreground-secondary)] mt-1 max-w-md">
            {error.message || 'An unexpected error occurred while loading the autopilot page.'}
          </p>
          {error.digest && (
            <p className="text-caption text-[var(--foreground-secondary)]/50 mt-1 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-apple-blue bg-[var(--tint-blue)] hover:bg-apple-blue/20 rounded-xl transition-all ease-spring press-scale"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}
