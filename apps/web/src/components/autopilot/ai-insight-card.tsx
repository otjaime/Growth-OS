'use client';

import { useState, useEffect, useRef } from 'react';
import { Brain, Megaphone, Target, BarChart3, DollarSign, Loader2, AlertTriangle } from 'lucide-react';
import type { DiagnosisInsight, InsightRecommendation } from './types';
import { apiFetch } from '@/lib/api';

interface AIInsightCardProps {
  diagnosisId: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'text-apple-red bg-[var(--tint-red)]',
  medium: 'text-apple-yellow bg-[var(--tint-yellow)]',
  low: 'text-apple-blue bg-[var(--tint-blue)]',
};

function PriorityPill({ priority }: { priority: string }) {
  return (
    <span className={`text-caption px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wide ${PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium}`}>
      {priority}
    </span>
  );
}

function RecommendationRow({
  icon,
  label,
  rec,
}: {
  icon: React.ReactNode;
  label: string;
  rec: InsightRecommendation;
}) {
  return (
    <div className="flex gap-3 py-3 border-b border-separator last:border-b-0">
      <div className="flex-shrink-0 mt-0.5 text-[var(--foreground-secondary)]/60">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-caption uppercase font-semibold text-[var(--foreground-secondary)]/60 tracking-wide">{label}</p>
          <PriorityPill priority={rec.priority} />
        </div>
        <p className="text-sm font-semibold text-[var(--foreground)]">{rec.action}</p>
        <p className="text-xs text-[var(--foreground-secondary)] mt-0.5 leading-relaxed">{rec.detail}</p>
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="glass-thin rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded skeleton-shimmer" />
        <div className="h-3 w-32 rounded skeleton-shimmer" />
      </div>
      <div className="h-10 rounded skeleton-shimmer" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3 py-3">
          <div className="h-4 w-4 rounded skeleton-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-2 w-16 rounded skeleton-shimmer" />
            <div className="h-3 w-48 rounded skeleton-shimmer" />
            <div className="h-2 w-64 rounded skeleton-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AIInsightCard({ diagnosisId }: AIInsightCardProps) {
  const [insight, setInsight] = useState<DiagnosisInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    // Prevent double-fetch for the same diagnosis
    if (fetchedRef.current === diagnosisId) return;
    fetchedRef.current = diagnosisId;

    setLoading(true);
    setError(null);
    setInsight(null);

    apiFetch(`/api/autopilot/diagnoses/${diagnosisId}/analyze`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to generate analysis');
        } else {
          setInsight(data.insight as DiagnosisInsight);
        }
      })
      .catch(() => {
        setError('Network error — could not reach the analysis service');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [diagnosisId]);

  if (loading) return <SkeletonLoader />;

  if (error) {
    return (
      <div className="glass-thin rounded-xl p-4">
        <div className="flex items-center gap-2 text-apple-yellow">
          <AlertTriangle className="h-4 w-4" />
          <p className="text-xs font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!insight) return null;

  return (
    <div className="glass-thin rounded-xl p-4 space-y-1">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 text-apple-purple" />
        <p className="text-xs uppercase font-semibold text-[var(--foreground-secondary)]">AI Analysis</p>
      </div>

      {/* Root Cause */}
      <div className="rounded-xl bg-glass-muted px-3 py-2.5 mb-3">
        <p className="text-caption uppercase font-semibold text-apple-purple/80 mb-1">Root Cause</p>
        <p className="text-sm text-[var(--foreground)] leading-relaxed">{insight.rootCause}</p>
      </div>

      {/* Three-level recommendations */}
      <RecommendationRow
        icon={<Megaphone className="h-4 w-4" />}
        label="Ad-Level"
        rec={insight.adRecommendation}
      />
      <RecommendationRow
        icon={<Target className="h-4 w-4" />}
        label="Ad Set"
        rec={insight.adSetRecommendation}
      />
      <RecommendationRow
        icon={<BarChart3 className="h-4 w-4" />}
        label="Campaign"
        rec={insight.campaignRecommendation}
      />

      {/* Estimated Impact */}
      <div className="flex items-center gap-2 pt-3 mt-1 border-t border-separator-strong">
        <DollarSign className="h-4 w-4 text-apple-green" />
        <p className="text-sm font-semibold text-apple-green">{insight.estimatedImpact}</p>
      </div>
    </div>
  );
}
