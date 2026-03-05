'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '@/lib/api';
import type { JSX } from 'react';

interface ForecastPoint {
  date: string;
  value: number;
  lower80?: number;
  upper80?: number;
}

interface ForecastResponse {
  metric: string;
  forecast: ForecastPoint[];
  historical: Array<{ date: string; value: number }>;
}

function formatCompact(num: number): string {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

export function ForecastWidget(): JSX.Element | null {
  const [data, setData] = useState<{
    trendPct: number;
    forecastTotal: number;
    trend: 'growing' | 'declining' | 'flat';
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    apiFetch('/api/metrics/forecast?metric=revenue&horizon=7')
      .then((res) => (res.ok ? res.json() : null))
      .then((json: ForecastResponse | null) => {
        if (cancelled || !json) return;

        const hist = json.historical ?? [];
        const fc = json.forecast ?? [];

        if (hist.length < 7 || fc.length === 0) return;

        // Last 7 days of actual data
        const recent = hist.slice(-7);
        const actualAvg = recent.reduce((s, d) => s + d.value, 0) / recent.length;

        // Forecasted 7 days
        const forecastAvg = fc.reduce((s, d) => s + d.value, 0) / fc.length;
        const forecastTotal = fc.reduce((s, d) => s + d.value, 0);

        if (actualAvg === 0) return;

        const trendPct = ((forecastAvg - actualAvg) / actualAvg) * 100;
        const trend: 'growing' | 'declining' | 'flat' =
          trendPct > 5 ? 'growing' : trendPct < -5 ? 'declining' : 'flat';

        setData({ trendPct, forecastTotal, trend });
      })
      .catch(() => { /* non-critical */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  if (loading || !data) return null;

  const trendConfig = {
    growing: {
      icon: <TrendingUp className="h-4 w-4" />,
      color: 'text-apple-green',
      bg: 'bg-[var(--tint-green)]',
      arrow: '↑',
      label: 'up',
    },
    declining: {
      icon: <TrendingDown className="h-4 w-4" />,
      color: 'text-apple-red',
      bg: 'bg-[var(--tint-red)]',
      arrow: '↓',
      label: 'down',
    },
    flat: {
      icon: <Minus className="h-4 w-4" />,
      color: 'text-[var(--foreground-secondary)]',
      bg: 'bg-glass-hover',
      arrow: '~',
      label: 'stable',
    },
  }[data.trend];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="card px-5 py-4"
    >
      <div className="flex items-center gap-3">
        <span className={`w-8 h-8 rounded-lg ${trendConfig.bg} flex items-center justify-center shrink-0`}>
          <span className={trendConfig.color}>{trendConfig.icon}</span>
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Revenue Forecast
          </p>
          <p className="text-caption text-[var(--foreground-secondary)] mt-0.5">
            <span className={`font-medium ${trendConfig.color}`}>
              Trending {trendConfig.label} {Math.abs(Math.round(data.trendPct))}%
            </span>
            {' '}&middot;{' '}
            {formatCompact(data.forecastTotal)} projected next 7 days
          </p>
        </div>
      </div>
    </motion.div>
  );
}
