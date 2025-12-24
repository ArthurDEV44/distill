/**
 * Summarize Logs Tool
 *
 * Intelligently summarizes verbose logs, extracting errors, warnings,
 * key events, and statistics.
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import {
  getSummarizer,
  type LogType,
  type FocusArea,
  type DetailLevel,
  type LogSummary,
  type SummarizeOptions,
  MAX_ENTRIES,
} from "../summarizers/index.js";
import { detectLogType } from "../utils/log-parser.js";

export const summarizeLogsSchema = {
  type: "object" as const,
  properties: {
    logs: {
      type: "string",
      description: "The log content to summarize",
    },
    logType: {
      type: "string",
      description: "Type of log (auto-detected if not provided)",
      enum: ["server", "test", "build", "application", "generic"],
    },
    focus: {
      type: "array",
      description: "Areas to focus on in the summary",
      items: {
        type: "string",
        enum: ["errors", "warnings", "performance", "timeline"],
      },
    },
    detail: {
      type: "string",
      description: "Level of detail in the summary (default: normal)",
      enum: ["minimal", "normal", "detailed"],
    },
    timeframe: {
      type: "object",
      description: "Time range filter (if timestamps are present)",
      properties: {
        start: { type: "string", description: "Start time" },
        end: { type: "string", description: "End time" },
      },
    },
  },
  required: ["logs"],
};

const inputSchema = z.object({
  logs: z.string(),
  logType: z
    .enum(["server", "test", "build", "application", "generic"])
    .optional(),
  focus: z
    .array(z.enum(["errors", "warnings", "performance", "timeline"]))
    .optional(),
  detail: z.enum(["minimal", "normal", "detailed"]).optional().default("normal"),
  timeframe: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});

export async function executeSummarizeLogs(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = inputSchema.parse(args);

  // Detect log type if not provided
  const detectedType = input.logType || detectLogType(input.logs);

  // Get appropriate summarizer
  const summarizer = getSummarizer(input.logs, detectedType as LogType);

  // Build options
  const options: SummarizeOptions = {
    logType: detectedType as LogType,
    focus: input.focus as FocusArea[] | undefined,
    detail: input.detail as DetailLevel,
    timeframe: input.timeframe,
  };

  // Generate summary
  const summary = summarizer.summarize(input.logs, options);

  // Format output
  const output = formatSummary(summary, options);

  // Calculate token savings
  const originalLines = input.logs.split("\n").length;
  const outputLines = output.split("\n").length;
  const originalTokens = Math.ceil(input.logs.length / 4);
  const outputTokens = Math.ceil(output.length / 4);
  const tokensSaved = Math.max(0, originalTokens - outputTokens);

  // Add metrics section
  const parts: string[] = [output];
  parts.push("\n---");
  parts.push("## Metrics\n");
  parts.push("| Metric | Value |");
  parts.push("|--------|-------|");
  parts.push(`| Original lines | ${originalLines.toLocaleString()} |`);
  parts.push(`| Summary lines | ${outputLines.toLocaleString()} |`);
  parts.push(
    `| Reduction | ${Math.round(((originalLines - outputLines) / originalLines) * 100)}% |`
  );
  parts.push(`| Tokens saved | ~${tokensSaved.toLocaleString()} |`);

  // Update session state
  if (tokensSaved > 0) {
  }

  return {
    content: [{ type: "text", text: parts.join("\n") }],
  };
}

/**
 * Format the summary as markdown
 */
