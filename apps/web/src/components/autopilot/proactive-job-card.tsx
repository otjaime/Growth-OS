'use client';

import { useState } from 'react';
import {
  Clock, Sparkles, CheckCircle, Play, Pause, AlertTriangle,
  Trophy, Loader2, XCircle, Package, Zap, ThumbsDown, RefreshCw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { ProactiveAdJob, ProactiveAdStatus } from './types';
import { ProactiveConfirmModal } from './proactive-confirm-modal';

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

export function ProactiveJobCard({ job, onRefresh }: ProactiveJobCardProps): JSX.Element {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const statusCfg = STATUS_CONFIG[job.status];
  const StatusIcon = statusCfg.icon;

  const testDays = job.testStartedAt
    ? Math.floor((Date.now() - new Date(job.testStartedAt).getTime()) / 86_400_000)
    : null;

  // ── Action handlers ──────────────────────────────────────

  async function callAction(url: string, method = 'POST'): Promise<void> {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setActionError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(false);
    }
  }

  function handleGenerate(): void {
    void callAction(`/api/autopilot/proactive/jobs/${job.id}/approve`);
  }

  function handleApproveClick(): void {
    setShowConfirm(true);
  }

  function handleConfirmApprove(): void {
    setShowConfirm(false);
    void callAction(`/api/autopilot/proactive/jobs/${job.id}/approve`);
  }

  function handleReject(): void {
    void callAction(`/api/autopilot/proactive/jobs/${job.id}/reject`);
  }

  function handleActivate(): void {
    void callAction(`/api/autopilot/proactive/jobs/${job.id}/activate`);
  }

  function handlePause(): void {
    void callAction(`/api/autopilot/proactive/jobs/${job.id}/reject`);
  }

  // ── Variant performance table ────────────────────────────

  const hasPerformanceData = job.status === 'TESTING'
    && job.variantPerformance
    && job.variantPerformance.length > 0;

  const allZero = hasPerformanceData
    && job.variantPerformance!.every(
      (v) => v.spend === 0 && v.clicks === 0 && v.conversions === 0 && v.revenue === 0,
    );

  const leadingVariantId = hasPerformanceData && !allZero
    ? job.variantPerformance!.reduce<string | null>((bestId, v) => {
      if (v.roas == null) return bestId;
      const best = job.variantPerformance!.find((x) => x.variantId === bestId);
      if (!best || best.roas == null || v.roas > best.roas) return v.variantId;
      return bestId;
    }, job.variantPerformance![0]?.variantId ?? null)
    : null;

  return (
    <>
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

        {/* Variant Performance Table (5.5) */}
        {hasPerformanceData && (
          <div className="space-y-1.5">
            <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Variant Performance</p>
            {allZero ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-glass-muted rounded-lg">
                <Loader2 className="h-3 w-3 animate-spin text-[var(--foreground-secondary)]" />
                <span className="text-xs text-[var(--foreground-secondary)]">Collecting data...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left px-2 py-1.5 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Variant</th>
                      <th className="text-right px-2 py-1.5 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Spend</th>
                      <th className="text-right px-2 py-1.5 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Clicks</th>
                      <th className="text-right px-2 py-1.5 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Conv</th>
                      <th className="text-right px-2 py-1.5 text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.variantPerformance!.map((v) => {
                      const isLeader = v.variantId === leadingVariantId;
                      return (
                        <tr
                          key={v.variantId}
                          className={`border-b border-[var(--border)]/50 ${isLeader ? 'bg-[var(--tint-green)] ring-1 ring-apple-green/30 rounded' : ''}`}
                        >
                          <td className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                              {isLeader && <Trophy className="h-3 w-3 text-apple-green shrink-0" />}
                              <span className="font-medium text-[var(--foreground)] capitalize truncate max-w-[120px]">
                                {v.angle.replace('_', ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[var(--foreground)]">{fmt$(v.spend)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[var(--foreground)]">{v.clicks}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-[var(--foreground)]">{v.conversions}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-[var(--foreground)]">
                            {v.roas != null ? `${v.roas.toFixed(2)}x` : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Error Message */}
        {job.errorMessage && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--tint-red)] border border-apple-red/30">
            <AlertTriangle className="h-3.5 w-3.5 text-apple-red mt-0.5 shrink-0" />
            <p className="text-xs text-apple-red">{job.errorMessage}</p>
          </div>
        )}

        {/* Action Buttons (5.1) */}
        {!actionLoading && !['GENERATING', 'APPROVED', 'WINNER'].includes(job.status) && (
          <div className="flex items-center gap-2 pt-1">
            {job.status === 'PENDING' && (
              <button
                onClick={handleGenerate}
                disabled={actionLoading}
                aria-label="Generate ad creative"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-apple-blue hover:bg-apple-blue/80 rounded-lg transition-all ease-spring"
              >
                <Zap className="h-3 w-3" />
                Generate Ad
              </button>
            )}
            {job.status === 'READY' && (
              <>
                <button
                  onClick={handleApproveClick}
                  disabled={actionLoading}
                  aria-label="Approve and publish ad"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-apple-green hover:bg-apple-green/80 rounded-lg transition-all ease-spring"
                >
                  <CheckCircle className="h-3 w-3" />
                  Approve & Publish
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading}
                  aria-label="Reject ad creative"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-apple-red border border-apple-red/30 hover:bg-[var(--tint-red)] rounded-lg transition-all ease-spring"
                >
                  <ThumbsDown className="h-3 w-3" />
                  Reject
                </button>
              </>
            )}
            {job.status === 'PUBLISHED' && (
              <button
                onClick={handleActivate}
                disabled={actionLoading}
                aria-label="Start A/B test"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-apple-blue hover:bg-apple-blue/80 rounded-lg transition-all ease-spring"
              >
                <Play className="h-3 w-3" />
                Start A/B Test
              </button>
            )}
            {job.status === 'TESTING' && (
              <button
                onClick={handlePause}
                disabled={actionLoading}
                aria-label="Pause A/B test"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-apple-yellow border border-apple-yellow/30 hover:bg-[var(--tint-yellow)] rounded-lg transition-all ease-spring"
              >
                <Pause className="h-3 w-3" />
                Pause Test
              </button>
            )}
            {job.status === 'PAUSED' && (
              <button
                onClick={handleGenerate}
                disabled={actionLoading}
                aria-label="Re-generate ad creative"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-apple-blue hover:bg-apple-blue/80 rounded-lg transition-all ease-spring"
              >
                <RefreshCw className="h-3 w-3" />
                Re-generate
              </button>
            )}
            {job.status === 'FAILED' && (
              <button
                onClick={handleGenerate}
                disabled={actionLoading}
                aria-label="Retry ad generation"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-apple-orange hover:bg-apple-orange/80 rounded-lg transition-all ease-spring"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}

        {/* Loading spinner during action */}
        {actionLoading && (
          <div className="flex items-center gap-2 pt-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-apple-blue" />
            <span className="text-xs text-[var(--foreground-secondary)]">Processing...</span>
          </div>
        )}

        {/* Inline action error */}
        {actionError && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[var(--tint-red)] border border-apple-red/30">
            <AlertTriangle className="h-3.5 w-3.5 text-apple-red mt-0.5 shrink-0" />
            <p className="text-xs text-apple-red">{actionError}</p>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ProactiveConfirmModal
        open={showConfirm}
        job={job}
        onConfirm={handleConfirmApprove}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
