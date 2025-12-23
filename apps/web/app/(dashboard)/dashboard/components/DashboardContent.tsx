"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useProjectUsage } from "@/lib/hooks/useProjectUsage";
import { useSessions, useAllProjectsSessions } from "@/lib/hooks/useSessions";
import {
  ScopeSelector,
  StatsCards,
  UsageChart,
  ModelBreakdown,
  SessionsTable,
} from "@/components/dashboard";
import Link from "next/link";
import type { UsagePeriod } from "@ctxopt/shared";

const PERIODS: { value: UsagePeriod; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

interface DashboardContentProps {
  userName: string;
}

export function DashboardContent({ userName }: DashboardContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const scope = searchParams.get("project") ?? "all";

  const handleScopeChange = (newScope: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newScope === "all") {
      params.delete("project");
    } else {
      params.set("project", newScope);
    }
    router.push(`/dashboard?${params.toString()}`);
  };

  // Fetch usage stats based on scope (unified hook with server-side aggregation)
  const usageStats = useProjectUsage({
    projectId: scope === "all" ? undefined : scope,
  });

  // Fetch sessions based on scope
  const allProjectsSessions = useAllProjectsSessions({ period: usageStats.period });
  const singleProjectSessions = useSessions({
    projectId: scope !== "all" ? scope : undefined,
    period: usageStats.period,
  });

  const sessionsData = scope === "all" ? allProjectsSessions : singleProjectSessions;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {userName}</p>
        </div>
        <ScopeSelector value={scope} onChange={handleScopeChange} />
      </div>

      {/* Stats Cards */}
      <StatsCards
        tokensUsed={usageStats.stats?.totalTokensUsed ?? 0}
        tokensSaved={usageStats.stats?.totalTokensSaved ?? 0}
        estimatedCostMicros={usageStats.stats?.totalCostMicros ?? 0}
        savingsPercent={usageStats.stats?.totalSavingsPercent ?? 0}
        isLoading={usageStats.isLoading}
      />

      {/* Usage Analytics Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Usage Analytics</h2>
          <div className="flex gap-1 rounded-lg border p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => usageStats.setPeriod(p.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  usageStats.period === p.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <UsageChart
            data={usageStats.stats?.dailyData ?? []}
            isLoading={usageStats.isLoading}
          />
          <ModelBreakdown
            data={usageStats.stats?.modelBreakdown ?? {}}
            isLoading={usageStats.isLoading}
          />
        </div>
      </div>

      {/* Sessions Table */}
      <SessionsTable
        sessions={sessionsData.sessions}
        hasMore={sessionsData.hasMore}
        isLoading={sessionsData.isLoading}
        onLoadMore={sessionsData.loadMore}
      />

      {/* Quick Start Guide */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-xl font-semibold">Get Started with CtxOpt</h2>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              1
            </div>
            <div>
              <p className="font-medium">Install the MCP Server</p>
              <p className="text-sm text-muted-foreground">
                Add CtxOpt MCP Server to Claude Code, Cursor, or Windsurf.
              </p>
              <pre className="mt-2 rounded bg-muted p-2 text-xs">
                npx @ctxopt/mcp-server
              </pre>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              2
            </div>
            <div>
              <p className="font-medium">Configure Your IDE</p>
              <p className="text-sm text-muted-foreground">
                Add the MCP server to your IDE configuration file.
              </p>
              <Link
                href="/docs/guides/claude-code"
                className="mt-1 inline-block text-sm text-primary hover:underline"
              >
                View setup guide
              </Link>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              3
            </div>
            <div>
              <p className="font-medium">Start Saving Tokens</p>
              <p className="text-sm text-muted-foreground">
                Use MCP tools like smart_file_read and auto_optimize to reduce
                token usage.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
