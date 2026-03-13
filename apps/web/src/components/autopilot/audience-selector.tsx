'use client';

import { useState } from 'react';
import { Users, ArrowLeft } from 'lucide-react';

interface SegmentData {
  segment: string;
  count: number;
  totalRevenue: number;
}

interface AudienceSelectorProps {
  value: string;
  onChange: (value: string) => void;
  segments: SegmentData[];
  loading?: boolean;
}

const SEGMENT_DESCRIPTIONS: Record<string, string> = {
  Champions: 'High-value repeat buyers, brand advocates',
  Loyal: 'Consistent purchasers with strong engagement',
  Potential: 'Recent buyers with growth opportunity, low frequency',
  'At Risk': 'Previously valuable customers, declining activity',
  Dormant: 'Inactive customers, haven\'t purchased recently',
  Lost: 'Churned customers requiring reactivation',
};

function fmt$(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function AudienceSelector({ value, onChange, segments, loading }: AudienceSelectorProps): JSX.Element {
  const [mode, setMode] = useState<'segments' | 'custom'>(
    // Start in custom mode if no segments or value doesn't match any segment
    segments.length === 0 ? 'custom' : 'segments'
  );

  if (mode === 'custom' || segments.length === 0) {
    return (
      <div className="space-y-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Health-conscious dog owners 25-45"
          className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] border border-white/5 focus:border-apple-blue/50 focus:outline-none transition-colors"
        />
        {segments.length > 0 && (
          <button
            onClick={() => setMode('segments')}
            className="flex items-center gap-1 text-[10px] text-apple-blue hover:underline"
          >
            <ArrowLeft className="h-2.5 w-2.5" />
            Choose from segments
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <select
        value={value || ''}
        onChange={(e) => {
          const selected = e.target.value;
          if (selected === '__custom__') {
            setMode('custom');
            onChange('');
            return;
          }
          const seg = segments.find((s) => s.segment === selected);
          if (seg) {
            const desc = SEGMENT_DESCRIPTIONS[seg.segment] ?? seg.segment;
            onChange(`${seg.segment}: ${desc}`);
          }
        }}
        className="w-full px-3 py-2 rounded-lg bg-glass-hover text-sm text-[var(--foreground)] border border-white/5 focus:border-apple-blue/50 focus:outline-none"
      >
        <option value="" disabled>
          {loading ? 'Loading segments…' : 'Select audience segment'}
        </option>
        {segments.map((seg) => (
          <option key={seg.segment} value={seg.segment}>
            {seg.segment} — {seg.count.toLocaleString()} customers, {fmt$(seg.totalRevenue)}
          </option>
        ))}
        <option disabled>────────────</option>
        <option value="__custom__">✎ Custom audience…</option>
      </select>
      {value && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--foreground-secondary)]">
          <Users className="h-2.5 w-2.5" />
          {value}
        </div>
      )}
    </div>
  );
}
