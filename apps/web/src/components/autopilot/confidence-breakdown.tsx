'use client';

import type { JSX } from 'react';

interface ConfidenceBreakdownProps {
  confidence: number | null;
  suggestedValue: Record<string, unknown> | null;
}

interface AdjustmentItem {
  label: string;
  delta: number;
}

/** Map enrichment flags to their confidence adjustments (mirrors run-diagnosis.ts) */
function extractAdjustments(sv: Record<string, unknown>): readonly AdjustmentItem[] {
  const items: AdjustmentItem[] = [];

  // Phase 1.1: Anomaly detection
  if (sv.anomalyDetected === true) {
    items.push({ label: 'Anomaly detected', delta: 10 });
  } else if (sv.anomalyDetected === false) {
    items.push({ label: 'Within normal variance', delta: -5 });
  }

  // Phase 1.3: Creative decay
  const decay = sv.decayAnalysis as Record<string, unknown> | undefined;
  if (decay) {
    const rec = decay.recommendation as string;
    if (rec === 'replace_now') items.push({ label: 'Creative needs replacement', delta: 15 });
    else if (rec === 'accelerating_decay') items.push({ label: 'Creative fatigue accelerating', delta: 10 });
    else if (rec === 'healthy') items.push({ label: 'Creative still healthy', delta: -15 });
  }

  // Phase 1.2: Portfolio disagreement
  if (sv.portfolioDisagreement === true) {
    items.push({ label: 'Portfolio optimizer disagrees', delta: -20 });
  }

  // Phase 2.2: Funnel validation
  if (sv.funnelConfirmed === true) {
    items.push({ label: 'Funnel confirms issue', delta: 10 });
  }

  // Phase 2.3: Unit economics guard
  if (sv.unitEconWarning === true) {
    items.push({ label: 'CAC near affordable limit', delta: -20 });
  }

  // Phase 2.4: Cohort LTV override
  if (sv.ltvOverride === true) {
    items.push({ label: 'High customer lifetime value', delta: -15 });
  }

  // Phase 2.5: Cross-channel warning
  if (sv.crossChannelWarning === true) {
    items.push({ label: 'Channel concentration risk', delta: -10 });
  }

  // Phase 3.4: Campaign health
  if (sv.campaignHealthWarning === true) {
    items.push({ label: 'Poor campaign health', delta: -25 });
  }
  const ch = sv.campaignHealth as Record<string, unknown> | undefined;
  if (ch?.grade === 'A' && !sv.campaignHealthWarning) {
    items.push({ label: 'Top campaign health', delta: 5 });
  }

  // Phase 4.3: Suggestion feedback
  if (sv.suggestionFeedbackBoost === true) {
    items.push({ label: 'Users approve similar suggestions', delta: 5 });
  }
  if (sv.suggestionFeedbackPenalty === true) {
    items.push({ label: 'Users reject similar suggestions', delta: -10 });
  }

  // Phase 5: Forecast
  if (sv.forecastWarning === true) {
    items.push({ label: 'Revenue forecast declining', delta: -15 });
  }
  if (sv.forecastBoost === true) {
    items.push({ label: 'Revenue forecast growing', delta: 5 });
  }

  return items;
}

function barColor(confidence: number): string {
  if (confidence >= 80) return 'bg-apple-green';
  if (confidence >= 50) return 'bg-apple-yellow';
  return 'bg-apple-red';
}

function barTrackColor(confidence: number): string {
  if (confidence >= 80) return 'bg-apple-green/15';
  if (confidence >= 50) return 'bg-apple-yellow/15';
  return 'bg-apple-red/15';
}

export function ConfidenceBreakdown({ confidence, suggestedValue }: ConfidenceBreakdownProps): JSX.Element | null {
  if (confidence == null) return null;

  const adjustments = suggestedValue ? extractAdjustments(suggestedValue) : [];
  const clamped = Math.max(0, Math.min(100, confidence));

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="flex items-center gap-2">
        <span className="text-caption font-medium text-[var(--foreground-secondary)] shrink-0">
          Confidence
        </span>
        <div className={`flex-1 h-1.5 rounded-full ${barTrackColor(clamped)} overflow-hidden`}>
          <div
            className={`h-full rounded-full ${barColor(clamped)} transition-all duration-500`}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <span className="text-caption font-semibold text-[var(--foreground)] tabular-nums shrink-0">
          {Math.round(clamped)}%
        </span>
      </div>

      {/* Adjustment items */}
      {adjustments.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {adjustments.map((adj) => (
            <span
              key={adj.label}
              className={`text-caption inline-flex items-center gap-0.5 ${
                adj.delta > 0 ? 'text-apple-green' : 'text-apple-red'
              }`}
            >
              {adj.delta > 0 ? '↑' : '↓'} {adj.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
