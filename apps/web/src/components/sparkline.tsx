'use client';

import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

interface MiniSparklineProps {
  data: number[];
  color?: string;
}

export function MiniSparkline({ data, color = '#3b82f6' }: MiniSparklineProps) {
  const chartData = data.map((value, index) => ({ index, value }));

  return (
    <div className="w-24 h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <YAxis domain={['dataMin', 'dataMax']} hide />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
