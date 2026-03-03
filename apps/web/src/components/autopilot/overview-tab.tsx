'use client';

import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, AlertTriangle, TrendingUp, ArrowRight, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '@/lib/api';
import { ActionCard } from './action-card';
import type { Diagnosis, DiagnosisStats, AutopilotStats, CampaignHealthScore, AutopilotTab } from './types';

interface OverviewTabProps {
  diagnoses: Diagnosis[];
  stats: DiagnosisStats | null;
  autopilotStats: AutopilotStats | null;
  campaignHealth: CampaignHealthScore[];
  onDismiss: (id: string) => void;
  onRefresh: () => void;
  onNavigate: (tab: AutopilotTab) => void;
}

// ── Impact Data ─────────────────────────────────────────────

interface ImpactData {
  actionsTaken7d: number;
  actionsTaken30d: number;
  budgetSaved7d: number;
  budgetReallocated7d: number;
  autoVsManual: { auto: number; manual: number };
}

function formatCurrency(num: number): string {
  return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// ── Grade Color ─────────────────────────────────────────────

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-apple-green bg-[var(--tint-green)]';
    case 'B': return 'text-apple-blue bg-[var(--tint-blue)]';
    case 'C': return 'text-apple-yellow bg-[var(--tint-yellow)]';
    case 'D': return 'text-apple-orange bg-[var(--tint-orange)]';
    case 'F': return 'text-apple-red bg-[var(--tint-red)]';
    default: return 'text-[var(--foreground-secondary)] bg-glass-hover';
  }
}

function trendLabel(trend: string): { label: string; color: string } {
  switch (trend) {
    case 'improving': return { label: 'Improving', color: 'text-apple-green' };
    case 'declining': return { label: 'Declining', color: 'text-apple-red' };
    default: return { label: 'Stable', color: 'text-[var(--foreground-secondary)]' };
  }
}

// ── Overview Tab ─────────────────────────────────────────────

