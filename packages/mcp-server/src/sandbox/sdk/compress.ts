/**
 * SDK Compress Functions
 *
 * Wraps compression functionality for sandbox use.
 */

import { compressContent, analyzeContent, semanticCompressor } from "../../compressors/index.js";
import { getSummarizer } from "../../summarizers/index.js";
import { countTokens } from "../../utils/token-counter.js";
import type { CompressResult, LogSummary } from "../types.js";

/**
 * Auto-detect content type and apply optimal compression
 */
export function compressAuto(content: string, hint?: string): CompressResult {
  const analysis = analyzeContent(content);
  const contentType = hint || analysis.detectedType;

  const result = compressContent(content, {
    contentType: contentType as "logs" | "stacktrace" | "config" | "generic",
  });

  const originalTokens = countTokens(content);
  const compressedTokens = countTokens(result.compressed);

  return {
    compressed: result.compressed,
    stats: {
      original: originalTokens,
      compressed: compressedTokens,
      reductionPercent: Math.round((1 - compressedTokens / originalTokens) * 100),
    },
  };
}

/**
 * Summarize log output
 */
export function compressLogs(logs: string): LogSummary {
  const summarizer = getSummarizer(logs);
  const result = summarizer.summarize(logs, { detail: "normal" });

  return {
    summary: result.overview,
    stats: {
      totalLines: logs.split("\n").length,
      errorCount: result.errors?.length || 0,
      warningCount: result.warnings?.length || 0,
    },
  };
}

/**
 * Compress git diff output
 */
export function compressDiff(diff: string): CompressResult {
  // Extract key changes from diff
  const lines = diff.split("\n");
  const importantLines: string[] = [];

  let addedCount = 0;
  let removedCount = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      if (match) {
        importantLines.push(`\n## ${match[2]}`);
      }
    } else if (line.startsWith("@@")) {
      importantLines.push(line);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      addedCount++;
      if (line.trim().length > 1) {
        importantLines.push(line);
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removedCount++;
      if (line.trim().length > 1) {
        importantLines.push(line);
      }
    }
  }

  const header = `[diff] +${addedCount}/-${removedCount} lines`;
  const compressed = [header, ...importantLines].join("\n");

  const originalTokens = countTokens(diff);
  const compressedTokens = countTokens(compressed);

  return {
    compressed,
    stats: {
      original: originalTokens,
      compressed: compressedTokens,
      reductionPercent: Math.round((1 - compressedTokens / originalTokens) * 100),
    },
  };
}

/**
 * TF-IDF based semantic compression
 */
export function compressSemantic(content: string, ratio: number = 0.5): CompressResult {
  const result = semanticCompressor.compress(content, {
    targetRatio: ratio,
    detail: "normal",
  });

  const originalTokens = countTokens(content);
  const compressedTokens = countTokens(result.compressed);

  return {
    compressed: result.compressed,
    stats: {
      original: originalTokens,
      compressed: compressedTokens,
      reductionPercent: Math.round((1 - compressedTokens / originalTokens) * 100),
    },
  };
}
