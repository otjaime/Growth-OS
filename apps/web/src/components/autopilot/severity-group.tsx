'use client';

import { SeverityIcon } from './severity-badge';
import type { DiagnosisSeverity } from './types';

interface SeverityGroupHeaderProps {
  severity: DiagnosisSeverity;
  count: number;
}

const labels: Record<DiagnosisSeverity, string> = {
  CRITICAL: 'Critical Issues',
  WARNING: 'Warnings',
  INFO: 'Info',
};

const accents: Record<DiagnosisSeverity, string> = {
  CRITICAL: 'border-l-2 border-apple-red pl-3',
  WARNING: 'border-l-2 border-apple-yellow pl-3',
  INFO: 'border-l-2 border-apple-blue pl-3',
};

export function SeverityGroupHeader({ severity, count }: SeverityGroupHeaderProps) {
  return (
    <div className={`flex items-center gap-2 py-2 mt-2 first:mt-0 ${accents[severity]}`}>
      <SeverityIcon severity={severity} className="h-3.5 w-3.5" />
      <span className="text-[11px] uppercase font-semibold text-[var(--foreground-secondary)] tracking-wide">
        {labels[severity]}
      </span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-[var(--foreground-secondary)] font-medium">
        {count}
      </span>
    </div>
  );
}
