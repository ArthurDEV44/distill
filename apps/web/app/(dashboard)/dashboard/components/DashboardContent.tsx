"use client";

import { useSuggestions } from "@/lib/hooks/useUsage";
import { QuickActions } from "./QuickActions";
import { SuggestionsPreview } from "./SuggestionsPreview";
import Link from "next/link";

interface DashboardContentProps {
  userName: string;
}

export function DashboardContent({ userName }: DashboardContentProps) {
  const { data: suggestionsData, isLoading: suggestionsLoading } = useSuggestions({
    status: "active",
    limit: 5,
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {userName}</p>
      </div>

      {/* Quick Actions */}
      <QuickActions />

      {/* Suggestions */}
      <SuggestionsPreview
        suggestions={suggestionsData?.suggestions ?? []}
        isLoading={suggestionsLoading}
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
