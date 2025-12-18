"use client";

import Link from "next/link";

export function AnalyticsContent() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Usage insights and token optimization metrics</p>
      </div>

      {/* Coming Soon */}
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
        <h3 className="text-xl font-semibold mb-2">Analytics Coming Soon</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          We&apos;re working on bringing you detailed analytics and insights from your
          MCP server usage. Stay tuned for token savings reports, optimization
          recommendations, and usage trends.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/docs/mcp"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            View MCP Docs
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>

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
