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
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selected === preset.days
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
