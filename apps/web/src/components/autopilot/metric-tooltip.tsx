'use client';

import { useState, useRef, useCallback } from 'react';
import { Info } from 'lucide-react';
import { METRIC_LABELS } from './human-labels';
import type { MetricKey } from './types';

interface MetricTooltipProps {
  metricKey: MetricKey;
  children: React.ReactNode;
  showIcon?: boolean;
}

export function MetricTooltip({ metricKey, children, showIcon = true }: MetricTooltipProps): JSX.Element {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const info = METRIC_LABELS[metricKey];

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(false), 150);
  }, []);

  return (
    <span
      className="relative inline-flex items-center gap-1 cursor-help"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {showIcon && (
        <Info className="h-3 w-3 text-[var(--foreground-secondary)] opacity-40 hover:opacity-80 transition-opacity" />
      )}
      {visible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--glass-border)] shadow-lg"
        >
          <p className="text-xs font-medium text-[var(--foreground)] mb-1">{info.label}</p>
          <p className="text-caption text-[var(--foreground-secondary)] leading-relaxed">{info.tooltip}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 rotate-45 bg-[var(--surface-elevated)] border-r border-b border-[var(--glass-border)]" />
          </div>
        </div>
      )}
    </span>
  );
}

interface MetricValueProps {
  metricKey: MetricKey;
  value: number | null;
  className?: string;
}

export function MetricValue({ metricKey, value, className = '' }: MetricValueProps): JSX.Element {
  const info = METRIC_LABELS[metricKey];
  if (value == null) {
    return <span className={`text-[var(--foreground-secondary)] ${className}`}>—</span>;
  }
  return (
    <MetricTooltip metricKey={metricKey}>
      <span className={className}>{info.format(value)}</span>
    </MetricTooltip>
  );
}
