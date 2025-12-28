/**
 * Auto-Optimize Tool
 *
 * Unified tool that auto-detects content type and applies
 * the appropriate optimization automatically.
 */

import type { ToolDefinition } from "./registry.js";

import { detectContentType } from "../utils/content-detector.js";
import type { ContentType } from "../compressors/types.js";
import { compressContent } from "../compressors/index.js";
import { getSummarizer } from "../summarizers/index.js";
import { analyzeBuildOutput } from "../parsers/index.js";
import { groupBySignature, formatGroups, calculateStats } from "../utils/signature-grouper.js";
import { countTokens } from "../utils/token-counter.js";

type OutputFormat = "plain" | "markdown";

// Minimal schema - format rarely used, keep only essential properties
const autoOptimizeSchema = {
  type: "object" as const,
  properties: {
    content: { type: "string" },
    hint: { enum: ["build", "logs", "errors", "code", "auto"] },
    aggressive: { type: "boolean" },
    format: { enum: ["plain", "markdown"] },
  },
  required: ["content"],
};

interface AutoOptimizeArgs {
  content: string;
  hint?: "build" | "logs" | "errors" | "code" | "auto";
  aggressive?: boolean;
  format?: OutputFormat;
}

interface OptimizationResult {
  optimizedContent: string;
  detectedType: string;
  originalTokens: number;
  optimizedTokens: number;
  savingsPercent: number;
  method: string;
}

function isBuildOutput(content: string): boolean {
  // Detect if content is build output
  return (
    content.includes("error TS") ||
    content.includes("warning TS") ||
    content.includes("error[E") ||
    content.includes("error:") ||
    /\d+:\d+.*error/i.test(content) ||
    content.includes("npm ERR") ||
    content.includes("ERROR in")
  );
}

function optimizeBuildOutput(content: string): OptimizationResult {
  const originalTokens = countTokens(content);
  const result = analyzeBuildOutput(content);

  return {
    optimizedContent: result.summary,
    detectedType: `build-${result.buildTool}`,
    originalTokens,
    optimizedTokens: result.stats.tokensCompressed,
    savingsPercent: result.stats.reductionPercent,
    method: "error-grouping",
  };
}

function optimizeLogs(content: string, format: OutputFormat = "plain"): OptimizationResult {
  const originalTokens = countTokens(content);
  const summarizer = getSummarizer(content);
  const summaryResult = summarizer.summarize(content, { detail: "normal" });

  // Format summary as text
  const summaryText = formatLogSummary(summaryResult, format);
  const optimizedTokens = countTokens(summaryText);

  return {
    optimizedContent: summaryText,
    detectedType: `logs-${summarizer.logType}`,
    originalTokens,
    optimizedTokens,
    savingsPercent: Math.round((1 - optimizedTokens / originalTokens) * 100),
    method: "log-summarization",
  };
}

function formatLogSummary(
  summary: import("../summarizers/types.js").LogSummary,
  format: OutputFormat = "plain"
): string {
  const parts: string[] = [];
  const md = format === "markdown";

  parts.push(md ? `## ${summary.overview}` : summary.overview);
  if (md) parts.push("");

  if (summary.errors.length > 0) {
    if (md) parts.push("### Errors");
    else parts.push("ERRORS:");
    for (const error of summary.errors.slice(0, 10)) {
      const count = error.count > 1 ? ` (×${error.count})` : "";
      const ts = error.timestamp ? `${error.timestamp} ` : "";
      parts.push(md ? `- ${ts}${error.message}${count}` : `  ${ts}${error.message}${count}`);
    }
    if (md) parts.push("");
  }

  if (summary.warnings.length > 0) {
    if (md) parts.push("### Warnings");
    else parts.push("WARNINGS:");
    for (const warning of summary.warnings.slice(0, 5)) {
      const count = warning.count > 1 ? ` (×${warning.count})` : "";
      const ts = warning.timestamp ? `${warning.timestamp} ` : "";
      parts.push(md ? `- ${ts}${warning.message}${count}` : `  ${ts}${warning.message}${count}`);
    }
    if (md) parts.push("");
  }

  if (summary.keyEvents.length > 0) {
    if (md) parts.push("### Key Events");
    else parts.push("KEY EVENTS:");
    for (const event of summary.keyEvents.slice(0, 5)) {
      const ts = event.timestamp ? `${event.timestamp} ` : "";
      parts.push(md ? `- ${ts}${event.message}` : `  ${ts}${event.message}`);
    }
  }

  return parts.join("\n");
}

