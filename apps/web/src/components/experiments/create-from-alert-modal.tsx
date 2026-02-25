'use client';

import { CreateModal } from './create-modal';
import type { ExperimentType } from './types';

interface AlertData {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
}

// Map alert rule IDs to primary metrics and experiment types
const ALERT_TO_METRIC: Record<string, string> = {
  cac_increase: 'cac',
  cm_decrease: 'revenue',
  retention_drop: 'retention',
  mer_deterioration: 'mer',
  revenue_decline: 'revenue',
  new_customer_decline: 'cac',
};

const ALERT_TO_EXP_TYPE: Record<string, ExperimentType> = {
  cac_increase: 'CREATIVE',
  cm_decrease: 'PRICING',
  retention_drop: 'LIFECYCLE',
  mer_deterioration: 'CREATIVE',
  revenue_decline: 'CRO',
  new_customer_decline: 'CRO',
};

function inferFromAlertId(alertId: string): { metric: string; experimentType: ExperimentType } {
  // Handle channel_cac_* alerts (e.g., channel_cac_meta)
  if (alertId.startsWith('channel_cac')) {
    return { metric: 'cac', experimentType: 'CREATIVE' };
  }
  return {
    metric: ALERT_TO_METRIC[alertId] ?? 'conversion_rate',
    experimentType: ALERT_TO_EXP_TYPE[alertId] ?? 'OTHER',
  };
}

interface CreateFromAlertModalProps {
  alert: AlertData;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateFromAlertModal({ alert, onClose, onCreated }: CreateFromAlertModalProps): React.ReactElement {
  const { metric, experimentType } = inferFromAlertId(alert.id);

  return (
    <CreateModal
      onClose={onClose}
      onCreated={onCreated}
      prefill={{
        name: `Investigate: ${alert.title}`,
        hypothesis: `If we address the ${alert.title.toLowerCase()}, then ${metric.replace(/_/g, ' ')} will improve because ${alert.recommendation.charAt(0).toLowerCase()}${alert.recommendation.slice(1)}`,
        primaryMetric: metric,
        experimentType,
      }}
    />
  );
}
