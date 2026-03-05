'use client';

import {
  Clock, Sparkles, CheckCircle, Play, Pause, AlertTriangle,
  Trophy, Loader2, XCircle, Package,
} from 'lucide-react';
import type { ProactiveAdJob, ProactiveAdStatus } from './types';

// ── Status config ────────────────────────────────────────────

const STATUS_CONFIG: Record<ProactiveAdStatus, {
  label: string;
  color: string;
  bg: string;
  icon: typeof Clock;
}> = {
  PENDING: { label: 'Pending', color: 'text-apple-yellow', bg: 'bg-[var(--tint-yellow)]', icon: Clock },
  GENERATING: { label: 'Generating', color: 'text-apple-blue', bg: 'bg-[var(--tint-blue)]', icon: Loader2 },
  READY: { label: 'Ready', color: 'text-apple-purple', bg: 'bg-[var(--tint-purple)]', icon: Sparkles },
  APPROVED: { label: 'Approved', color: 'text-apple-green', bg: 'bg-[var(--tint-green)]', icon: CheckCircle },
  PUBLISHED: { label: 'Published', color: 'text-apple-blue', bg: 'bg-[var(--tint-blue)]', icon: CheckCircle },
  TESTING: { label: 'Testing', color: 'text-apple-orange', bg: 'bg-[var(--tint-orange)]', icon: Play },
  WINNER: { label: 'Winner', color: 'text-apple-green', bg: 'bg-[var(--tint-green)]', icon: Trophy },
  PAUSED: { label: 'Paused', color: 'text-[var(--foreground-secondary)]', bg: 'bg-glass-muted', icon: Pause },
  FAILED: { label: 'Failed', color: 'text-apple-red', bg: 'bg-[var(--tint-red)]', icon: XCircle },
};

// ── Component ────────────────────────────────────────────────

interface ProactiveJobCardProps {
  job: ProactiveAdJob;
  onRefresh: () => void;
}

function fmt$(v: number): string {
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function ProactiveJobCard({ job }: ProactiveJobCardProps): JSX.Element {
  const statusCfg = STATUS_CONFIG[job.status];
  const StatusIcon = statusCfg.icon;

  const testDays = job.testStartedAt
    ? Math.floor((Date.now() - new Date(job.testStartedAt).getTime()) / 86_400_000)
    : null;

  return (
    <div className="card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {job.productImageUrl || job.imageUrl ? (
            <img
              src={job.productImageUrl ?? job.imageUrl ?? ''}
              alt={job.productTitle}
              className="w-10 h-10 rounded-lg object-cover bg-glass-muted"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-glass-muted flex items-center justify-center">
              <Package className="h-4 w-4 text-[var(--foreground-secondary)]" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">{job.productTitle}</p>
            <p className="text-caption text-[var(--foreground-secondary)] capitalize">{job.productType}</p>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${statusCfg.bg}`}>
          <StatusIcon className={`h-3 w-3 ${statusCfg.color} ${job.status === 'GENERATING' ? 'animate-spin' : ''}`} />
          <span className={`text-xs font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
        </div>
      </div>

      {/* Score + Test Info */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--foreground-secondary)]">Ad Score:</span>
          <span className="font-semibold text-[var(--foreground)]">{job.adFitnessScore.toFixed(0)}</span>
        </div>
        {job.dailyBudget != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--foreground-secondary)]">Budget:</span>
            <span className="font-semibold text-[var(--foreground)]">{fmt$(job.dailyBudget)}/day</span>
          </div>
        )}
        {job.testRoundNumber > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--foreground-secondary)]">Round:</span>
            <span className="font-semibold text-[var(--foreground)]">{job.testRoundNumber}</span>
          </div>
        )}
        {testDays != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-[var(--foreground-secondary)]">Testing:</span>
            <span className="font-semibold text-[var(--foreground)]">{testDays}d</span>
          </div>
        )}
      </div>

      {/* Copy Variants Preview */}
      {job.copyVariants && job.copyVariants.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Copy Variants</p>
          <div className="grid gap-1.5">
            {job.copyVariants.map((v, i) => (
              <div key={i} className="bg-glass-muted rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-caption font-medium text-apple-purple capitalize">{v.angle.replace('_', ' ')}</span>
                </div>
                <p className="text-xs font-medium text-[var(--foreground)]">{v.headline}</p>
                <p className="text-caption text-[var(--foreground-secondary)] line-clamp-2">{v.primaryText}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Message */}
      {job.errorMessage && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--tint-red)] border border-apple-red/30">
          <AlertTriangle className="h-3.5 w-3.5 text-apple-red mt-0.5 shrink-0" />
          <p className="text-xs text-apple-red">{job.errorMessage}</p>
        </div>
      )}
    </div>
  );
}
