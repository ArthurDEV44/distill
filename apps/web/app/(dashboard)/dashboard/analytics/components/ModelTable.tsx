"use client";

import { useState } from "react";
import { formatNumber, formatCost } from "@ctxopt/shared";

interface ModelData {
  requests: number;
  tokens: number;
  costMicros: number;
}

interface ModelTableProps {
  data: Record<string, ModelData>;
  isLoading?: boolean;
}

type SortKey = "model" | "requests" | "tokens" | "cost" | "percentage";
type SortDirection = "asc" | "desc";

const MODEL_NAMES: Record<string, string> = {
  "claude-opus-4-20250514": "Claude Opus 4",
  "claude-sonnet-4-20250514": "Claude Sonnet 4",
  "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
};

function getModelName(model: string): string {
  return MODEL_NAMES[model] || model;
}

function getModelBadgeColor(model: string): string {
  if (model.includes("opus")) return "bg-purple-100 text-purple-700";
  if (model.includes("sonnet")) return "bg-blue-100 text-blue-700";
  if (model.includes("haiku")) return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-700";
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 bg-muted rounded animate-pulse" />
      ))}
    </div>
  );
}

export function ModelTable({ data, isLoading = false }: ModelTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6">
        <div className="h-6 w-48 bg-muted rounded animate-pulse mb-4" />
        <TableSkeleton />
      </div>
    );
  }

  const totalCost = Object.values(data).reduce((sum, d) => sum + d.costMicros, 0);

  const tableData = Object.entries(data).map(([model, stats]) => ({
    model,
    modelName: getModelName(model),
    requests: stats.requests,
    tokens: stats.tokens,
    cost: stats.costMicros,
    percentage: totalCost > 0 ? (stats.costMicros / totalCost) * 100 : 0,
  }));

  // Sort data
  tableData.sort((a, b) => {
    let comparison = 0;
    switch (sortKey) {
      case "model":
        comparison = a.modelName.localeCompare(b.modelName);
        break;
      case "requests":
        comparison = a.requests - b.requests;
        break;
      case "tokens":
        comparison = a.tokens - b.tokens;
        break;
      case "cost":
        comparison = a.cost - b.cost;
        break;
      case "percentage":
        comparison = a.percentage - b.percentage;
        break;
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null;
    return <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  if (tableData.length === 0) {
    return (
      <div className="rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Usage by Model</h3>
        <p className="text-muted-foreground">No model data for this period</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Usage by Model</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th
                className="text-left py-3 px-2 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => handleSort("model")}
              >
                Model <SortIcon column="model" />
              </th>
              <th
                className="text-right py-3 px-2 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => handleSort("requests")}
              >
                Requests <SortIcon column="requests" />
              </th>
              <th
                className="text-right py-3 px-2 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => handleSort("tokens")}
              >
                Tokens <SortIcon column="tokens" />
              </th>
              <th
                className="text-right py-3 px-2 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => handleSort("cost")}
              >
                Cost <SortIcon column="cost" />
              </th>
              <th
                className="text-right py-3 px-2 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => handleSort("percentage")}
              >
                % <SortIcon column="percentage" />
              </th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row) => (
              <tr key={row.model} className="border-b last:border-0 hover:bg-muted/50">
                <td className="py-3 px-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getModelBadgeColor(row.model)}`}>
                    {row.modelName}
                  </span>
                </td>
                <td className="text-right py-3 px-2 text-sm">{formatNumber(row.requests)}</td>
                <td className="text-right py-3 px-2 text-sm">{formatNumber(row.tokens)}</td>
                <td className="text-right py-3 px-2 text-sm font-medium">{formatCost(row.cost)}</td>
                <td className="text-right py-3 px-2 text-sm text-muted-foreground">
                  {row.percentage.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
