'use client';

import { useState } from 'react';
import {
  Sparkles, Pause, Play, TrendingUp, TrendingDown,
  RefreshCw, Eye, Loader2, Check, X, Copy, CheckCircle2, AlertCircle,
  Rocket, Trophy,
} from 'lucide-react';
import { SeverityBadge } from './severity-badge';
import { ExpiryCountdown } from './expiry-countdown';
import { ConfidenceBadge } from './confidence-badge';
import { AdThumbnail } from './ad-thumbnail';
import { TrendArrow } from './trend-arrow';
import type { Diagnosis, AdVariant } from './types';
import { AIInsightCard } from './ai-insight-card';
import { ConfirmationModal } from './confirmation-modal';
import { ExecutionStatus } from './execution-status';
import { VariantPerformance } from './variant-performance';
import { apiFetch } from '@/lib/api';

interface DiagnosisDetailProps {
  diagnosis: Diagnosis;
  onDismiss: (id: string) => void;
  onRefresh: () => void;
}

function ActionIcon({ actionType }: { actionType: string }) {
  switch (actionType) {
    case 'GENERATE_COPY_VARIANTS': return <Sparkles className="h-4 w-4" />;
    case 'PAUSE_AD': return <Pause className="h-4 w-4" />;
    case 'REACTIVATE_AD': return <Play className="h-4 w-4" />;
    case 'INCREASE_BUDGET': return <TrendingUp className="h-4 w-4" />;
    case 'DECREASE_BUDGET': return <TrendingDown className="h-4 w-4" />;
    case 'REFRESH_CREATIVE': return <RefreshCw className="h-4 w-4" />;
    default: return <Eye className="h-4 w-4" />;
  }
}

function actionDescription(d: Diagnosis): string {
  const sv = d.suggestedValue ?? {};
  switch (d.actionType) {
    case 'GENERATE_COPY_VARIANTS':
      return 'Generate 3 AI copy variants (benefit, pain point, urgency) to combat creative fatigue.';
    case 'PAUSE_AD':
      return `Pause this ad to stop wasting budget. Current ROAS: ${(sv.currentRoas as number)?.toFixed(2) ?? 'N/A'}x`;
    case 'REACTIVATE_AD':
      return `This paused ad had ${(sv.previousRoas as number)?.toFixed(2) ?? '?'}x ROAS on $${(sv.previousSpend as number)?.toFixed(0) ?? '?'} spend. Consider reactivating.`;
    case 'INCREASE_BUDGET':
      return `Scale from $${sv.currentBudget ?? '?'}/day to $${sv.suggestedBudget ?? '?'}/day. ROAS is strong at ${(sv.currentRoas as number)?.toFixed(2) ?? '?'}x.`;
    case 'DECREASE_BUDGET':
      return 'Reduce budget to limit exposure on underperforming ad.';
    case 'REFRESH_CREATIVE':
      return 'High CTR but low conversions — the creative attracts clicks but the landing page or offer isn\'t converting.';
    default:
      return 'Monitor this ad — no immediate action needed.';
  }
}

function MetricPill({ label, value, change, invert }: {
  label: string;
  value: string;
  change?: number | null;
  invert?: boolean;
}) {
  return (
    <div className="px-3 py-2.5 glass-thin rounded-xl">
      <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">{label}</p>
      <p className="text-sm font-semibold text-[var(--foreground)] mt-0.5">{value}</p>
      {change !== undefined && <TrendArrow change={change ?? null} invert={invert} size="sm" />}
    </div>
  );
}

