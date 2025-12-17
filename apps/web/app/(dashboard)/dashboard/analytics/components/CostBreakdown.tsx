"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCost } from "@ctxopt/shared";

interface ModelData {
  model: string;
  requests: number;
  tokens: number;
  costMicros: number;
}

interface CostBreakdownProps {
  data: Record<string, ModelData>;
  isLoading?: boolean;
}

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-20250514": "#8B5CF6",
  "claude-sonnet-4-20250514": "#3B82F6",
  "claude-3-5-haiku-20241022": "#10B981",
};

const MODEL_NAMES: Record<string, string> = {
  "claude-opus-4-20250514": "Opus 4",
  "claude-sonnet-4-20250514": "Sonnet 4",
  "claude-3-5-haiku-20241022": "Haiku 3.5",
};

function getModelColor(model: string): string {
  if (model.includes("opus")) return "#8B5CF6";
  if (model.includes("sonnet")) return "#3B82F6";
  if (model.includes("haiku")) return "#10B981";
  return "#6B7280";
}

function getModelName(model: string): string {
  return MODEL_NAMES[model] || model.split("-").slice(1, 3).join(" ");
}

function ChartSkeleton() {
  return (
    <div className="h-[250px] w-full flex items-center justify-center">
      <div className="h-40 w-40 rounded-full bg-muted animate-pulse" />
    </div>
  );
}

export function CostBreakdown({ data, isLoading = false }: CostBreakdownProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border p-6">
        <div className="h-6 w-40 bg-muted rounded animate-pulse mb-4" />
        <ChartSkeleton />
      </div>
    );
  }

  const pieData = Object.entries(data).map(([model, stats]) => ({
    name: getModelName(model),
    value: stats.costMicros,
    fill: getModelColor(model),
  }));

  const totalCost = pieData.reduce((sum, d) => sum + d.value, 0);

  if (pieData.length === 0 || totalCost === 0) {
    return (
      <div className="rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Cost by Model</h3>
        <div className="h-[250px] flex items-center justify-center text-muted-foreground">
          No cost data for this period
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Cost by Model</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
            }}
            formatter={(value: number) => [formatCost(value), "Cost"]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => <span className="text-sm">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="text-center mt-2">
        <p className="text-2xl font-bold">{formatCost(totalCost)}</p>
        <p className="text-sm text-muted-foreground">Total Cost</p>
      </div>
    </div>
  );
}
