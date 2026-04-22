/**
 * Auto-Optimize Tool
 *
 * Unified compression tool that absorbs all compression strategies.
 * Auto-detects content type or accepts an explicit strategy parameter
 * to bypass detection and force a specific compression path.
 */

import type { ToolDefinition } from "./registry.js";
import isSafeRegex from "safe-regex2";

import { detectContentType } from "../utils/content-detector.js";
import { maybeWrapInMarker } from "../utils/distill-marker.js";
import type { ContentType } from "../compressors/types.js";
import { compressContent } from "../compressors/index.js";
import { compressDiff } from "../compressors/diff.js";
import { semanticCompressor } from "../compressors/semantic.js";
import { stacktraceCompressor } from "../compressors/stacktrace.js";
import { configCompressor } from "../compressors/config.js";
import { getSummarizer } from "../summarizers/index.js";
import { analyzeBuildOutput } from "../parsers/index.js";
import { groupBySignature, formatGroups, calculateStats } from "../utils/signature-grouper.js";
import { countTokens } from "../utils/token-counter.js";
import { MAX_OUTPUT_CHARS } from "../constants.js";

type OutputFormat = "plain" | "markdown";

type Strategy = "auto" | "logs" | "build" | "diff" | "stacktrace" | "code" | "semantic" | "config" | "errors";

type ResponseFormat = "minimal" | "normal" | "detailed";

// Input schema with semantic descriptions for better LLM understanding
const autoOptimizeSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "The content to optimize (build output, logs, diffs, errors, code, config, or any text)",
    },
    strategy: {
      enum: ["auto", "logs", "build", "diff", "stacktrace", "code", "semantic", "config", "errors"],
      description:
        "Compression strategy: auto (detect), logs (server/test logs), build (compiler errors), " +
        "diff (git diff), stacktrace (stack traces), code/semantic (TF-IDF importance), " +
        "config (JSON/YAML), errors (deduplication)",
      default: "auto",
    },
    response_format: {
      enum: ["minimal", "normal", "detailed"],
      description:
        "Output verbosity: minimal (savings % + content), normal (stats line + content), " +
        "detailed (full metadata block + content)",
      default: "normal",
    },
    aggressive: {
      type: "boolean",
      description: "Enable aggressive compression for maximum token savings",
      default: false,
    },
    preservePatterns: {
      type: "array",
      items: { type: "string" },
      description: "Regex patterns for content that must never be compressed (e.g. ['ERROR.*critical', 'TODO'])",
      maxItems: 20,
      default: [],
    },
    format: {
      enum: ["plain", "markdown"],
      description: "Output format for structured sections (plain or markdown)",
      default: "plain",
    },
  },
  required: ["content"],
};

// Output schema per MCP 2025-06-18 spec for structured validation
const autoOptimizeOutputSchema = {
  type: "object" as const,
  properties: {
    detectedType: {
      type: "string",
      description: "Detected or specified content type",
    },
    originalTokens: {
      type: "number",
      description: "Token count before optimization",
    },
    optimizedTokens: {
      type: "number",
      description: "Token count after optimization",
    },
    savingsPercent: {
      type: "number",
      description: "Percentage of tokens saved (0-100)",
    },
    method: {
      type: "string",
      description: "Compression method used",
    },
    optimizedContent: {
      type: "string",
      description: "The optimized content",
    },
  },
  required: ["detectedType", "originalTokens", "optimizedTokens", "savingsPercent", "method", "optimizedContent"],
};

interface AutoOptimizeArgs {
  content: string;
  strategy?: Strategy;
  hint?: "build" | "logs" | "errors" | "code" | "auto";
  aggressive?: boolean;
  preservePatterns?: string[];
  format?: OutputFormat;
  response_format?: ResponseFormat;
}

interface OptimizationResult {
  optimizedContent: string;
  detectedType: string;
  originalTokens: number;
  optimizedTokens: number;
  savingsPercent: number;
  method: string;
}

/**
 * Parse user-provided regex strings into RegExp objects.
 * Invalid patterns and unsafe patterns (ReDoS risk via safe-regex2) are filtered out.
 */
function parsePreservePatterns(patterns?: string[]): { parsed: RegExp[] | undefined; warnings: string[] } {
  const warnings: string[] = [];
  if (!patterns || patterns.length === 0) return { parsed: undefined, warnings };
  const parsed: RegExp[] = [];
  for (const p of patterns) {
    if (p.length > 500 || !isSafeRegex(p)) {
      warnings.push(`Skipped unsafe regex pattern (ReDoS risk): ${JSON.stringify(p.slice(0, 50))}`);
      continue;
    }
    try {
      parsed.push(new RegExp(p));
    } catch {
      warnings.push(`Skipped invalid regex pattern: ${JSON.stringify(p.slice(0, 50))}`);
    }
  }
  return { parsed: parsed.length > 0 ? parsed : undefined, warnings };
}