function CopyVariantCard({
  variant,
  original,
  onApprove,
  onReject,
  onActivate,
  activating,
}: {
  variant: AdVariant;
  original: { headline: string | null; primaryText: string | null; description: string | null };
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onActivate: (id: string) => void;
  activating: boolean;
}) {
  const ANGLE_NAME_MAP: Record<string, string> = { benefit: 'Benefit', pain_point: 'Pain Point', urgency: 'Urgency', social_proof: 'Social Proof', value: 'Value' };
  const ANGLE_COLOR_MAP: Record<string, string> = {
    benefit: 'text-apple-green bg-[var(--tint-green)]',
    pain_point: 'text-apple-yellow bg-[var(--tint-yellow)]',
    urgency: 'text-apple-red bg-[var(--tint-red)]',
    social_proof: 'text-apple-blue bg-[var(--tint-blue)]',
    value: 'text-apple-purple bg-[var(--tint-purple)]',
  };
  const angleName = ANGLE_NAME_MAP[variant.angle] ?? variant.angle;
  const angleColor = ANGLE_COLOR_MAP[variant.angle] ?? 'text-apple-red bg-[var(--tint-red)]';

  const isActioned = variant.status !== 'DRAFT';

  return (
    <div className="glass-thin rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-caption px-2 py-0.5 rounded-full uppercase font-semibold ${angleColor}`}>
          {angleName}
        </span>
        {variant.status === 'APPROVED' && (
          <span className="text-caption px-2 py-0.5 rounded-full bg-[var(--tint-green)] text-apple-green font-semibold">APPROVED</span>
        )}
        {variant.status === 'REJECTED' && (
          <span className="text-caption px-2 py-0.5 rounded-full bg-[var(--tint-red)] text-apple-red font-semibold">REJECTED</span>
        )}
        {variant.status === 'PUBLISHED' && (
          <span className="text-caption px-2 py-0.5 rounded-full bg-[var(--tint-blue)] text-apple-blue font-semibold">LIVE</span>
        )}
        {variant.status === 'WINNER' && (
          <span className="flex items-center gap-1 text-caption px-2 py-0.5 rounded-full bg-[var(--tint-green)] text-apple-green font-semibold">
            <Trophy className="h-3 w-3" /> WINNER
          </span>
        )}
        {variant.status === 'LOSER' && (
          <span className="text-caption px-2 py-0.5 rounded-full bg-[var(--tint-red)] text-apple-red font-semibold">UNDERPERFORMER</span>
        )}
      </div>

      {/* Before / After comparison */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2 opacity-50">
          <p className="text-caption uppercase text-[var(--foreground-secondary)]/60 font-medium">Current</p>
          <p className="text-xs font-semibold text-[var(--foreground)]">{original.headline ?? '—'}</p>
          <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2">{original.primaryText ?? '—'}</p>
        </div>
        <div className="space-y-2">
          <p className="text-caption uppercase text-apple-blue/80 font-medium">Variant</p>
          <p className="text-xs font-semibold text-[var(--foreground)]">{variant.headline}</p>
          <p className="text-xs text-[var(--foreground-secondary)] line-clamp-2">{variant.primaryText}</p>
        </div>
      </div>

      {!isActioned && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onApprove(variant.id)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-apple-green bg-[var(--tint-green)] hover:bg-apple-green/20 px-3 py-2 rounded-lg transition-all ease-spring"
          >
            <Check className="h-3.5 w-3.5" />
            Approve
          </button>
          <button
            onClick={() => onReject(variant.id)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-apple-red bg-[var(--tint-red)] hover:bg-apple-red/20 px-3 py-2 rounded-lg transition-all ease-spring"
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </button>
        </div>
      )}

      {variant.status === 'APPROVED' && (
        <div className="pt-1">
          <button
            onClick={() => onActivate(variant.id)}
            disabled={activating}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-apple-purple bg-[var(--tint-purple)] hover:bg-apple-purple/20 px-3 py-2 rounded-lg transition-all ease-spring disabled:opacity-50"
          >
            {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            {activating ? 'Publishing...' : 'Activate in Meta'}
          </button>
        </div>
      )}
    </div>
  );
}

export function DiagnosisDetail({ diagnosis, onDismiss, onRefresh }: DiagnosisDetailProps) {
  const [variants, setVariants] = useState<AdVariant[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    detail?: string;
    confirmLabel: string;
    confirmColor: 'red' | 'green' | 'yellow' | 'blue';
  } | null>(null);

  const d = diagnosis;
  const ad = d.ad;

  const handleGenerate = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await apiFetch(`/api/autopilot/diagnoses/${d.id}/generate-copy`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? 'Failed to generate variants');
      } else {
        setVariants(data.variants ?? []);
      }
    } catch {
      setGenError('Network error');
    } finally {
      setGenerating(false);
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const res = await apiFetch(`/api/autopilot/diagnoses/${d.id}/dismiss`, { method: 'POST' });
      if (res.ok) {
        onDismiss(d.id);
      }
    } catch {
      // ignore
    } finally {
      setDismissing(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setApproveResult(null);
    try {
      const res = await apiFetch(`/api/autopilot/diagnoses/${d.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setApproveResult({ success: false, message: data.error ?? 'Failed to approve action' });
      } else {
        setApproveResult({ success: true, message: data.message ?? 'Action approved and executing via Meta API...' });
        // Refresh parent list after a short delay to show updated status
        setTimeout(() => onRefresh(), 2000);
      }
    } catch {
      setApproveResult({ success: false, message: 'Network error — could not reach the server' });
    } finally {
      setApproving(false);
    }
  };

  const requestApprove = () => {
    const sv = d.suggestedValue ?? {};

    switch (d.actionType) {
      case 'PAUSE_AD':
        setConfirmModal({
          title: `Pause "${ad.name}"?`,
          message: `This ad generated $${Number(ad.spend7d).toFixed(0)} spend with ${ad.roas7d != null ? Number(ad.roas7d).toFixed(2) + 'x ROAS' : 'unknown ROAS'} this week.`,
          detail: 'The ad will be paused immediately in Meta Ads Manager.',
          confirmLabel: 'Pause Ad',
          confirmColor: 'red',
        });
        break;
      case 'INCREASE_BUDGET':
        setConfirmModal({
          title: 'Increase Budget?',
          message: `Scale from $${sv.currentBudget ?? '?'}/day to $${sv.suggestedBudget ?? '?'}/day.`,
          detail: `Additional spend: +$${(Number(sv.suggestedBudget) || 0) - (Number(sv.currentBudget) || 0)}/day · +$${Math.round(((Number(sv.suggestedBudget) || 0) - (Number(sv.currentBudget) || 0)) * 30)}/mo.`,
          confirmLabel: 'Scale Budget',
          confirmColor: 'green',
        });
        break;
      case 'DECREASE_BUDGET':
        setConfirmModal({
          title: 'Decrease Budget?',
          message: 'Reduce budget to limit exposure on this underperforming ad.',
          confirmLabel: 'Reduce Budget',
          confirmColor: 'yellow',
        });
        break;
      case 'REACTIVATE_AD':
        setConfirmModal({
          title: `Reactivate "${ad.name}"?`,
          message: `This paused ad had ${(sv.previousRoas as number)?.toFixed(2) ?? '?'}x ROAS. It will be set to ACTIVE in Meta.`,
          confirmLabel: 'Reactivate',
          confirmColor: 'green',
        });
        break;
      default:
        handleApprove();
        break;
    }
  };

  const handleVariantAction = async (variantId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await apiFetch(`/api/autopilot/variants/${variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setVariants((prev) => prev.map((v) => v.id === variantId ? { ...v, status } : v));
      }
    } catch {
      // ignore
    }
  };

  const handleActivateVariant = async (variantId: string) => {
    setActivatingId(variantId);
    try {
      const res = await apiFetch(`/api/autopilot/variants/${variantId}/activate`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setVariants((prev) => prev.map((v) =>
          v.id === variantId
            ? { ...v, status: 'PUBLISHED' as const, metaAdId: data.metaAdId ?? null }
            : v
        ));
      }
    } catch {
      // ignore
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <SeverityBadge severity={d.severity} />
          <ExpiryCountdown expiresAt={d.expiresAt} />
          {d.confidence !== null && <ConfidenceBadge confidence={d.confidence} />}
        </div>
        <h2 className="text-lg font-bold tracking-tight text-[var(--foreground)]">{d.title}</h2>
        <p className="text-sm text-[var(--foreground-secondary)] mt-1">{d.message}</p>
      </div>

      {/* Ad Context */}
      <div className="glass-thin rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AdThumbnail
            thumbnailUrl={ad.thumbnailUrl}
            imageUrl={ad.imageUrl}
            name={ad.name}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--foreground)] truncate">{ad.name}</p>
            <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
              {ad.campaign.name} &rsaquo; {ad.adSet.name}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-caption px-1.5 py-0.5 rounded-lg font-medium ${
                ad.status === 'ACTIVE' ? 'text-apple-green bg-[var(--tint-green)]' : 'text-[var(--foreground-secondary)] bg-glass-hover'
              }`}>
                {ad.status}
              </span>
              <span className="text-caption text-[var(--foreground-secondary)]/60 uppercase">{ad.creativeType}</span>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <MetricPill label="Spend (7d)" value={`$${Number(ad.spend7d).toFixed(0)}`} />
          <MetricPill label="ROAS" value={ad.roas7d != null ? `${Number(ad.roas7d).toFixed(2)}x` : '—'} />
          <MetricPill label="CTR" value={ad.ctr7d != null ? `${(Number(ad.ctr7d) * 100).toFixed(2)}%` : '—'} />
          <MetricPill label="Freq" value={ad.frequency7d != null ? `${Number(ad.frequency7d).toFixed(1)}x` : '—'} />
        </div>
      </div>

      {/* AI Analysis — multi-level recommendations */}
      <AIInsightCard diagnosisId={d.id} />

      {/* Recommended Action */}
      <div className="glass-thin rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <ActionIcon actionType={d.actionType} />
          <p className="text-xs uppercase font-semibold text-[var(--foreground-secondary)]">Recommended Action</p>
        </div>
        <p className="text-sm text-[var(--foreground)]">{actionDescription(d)}</p>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4">
          {d.actionType === 'GENERATE_COPY_VARIANTS' && d.status === 'PENDING' && variants.length === 0 && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 text-xs font-medium text-apple-purple bg-[var(--tint-purple)] hover:bg-apple-purple/20 px-4 py-2 rounded-xl transition-all ease-spring disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generating ? 'Generating...' : 'Generate Copy Variants'}
            </button>
          )}

          {d.actionType === 'PAUSE_AD' && d.status === 'PENDING' && !approveResult?.success && (
            <button
              onClick={requestApprove}
              disabled={approving}
              className="flex items-center gap-1.5 text-xs font-medium text-apple-red bg-[var(--tint-red)] hover:bg-apple-red/20 px-4 py-2 rounded-xl transition-all ease-spring disabled:opacity-50"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
              {approving ? 'Pausing...' : 'Pause Ad'}
            </button>
          )}

          {d.actionType === 'REACTIVATE_AD' && d.status === 'PENDING' && !approveResult?.success && (
            <button
              onClick={requestApprove}
              disabled={approving}
              className="flex items-center gap-1.5 text-xs font-medium text-apple-green bg-[var(--tint-green)] hover:bg-apple-green/20 px-4 py-2 rounded-xl transition-all ease-spring disabled:opacity-50"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {approving ? 'Reactivating...' : 'Reactivate Ad'}
            </button>
          )}

          {d.actionType === 'INCREASE_BUDGET' && d.status === 'PENDING' && !approveResult?.success && (
            <button
              onClick={requestApprove}
              disabled={approving}
              className="flex items-center gap-1.5 text-xs font-medium text-apple-green bg-[var(--tint-green)] hover:bg-apple-green/20 px-4 py-2 rounded-xl transition-all ease-spring disabled:opacity-50"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
              {approving ? 'Scaling...' : `Scale Budget to $${(d.suggestedValue?.suggestedBudget as number) ?? '?'}/day`}
            </button>
          )}

          {d.actionType === 'DECREASE_BUDGET' && d.status === 'PENDING' && !approveResult?.success && (
            <button
              onClick={requestApprove}
              disabled={approving}
              className="flex items-center gap-1.5 text-xs font-medium text-apple-yellow bg-[var(--tint-yellow)] hover:bg-apple-yellow/20 px-4 py-2 rounded-xl transition-all ease-spring disabled:opacity-50"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {approving ? 'Reducing...' : 'Reduce Budget'}
            </button>
          )}

          {d.status === 'PENDING' && (
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] bg-glass-hover hover:bg-glass-active-strong px-4 py-2 rounded-xl transition-all ease-spring disabled:opacity-50"
            >
              {dismissing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Dismiss
            </button>
          )}
        </div>

        {genError && (
          <p className="text-xs text-apple-red mt-2">{genError}</p>
        )}

        {approveResult && (
          <div className={`flex items-center gap-2 mt-3 px-3 py-2 rounded-lg text-xs font-medium ${
            approveResult.success
              ? 'text-apple-green bg-[var(--tint-green)]'
              : 'text-apple-red bg-[var(--tint-red)]'
          }`}>
            {approveResult.success
              ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
            {approveResult.message}
          </div>
        )}

        {d.status === 'APPROVED' && (
          <ExecutionStatus
            diagnosisId={d.id}
            status={d.status}
            initialError={
              (d.executionResult as Record<string, unknown> | null)?.error as string | undefined
            }
            onExecuted={onRefresh}
          />
        )}
      </div>

      {/* Copy Variants */}
      {variants.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-apple-purple" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Generated Variants</h3>
          </div>
          {variants.map((v) => (
            <CopyVariantCard
              key={v.id}
              variant={v}
              original={{
                headline: null,
                primaryText: null,
                description: null,
              }}
              onApprove={(id) => handleVariantAction(id, 'APPROVED')}
              onReject={(id) => handleVariantAction(id, 'REJECTED')}
              onActivate={handleActivateVariant}
              activating={activatingId === v.id}
            />
          ))}

          {/* Variant Performance Comparison */}
          {variants.filter((v) => ['PUBLISHED', 'WINNER', 'LOSER'].includes(v.status)).map((v) => (
            <VariantPerformance
              key={`perf-${v.id}`}
              variant={{
                status: v.status,
                spend: v.spend ?? null,
                impressions: v.impressions ?? null,
                clicks: v.clicks ?? null,
                conversions: v.conversions ?? null,
                revenue: v.revenue ?? null,
              }}
              original={{
                spend7d: Number(ad.spend7d),
                roas7d: ad.roas7d !== null ? Number(ad.roas7d) : null,
                ctr7d: ad.ctr7d !== null ? Number(ad.ctr7d) : null,
                conversions7d: 0,
              }}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}
