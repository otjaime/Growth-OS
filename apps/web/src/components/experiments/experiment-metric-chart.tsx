'use client';

import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area } from 'recharts';
import { apiFetch } from '@/lib/api';
import { Skeleton } from '@/components/skeleton';
import type { ExperimentMetric } from './types';

interface ExperimentMetricChartProps {
  experimentId: string;
  metricName: string;
}

const CURRENCY_METRICS = new Set(['cac', 'aov', 'ltv', 'revenue']);
const PERCENT_METRICS = new Set(['conversion_rate', 'retention']);

function formatMetricValue(value: number, metricName: string): string {
  if (CURRENCY_METRICS.has(metricName)) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (PERCENT_METRICS.has(metricName)) return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const GLASS_TOOLTIP = {
  backgroundColor: 'rgba(30,30,36,0.85)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  color: '#f5f5f7',
  boxShadow: '0 2px 16px rgba(0,0,0,0.28)',
};

export function ExperimentMetricChart({ experimentId, metricName }: ExperimentMetricChartProps): React.ReactElement {
  const [data, setData] = useState<Array<{ date: string; value: number }> | null>(null);
  const [loading, setLoading] = useState(true);
  const cache = useRef<Map<string, ExperimentMetric[]>>(new Map());

  useEffect(() => {
    const cacheKey = `${experimentId}:${metricName}`;
    const cached = cache.current.get(cacheKey);
    if (cached) {
      setData(cached.map((m) => ({ date: m.date.slice(0, 10), value: m.value })));
      setLoading(false);
      return;
    }

    setLoading(true);
    apiFetch(`/api/experiments/${experimentId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((body: { metrics?: ExperimentMetric[] } | null) => {
        if (!body?.metrics) {
          setData([]);
          setLoading(false);
          return;
        }
        const allMetrics = body.metrics;
        const filtered = allMetrics.filter((m) => m.metricName === metricName);
        cache.current.set(cacheKey, filtered);

        const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
        setData(sorted.map((m) => ({ date: m.date.slice(0, 10), value: m.value })));
        setLoading(false);
      })
      .catch(() => {
        setData([]);
        setLoading(false);
      });
  }, [experimentId, metricName]);

  if (loading) {
    return <Skeleton className="h-48 w-full rounded-lg" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-[var(--foreground-secondary)]/70">
        No metric data recorded
      </div>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <defs>
            <linearGradient id={`area-${experimentId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a84ff" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#0a84ff" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            stroke="rgba(255,255,255,0.35)"
            fontSize={10}
            tickFormatter={formatDateShort}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="rgba(255,255,255,0.35)"
            fontSize={10}
            tickFormatter={(v: number) => formatMetricValue(v, metricName)}
            width={60}
          />
          <Tooltip
            contentStyle={GLASS_TOOLTIP}
            formatter={(value: number) => [formatMetricValue(value, metricName), metricName.replace(/_/g, ' ')]}
            labelFormatter={formatDateLong}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill={`url(#area-${experimentId})`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0a84ff"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#0a84ff', stroke: '#fff', strokeWidth: 1 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
