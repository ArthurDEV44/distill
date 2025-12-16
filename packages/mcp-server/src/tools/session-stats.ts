/**
 * Session Stats Tool
 *
 * Returns real-time statistics from the current session state.
 * Supports multiple detail levels and export formats.
 */

import { z } from "zod";
import type { SessionState } from "../state/session.js";
import {
  getSessionStats,
  getRecentCommands,
  getToolBreakdown,
  getPatternStats,
  type ToolStats,
} from "../state/session.js";
import { generateRecommendations, formatRecommendations } from "../utils/recommendations.js";
import type { ToolDefinition } from "./registry.js";

export const sessionStatsSchema = {
  type: "object" as const,
  properties: {
    detail: {
      type: "string",
      description: "Level of detail: summary (compact), detailed (default), or full (everything)",
      enum: ["summary", "detailed", "full"],
    },
    includeHistory: {
      type: "boolean",
      description: "Include recent command history (default: false, auto-true for 'full')",
    },
    historyLimit: {
      type: "number",
      description: "Number of recent commands to include (default: 10)",
    },
    format: {
      type: "string",
      description: "Output format: markdown (default) or json",
      enum: ["markdown", "json"],
    },
  },
  required: [],
};

const inputSchema = z.object({
  detail: z.enum(["summary", "detailed", "full"]).optional().default("detailed"),
  includeHistory: z.boolean().optional(),
  historyLimit: z.number().optional().default(10),
  format: z.enum(["markdown", "json"]).optional().default("markdown"),
});

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toString();
}

function formatToolBreakdown(breakdown: Map<string, ToolStats>): string {
  if (breakdown.size === 0) {
    return "No tools used yet.";
  }

  // Sort by tokensSaved descending
  const sorted = Array.from(breakdown.entries()).sort(
    ([, a], [, b]) => b.tokensSaved - a.tokensSaved
  );

  const lines: string[] = [];
  lines.push("| Tool | Calls | Tokens In | Tokens Out | Saved |");
  lines.push("|------|-------|-----------|------------|-------|");

  for (const [name, stats] of sorted) {
    lines.push(
      `| ${name} | ${stats.calls} | ${formatTokens(stats.tokensIn)} | ${formatTokens(stats.tokensOut)} | ${formatTokens(stats.tokensSaved)} |`
    );
  }

  return lines.join("\n");
}

function formatToolBreakdownCompact(breakdown: Map<string, ToolStats>): string {
  if (breakdown.size === 0) {
    return "No tools used";
  }

  // Sort by calls descending
  const sorted = Array.from(breakdown.entries())
    .sort(([, a], [, b]) => b.calls - a.calls)
    .slice(0, 3);

  return sorted.map(([name, stats]) => `${name} (${stats.calls})`).join(", ");
}

interface SessionStatsJSON {
  session: {
    id: string;
    startedAt: string;
    durationMs: number;
    durationFormatted: string;
  };
  tokens: {
    used: number;
    saved: number;
    savingsPercent: number;
  };
  commands: {
    total: number;
  };
  tools: Record<string, ToolStats>;
  patterns: {
    retryLoopsDetected: number;
    uniqueErrors: number;
    totalErrorOccurrences: number;
  };
  project: {
    name: string;
    type: string;
    path: string;
  } | null;
  recommendations: string[];
}

function buildJSONOutput(state: SessionState): SessionStatsJSON {
  const stats = getSessionStats(state);
  const breakdown = getToolBreakdown(state);
  const patterns = getPatternStats(state);
  const recommendations = generateRecommendations(state);

  const toolsObj: Record<string, ToolStats> = {};
  for (const [name, toolStats] of breakdown.entries()) {
    toolsObj[name] = toolStats;
  }

  return {
    session: {
      id: stats.sessionId,
      startedAt: state.startedAt.toISOString(),
      durationMs: stats.duration,
      durationFormatted: formatDuration(stats.duration),
    },
    tokens: {
      used: stats.tokensUsed,
      saved: stats.tokensSaved,
      savingsPercent: stats.savingsPercent,
    },
    commands: {
      total: stats.commandCount,
    },
    tools: toolsObj,
    patterns,
    project: state.project
      ? {
          name: state.project.name,
          type: state.project.type,
          path: state.project.rootPath,
        }
      : null,
    recommendations: recommendations.map((r) => r.message),
  };
}

