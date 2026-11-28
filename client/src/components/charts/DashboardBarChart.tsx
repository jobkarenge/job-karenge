import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface DashboardBarChartProps {
  data: Array<Record<string, string | number>>;
  xKey: string;
  barKey: string;
  barColor?: string;
  xFontSize?: number;
}

export default function DashboardBarChart({
  data,
  xKey,
  barKey,
  barColor = '#2563EB',
  xFontSize = 12,
}: DashboardBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: xFontSize }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey={barKey} fill={barColor} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
