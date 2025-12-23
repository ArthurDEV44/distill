"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatCost } from "@ctxopt/shared";

export interface Session {
  id: string;
  date: string;
  tokensUsed: number;
  tokensSaved: number;
  savingsPercent: number;
  costMicros: number;
  model: string | null;
}

interface SessionsTableProps {
  sessions: Session[];
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}

const MODEL_NAMES: Record<string, string> = {
  "claude-opus-4-20250514": "Opus 4",
  "claude-sonnet-4-20250514": "Sonnet 4",
  "claude-3-5-haiku-20241022": "Haiku 3.5",
};

function getModelName(model: string | null): string {
  if (!model) return "Unknown";
  return MODEL_NAMES[model] || model.split("-").slice(1, 3).join(" ");
}

function getModelColor(model: string | null): string {
  if (!model) return "text-muted-foreground";
  if (model.includes("opus")) return "text-purple-600";
  if (model.includes("sonnet")) return "text-blue-600";
  if (model.includes("haiku")) return "text-green-600";
  return "text-muted-foreground";
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MIN_TABLE_HEIGHT = "min-h-[280px]";

function TableSkeleton() {
  return (
    <div className={`rounded-lg border ${MIN_TABLE_HEIGHT}`}>
      <div className="p-4 border-b">
        <div className="h-6 w-40 bg-muted rounded animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            <div className="h-4 w-12 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SessionsTable({
  sessions,
  hasMore,
  isLoading,
  onLoadMore,
}: SessionsTableProps) {
  if (isLoading && sessions.length === 0) {
    return <TableSkeleton />;
  }

  if (sessions.length === 0) {
    return (
      <div className={`rounded-lg border p-6 ${MIN_TABLE_HEIGHT}`}>
        <h3 className="text-lg font-semibold mb-4">Recent Sessions</h3>
        <div className="flex items-center justify-center text-muted-foreground h-[180px]">
          No sessions recorded yet
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${MIN_TABLE_HEIGHT}`}>
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="text-lg font-semibold">Recent Sessions</h3>
        <span className="text-sm text-muted-foreground">
          {sessions.length} sessions
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Saved</TableHead>
            <TableHead className="text-right">Savings</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Model</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell className="font-medium">
                {formatDate(session.date)}
              </TableCell>
              <TableCell className="text-right">
                {formatNumber(session.tokensUsed)}
              </TableCell>
              <TableCell className="text-right text-green-600">
                {formatNumber(session.tokensSaved)}
              </TableCell>
              <TableCell className="text-right">
                {session.savingsPercent.toFixed(1)}%
              </TableCell>
              <TableCell className="text-right">
                {formatCost(session.costMicros)}
              </TableCell>
              <TableCell>
                <span className={getModelColor(session.model)}>
                  {getModelName(session.model)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {hasMore && (
        <div className="p-4 border-t">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="w-full py-2 text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50"
          >
            {isLoading ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
