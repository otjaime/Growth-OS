'use client';

import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import type { DiagnosisSeverity } from './types';
import { getSeverityLabel } from './human-labels';

const config: Record<DiagnosisSeverity, { icon: typeof AlertTriangle; color: string; bg: string; text: string; border: string }> = {
  CRITICAL: { icon: AlertTriangle, color: 'text-apple-red', bg: 'bg-[var(--tint-red)]', text: 'text-apple-red', border: 'border-apple-red' },
  WARNING: { icon: AlertCircle, color: 'text-apple-yellow', bg: 'bg-[var(--tint-yellow)]', text: 'text-apple-yellow', border: 'border-apple-yellow' },
  INFO: { icon: Info, color: 'text-apple-blue', bg: 'bg-[var(--tint-blue)]', text: 'text-apple-blue', border: 'border-apple-blue' },
};

export function SeverityBadge({ severity }: { severity: DiagnosisSeverity }) {
  const c = config[severity];
  return (
    <span className={`text-caption px-2 py-0.5 rounded-full font-semibold ${c.bg} ${c.text}`}>
      {getSeverityLabel(severity)}
    </span>
  );
}

export function SeverityIcon({ severity, className }: { severity: DiagnosisSeverity; className?: string }) {
  const c = config[severity];
  const Icon = c.icon;
  return <Icon className={`${c.color} ${className ?? 'h-4 w-4'}`} />;
}

export function SeverityDot({ severity }: { severity: DiagnosisSeverity }) {
  const colorMap: Record<DiagnosisSeverity, string> = {
    CRITICAL: 'bg-apple-red',
    WARNING: 'bg-apple-yellow',
    INFO: 'bg-apple-blue',
  };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorMap[severity]}`} />;
}
