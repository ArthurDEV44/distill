"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatNumber, formatCost } from "@ctxopt/shared";

interface DailyData {
  date: string;
  tokens: number;
  costMicros: number;
  requests: number;
}

interface TokensChartProps {
  data: DailyData[];
  isLoading?: boolean;
}

type MetricType = "tokens" | "cost" | "requests";

const METRIC_CONFIG: Record<MetricType, { label: string; color: string; format: (v: number) => string }> = {
  tokens: { label: "Tokens", color: "#3B82F6", format: formatNumber },
  cost: { label: "Cost", color: "#10B981", format: (v) => formatCost(v * 1_000_000) },
  requests: { label: "Requests", color: "#8B5CF6", format: formatNumber },
};

function ChartSkeleton() {
  return (
    <div className="h-[300px] w-full animate-pulse bg-muted rounded-lg" />
  );
}

export function TokensChart({ data, isLoading = false }: TokensChartProps) {
  const [metric, setMetric] = useState<MetricType>("tokens");

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        </div>
        <ChartSkeleton />
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    tokens: d.tokens,
    cost: d.costMicros / 1_000_000,
    requests: d.requests,
  }));

  const config = METRIC_CONFIG[metric];

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Usage Over Time</h3>
        <div className="flex gap-1 rounded-lg border p-1">
          {(Object.keys(METRIC_CONFIG) as MetricType[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                metric === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {METRIC_CONFIG[m].label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          No data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={config.format}
              className="text-muted-foreground"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              formatter={(value: number) => [config.format(value), config.label]}
            />
            <Line
              type="monotone"
              dataKey={metric}
              stroke={config.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
