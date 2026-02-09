'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, BarChart, Bar, ComposedChart, Line,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface RevenueChartProps {
  revenueData: Array<{ date: string; revenue: number; orders: number }>;
  spendData: Array<{ date: string; spend: number }>;
}

export function RevenueChart({ revenueData, spendData }: RevenueChartProps) {
  // Merge data by date
  const merged = revenueData.map((r) => {
    const spendRow = spendData.find((s) => s.date.slice(0, 10) === r.date.slice(0, 10));
    return {
      date: r.date.slice(0, 10),
      revenue: Math.round(r.revenue),
      orders: r.orders,
      spend: spendRow ? Math.round(spendRow.spend) : 0,
    };
  });

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
          <YAxis yAxisId="spend" orientation="right" stroke="#94a3b8" fontSize={11} hide />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0',
            }}
            formatter={(value: number, name: string) => [
              `$${value.toLocaleString()}`,
              name,
            ]}
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
