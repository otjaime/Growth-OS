'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';
import { useDemoMode } from '@/contexts/demo-mode';

const DISMISS_KEY = 'growth-os-demo-banner-dismissed';

export function DemoBanner(): React.ReactElement | null {
  const { isDemoMode, isLoading } = useDemoMode();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === 'true');
  }, []);

  if (isLoading || !isDemoMode || dismissed) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-apple-yellow/30 bg-yellow-500/10 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm text-apple-yellow">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          You&apos;re viewing sample data &mdash;{' '}
          <strong>Demo Mode</strong>.{' '}
          <Link href="/settings" className="underline hover:text-apple-yellow/80">
            Switch to live data
          </Link>
        </span>
      </div>
      <button
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, 'true');
          setDismissed(true);
        }}
        className="text-apple-yellow/70 hover:text-apple-yellow transition-colors"
        aria-label="Dismiss demo banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
