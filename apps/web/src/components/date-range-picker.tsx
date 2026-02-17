'use client';

import { useState, useEffect } from 'react';

interface DateRangePickerProps {
  onChange: (days: number) => void;
  defaultDays?: number;
}

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

export function DateRangePicker({ onChange, defaultDays = 7 }: DateRangePickerProps) {
  const [selected, setSelected] = useState(defaultDays);

  return (
    <div className="flex gap-2">
      {PRESETS.map((preset) => (
        <button
          key={preset.days}
          onClick={() => {
            setSelected(preset.days);
            onChange(preset.days);
          }}
          className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium transition-all ease-spring ${
            selected === preset.days
              ? 'bg-[var(--tint-blue)] text-apple-blue border border-apple-blue/30'
              : 'bg-white/[0.06] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] hover:bg-white/[0.1] border border-transparent'
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