function buildSummaryOutput(state: SessionState): string {
  const stats = getSessionStats(state);
  const breakdown = getToolBreakdown(state);

  const parts: string[] = [];

  parts.push(
    `**Session:** ${formatDuration(stats.duration)} | **Tokens:** ${formatTokens(stats.tokensUsed)} used, ${formatTokens(stats.tokensSaved)} saved (${stats.savingsPercent}%)`
  );
  parts.push(`**Tools:** ${formatToolBreakdownCompact(breakdown)}`);

  return parts.join("\n");
}

function buildDetailedOutput(state: SessionState, includeHistory: boolean, historyLimit: number): string {
  const stats = getSessionStats(state);
  const breakdown = getToolBreakdown(state);
  const patterns = getPatternStats(state);
  const recommendations = generateRecommendations(state);

  const parts: string[] = [];

  parts.push("## Session Statistics");
  parts.push("");
  parts.push(`**Session ID:** \`${stats.sessionId}\``);
  parts.push(`**Duration:** ${formatDuration(stats.duration)}`);
  parts.push(`**Commands Executed:** ${stats.commandCount}`);
  parts.push("");

  parts.push("### Token Usage");
  parts.push(`- **Tokens Used:** ${formatTokens(stats.tokensUsed)}`);
  parts.push(`- **Tokens Saved:** ${formatTokens(stats.tokensSaved)}`);
  parts.push(`- **Savings:** ${stats.savingsPercent}%`);
  parts.push("");

  if (breakdown.size > 0) {
    parts.push("### Tool Breakdown");
    parts.push(formatToolBreakdown(breakdown));
    parts.push("");
  }

  parts.push("### Patterns Detected");
  parts.push(`- **Retry Loops:** ${patterns.retryLoopsDetected}`);
  parts.push(`- **Unique Errors Cached:** ${patterns.uniqueErrors}`);
  parts.push(`- **Total Error Occurrences:** ${patterns.totalErrorOccurrences}`);
  parts.push("");

  if (recommendations.length > 0) {
    parts.push("### Recommendations");
    parts.push(formatRecommendations(recommendations));
    parts.push("");
  }

  if (state.project) {
    parts.push("### Project Info");
    parts.push(`- **Name:** ${state.project.name}`);
    parts.push(`- **Type:** ${state.project.type}`);
    parts.push(`- **Path:** \`${state.project.rootPath}\``);
    parts.push("");
  }

  if (includeHistory && stats.commandCount > 0) {
    const recentCommands = getRecentCommands(state, historyLimit);
    parts.push("### Recent Commands");
    parts.push("");
    parts.push("| Tool | Tokens In | Tokens Out | Saved | Duration |");
    parts.push("|------|-----------|------------|-------|----------|");

    for (const cmd of recentCommands) {
      parts.push(
        `| ${cmd.toolName} | ${formatTokens(cmd.tokensIn)} | ${formatTokens(cmd.tokensOut)} | ${formatTokens(cmd.tokensSaved)} | ${cmd.durationMs}ms |`
      );
    }
    parts.push("");
  }

  parts.push("---");
  parts.push("*Stats from CtxOpt MCP Server*");

  return parts.join("\n");
}

function buildFullOutput(state: SessionState, historyLimit: number): string {
  // Full includes everything from detailed, plus always includes history
  return buildDetailedOutput(state, true, historyLimit);
}

export async function executeSessionStats(
  args: unknown,
  state: SessionState
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = inputSchema.parse(args);

  // For 'full' detail, always include history
  const includeHistory = input.includeHistory ?? (input.detail === "full");

  // JSON format
  if (input.format === "json") {
    const jsonOutput = buildJSONOutput(state);
    return {
      content: [{ type: "text", text: JSON.stringify(jsonOutput, null, 2) }],
    };
  }

  // Markdown format
  let result: string;

  switch (input.detail) {
    case "summary":
      result = buildSummaryOutput(state);
      break;
    case "full":
      result = buildFullOutput(state, input.historyLimit);
      break;
    case "detailed":
    default:
      result = buildDetailedOutput(state, includeHistory, input.historyLimit);
      break;
  }

  return {
    content: [{ type: "text", text: result }],
  };
}

export const sessionStatsTool: ToolDefinition = {
  name: "session_stats",
  description: `Get real-time statistics for the current MCP session.
Shows token usage, savings by tool, patterns detected, and actionable recommendations.
Use detail="summary" for compact output, "detailed" (default) for full stats, or "full" for everything including command history.
Use format="json" for machine-readable output.`,
  inputSchema: sessionStatsSchema,
  execute: executeSessionStats,
};
