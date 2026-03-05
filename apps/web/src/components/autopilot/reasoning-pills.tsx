'use client';

import {
  TrendingUp, TrendingDown, Zap, Filter, DollarSign,
  Users, Layers, AlertTriangle, BarChart3, RefreshCw, Calendar,
} from 'lucide-react';
import type { JSX, ReactNode } from 'react';

interface ReasoningPillsProps {
  suggestedValue: Record<string, unknown> | null;
}

interface PillConfig {
  label: string;
  text: string;
  icon: ReactNode;
  color: 'green' | 'red' | 'yellow' | 'blue';
}

const COLOR_CLASSES: Record<string, { text: string; bg: string; icon: string }> = {
  green: {
    text: 'text-apple-green',
    bg: 'bg-[var(--tint-green)]',
    icon: 'text-apple-green',
  },
  red: {
    text: 'text-apple-red',
    bg: 'bg-[var(--tint-red)]',
    icon: 'text-apple-red',
  },
  yellow: {
    text: 'text-apple-yellow',
    bg: 'bg-[var(--tint-yellow)]',
    icon: 'text-apple-yellow',
  },
  blue: {
    text: 'text-apple-blue',
    bg: 'bg-[var(--tint-blue)]',
    icon: 'text-apple-blue',
  },
};

