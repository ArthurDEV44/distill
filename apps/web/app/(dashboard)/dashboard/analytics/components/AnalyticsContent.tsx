"use client";

import { useState, useEffect } from "react";
import { useUsage } from "@/lib/hooks/useUsage";
import { formatNumber, formatCost } from "@ctxopt/shared";
import { PeriodSelector } from "./PeriodSelector";
import { TokensChart } from "./TokensChart";
import { CostBreakdown } from "./CostBreakdown";
import { ModelTable } from "./ModelTable";
import { ExportButton } from "./ExportButton";

type Period = "last_7_days" | "last_30_days" | "this_month" | "last_month";

interface UserInfo {
  plan: string;
}

function StatCard({
  label,
  value,
  subtext,
  isLoading,
}: {
  label: string;
  value: string;
  subtext?: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 animate-pulse">
        <div className="h-4 w-20 bg-muted rounded mb-2" />
        <div className="h-8 w-24 bg-muted rounded mb-1" />
        {subtext && <div className="h-3 w-16 bg-muted rounded" />}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}

export function AnalyticsContent() {
  const [period, setPeriod] = useState<Period>("last_30_days");
  const [userPlan, setUserPlan] = useState<string>("free");

  const { data, isLoading, error, refresh } = useUsage({ period });

  // Fetch user plan for export button visibility
  useEffect(() => {
    fetch("/api/user/plan")
      .then((res) => res.json())
      .then((data) => {
        if (data.plan) setUserPlan(data.plan);
      })
      .catch(() => {
        // Default to free if can't fetch
      });
  }, []);

  const canExport = userPlan !== "free";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Detailed usage analysis and insights</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          {canExport && (
            <ExportButton
              data={data?.daily ?? []}
              period={period}
              disabled={isLoading}
            />
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={refresh}
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Tokens"
          value={formatNumber(data?.summary?.totalTokens ?? 0)}
          isLoading={isLoading}
        />
        <StatCard
          label="Total Cost"
          value={formatCost(data?.summary?.totalCostMicros ?? 0)}
          isLoading={isLoading}
        />
        <StatCard
          label="Requests"
          value={formatNumber(data?.summary?.totalRequests ?? 0)}
          isLoading={isLoading}
        />
        <StatCard
          label="Avg Latency"
          value={`${data?.summary?.avgLatencyMs ?? 0}ms`}
          isLoading={isLoading}
        />
      </div>

      {/* Main Chart */}
      <TokensChart data={data?.daily ?? []} isLoading={isLoading} />

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CostBreakdown data={data?.byModel ?? {}} isLoading={isLoading} />
        <ModelTable data={data?.byModel ?? {}} isLoading={isLoading} />
      </div>

      {/* Empty State */}
      {!isLoading && !error && data?.summary?.totalRequests === 0 && (
        <div className="rounded-lg border p-8 text-center">
          <h3 className="text-lg font-semibold mb-2">No data for this period</h3>
          <p className="text-muted-foreground mb-4">
            Try selecting a different time period or start using the API to see your analytics.
          </p>
          <button
            onClick={() => setPeriod("this_month")}
            className="text-sm font-medium text-primary hover:underline"
          >
            View this month
          </button>
        </div>
      )}
    </div>
  );
}
