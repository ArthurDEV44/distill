"use client";

import type { ApiKey } from "@ctxopt/shared";

interface ApiKeysListProps {
  apiKeys: ApiKey[];
  isLoading: boolean;
  projectName: string;
  onRevoke: (keyId: string) => void;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) {
    return formatDate(date);
  }
  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  if (diffMins > 0) {
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  }
  return "Just now";
}

export function ApiKeysList({
  apiKeys,
  isLoading,
  projectName,
  onRevoke,
}: ApiKeysListProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border">
        <div className="p-6 text-center text-muted-foreground">Loading API keys...</div>
      </div>
    );
  }

  if (apiKeys.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <svg
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
        </div>
        <h3 className="font-semibold mb-1">No API Keys</h3>
        <p className="text-sm text-muted-foreground">
          Create an API key to start tracking usage for {projectName}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border divide-y">
      {apiKeys.map((key) => (
        <div key={key.id} className="p-4 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{key.name}</span>
              <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                {key.keyPrefix}...
              </code>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Created: {formatDate(key.createdAt)}</span>
              <span>Last used: {formatRelativeTime(key.lastUsedAt)}</span>
            </div>
          </div>
          <button
            onClick={() => onRevoke(key.id)}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
          >
            Revoke
          </button>
        </div>
      ))}
    </div>
  );
}
