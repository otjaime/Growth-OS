'use client';

import { useState } from 'react';

interface TrustIndicatorProps {
  confidence: number | null;
  compact?: boolean;
}

type TrustLevel = 'high' | 'medium' | 'low' | 'unknown';

function getTrustLevel(confidence: number | null): TrustLevel {
  if (confidence == null) return 'unknown';
  if (confidence >= 80) return 'high';
  if (confidence >= 50) return 'medium';
  return 'low';
}

const TRUST_CONFIG: Record<TrustLevel, { label: string; detail: string; color: string; fill: string; segments: number }> = {
  high: {
    label: "We're confident",
    detail: 'This recommendation is backed by strong data signals.',
    color: 'text-apple-green',
    fill: 'bg-apple-green',
    segments: 3,
  },
  medium: {
    label: 'Somewhat confident',
    detail: 'We have moderate signals. A few more days of data would increase certainty.',
    color: 'text-apple-yellow',
    fill: 'bg-apple-yellow',
    segments: 2,
  },
  low: {
    label: 'Still learning',
    detail: 'This recommendation is based on limited data. We need a few more days to be sure.',
    color: 'text-[var(--foreground-secondary)]',
    fill: 'bg-[var(--foreground-secondary)]',
    segments: 1,
  },
  unknown: {
    label: 'Not enough data',
    detail: 'We cannot assess confidence yet.',
    color: 'text-[var(--foreground-secondary)]',
    fill: 'bg-[var(--foreground-secondary)]',
    segments: 0,
  },
};

export function TrustIndicator({ confidence, compact = false }: TrustIndicatorProps): JSX.Element {
  const [showTooltip, setShowTooltip] = useState(false);
  const level = getTrustLevel(confidence);
  const config = TRUST_CONFIG[level];

  return (
    <span
      className="relative inline-flex items-center gap-1.5 cursor-help"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* 3-segment bar indicator */}
      <span className="inline-flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-1.5 h-3 rounded-sm transition-colors ${
              i < config.segments ? config.fill : 'bg-[var(--foreground-secondary)]/20'
            }`}
          />
        ))}
      </span>

      {!compact && (
        <span className={`text-caption font-medium ${config.color}`}>{config.label}</span>
      )}

      {showTooltip && (
        <span
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 px-3 py-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--glass-border)] shadow-lg"
        >
          <span className={`text-xs font-medium ${config.color} block mb-1`}>{config.label}</span>
          <span className="text-caption text-[var(--foreground-secondary)] leading-relaxed block">{config.detail}</span>
          {confidence != null && (
            <span className="text-caption text-[var(--foreground-secondary)]/60 block mt-1">
              Confidence: {Math.round(confidence)}%
            </span>
          )}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <span className="block w-2 h-2 rotate-45 bg-[var(--surface-elevated)] border-r border-b border-[var(--glass-border)]" />
          </span>
        </span>
      )}
    </span>
  );
}
