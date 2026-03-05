'use client';

import { useState, useCallback } from 'react';
import {
  Sparkles, Pause, Play, TrendingUp, TrendingDown,
  RefreshCw, Eye, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdThumbnail } from './ad-thumbnail';
import { TrustIndicator } from './trust-indicator';
import { AIInsightCard } from './ai-insight-card';
import { ReasoningPills } from './reasoning-pills';
import { ConfidenceBreakdown } from './confidence-breakdown';
import { ConfirmationModal } from './confirmation-modal';
import { ExecutionStatus } from './execution-status';
import { getActionLabel } from './human-labels';
import type { Diagnosis, DiagnosisAction } from './types';
import { apiFetch } from '@/lib/api';

interface ActionCardProps {
  diagnosis: Diagnosis;
  onDismiss: (id: string) => void;
  onRefresh: () => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function ActionIconComponent({ actionType }: { actionType: DiagnosisAction }): JSX.Element {
  switch (actionType) {
    case 'GENERATE_COPY_VARIANTS': return <Sparkles className="h-3.5 w-3.5" />;
    case 'PAUSE_AD': return <Pause className="h-3.5 w-3.5" />;
    case 'REACTIVATE_AD': return <Play className="h-3.5 w-3.5" />;
    case 'INCREASE_BUDGET': return <TrendingUp className="h-3.5 w-3.5" />;
    case 'DECREASE_BUDGET': return <TrendingDown className="h-3.5 w-3.5" />;
    case 'REFRESH_CREATIVE': return <RefreshCw className="h-3.5 w-3.5" />;
    default: return <Eye className="h-3.5 w-3.5" />;
  }
}

function actionButtonStyle(action: DiagnosisAction): string {
  switch (action) {
    case 'PAUSE_AD':
    case 'DECREASE_BUDGET':
      return 'text-apple-red bg-[var(--tint-red)] hover:bg-apple-red/20';
    case 'REACTIVATE_AD':
    case 'INCREASE_BUDGET':
      return 'text-apple-green bg-[var(--tint-green)] hover:bg-apple-green/20';
    case 'GENERATE_COPY_VARIANTS':
    case 'REFRESH_CREATIVE':
      return 'text-apple-blue bg-[var(--tint-blue)] hover:bg-apple-blue/20';
    default:
      return 'text-[var(--foreground-secondary)] bg-glass-hover hover:bg-glass-active';
  }
}

function severityBorder(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'border-l-apple-red';
    case 'WARNING': return 'border-l-apple-yellow';
    default: return 'border-l-apple-blue';
  }
}