function optimizeErrors(content: string, format: OutputFormat = "plain"): OptimizationResult {
  const originalTokens = countTokens(content);
  const lines = content.split("\n").filter((l) => l.trim());
  const md = format === "markdown";

  // Group errors by signature
  const result = groupBySignature(lines);
  const stats = calculateStats(result);
  const formatted = formatGroups(result, format);

  const header = md
    ? `**${stats.originalLines} lines → ${stats.uniqueErrors} unique patterns** (${stats.totalDuplicates} duplicates removed)\n\n`
    : `${stats.originalLines} lines -> ${stats.uniqueErrors} unique patterns (${stats.totalDuplicates} duplicates removed)\n\n`;
  const optimizedContent = header + formatted;
  const optimizedTokens = countTokens(optimizedContent);

  return {
    optimizedContent,
    detectedType: "errors",
    originalTokens,
    optimizedTokens,
    savingsPercent: stats.reductionPercent,
    method: "error-deduplication",
  };
}

function optimizeGeneric(content: string, aggressive: boolean): OptimizationResult {
  const originalTokens = countTokens(content);
  const result = compressContent(content, {
    detail: aggressive ? "minimal" : "normal",
  });

  return {
    optimizedContent: result.compressed,
    detectedType: "generic",
    originalTokens,
    optimizedTokens: result.stats.compressedTokens,
    savingsPercent: result.stats.reductionPercent,
    method: result.stats.technique,
  };
}

async function autoOptimize(
  args: AutoOptimizeArgs
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const { content, hint = "auto", aggressive = false, format = "plain" } = args;
  const md = format === "markdown";

  // Minimum threshold for optimization (500 chars ~ 125 tokens)
  if (content.length < 500) {
    const msg = md
      ? `## Already Optimal\n\nContent is too short (${content.length} chars) to benefit from optimization.\n\n${content}`
      : `Already Optimal: Content too short (${content.length} chars)\n\n${content}`;
    return {
      content: [{ type: "text", text: msg }],
    };
  }

  let result: OptimizationResult;

  // Determine content type
  if (hint === "build" || (hint === "auto" && isBuildOutput(content))) {
    result = optimizeBuildOutput(content);
  } else if (hint === "logs" || (hint === "auto" && detectContentType(content) === "logs")) {
    result = optimizeLogs(content, format);
  } else if (hint === "errors") {
    result = optimizeErrors(content, format);
  } else {
    // Use automatic type detection
    const detectedType: ContentType = detectContentType(content);

    switch (detectedType) {
      case "logs":
        result = optimizeLogs(content, format);
        break;
      case "stacktrace":
        result = optimizeErrors(content, format);
        break;
      default:
        result = optimizeGeneric(content, aggressive);
    }
  }

  // Format output - minimal header to save tokens
  const stats = `[${result.detectedType}] ${result.originalTokens}→${result.optimizedTokens} tokens (-${result.savingsPercent}%)`;
  const output = `${stats}\n${result.optimizedContent}`;

  return {
    content: [{ type: "text", text: output }],
  };
}

export const autoOptimizeTool: ToolDefinition = {
  name: "auto_optimize",
  description: "Auto-compress verbose output (build errors, logs). 80-95% token reduction.",
  inputSchema: autoOptimizeSchema,
  execute: async (args) => autoOptimize(args as AutoOptimizeArgs),
};
