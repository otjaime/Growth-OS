'use client';

import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface BulkActionsBarProps {
  selectedCount: number;
  selectedIds: Set<string>;
  onComplete: () => void;
  onCancel: () => void;
}

export function BulkActionsBar({ selectedCount, selectedIds, onComplete, onCancel }: BulkActionsBarProps) {
  const [loading, setLoading] = useState<'approve' | 'dismiss' | null>(null);
  const [result, setResult] = useState<{ type: string; message: string } | null>(null);

  if (selectedCount === 0) return null;

  const handleBulkApprove = async () => {
    setLoading('approve');
    setResult(null);
    try {
      const res = await apiFetch('/api/autopilot/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: 'error', message: data.error ?? 'Bulk approve failed' });
      } else {
        setResult({
          type: 'success',
          message: `${data.approved} diagnosis(es) approved and queued for execution${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`,
        });
        setTimeout(() => onComplete(), 1500);
      }
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    } finally {
      setLoading(null);
    }
  };

  const handleBulkDismiss = async () => {
    setLoading('dismiss');
    setResult(null);
    try {
      const res = await apiFetch('/api/autopilot/bulk-dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: 'error', message: data.error ?? 'Bulk dismiss failed' });
      } else {
        setResult({
          type: 'success',
          message: `${data.dismissed} diagnosis(es) dismissed`,
        });
        setTimeout(() => onComplete(), 1500);
      }
    } catch {
      setResult({ type: 'error', message: 'Network error' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] shadow-2xl">
        <span className="text-sm font-semibold text-[var(--foreground)] tabular-nums">
          {selectedCount} selected
        </span>

        <div className="w-px h-5 bg-[var(--glass-border)]" />

        <button
          onClick={handleBulkApprove}
          disabled={loading !== null}
          className="flex items-center gap-1.5 text-xs font-medium text-apple-green bg-[var(--tint-green)] hover:bg-apple-green/20 px-4 py-2 rounded-lg transition-all ease-spring disabled:opacity-50"
        >
          {loading === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve ({selectedCount})
        </button>

        <button
          onClick={handleBulkDismiss}
          disabled={loading !== null}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--foreground-secondary)] bg-white/[0.06] hover:bg-white/[0.1] px-4 py-2 rounded-lg transition-all ease-spring disabled:opacity-50"
        >
          {loading === 'dismiss' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Dismiss ({selectedCount})
        </button>

        <button
          onClick={onCancel}
          disabled={loading !== null}
          className="text-xs text-[var(--foreground-secondary)] hover:text-[var(--foreground)] ml-1 transition-colors"
        >
          Cancel
        </button>

        {result && (
          <span className={`text-xs font-medium ml-2 ${
            result.type === 'success' ? 'text-apple-green' : 'text-apple-red'
          }`}>
            {result.message}
          </span>
        )}
      </div>
    </div>
  );
}