function extractPills(sv: Record<string, unknown>): readonly PillConfig[] {
  const pills: PillConfig[] = [];

  // Forecast context
  const fc = sv.forecastContext as Record<string, unknown> | undefined;
  if (fc) {
    const trend = fc.trend as string;
    const pct = typeof fc.forecastVsActualPct === 'number'
      ? Math.abs(Math.round(fc.forecastVsActualPct))
      : null;

    if (trend === 'growing') {
      pills.push({
        label: 'Forecast',
        text: `Revenue trending up${pct ? ` ${pct}%` : ''} — good time to scale`,
        icon: <TrendingUp className="h-3 w-3" />,
        color: 'green',
      });
    } else if (trend === 'declining') {
      pills.push({
        label: 'Forecast',
        text: `Revenue declining${pct ? ` ${pct}%` : ''} — risky to scale now`,
        icon: <TrendingDown className="h-3 w-3" />,
        color: 'red',
      });
    }
  }

  // Anomaly detection
  if (sv.anomalyDetected === true) {
    const anomalies = sv.anomalies as Array<{ metric: string; zScore: number; direction: string }> | undefined;
    const top = anomalies?.[0];
    const detail = top
      ? `Unusual ${top.direction === 'down' ? 'drop' : 'spike'} in ${top.metric.toUpperCase()} (z-score: ${top.zScore.toFixed(1)})`
      : 'Statistical anomaly detected in ad metrics';
    pills.push({
      label: 'Anomaly',
      text: detail,
      icon: <Zap className="h-3 w-3" />,
      color: 'yellow',
    });
  }

  // Funnel validation
  if (sv.funnelConfirmed === true) {
    const bottleneck = sv.funnelBottleneck as string | undefined;
    const atcRate = sv.atcToCheckout as number | undefined;
    const detail = bottleneck
      ? `Funnel confirms: ${atcRate != null ? `${atcRate.toFixed(0)}%` : ''} drop at ${bottleneck}`
      : 'Funnel data confirms post-click issue';
    pills.push({
      label: 'Funnel',
      text: detail,
      icon: <Filter className="h-3 w-3" />,
      color: 'blue',
    });
  }

  // Unit economics warning
  if (sv.unitEconWarning === true) {
    const ctx = sv.unitEconContext as Record<string, number> | undefined;
    const detail = ctx
      ? `CAC ($${ctx.metaCac?.toFixed(0)}) near max affordable ($${ctx.maxAffordableCac?.toFixed(0)})`
      : 'Customer acquisition cost approaching limit';
    pills.push({
      label: 'Unit Economics',
      text: detail,
      icon: <DollarSign className="h-3 w-3" />,
      color: 'red',
    });
  }

  // LTV override
  if (sv.ltvOverride === true) {
    const ctx = sv.ltvContext as Record<string, number> | undefined;
    const detail = ctx
      ? `High LTV:CAC ratio (${ctx.ltvCacRatio?.toFixed(1)}x) — customers valuable long-term`
      : 'Customer lifetime value justifies continued spend';
    pills.push({
      label: 'LTV',
      text: detail,
      icon: <Users className="h-3 w-3" />,
      color: 'green',
    });
  }

  // Cross-channel warning
  if (sv.crossChannelWarning === true) {
    const ctx = sv.crossChannelNote as Record<string, unknown> | undefined;
    const share = typeof ctx?.metaSpendShare === 'number' ? Math.round(ctx.metaSpendShare) : null;
    const best = ctx?.bestChannel as string | undefined;
    const detail = share
      ? `Meta already ${share}% of spend${best ? ` — ${best} performs better` : ''}`
      : 'Consider diversifying across channels';
    pills.push({
      label: 'Channel Mix',
      text: detail,
      icon: <Layers className="h-3 w-3" />,
      color: 'yellow',
    });
  }

  // Campaign health warning
  if (sv.campaignHealthWarning === true) {
    const ctx = sv.campaignHealth as Record<string, unknown> | undefined;
    const grade = ctx?.grade as string | undefined;
    const detail = grade
      ? `Campaign graded ${grade} — risky to increase budget`
      : 'Campaign health is poor';
    pills.push({
      label: 'Campaign',
      text: detail,
      icon: <AlertTriangle className="h-3 w-3" />,
      color: 'red',
    });
  }

  // Portfolio disagreement
  if (sv.portfolioDisagreement === true) {
    pills.push({
      label: 'Portfolio',
      text: 'Budget optimizer disagrees with this change',
      icon: <BarChart3 className="h-3 w-3" />,
      color: 'yellow',
    });
  }

  // Creative decay
  const decay = sv.decayAnalysis as Record<string, unknown> | undefined;
  if (decay) {
    const rec = decay.recommendation as string;
    const days = decay.estimatedDaysToBreakeven as number | null;
    if (rec === 'replace_now' || rec === 'accelerating_decay') {
      pills.push({
        label: 'Creative',
        text: days != null
          ? `Creative fatigue: breakeven in ~${Math.round(days)} days`
          : `Creative showing ${rec === 'replace_now' ? 'severe' : 'accelerating'} fatigue`,
        icon: <RefreshCw className="h-3 w-3" />,
        color: rec === 'replace_now' ? 'red' : 'yellow',
      });
    }
  }

  // Seasonal context
  const seasonal = sv.seasonalContext as Record<string, unknown> | undefined;
  if (seasonal?.isHighDemandDay === true) {
    const factor = seasonal.todayFactor as number | undefined;
    pills.push({
      label: 'Seasonal',
      text: factor
        ? `High-demand day (${factor.toFixed(2)}x seasonal factor)`
        : 'Today is a high-demand day',
      icon: <Calendar className="h-3 w-3" />,
      color: 'blue',
    });
  }

  return pills;
}

export function ReasoningPills({ suggestedValue }: ReasoningPillsProps): JSX.Element | null {
  if (!suggestedValue) return null;

  const pills = extractPills(suggestedValue);
  if (pills.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-caption font-medium text-[var(--foreground-secondary)] uppercase tracking-wider">
        Why this recommendation
      </p>
      <div className="space-y-1">
        {pills.map((pill) => {
          const colors = COLOR_CLASSES[pill.color];
          return (
            <div
              key={pill.label}
              className="flex items-start gap-2 text-xs"
            >
              <span className={`flex items-center gap-1.5 shrink-0 font-medium ${colors.text}`}>
                <span className={`w-5 h-5 rounded-md ${colors.bg} flex items-center justify-center`}>
                  <span className={colors.icon}>{pill.icon}</span>
                </span>
                {pill.label}
              </span>
              <span className="text-[var(--foreground-secondary)] pt-0.5 leading-tight">
                {pill.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
