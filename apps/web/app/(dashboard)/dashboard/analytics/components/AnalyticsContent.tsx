"use client";

import { useAllProjectsUsage } from "@/lib/hooks/useUsageStats";
import type { UsagePeriod } from "@ctxopt/shared";
import Link from "next/link";

function formatNumber(n: number): string {
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return n.toString();
}

function formatCost(micros: number): string {
  const dollars = micros / 1000000;
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  }
  return `$${dollars.toFixed(2)}`;
}

export function AnalyticsContent() {
  const { stats, period, isLoading, setPeriod } = useAllProjectsUsage();

  const periods: { value: UsagePeriod; label: string }[] = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "365d", label: "Last year" },
  ];

  // Check if there's any data
  const hasData = stats && stats.sessionCount > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">
            Usage insights and token optimization metrics
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as UsagePeriod)}
          className="rounded-md border px-3 py-2 text-sm bg-background"
        >
          {periods.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="rounded-lg border p-8 text-center">
          <div className="animate-pulse">Loading analytics...</div>
        </div>
      ) : !hasData ? (
        /* No Data State */
        <div className="rounded-lg border p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <svg
              className="h-8 w-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">No Usage Data Yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Configure an API key and use the MCP server to start collecting usage
            analytics.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/dashboard/api-keys"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Configure API Key
            </Link>
            <Link
              href="/docs/mcp"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              View MCP Docs
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Tokens Used</p>
              <p className="text-2xl font-bold">{formatNumber(stats.totalTokensUsed)}</p>
              <p className="text-xs text-muted-foreground">
                ~{formatCost(stats.totalCostMicros)} cost
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Tokens Saved</p>
              <p className="text-2xl font-bold text-green-600">
                {formatNumber(stats.totalTokensSaved)}
              </p>
              <p className="text-xs text-green-600">
                ~{formatCost(stats.totalSavingsMicros)} saved
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Savings Rate</p>
              <p className="text-2xl font-bold">{stats.totalSavingsPercent.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">of total tokens</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Sessions</p>
              <p className="text-2xl font-bold">{stats.sessionCount}</p>
              <p className="text-xs text-muted-foreground">
                {stats.totalCommands} commands
              </p>
            </div>
          </div>

          {/* Top Saving Tools */}
          {stats.topTools.length > 0 && (
            <div className="rounded-lg border p-6">
              <h2 className="mb-4 text-lg font-semibold">Top Saving Tools</h2>
              <div className="space-y-3">
                {stats.topTools.map((tool, index) => (
                  <div key={tool.name} className="flex items-center gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-mono">{tool.name}</code>
                        <span className="text-sm text-muted-foreground">
                          {formatNumber(tool.tokensSaved)} tokens
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${Math.min(tool.savingsPercent, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-green-600 w-12 text-right">
                      {tool.savingsPercent.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tips */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-lg font-semibold">Token Optimization Tips</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
              1
            </div>
            <div>
              <p className="font-medium">Use smart_file_read</p>
              <p className="text-sm text-muted-foreground">
                Extract only the code you need instead of reading entire files.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
              2
            </div>
            <div>
              <p className="font-medium">Compress build output</p>
              <p className="text-sm text-muted-foreground">
                Use auto_optimize to reduce verbose build errors by 95%+.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
              3
            </div>
            <div>
              <p className="font-medium">Check session stats</p>
              <p className="text-sm text-muted-foreground">
                Monitor your savings with the session_stats tool.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
              4
            </div>
            <div>
              <p className="font-medium">Summarize logs</p>
              <p className="text-sm text-muted-foreground">
                Use summarize_logs for large log files to reduce tokens.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