export function OverviewTab({
  diagnoses,
  stats,
  autopilotStats,
  campaignHealth,
  onDismiss,
  onRefresh,
  onNavigate,
}: OverviewTabProps): JSX.Element {
  const [impact, setImpact] = useState<ImpactData | null>(null);
  const [impactLoading, setImpactLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/autopilot/impact')
      .then((res) => (res.ok ? res.json() : null))
      .then((json: ImpactData | null) => {
        if (!cancelled) setImpact(json);
      })
      .catch(() => { /* non-critical */ })
      .finally(() => { if (!cancelled) setImpactLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Top 3 priority actions (CRITICAL first, then WARNING, by spend desc)
  const priorityActions = useMemo(() => {
    const pending = diagnoses.filter((d) => d.status === 'PENDING' && d.actionType !== 'NONE');
    const severityOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return pending
      .sort((a, b) => {
        const sv = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
        if (sv !== 0) return sv;
        return b.ad.spend7d - a.ad.spend7d;
      })
      .slice(0, 3);
  }, [diagnoses]);

  const total = stats?.total ?? 0;
  const critical = stats?.critical ?? 0;

  return (
    <div className="space-y-6">
      {/* ═══ Section 1: Impact Narrative ═══════════════════════ */}
      {!impactLoading && impact && impact.actionsTaken30d > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="card px-5 py-4"
        >
          <p className="text-sm font-semibold text-[var(--foreground)] mb-2">
            This week, Copilot helped you:
          </p>
          <div className="space-y-1.5">
            {impact.budgetSaved7d > 0 && (
              <div className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)]">
                <span className="w-5 h-5 rounded-full bg-[var(--tint-green)] flex items-center justify-center shrink-0">
                  <CheckCircle className="h-3 w-3 text-apple-green" />
                </span>
                Save <span className="font-semibold text-[var(--foreground)]">{formatCurrency(impact.budgetSaved7d)}</span> by pausing underperforming ads
              </div>
            )}
            {impact.budgetReallocated7d > 0 && (
              <div className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)]">
                <span className="w-5 h-5 rounded-full bg-[var(--tint-blue)] flex items-center justify-center shrink-0">
                  <TrendingUp className="h-3 w-3 text-apple-blue" />
                </span>
                Move <span className="font-semibold text-[var(--foreground)]">{formatCurrency(impact.budgetReallocated7d)}</span> to your best-performing campaigns
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)]">
              <span className="w-5 h-5 rounded-full bg-[var(--tint-purple)] flex items-center justify-center shrink-0">
                <Zap className="h-3 w-3 text-apple-purple" />
              </span>
              <span className="font-semibold text-[var(--foreground)]">{impact.actionsTaken7d}</span> actions taken this week
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ Section 2: Priority Actions ══════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {total > 0
              ? `${critical > 0 ? `${critical} urgent, ` : ''}${total} action${total !== 1 ? 's' : ''} to review`
              : 'No actions needed'}
          </h2>
          {total > 3 && (
            <button
              onClick={() => onNavigate('actions')}
              className="flex items-center gap-1 text-xs font-medium text-apple-blue hover:text-apple-blue/80 press-scale transition-colors"
            >
              View all {total}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>

        {priorityActions.length > 0 ? (
          <div className="space-y-2">
            {priorityActions.map((d, i) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, delay: i * 0.05 }}
              >
                <ActionCard
                  diagnosis={d}
                  onDismiss={onDismiss}
                  onRefresh={onRefresh}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="card px-5 py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[var(--tint-green)] flex items-center justify-center mx-auto mb-2">
              <CheckCircle className="h-5 w-5 text-apple-green" />
            </div>
            <p className="text-sm font-medium text-[var(--foreground)]">All clear!</p>
            <p className="text-caption text-[var(--foreground-secondary)] mt-1">
              Your ads are performing well. We&apos;ll let you know if anything changes.
            </p>
          </div>
        )}
      </div>

      {/* ═══ Section 3: Campaign Health Strip ═════════════════ */}
      {campaignHealth.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Campaign Health</h2>
            <button
              onClick={() => onNavigate('ads')}
              className="flex items-center gap-1 text-xs font-medium text-apple-blue hover:text-apple-blue/80 press-scale transition-colors"
            >
              View all ads
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {campaignHealth
              .sort((a, b) => a.overallScore - b.overallScore) // worst first
              .slice(0, 6)
              .map((c) => {
                const t = trendLabel(c.trend);
                return (
                  <div
                    key={c.campaignId}
                    className="card px-3 py-2.5 shrink-0 min-w-[160px] max-w-[200px]"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-[var(--foreground)] truncate flex-1 mr-2">{c.campaignName}</p>
                      <span className={`text-caption font-bold px-1.5 py-0.5 rounded ${gradeColor(c.grade)}`}>
                        {c.grade}
                      </span>
                    </div>
                    <p className={`text-caption ${t.color}`}>{t.label}</p>
                    {c.topIssue && (
                      <div className="flex items-start gap-1 mt-1.5">
                        <AlertTriangle className="h-3 w-3 text-apple-yellow shrink-0 mt-0.5" />
                        <p className="text-caption text-[var(--foreground-secondary)] line-clamp-1">{c.topIssue}</p>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ═══ Section 4: Quick Stats ═══════════════════════════ */}
      {autopilotStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card px-3 py-2.5 text-center">
            <p className="text-caption text-[var(--foreground-secondary)]">Active ads</p>
            <p className="text-lg font-bold text-[var(--foreground)]">{autopilotStats.activeAds}</p>
          </div>
          <div className="card px-3 py-2.5 text-center">
            <p className="text-caption text-[var(--foreground-secondary)]">Spent this week</p>
            <p className="text-lg font-bold text-[var(--foreground)]">{formatCurrency(autopilotStats.metrics7d.totalSpend)}</p>
          </div>
          <div className="card px-3 py-2.5 text-center">
            <p className="text-caption text-[var(--foreground-secondary)]">Revenue</p>
            <p className="text-lg font-bold text-[var(--foreground)]">{formatCurrency(autopilotStats.metrics7d.totalRevenue)}</p>
          </div>
          <div className="card px-3 py-2.5 text-center">
            <p className="text-caption text-[var(--foreground-secondary)]">Return</p>
            <p className="text-lg font-bold text-[var(--foreground)]">
              {autopilotStats.metrics7d.blendedRoas != null
                ? `${autopilotStats.metrics7d.blendedRoas.toFixed(2)}x`
                : '—'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
