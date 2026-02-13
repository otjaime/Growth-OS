'use client';

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

interface ForecastPoint {
  date: string;
  value: number;
  lower80: number;
  upper80: number;
  lower95: number;
  upper95: number;
}

interface ForecastChartProps {
  historical: Array<{ date: string; value: number }>;
  forecast: ForecastPoint[] | null;
  metric: 'revenue' | 'orders' | 'spend';
}

const LABELS: Record<string, string> = {
  revenue: 'Revenue',
  orders: 'Orders',
  spend: 'Ad Spend',
};

function fmtValue(v: number, metric: string): string {
  if (metric === 'orders') return Math.round(v).toLocaleString();
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtAxis(v: number, metric: string): string {
  if (metric === 'orders') return `${v}`;
  return `$${(v / 1000).toFixed(0)}K`;
}

export function ForecastChart({ historical, forecast, metric }: ForecastChartProps) {
  // Show last 90 days of historical (model uses 180 but chart is cleaner with 90)
  const visibleHist = historical.slice(-90);

  // Build merged data array for Recharts
  const merged: Array<{
    date: string;
    actual: number | null;
    forecast: number | null;
    band95Base: number | null;
    band95Height: number | null;
    band80Base: number | null;
    band80Height: number | null;
  }> = visibleHist.map((h) => ({
    date: h.date,
    actual: h.value,
    forecast: null,
    band95Base: null,
    band95Height: null,
    band80Base: null,
    band80Height: null,
  }));

  // Bridge point: connect historical to forecast
  if (forecast && visibleHist.length > 0) {
    const last = visibleHist[visibleHist.length - 1];
    merged.push({
      date: last.date,
      actual: last.value,
      forecast: last.value,
      band95Base: null,
      band95Height: null,
      band80Base: null,
      band80Height: null,
    });

    for (const f of forecast) {
      merged.push({
        date: f.date,
        actual: null,
        forecast: f.value,
        band95Base: f.lower95,
        band95Height: f.upper95 - f.lower95,
        band80Base: f.lower80,
        band80Height: f.upper80 - f.lower80,
      });
    }
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={merged}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            fontSize={11}
            tickFormatter={(v: string) => format(new Date(v + 'T00:00:00'), 'MMM d')}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickFormatter={(v: number) => fmtAxis(v, metric)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'Actual' || name === 'Forecast') {
                return [fmtValue(value, metric), name];
              }
              return [null, null];
            }}
            labelFormatter={(label: string) => format(new Date(label + 'T00:00:00'), 'MMM d, yyyy')}
            itemSorter={() => -1}
          />

          {/* 95% CI band — stacked with transparent base */}
          <Area
            type="monotone"
            dataKey="band95Base"
            stackId="ci95"
            fill="transparent"
            stroke="none"
          />
          <Area
            type="monotone"
            dataKey="band95Height"
            stackId="ci95"
            fill="#3b82f6"
            fillOpacity={0.07}
            stroke="none"
            name="95% CI"
          />

          {/* 80% CI band — stacked with transparent base */}
          <Area
            type="monotone"
            dataKey="band80Base"
            stackId="ci80"
            fill="transparent"
            stroke="none"
          />
          <Area
            type="monotone"
            dataKey="band80Height"
            stackId="ci80"
            fill="#3b82f6"
            fillOpacity={0.14}
            stroke="none"
            name="80% CI"
          />

          {/* Historical line */}
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />

          {/* Forecast line (dashed) */}
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke="#3b82f6"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
