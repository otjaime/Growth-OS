'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle, X, Package, DollarSign, Sparkles } from 'lucide-react';
import type { ProactiveAdJob } from './types';

// ── Color maps (matching existing confirmation-modal.tsx) ───

const COLOR_MAP: Record<string, string> = {
  red: 'bg-apple-red hover:bg-apple-red/80 text-white',
  green: 'bg-apple-green hover:bg-apple-green/80 text-white',
  yellow: 'bg-apple-yellow hover:bg-apple-yellow/80 text-white',
  blue: 'bg-apple-blue hover:bg-apple-blue/80 text-white',
  purple: 'bg-apple-purple hover:bg-apple-purple/80 text-white',
};

const ICON_COLOR_MAP: Record<string, string> = {
  red: 'text-apple-red bg-[var(--tint-red)]',
  green: 'text-apple-green bg-[var(--tint-green)]',
  yellow: 'text-apple-yellow bg-[var(--tint-yellow)]',
  blue: 'text-apple-blue bg-[var(--tint-blue)]',
  purple: 'text-apple-purple bg-[var(--tint-purple)]',
};

// ── Props ───────────────────────────────────────────────────

interface ProactiveConfirmModalProps {
  open: boolean;
  job: ProactiveAdJob;
  onConfirm: () => void;
  onCancel: () => void;
}

// ── Helpers ─────────────────────────────────────────────────

function fmt$(v: number): string {
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Component ───────────────────────────────────────────────

export function ProactiveConfirmModal({
  open,
  job,
  onConfirm,
  onCancel,
}: ProactiveConfirmModalProps): JSX.Element | null {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus trap: focus first button on mount, Escape closes
  useEffect(() => {
    if (!open) return;

    // Focus confirm button on open
    const timer = setTimeout(() => confirmRef.current?.focus(), 50);

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const previewVariants = (job.copyVariants ?? []).slice(0, 3);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg mx-4 bg-[var(--glass-bg-elevated)] backdrop-blur-xl border border-[var(--glass-border)] rounded-2xl shadow-glass-elevated overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm publish ad"
      >
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ICON_COLOR_MAP.green}`}>
              <CheckCircle className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[var(--foreground)]">Approve & Publish</h3>
              <p className="text-sm text-[var(--foreground-secondary)] mt-1">
                This will publish the ad to Meta and start spending budget.
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Product Info */}
          <div className="flex items-center gap-3 px-3 py-3 bg-[var(--glass-bg-thin)] rounded-xl">
            {job.productImageUrl ?? job.imageUrl ? (
              <img
                src={(job.productImageUrl ?? job.imageUrl)!}
                alt={job.productTitle}
                className="w-12 h-12 rounded-lg object-cover bg-glass-muted"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-glass-muted flex items-center justify-center">
                <Package className="h-5 w-5 text-[var(--foreground-secondary)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--foreground)] truncate">{job.productTitle}</p>
              <p className="text-xs text-[var(--foreground-secondary)] capitalize">{job.productType}</p>
            </div>
          </div>

          {/* Score + Budget Row */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--glass-bg-thin)] rounded-lg">
              <Sparkles className="h-3 w-3 text-apple-purple" />
              <span className="text-[var(--foreground-secondary)]">Ad Score:</span>
              <span className="font-semibold text-[var(--foreground)]">{Number(job.adFitnessScore).toFixed(0)}</span>
            </div>
            {job.dailyBudget != null && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--glass-bg-thin)] rounded-lg">
                <DollarSign className="h-3 w-3 text-apple-green" />
                <span className="text-[var(--foreground-secondary)]">Budget:</span>
                <span className="font-semibold text-[var(--foreground)]">{fmt$(Number(job.dailyBudget))}/day</span>
              </div>
            )}
          </div>

          {/* Copy Variants Preview */}
          {previewVariants.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">
                Copy Variants ({previewVariants.length})
              </p>
              <div className="grid gap-1.5 max-h-40 overflow-y-auto">
                {previewVariants.map((v, i) => (
                  <div key={i} className="bg-glass-muted rounded-lg px-3 py-2">
                    <span className="text-caption font-medium text-apple-purple capitalize">
                      {v.angle.replace('_', ' ')}
                    </span>
                    <p className="text-xs font-medium text-[var(--foreground)] mt-0.5">{v.headline}</p>
                    <p className="text-caption text-[var(--foreground-secondary)] line-clamp-1">{v.primaryText}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onCancel}
              className="text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] bg-[var(--glass-bg-thin)] hover:bg-[var(--glass-bg)] px-4 py-2.5 rounded-lg transition-all ease-spring"
              aria-label="Cancel publish"
            >
              Cancel
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              className={`text-xs font-semibold px-5 py-2.5 rounded-lg transition-all ease-spring ${COLOR_MAP.green}`}
              aria-label="Confirm and publish ad"
            >
              Confirm & Publish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
