/**
 * Auto-Optimize strategy-specific compression functions (US-012 decomposition).
 *
 * Each `optimize*` function maps a content path to an OptimizationResult. The
 * bodies are byte-identical to the pre-decomposition single file — compressor
 * selection and output are unchanged.
 */

import isSafeRegex from "safe-regex2";

import { compressContent } from "../../compressors/index.js";
// semantic + diff are direct-only (not in the compressContent dispatch array) — US-005.
import { compressDiff, semanticCompressor } from "../../compressors/direct.js";
import { stacktraceCompressor } from "../../compressors/stacktrace.js";
import { configCompressor } from "../../compressors/config.js";
import { getSummarizer } from "../../summarizers/index.js";
import { analyzeBuildOutput } from "../../parsers/index.js";
import { groupBySignature, formatGroups, calculateStats } from "../../utils/signature-grouper.js";
import { countTokens } from "../../utils/token-counter.js";
import type { OutputFormat, OptimizationResult } from "./types.js";

/**
 * Parse user-provided regex strings into RegExp objects.
 * Invalid patterns and unsafe patterns (ReDoS risk via safe-regex2) are filtered out.
 */
export function parsePreservePatterns(patterns?: string[]): { parsed: RegExp[] | undefined; warnings: string[] } {
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

export function optimizeBuildOutput(content: string): OptimizationResult {
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

export function optimizeLogs(
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
  summary: import("../../summarizers/types.js").LogSummary,
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

export function optimizeDiff(content: string, aggressive: boolean): OptimizationResult {
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

export function optimizeStacktrace(content: string, aggressive: boolean): OptimizationResult {
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

export function optimizeSemantic(
  content: string,
  aggressive: boolean,
  preservePatterns?: RegExp[],
  query?: string,
): OptimizationResult {
  const originalTokens = countTokens(content);
  const targetRatio = aggressive ? 0.3 : 0.5;
  const result = semanticCompressor.compress(content, {
    detail: aggressive ? "minimal" : "normal",
    targetRatio,
    preservePatterns,
    query,
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

export function optimizeConfig(content: string, aggressive: boolean): OptimizationResult {
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

export function optimizeErrors(content: string, format: OutputFormat = "plain"): OptimizationResult {
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

export function optimizeGeneric(
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
