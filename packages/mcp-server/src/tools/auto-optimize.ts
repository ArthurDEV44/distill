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

const autoOptimizeSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "The content to optimize (command output, logs, errors, code, etc.)",
    },
    hint: {
      type: "string",
      enum: ["build", "logs", "errors", "code", "auto"],
      description: "Hint about content type (optional, auto-detected by default)",
    },
    aggressive: {
      type: "boolean",
      description: "Aggressive mode: maximum compression even with information loss (default: false)",
    },
  },
  required: ["content"],
};

interface AutoOptimizeArgs {
  content: string;
  hint?: "build" | "logs" | "errors" | "code" | "auto";
  aggressive?: boolean;
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

function optimizeLogs(content: string): OptimizationResult {
  const originalTokens = countTokens(content);
  const summarizer = getSummarizer(content);
  const summaryResult = summarizer.summarize(content, { detail: "normal" });

  // Format summary as text
  const summaryText = formatLogSummary(summaryResult);
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

function formatLogSummary(summary: import("../summarizers/types.js").LogSummary): string {
  const parts: string[] = [];
  parts.push(`## ${summary.overview}`);
  parts.push("");

  if (summary.errors.length > 0) {
    parts.push("### Errors");
    for (const error of summary.errors.slice(0, 10)) {
      const count = error.count > 1 ? ` (×${error.count})` : "";
      parts.push(`- ${error.timestamp || ""} ${error.message}${count}`);
    }
    parts.push("");
  }

  if (summary.warnings.length > 0) {
    parts.push("### Warnings");
    for (const warning of summary.warnings.slice(0, 5)) {
      const count = warning.count > 1 ? ` (×${warning.count})` : "";
      parts.push(`- ${warning.timestamp || ""} ${warning.message}${count}`);
    }
    parts.push("");
  }

  if (summary.keyEvents.length > 0) {
    parts.push("### Key Events");
    for (const event of summary.keyEvents.slice(0, 5)) {
      parts.push(`- ${event.timestamp || ""} ${event.message}`);
    }
  }

  return parts.join("\n");
}

function optimizeErrors(content: string): OptimizationResult {
  const originalTokens = countTokens(content);
  const lines = content.split("\n").filter((l) => l.trim());

  // Group errors by signature
  const result = groupBySignature(lines);
  const stats = calculateStats(result);
  const formatted = formatGroups(result);

  const header = `**${stats.originalLines} lines → ${stats.uniqueErrors} unique patterns** (${stats.totalDuplicates} duplicates removed)\n\n`;
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
  const { content, hint = "auto", aggressive = false } = args;

  // Minimum threshold for optimization (500 chars ~ 125 tokens)
  if (content.length < 500) {
    return {
      content: [
        {
          type: "text",
          text: `## Already Optimal\n\nContent is too short (${content.length} chars) to benefit from optimization.\n\n${content}`,
        },
      ],
    };
  }

  let result: OptimizationResult;

  // Determine content type
  if (hint === "build" || (hint === "auto" && isBuildOutput(content))) {
    result = optimizeBuildOutput(content);
  } else if (hint === "logs" || (hint === "auto" && detectContentType(content) === "logs")) {
    result = optimizeLogs(content);
  } else if (hint === "errors") {
    result = optimizeErrors(content);
  } else {
    // Use automatic type detection
    const detectedType: ContentType = detectContentType(content);

    switch (detectedType) {
      case "logs":
        result = optimizeLogs(content);
        break;
      case "stacktrace":
        result = optimizeErrors(content);
        break;
      default:
        result = optimizeGeneric(content, aggressive);
    }
  }

  // Format output
  const output = `## Optimized Content

**Detected type:** ${result.detectedType}
**Method:** ${result.method}
**Tokens:** ${result.originalTokens} → ${result.optimizedTokens} (${result.savingsPercent}% saved)

---

${result.optimizedContent}`;

  return {
    content: [{ type: "text", text: output }],
  };
}

export const autoOptimizeTool: ToolDefinition = {
  name: "auto_optimize",
  description: `Automatically optimize any verbose content.

RECOMMENDED USAGE: Call this tool after any Bash command that produces output > 500 characters.

Auto-detects content type and applies appropriate optimization:
- Build errors → grouping and deduplication (95%+ reduction)
- Logs → intelligent summary (80-90% reduction)
- Repetitive errors → pattern-based deduplication
- Other content → intelligent compression (40-60% reduction)

Example: After "npm run build" fails, pass the output to auto_optimize to get a structured error summary.`,
  inputSchema: autoOptimizeSchema,
  execute: async (args) => autoOptimize(args as AutoOptimizeArgs),
};