function formatSummary(summary: LogSummary, options: SummarizeOptions): string {
  const parts: string[] = [];
  const focus = options.focus || ["errors", "warnings", "timeline"];

  // Header
  parts.push(`## Log Summary (${summary.logType})\n`);
  parts.push(`**${summary.overview}**\n`);

  // Errors section
  if (focus.includes("errors") && summary.errors.length > 0) {
    parts.push("---");
    parts.push(`### Errors (${summary.statistics.errorCount})\n`);

    if (summary.errors.length <= 5) {
      for (const error of summary.errors) {
        const prefix = error.timestamp ? `${error.timestamp} - ` : "";
        const suffix = error.count > 1 ? ` (×${error.count})` : "";
        parts.push(`- ${prefix}${error.message}${suffix}`);
      }
    } else {
      parts.push("| Time | Message | Count |");
      parts.push("|------|---------|-------|");
      for (const error of summary.errors.slice(0, MAX_ENTRIES[options.detail].errors)) {
        const time = error.timestamp || "-";
        const msg = truncate(error.message, 60);
        parts.push(`| ${time} | ${msg} | ${error.count} |`);
      }
      if (summary.errors.length > MAX_ENTRIES[options.detail].errors) {
        parts.push(
          `\n*...and ${summary.errors.length - MAX_ENTRIES[options.detail].errors} more errors*`
        );
      }
    }
    parts.push("");
  }

  // Warnings section
  if (focus.includes("warnings") && summary.warnings.length > 0) {
    parts.push("---");
    parts.push(`### Warnings (${summary.statistics.warningCount})\n`);

    for (const warning of summary.warnings.slice(0, MAX_ENTRIES[options.detail].warnings)) {
      const prefix = warning.timestamp ? `${warning.timestamp} - ` : "";
      const suffix = warning.count > 1 ? ` (×${warning.count})` : "";
      parts.push(`- ${prefix}${warning.message}${suffix}`);
    }
    if (summary.warnings.length > MAX_ENTRIES[options.detail].warnings) {
      parts.push(
        `\n*...and ${summary.warnings.length - MAX_ENTRIES[options.detail].warnings} more warnings*`
      );
    }
    parts.push("");
  }

  // Timeline / Key Events
  if (focus.includes("timeline") && summary.keyEvents.length > 0) {
    parts.push("---");
    parts.push("### Key Events\n");

    let eventNum = 1;
    for (const event of summary.keyEvents.slice(0, MAX_ENTRIES[options.detail].events)) {
      const time = event.timestamp || "";
      parts.push(`${eventNum}. ${time ? `${time} - ` : ""}${event.message}`);
      eventNum++;
    }
    parts.push("");
  }

  // Performance / Statistics
  if (focus.includes("performance") || summary.logType === "server") {
    parts.push("---");
    parts.push("### Statistics\n");

    const stats = summary.statistics;

    if (stats.timespan) {
      parts.push(`- **Duration:** ${stats.timespan.durationFormatted}`);
    }

    // Server-specific stats
    if (stats.requestCount !== undefined) {
      parts.push(`- **Total requests:** ${stats.requestCount.toLocaleString()}`);
    }
    if (stats.avgResponseTime !== undefined && stats.avgResponseTime > 0) {
      parts.push(`- **Avg response time:** ${stats.avgResponseTime}ms`);
    }
    if (stats.endpoints && stats.endpoints.length > 0) {
      parts.push("\n**Top Endpoints:**");
      parts.push("| Endpoint | Requests | Avg Time |");
      parts.push("|----------|----------|----------|");
      for (const ep of stats.endpoints.slice(0, 5)) {
        parts.push(`| ${ep.method} ${ep.path} | ${ep.count} | ${ep.avgTime}ms |`);
      }
    }

    // Test-specific stats
    if (stats.passCount !== undefined) {
      const total = (stats.passCount || 0) + (stats.failCount || 0) + (stats.skipCount || 0);
      const passRate = total > 0 ? Math.round(((stats.passCount || 0) / total) * 100) : 0;
      parts.push(`- **Tests:** ${stats.passCount} passed, ${stats.failCount} failed`);
      if (stats.skipCount) {
        parts.push(`- **Skipped:** ${stats.skipCount}`);
      }
      parts.push(`- **Pass rate:** ${passRate}%`);
    }
    if (stats.testDuration) {
      parts.push(`- **Test duration:** ${(stats.testDuration / 1000).toFixed(2)}s`);
    }

    // Build-specific stats
    if (stats.buildDuration) {
      parts.push(`- **Build time:** ${(stats.buildDuration / 1000).toFixed(2)}s`);
    }
    if (stats.bundleSize) {
      parts.push(`- **Bundle size:** ${(stats.bundleSize / 1024).toFixed(1)} KB`);
    }

    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Truncate a string to a maximum length
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export const summarizeLogsTool: ToolDefinition = {
  name: "summarize_logs",
  description: `Summarize verbose logs to reduce tokens by 90%+.

Use this tool when you have large log outputs (server logs, test results, build output) to get a concise summary with:
- Errors and warnings extracted and deduplicated
- Key events timeline
- Statistics (request counts, response times, test results, etc.)
- Auto-detection of log type (server, test, build, application)

Supports focus areas: errors, warnings, performance, timeline.`,
  inputSchema: summarizeLogsSchema,
  execute: executeSummarizeLogs,
};
