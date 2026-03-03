'use client';

import { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, Minus, Loader2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { CampaignHealthScore } from './types';
import { GlassSurface } from '@/components/ui/glass-surface';

function gradeColor(grade: CampaignHealthScore['grade']): string {
  switch (grade) {
    case 'A': return 'text-apple-green bg-[var(--tint-green)]';
    case 'B': return 'text-apple-blue bg-[var(--tint-blue)]';
    case 'C': return 'text-apple-yellow bg-[var(--tint-yellow)]';
    case 'D': return 'text-apple-orange bg-apple-orange/[0.18]';
    case 'F': return 'text-apple-red bg-[var(--tint-red)]';
    default: return 'text-[var(--foreground-secondary)] bg-glass-hover';
  }
}

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.8) return 'bg-apple-green';
  if (pct >= 0.6) return 'bg-apple-blue';
  if (pct >= 0.4) return 'bg-apple-yellow';
  if (pct >= 0.2) return 'bg-apple-orange';
  return 'bg-apple-red';
}

function TrendIndicator({ trend }: { trend: CampaignHealthScore['trend'] }) {
  switch (trend) {
    case 'improving':
      return (
        <span className="inline-flex items-center gap-0.5 text-caption font-medium text-apple-green">
          <TrendingUp className="h-3 w-3" /> Improving
        </span>
      );
    case 'declining':
      return (
        <span className="inline-flex items-center gap-0.5 text-caption font-medium text-apple-red">
          <TrendingDown className="h-3 w-3" /> Declining
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-0.5 text-caption font-medium text-[var(--foreground-secondary)]">
          <Minus className="h-3 w-3" /> Stable
        </span>
      );
  }
}

function ComponentBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-caption text-[var(--foreground-secondary)] w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-glass-hover overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ease-spring ${scoreColor(score, max)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-caption font-medium text-[var(--foreground-secondary)] w-8 text-right">
        {score.toFixed(0)}
      </span>
    </div>
  );
}

export function CampaignHealthView() {
  const [campaigns, setCampaigns] = useState<CampaignHealthScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/autopilot/campaigns/health')
      .then((r) => {
        if (!r.ok) throw new Error(`API returned ${r.status}`);
        return r.json();
      })
      .then((json: { campaigns: CampaignHealthScore[] }) => {
        setCampaigns(json.campaigns ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 skeleton-shimmer" />
              <div className="h-10 w-10 rounded-lg skeleton-shimmer" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-2 skeleton-shimmer" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-16">
        <Activity className="h-12 w-12 text-[var(--foreground-secondary)]/20 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Campaign Health Unavailable</h2>
        <p className="text-sm text-[var(--foreground-secondary)]">{error}</p>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="card text-center py-16">
        <Activity className="h-12 w-12 text-[var(--foreground-secondary)]/20 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">No Campaigns</h2>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Sync Meta Ads data to see campaign health scores.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {campaigns.map((c) => (
        <GlassSurface key={c.campaignId} className="card p-4" intensity="subtle">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-sm font-semibold text-[var(--foreground)] truncate">{c.campaignName}</p>
              <TrendIndicator trend={c.trend} />
            </div>

            {/* Score + Grade */}
            <div className="text-center shrink-0">
              <p className="text-3xl font-bold text-[var(--foreground)] leading-none">{c.overallScore}</p>
              <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded mt-1 ${gradeColor(c.grade)}`}>
                {c.grade}
              </span>
            </div>
          </div>

          {/* Component Bars */}
          <div className="space-y-2 mb-3">
            <ComponentBar label="ROAS" score={c.components.roasScore} max={25} />
            <ComponentBar label="Efficiency" score={c.components.efficiencyScore} max={25} />
            <ComponentBar label="Scale" score={c.components.scaleScore} max={25} />
            <ComponentBar label="Stability" score={c.components.stabilityScore} max={25} />
          </div>

          {/* Top Issue */}
          {c.topIssue && (
            <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-[var(--glass-border)]">
              <AlertTriangle className="h-3 w-3 text-apple-red mt-0.5 shrink-0" />
              <p className="text-label text-apple-red leading-relaxed">{c.topIssue}</p>
            </div>
          )}
        </GlassSurface>
      ))}
    </div>
  );
}