function isBuildOutput(content: string): boolean {
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

function isDiffOutput(content: string): boolean {
  return (
    content.includes("diff --git ") ||
    (content.includes("--- a/") && content.includes("+++ b/")) ||
    /^@@\s+-\d+/m.test(content)
  );
}

// ---------------------------------------------------------------------------
// Strategy-specific optimization functions
// ---------------------------------------------------------------------------

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

function optimizeLogs(
  content: string,
  format: OutputFormat = "plain",
): OptimizationResult {
  const originalTokens = countTokens(content);
  const summarizer = getSummarizer(content);
  const summaryResult = summarizer.summarize(content, { detail: "normal" });

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
  format: OutputFormat = "plain",
): string {
  const parts: string[] = [];
  const md = format === "markdown";

  parts.push(md ? `## ${summary.overview}` : summary.overview);
  if (md) parts.push("");

  if (summary.errors.length > 0) {
    if (md) parts.push("### Errors");
    else parts.push("ERRORS:");
    for (const error of summary.errors.slice(0, 10)) {
      const count = error.count > 1 ? ` (x${error.count})` : "";
      const ts = error.timestamp ? `${error.timestamp} ` : "";
      parts.push(md ? `- ${ts}${error.message}${count}` : `  ${ts}${error.message}${count}`);
    }
    if (md) parts.push("");
  }

  if (summary.warnings.length > 0) {
    if (md) parts.push("### Warnings");
    else parts.push("WARNINGS:");
    for (const warning of summary.warnings.slice(0, 5)) {
      const count = warning.count > 1 ? ` (x${warning.count})` : "";
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

function optimizeDiff(content: string, aggressive: boolean): OptimizationResult {
  const originalTokens = countTokens(content);
  const strategy = aggressive ? "summary" : "hunks-only";
  const result = compressDiff(content, { strategy });

  return {
    optimizedContent: result.compressed,
    detectedType: "diff",
    originalTokens,
    optimizedTokens: result.stats.compressedTokens,
    savingsPercent: result.stats.reductionPercent,
    method: result.stats.technique,
  };
}

function optimizeStacktrace(content: string, aggressive: boolean): OptimizationResult {
  const originalTokens = countTokens(content);
  const result = stacktraceCompressor.compress(content, {
    detail: aggressive ? "minimal" : "normal",
  });

  return {
    optimizedContent: result.compressed,
    detectedType: "stacktrace",
    originalTokens,
    optimizedTokens: result.stats.compressedTokens,
    savingsPercent: result.stats.reductionPercent,
    method: result.stats.technique,
  };
}

function optimizeSemantic(
  content: string,
  aggressive: boolean,
  preservePatterns?: RegExp[],
): OptimizationResult {
  const originalTokens = countTokens(content);
  const targetRatio = aggressive ? 0.3 : 0.5;
  const result = semanticCompressor.compress(content, {
    detail: aggressive ? "minimal" : "normal",
    targetRatio,
    preservePatterns,
  });

  return {
    optimizedContent: result.compressed,
    detectedType: "semantic",
    originalTokens,
    optimizedTokens: result.stats.compressedTokens,
    savingsPercent: result.stats.reductionPercent,
    method: result.stats.technique,
  };
}

function optimizeConfig(content: string, aggressive: boolean): OptimizationResult {
  const originalTokens = countTokens(content);
  const result = configCompressor.compress(content, {
    detail: aggressive ? "minimal" : "normal",
  });

  return {
    optimizedContent: result.compressed,
    detectedType: "config",
    originalTokens,
    optimizedTokens: result.stats.compressedTokens,
    savingsPercent: result.stats.reductionPercent,
    method: result.stats.technique,
  };
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
    ? `**${stats.originalLines} lines -> ${stats.uniqueErrors} unique patterns** (${stats.totalDuplicates} duplicates removed)\n\n`
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

function optimizeGeneric(
  content: string,
  aggressive: boolean,
  preservePatterns?: RegExp[],
): OptimizationResult {
  const originalTokens = countTokens(content);
  const result = compressContent(content, {
    detail: aggressive ? "minimal" : "normal",
    preservePatterns,
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

// ---------------------------------------------------------------------------
// Strategy resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective strategy from explicit strategy, legacy hint, and auto-detection.
 */
function resolveStrategy(content: string, strategy: Strategy, hint?: string): Strategy {
  // Explicit strategy always wins (unless "auto")
  if (strategy !== "auto") return strategy;

  // Legacy hint support
  if (hint && hint !== "auto") {
    switch (hint) {
      case "build":
        return "build";
      case "logs":
        return "logs";
      case "errors":
        return "errors";
      case "code":
        return "semantic";
    }
  }

  // Auto-detection
  if (isBuildOutput(content)) return "build";
  if (isDiffOutput(content)) return "diff";

  const detectedType: ContentType = detectContentType(content);
  switch (detectedType) {
    case "logs":
      return "logs";
    case "stacktrace":
      return "stacktrace";
    case "config":
      return "config";
    case "code":
      return "semantic";
    default:
      return "auto"; // will fall through to generic
  }
}

// ---------------------------------------------------------------------------
// Output formatting by response_format
// ---------------------------------------------------------------------------

function formatOutput(result: OptimizationResult, responseFormat: ResponseFormat): string {
  const savings = Math.max(0, result.savingsPercent);
  switch (responseFormat) {
    case "minimal":
      return `(-${savings}%)\n${result.optimizedContent}`;
    case "detailed":
      return [
        `Strategy: ${result.detectedType}`,
        `Method: ${result.method}`,
        `Tokens: ${result.originalTokens} -> ${result.optimizedTokens} (-${savings}%)`,
        `---`,
        result.optimizedContent,
      ].join("\n");
    case "normal":
    default:
      return `[${result.detectedType}] ${result.originalTokens}->${result.optimizedTokens} tokens (-${savings}%)\n${result.optimizedContent}`;
  }
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

async function autoOptimize(
  args: AutoOptimizeArgs,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> }> {
  const {
    content,
    strategy: rawStrategy = "auto",
    hint,
    aggressive = false,
    preservePatterns: rawPreserve,
    format = "plain",
    response_format: responseFormat = "normal",
  } = args;

  // Handle empty or missing content
  if (!content || content.trim().length === 0) {
    const errorText = "No content provided. Pass content to optimize.";
    return {
      content: [{ type: "text", text: errorText }],
      isError: true,
      structuredContent: {
        detectedType: "none",
        originalTokens: 0,
        optimizedTokens: 0,
        savingsPercent: 0,
        method: "none",
        optimizedContent: "",
        compressionRatio: 1,
        outputChars: errorText.length,
        truncated: false,
      },
    };
  }

  const { parsed: preservePatterns, warnings: regexWarnings } = parsePreservePatterns(rawPreserve);

  // Minimum threshold for optimization (500 chars ~ 125 tokens)
  if (content.length < 500) {
    const tokens = countTokens(content);
    const shortResult: OptimizationResult = {
      optimizedContent: content,
      detectedType: "none",
      originalTokens: tokens,
      optimizedTokens: tokens,
      savingsPercent: 0,
      method: "none",
    };
    const shortOutput = formatOutput(shortResult, responseFormat);
    return {
      content: [{ type: "text", text: shortOutput }],
      structuredContent: {
        detectedType: "none",
        originalTokens: tokens,
        optimizedTokens: tokens,
        savingsPercent: 0,
        method: "none",
        optimizedContent: content,
        compressionRatio: 1,
        outputChars: shortOutput.length,
        truncated: false,
      },
    };
  }

  const resolved = resolveStrategy(content, rawStrategy, hint);

  let result: OptimizationResult;

  switch (resolved) {
    case "build":
      result = optimizeBuildOutput(content);
      break;
    case "logs":
      result = optimizeLogs(content, format);
      break;
    case "diff":
      result = optimizeDiff(content, aggressive);
      break;
    case "stacktrace":
      result = optimizeStacktrace(content, aggressive);
      break;
    case "code":
    case "semantic":
      result = optimizeSemantic(content, aggressive, preservePatterns);
      break;
    case "config":
      result = optimizeConfig(content, aggressive);
      break;
    case "errors":
      result = optimizeErrors(content, format);
      break;
    default:
      // "auto" that didn't resolve to a specific strategy -> generic
      result = optimizeGeneric(content, aggressive, preservePatterns);
  }

  // Format output based on response_format
  let output = formatOutput(result, responseFormat);

  // Append regex warnings if any patterns were filtered
  if (regexWarnings.length > 0) {
    output += "\n\n[WARN] " + regexWarnings.join("\n[WARN] ");
  }

  // Output budget cap: re-compress or truncate if over MAX_OUTPUT_CHARS
  // Note: re-compression uses the generic compressor and drops preservePatterns —
  // acceptable since the goal is to meet the size budget, not preserve formatting.
  // Regex warnings appended above are also lost on re-compression (acceptable trade-off).
  let truncated = false;
  if (output.length > MAX_OUTPUT_CHARS) {
    // Re-compress with aggressive settings
    const recompressed = compressContent(result.optimizedContent, {
      detail: "minimal",
      targetRatio: 0.2,
    });
    result = {
      ...result,
      optimizedContent: recompressed.compressed,
      optimizedTokens: recompressed.stats.compressedTokens,
      savingsPercent: Math.round(
        ((result.originalTokens - recompressed.stats.compressedTokens) / result.originalTokens) * 100,
      ),
      method: `${result.method}+recompressed`,
    };
    output = formatOutput(result, responseFormat);
  }

  if (output.length > MAX_OUTPUT_CHARS) {
    // Truncate as last resort — hard cap to ensure we never exceed budget
    truncated = true;
    const overBy = output.length - MAX_OUTPUT_CHARS;
    const truncMsg = `\n\n[... ${overBy} chars truncated. Use auto_optimize with smaller chunks.]`;
    output = output.slice(0, MAX_OUTPUT_CHARS - truncMsg.length) + truncMsg;
  }

  const compressionRatio = result.originalTokens > 0
    ? Math.min(1, Math.round((result.optimizedTokens / result.originalTokens) * 100) / 100)
    : 1;

  // US-008: opt-in compression envelope. Wrap only when savings ≥ 30%
  // (ratio ≤ 0.7). Gated by DISTILL_COMPRESSED_MARKERS env var for v0.9.x
  // backwards compatibility.
  const wrappedOutput = maybeWrapInMarker(output, {
    ratio: compressionRatio,
    method: result.method,
    shouldWrap: compressionRatio <= 0.7,
  });

  return {
    content: [{ type: "text", text: wrappedOutput }],
    structuredContent: {
      detectedType: result.detectedType,
      originalTokens: result.originalTokens,
      optimizedTokens: result.optimizedTokens,
      savingsPercent: result.savingsPercent,
      method: result.method,
      optimizedContent: result.optimizedContent,
      compressionRatio,
      outputChars: wrappedOutput.length,
      truncated,
    },
  };
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export function createAutoOptimizeTool(): ToolDefinition {
  return {
    name: "auto_optimize",
    description:
      "Compress large content to save tokens — build output, logs, diffs, code, configs, stack traces, errors.\n\n" +
      "WHEN TO USE: After running builds, tests, or commands that produce verbose output (>500 chars). " +
      "Before pasting logs, diffs, or error output into context. Ideal for tool results that would consume excessive tokens.\n\n" +
      "HOW TO FORMAT:\n" +
      '- Auto-detect: auto_optimize({ content: "<paste build output>" })\n' +
      '- Force strategy: auto_optimize({ content: "<paste>", strategy: "build" })\n' +
      '- Preserve patterns: auto_optimize({ content: "<paste>", preservePatterns: ["ERROR.*critical"] })\n' +
      '- Control verbosity: auto_optimize({ content: "<paste>", response_format: "minimal" })\n\n' +
      "Strategies and typical savings: build (95%), logs (80-90%), errors (70-90%), diff (60-80%), " +
      "stacktrace (50-80%), code/semantic (40-60%), config (30-60%). " +
      'Leave strategy as "auto" to detect automatically.\n\n' +
      "WHAT TO EXPECT: Compressed content with stats header. " +
      "response_format controls verbosity: minimal (savings % + content), normal (stats line + content), detailed (full metadata + content).\n\n" +
      "MARKER: When DISTILL_COMPRESSED_MARKERS=1 is set and savings are >= 30% " +
      "(ratio <= 0.7), the compressed text is wrapped in " +
      "[DISTILL:COMPRESSED ratio=X.XX method=<name>] ... [/DISTILL:COMPRESSED]. " +
      "The marker is opt-in and designed for use alongside the shipped PreCompact " +
      "hook so Claude Code's compact-summary step preserves the region verbatim.",
    inputSchema: autoOptimizeSchema,
    outputSchema: autoOptimizeOutputSchema,
    annotations: {
      title: "Auto Optimize",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    execute: async (args) => autoOptimize(args as AutoOptimizeArgs),
  };
}

/**
 * Default export imported by `server.ts` and registered at startup.
 */
export const autoOptimizeTool: ToolDefinition = createAutoOptimizeTool();
