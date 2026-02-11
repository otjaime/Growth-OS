'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, BarChart, Bar, ComposedChart, Line,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface RevenueChartProps {
  revenueData: Array<{ date: string; revenue: number; orders: number }>;
  spendData: Array<{ date: string; spend: number }>;
  marginData?: Array<{ date: string; cm: number; revenue_net: number }>;
}

export function RevenueChart({ revenueData, spendData, marginData }: RevenueChartProps) {
  // Merge data by date
  const merged = revenueData.map((r) => {
    const dateKey = r.date.slice(0, 10);
    const spendRow = spendData.find((s) => s.date.slice(0, 10) === dateKey);
    const marginRow = marginData?.find((m) => m.date.slice(0, 10) === dateKey);
    const cmPct = marginRow && marginRow.revenue_net > 0
      ? Math.round((marginRow.cm / marginRow.revenue_net) * 100)
      : null;
    return {
      date: dateKey,
      revenue: Math.round(r.revenue),
      orders: r.orders,
      spend: spendRow ? Math.round(spendRow.spend) : 0,
      cmPct,
    };
  });

  const hasMarginData = marginData && marginData.length > 0;

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
          />
          <YAxis
            yAxisId="revenue"
            stroke="#94a3b8"
            fontSize={11}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
          />
          {hasMarginData && (
            <YAxis
              yAxisId="percent"
              orientation="right"
              stroke="#94a3b8"
              fontSize={11}
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
            />
          )}
          {!hasMarginData && (
            <YAxis yAxisId="percent" orientation="right" stroke="#94a3b8" fontSize={11} hide />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'CM%') return [`${value}%`, name];
              return [`$${value.toLocaleString()}`, name];
            }}
            labelFormatter={(label: string) => format(new Date(label + 'T00:00:00'), 'MMM d, yyyy')}
          />
          <Legend />
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Bar
            yAxisId="revenue"
            dataKey="spend"
            name="Ad Spend"
            fill="#f59e0b"
            fillOpacity={0.6}
            radius={[2, 2, 0, 0]}
          />
          {hasMarginData && (
            <Line
              yAxisId="percent"
              type="monotone"
              dataKey="cmPct"
              name="CM%"
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
