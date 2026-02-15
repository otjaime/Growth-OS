// ──────────────────────────────────────────────────────────────
// Growth OS — Signal Detection
// Wraps evaluateAlerts() and adds metric delta / funnel signals
// ──────────────────────────────────────────────────────────────

import { evaluateAlerts } from './alerts.js';
import type { AlertInput } from './alerts.js';
import * as kpis from './kpis.js';

export interface Signal {
  id: string;
  type: 'alert' | 'metric_delta' | 'funnel_drop';
  sourceMetric: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
}

export interface FunnelCvr {
  sessionToPdp: number;
  pdpToAtc: number;
  atcToCheckout: number;
  checkoutToPurchase: number;
}

export interface SignalInput extends AlertInput {
  currentAOV?: number;
  previousAOV?: number;
  currentSessions?: number;
  previousSessions?: number;
  funnelCurrent?: FunnelCvr;
  funnelPrevious?: FunnelCvr;
}

export function detectSignals(input: SignalInput): Signal[] {
  const signals: Signal[] = [];

  // 1. Convert existing alerts to signals
  const alerts = evaluateAlerts(input);
  for (const alert of alerts) {
    signals.push({
      id: `alert_${alert.id}`,
      type: 'alert',
      sourceMetric: alert.id,
      currentValue: alert.metricValue,
      previousValue: alert.threshold,
      changePercent: alert.metricValue,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
    });
  }

  // 2. AOV change > 10%
  if (input.currentAOV != null && input.previousAOV != null && input.previousAOV > 0) {
    const aovChange = kpis.percentChange(input.currentAOV, input.previousAOV);
    if (Math.abs(aovChange) > 0.10) {
      const direction = aovChange > 0 ? 'increased' : 'decreased';
      signals.push({
        id: 'metric_delta_aov',
        type: 'metric_delta',
        sourceMetric: 'aov',
        currentValue: input.currentAOV,
        previousValue: input.previousAOV,
        changePercent: aovChange,
        severity: Math.abs(aovChange) > 0.20 ? 'warning' : 'info',
        title: `AOV ${direction} ${(Math.abs(aovChange) * 100).toFixed(1)}%`,
        description: `Average order value ${direction} from $${input.previousAOV.toFixed(0)} to $${input.currentAOV.toFixed(0)} WoW`,
      });
    }
  }

  // 3. Sessions decline > 15%
  if (input.currentSessions != null && input.previousSessions != null && input.previousSessions > 0) {
    const sessionsChange = kpis.percentChange(input.currentSessions, input.previousSessions);
    if (sessionsChange < -0.15) {
      signals.push({
        id: 'metric_delta_sessions',
        type: 'metric_delta',
        sourceMetric: 'sessions',
        currentValue: input.currentSessions,
        previousValue: input.previousSessions,
        changePercent: sessionsChange,
        severity: sessionsChange < -0.30 ? 'warning' : 'info',
        title: `Sessions dropped ${(Math.abs(sessionsChange) * 100).toFixed(1)}%`,
        description: `Website sessions declined from ${input.previousSessions.toLocaleString()} to ${input.currentSessions.toLocaleString()} WoW`,
      });
    }
  }

  // 4. Funnel stage drops > 15%
  if (input.funnelCurrent && input.funnelPrevious) {
    const stages: Array<{ key: keyof FunnelCvr; label: string }> = [
      { key: 'sessionToPdp', label: 'Session → PDP' },
      { key: 'pdpToAtc', label: 'PDP → Add to Cart' },
      { key: 'atcToCheckout', label: 'Add to Cart → Checkout' },
      { key: 'checkoutToPurchase', label: 'Checkout → Purchase' },
    ];

    for (const stage of stages) {
      const cur = input.funnelCurrent[stage.key];
      const prev = input.funnelPrevious[stage.key];
      if (prev > 0) {
        const change = kpis.percentChange(cur, prev);
        if (change < -0.15) {
          signals.push({
            id: `funnel_drop_${stage.key}`,
            type: 'funnel_drop',
            sourceMetric: `funnel.${stage.key}`,
            currentValue: cur,
            previousValue: prev,
            changePercent: change,
            severity: change < -0.30 ? 'warning' : 'info',
            title: `${stage.label} CVR dropped ${(Math.abs(change) * 100).toFixed(1)}%`,
            description: `${stage.label} conversion rate dropped from ${(prev * 100).toFixed(1)}% to ${(cur * 100).toFixed(1)}% WoW`,
          });
        }
      }
    }
  }

  return signals;
}
