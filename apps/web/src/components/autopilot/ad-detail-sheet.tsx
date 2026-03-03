'use client';

import { useEffect, useCallback } from 'react';
import { X, ExternalLink, AlertTriangle, CheckCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AdThumbnail } from './ad-thumbnail';
import { SeverityBadge } from './severity-badge';
import { METRIC_LABELS } from './human-labels';
import type { MetaAdWithTrends, Diagnosis, CampaignHealthScore, MetricKey } from './types';

interface AdDetailSheetProps {
  ad: MetaAdWithTrends | null;
  diagnoses: Diagnosis[];
  campaignHealth?: CampaignHealthScore | null;
  onClose: () => void;
  onActionClick?: (diagnosisId: string) => void;
}

function MetricRow({ metricKey, value }: { metricKey: MetricKey; value: number | null }): JSX.Element | null {
  if (value == null) return null;
  const metric = METRIC_LABELS[metricKey];
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--glass-border)] last:border-0">
      <div>
        <p className="text-sm text-[var(--foreground)]">{metric.label}</p>
        <p className="text-caption text-[var(--foreground-secondary)]">{metric.tooltip}</p>
      </div>
      <p className="text-sm font-semibold text-[var(--foreground)]">
        {metric.format(value)}
      </p>
    </div>
  );
}

function healthGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-apple-green bg-[var(--tint-green)]';
    case 'B': return 'text-apple-blue bg-[var(--tint-blue)]';
    case 'C': return 'text-apple-yellow bg-[var(--tint-yellow)]';
    case 'D': return 'text-apple-orange bg-apple-orange/[0.18]';
    case 'F': return 'text-apple-red bg-[var(--tint-red)]';
    default: return 'text-[var(--foreground-secondary)] bg-glass-hover';
  }
}

export function AdDetailSheet({ ad, diagnoses, campaignHealth, onClose, onActionClick }: AdDetailSheetProps): JSX.Element {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (ad) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [ad, handleKeyDown]);

  return (
    <AnimatePresence>
      {ad && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-0 right-0 z-[91] h-full w-full max-w-[480px] bg-[var(--surface)] border-l border-[var(--glass-border)] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--glass-border)]">
              <h2 className="text-lg font-semibold text-[var(--foreground)] truncate pr-4">{ad.name}</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-glass-hover transition-colors press-scale shrink-0"
              >
                <X className="h-4 w-4 text-[var(--foreground-secondary)]" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Creative Preview */}
              <div className="flex items-start gap-4">
                <AdThumbnail
                  thumbnailUrl={ad.thumbnailUrl}
                  imageUrl={ad.imageUrl}
                  name={ad.name}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)]">{ad.name}</p>
                  <p className="text-xs text-[var(--foreground-secondary)] mt-0.5">
                    {ad.campaign.name}
                  </p>
                  <p className="text-xs text-[var(--foreground-secondary)]">
                    {ad.adSet.name}
                  </p>
                  <div className="mt-2">
                    <span className={`text-caption px-1.5 py-0.5 rounded font-medium ${
                      ad.status === 'ACTIVE'
                        ? 'text-apple-green bg-[var(--tint-green)]'
                        : 'text-[var(--foreground-secondary)] bg-glass-hover'
                    }`}>
                      {ad.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <section>
                <h3 className="text-xs font-semibold uppercase text-[var(--foreground-secondary)]/60 mb-2">
                  Last 7 Days
                </h3>
                <div className="card p-4">
                  <MetricRow metricKey="spend" value={ad.spend7d} />
                  <MetricRow metricKey="revenue" value={ad.revenue7d} />
                  <MetricRow metricKey="roas" value={ad.roas7d} />
                  <MetricRow metricKey="ctr" value={ad.ctr7d != null ? Number(ad.ctr7d) * 100 : null} />
                  <MetricRow metricKey="cpc" value={ad.cpc7d} />
                  <MetricRow metricKey="frequency" value={ad.frequency7d} />
                  <MetricRow metricKey="conversions" value={ad.conversions7d} />
                </div>
              </section>

              {/* Campaign Health */}
              {campaignHealth && (
                <section>
                  <h3 className="text-xs font-semibold uppercase text-[var(--foreground-secondary)]/60 mb-2">
                    Campaign Health
                  </h3>
                  <div className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-[var(--foreground)]">{campaignHealth.campaignName}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${healthGradeColor(campaignHealth.grade)}`}>
                        {campaignHealth.grade}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--foreground-secondary)]">
                      <span>Score: {campaignHealth.overallScore}/100</span>
                      <span className={`capitalize ${
                        campaignHealth.trend === 'improving' ? 'text-apple-green' :
                        campaignHealth.trend === 'declining' ? 'text-apple-red' :
                        'text-[var(--foreground-secondary)]'
                      }`}>
                        {campaignHealth.trend}
                      </span>
                    </div>
                    {campaignHealth.topIssue && (
                      <p className="text-xs text-apple-yellow mt-2">
                        {campaignHealth.topIssue}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Related Actions */}
              {diagnoses.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase text-[var(--foreground-secondary)]/60 mb-2">
                    Actions for this ad ({diagnoses.length})
                  </h3>
                  <div className="space-y-2">
                    {diagnoses.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => onActionClick?.(d.id)}
                        className="card p-3 w-full text-left hover:bg-glass-muted transition-colors press-scale"
                      >
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={d.severity} />
                          <p className="text-sm text-[var(--foreground)] flex-1 truncate">{d.title}</p>
                          <ExternalLink className="h-3 w-3 text-[var(--foreground-secondary)] shrink-0" />
                        </div>
                        <p className="text-caption text-[var(--foreground-secondary)] mt-1 truncate">{d.message}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* No actions — all clear */}
              {diagnoses.length === 0 && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--tint-green)] border border-apple-green/20">
                  <CheckCircle className="h-4 w-4 text-apple-green shrink-0" />
                  <p className="text-sm text-apple-green">
                    This ad is performing well. No actions needed.
                  </p>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