function formatSpend(spend: number): string {
  return `$${spend.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function ActionCard({
  diagnosis,
  onDismiss,
  onRefresh,
  selectionMode,
  isSelected,
  onToggleSelect,
}: ActionCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [approveResult, setApproveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    detail?: string;
    confirmLabel: string;
    confirmColor: 'red' | 'green' | 'yellow' | 'blue';
  } | null>(null);

  const d = diagnosis;
  const ad = d.ad;
  const humanAction = getActionLabel(d.actionType);

  const handleApprove = useCallback(async () => {
    setApproving(true);
    setApproveResult(null);
    try {
      const res = await apiFetch(`/api/autopilot/diagnoses/${d.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setApproveResult({ success: false, message: data.error ?? 'Failed' });
      } else {
        setApproveResult({ success: true, message: data.message ?? 'Done! Executing via Meta API...' });
        setTimeout(() => onRefresh(), 2000);
      }
    } catch {
      setApproveResult({ success: false, message: 'Network error' });
    } finally {
      setApproving(false);
    }
  }, [d.id, onRefresh]);

  const handleDismiss = useCallback(async () => {
    setDismissing(true);
    try {
      const res = await apiFetch(`/api/autopilot/diagnoses/${d.id}/dismiss`, { method: 'POST' });
      if (res.ok) onDismiss(d.id);
    } catch {
      // ignore
    } finally {
      setDismissing(false);
    }
  }, [d.id, onDismiss]);

  const requestApprove = useCallback(() => {
    const sv = d.suggestedValue ?? {};

    switch (d.actionType) {
      case 'PAUSE_AD':
        setConfirmModal({
          title: `Stop "${ad.name}"?`,
          message: `This ad spent ${formatSpend(ad.spend7d)} this week${ad.roas7d != null ? ` with ${Number(ad.roas7d).toFixed(2)}x return` : ''}.`,
          detail: 'The ad will be paused immediately in Meta Ads.',
          confirmLabel: 'Stop this ad',
          confirmColor: 'red',
        });
        break;
      case 'INCREASE_BUDGET':
        setConfirmModal({
          title: 'Spend more on this ad?',
          message: `Increase from $${sv.currentBudget ?? '?'}/day to $${sv.suggestedBudget ?? '?'}/day.`,
          detail: `That's ~$${(((Number(sv.suggestedBudget) || 0) - (Number(sv.currentBudget) || 0)) * 7).toFixed(0)} more per week.`,
          confirmLabel: 'Increase budget',
          confirmColor: 'green',
        });
        break;
      case 'DECREASE_BUDGET':
        setConfirmModal({
          title: 'Spend less on this ad?',
          message: "This ad isn't performing well. Reducing the budget will limit waste.",
          confirmLabel: 'Reduce budget',
          confirmColor: 'yellow',
        });
        break;
      case 'REACTIVATE_AD':
        setConfirmModal({
          title: `Restart "${ad.name}"?`,
          message: `This paused ad had ${(sv.previousRoas as number)?.toFixed(2) ?? '?'}x return. It will be turned back on.`,
          confirmLabel: 'Restart this ad',
          confirmColor: 'green',
        });
        break;
      default:
        handleApprove();
        break;
    }
  }, [d, ad, handleApprove]);

  // Completed state
  if (approveResult?.success) {
    return (
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        className="card px-4 py-3 flex items-center gap-3 border-l-4 border-l-apple-green"
      >
        <CheckCircle2 className="h-4 w-4 text-apple-green shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-apple-green">{approveResult.message}</p>
          <p className="text-caption text-[var(--foreground-secondary)] mt-0.5">Check back in 48h to see the impact.</p>
        </div>
        <ExecutionStatus diagnosisId={d.id} status={d.status} onExecuted={onRefresh} />
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        layout
        className={`card overflow-hidden border-l-4 ${severityBorder(d.severity)} transition-colors ${
          expanded ? 'bg-glass-muted' : ''
        }`}
      >
        {/* ─── Collapsed Row ─── */}
        <div className="flex items-center gap-3 px-4 py-3">
          {selectionMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect?.(d.id)}
              className="h-4 w-4 rounded border-[var(--glass-border)] accent-apple-blue shrink-0"
            />
          )}

          <AdThumbnail
            thumbnailUrl={ad.thumbnailUrl}
            imageUrl={ad.imageUrl}
            name={ad.name}
            size="sm"
          />

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--foreground)] truncate">
              {humanAction.verb}
            </p>
            <p className="text-caption text-[var(--foreground-secondary)] truncate mt-0.5">
              {ad.name} &middot; {formatSpend(ad.spend7d)}/week
              {d.actionType === 'PAUSE_AD' && ad.spend7d > 0 && (
                <span className="text-apple-red"> &middot; losing money</span>
              )}
            </p>
          </div>

          {d.confidence != null && (
            <TrustIndicator confidence={d.confidence} compact />
          )}

          {/* Primary CTA */}
          {d.status === 'PENDING' && d.actionType !== 'NONE' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                requestApprove();
              }}
              disabled={approving}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg press-scale transition-all ease-spring disabled:opacity-50 shrink-0 ${actionButtonStyle(d.actionType)}`}
            >
              {approving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ActionIconComponent actionType={d.actionType} />
              )}
              <span className="hidden sm:inline">{approving ? humanAction.activeLabel : humanAction.buttonLabel}</span>
            </button>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-glass-hover transition-colors press-scale shrink-0"
          >
            {expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-[var(--foreground-secondary)]" />
              : <ChevronDown className="h-3.5 w-3.5 text-[var(--foreground-secondary)]" />
            }
          </button>
        </div>

        {/* ─── Expanded Detail ─── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-4 border-t border-[var(--glass-border)]">
                {/* Metric pills */}
                <div className="grid grid-cols-4 gap-2 pt-3">
                  <div className="glass-thin rounded-lg px-2.5 py-2">
                    <p className="text-caption text-[var(--foreground-secondary)] mb-0.5">Money spent</p>
                    <p className="text-xs font-semibold text-[var(--foreground)]">{formatSpend(ad.spend7d)}</p>
                  </div>
                  <div className="glass-thin rounded-lg px-2.5 py-2">
                    <p className="text-caption text-[var(--foreground-secondary)] mb-0.5">Return</p>
                    <p className="text-xs font-semibold text-[var(--foreground)]">
                      {ad.roas7d != null ? `${Number(ad.roas7d).toFixed(2)}x` : '—'}
                    </p>
                  </div>
                  <div className="glass-thin rounded-lg px-2.5 py-2">
                    <p className="text-caption text-[var(--foreground-secondary)] mb-0.5">Click rate</p>
                    <p className="text-xs font-semibold text-[var(--foreground)]">
                      {ad.ctr7d != null ? `${(Number(ad.ctr7d) * 100).toFixed(2)}%` : '—'}
                    </p>
                  </div>
                  <div className="glass-thin rounded-lg px-2.5 py-2">
                    <p className="text-caption text-[var(--foreground-secondary)] mb-0.5">Views/person</p>
                    <p className="text-xs font-semibold text-[var(--foreground)]">
                      {ad.frequency7d != null ? `${Number(ad.frequency7d).toFixed(1)}x` : '—'}
                    </p>
                  </div>
                </div>

                {/* Intelligence reasoning */}
                <ReasoningPills suggestedValue={d.suggestedValue} />

                {/* Confidence breakdown */}
                <ConfidenceBreakdown confidence={d.confidence} suggestedValue={d.suggestedValue} />

                {/* Human description */}
                <p className="text-sm text-[var(--foreground-secondary)]">{humanAction.description}</p>

                {/* AI Analysis */}
                <AIInsightCard diagnosisId={d.id} />

                {/* Approval feedback */}
                {approveResult && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                    approveResult.success
                      ? 'text-apple-green bg-[var(--tint-green)]'
                      : 'text-apple-red bg-[var(--tint-red)]'
                  }`}>
                    {approveResult.success
                      ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                    {approveResult.message}
                  </div>
                )}

                {/* Secondary actions */}
                {d.status === 'PENDING' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDismiss}
                      disabled={dismissing}
                      className="flex items-center gap-1.5 text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] bg-glass-hover hover:bg-glass-active-strong px-3 py-1.5 rounded-lg press-scale transition-all ease-spring disabled:opacity-50"
                    >
                      {dismissing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      Skip this
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={!!confirmModal}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        detail={confirmModal?.detail}
        confirmLabel={confirmModal?.confirmLabel ?? 'Confirm'}
        confirmColor={confirmModal?.confirmColor ?? 'blue'}
        onConfirm={() => {
          setConfirmModal(null);
          handleApprove();
        }}
        onCancel={() => setConfirmModal(null)}
      />
    </>
  );
}
