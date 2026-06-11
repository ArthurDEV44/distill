/**
 * Config Compressor
 *
 * Specialized compressor for configuration files (JSON, YAML-like).
 * Summarizes nested objects and arrays while preserving structure.
 */

import type { Compressor, CompressOptions, CompressedResult } from "./types.js";
// US-006: route through the single canonical tiktoken encoder instead of
// opening a separate gpt-4 encoder instance here.
import { countTokens } from "../utils/token-counter.js";

/**
 * Check if content is valid JSON
 */
function isValidJSON(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Summarize a value based on its type and size
 */
function summarizeValue(value: unknown, depth: number, maxDepth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== "object") {
    // Truncate long strings
    if (typeof value === "string" && value.length > 100) {
      return value.slice(0, 97) + "...";
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [];

    // For deep arrays, just show count
    if (depth >= maxDepth) {
      return `[${value.length} items]`;
    }

    // For large arrays, show sample and count
    if (value.length > 5) {
      const sample = value.slice(0, 2).map((v) => summarizeValue(v, depth + 1, maxDepth));
      return [...sample, `... (${value.length - 2} more items)`];
    }

    return value.map((v) => summarizeValue(v, depth + 1, maxDepth));
  }

  // Object
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 0) return {};

  // For deep objects, just show key count
  if (depth >= maxDepth) {
    return `{${keys.length} keys}`;
  }

  // Summarize each key
  const result: Record<string, unknown> = {};

  for (const key of keys) {
    result[key] = summarizeValue(obj[key], depth + 1, maxDepth);
  }

  return result;
}

/**
 * Compress JSON content
 */
function compressJSON(
  content: string,
  detail: "minimal" | "normal" | "detailed"
): { compressed: string; technique: string } {
  try {
    const parsed = JSON.parse(content);

    // Determine max depth based on detail level
    const maxDepth = detail === "minimal" ? 1 : detail === "normal" ? 2 : 3;

    const summarized = summarizeValue(parsed, 0, maxDepth);
    const compressed = JSON.stringify(summarized, null, 2);

    return { compressed, technique: "json-summarize" };
  } catch {
    return { compressed: content, technique: "none" };
  }
}

/**
 * Compress YAML-like content (simple key: value pairs)
 */
function compressYAML(
  content: string,
  detail: "minimal" | "normal" | "detailed"
): { compressed: string; technique: string } {
  const lines = content.split("\n");
  const output: string[] = [];

  let currentIndent = 0;
  let skipUntilDedent = false;
  let skipIndent = 0;
  let skippedCount = 0;

  const maxIndent = detail === "minimal" ? 2 : detail === "normal" ? 4 : 6;

  for (const line of lines) {
    // Calculate indent level
    const match = line.match(/^(\s*)/);
    const indent = match ? match[1]?.length ?? 0 : 0;

    // If we were skipping, check if we should stop
    if (skipUntilDedent) {
      if (indent <= skipIndent && line.trim()) {
        // We've dedented, stop skipping
        if (skippedCount > 0) {
          output.push(`${"  ".repeat(skipIndent / 2)}  ... (${skippedCount} nested items)`);
        }
        skipUntilDedent = false;
        skippedCount = 0;
      } else {
        skippedCount++;
        continue;
      }
    }

    // Check if this line is too deep
    if (indent > maxIndent && line.trim()) {
      skipUntilDedent = true;
      skipIndent = currentIndent;
      skippedCount = 1;
      continue;
    }

    output.push(line);
    currentIndent = indent;
  }

  // Handle trailing skipped content
  if (skippedCount > 0) {
    output.push(`${"  ".repeat(skipIndent / 2)}  ... (${skippedCount} nested items)`);
  }

  return { compressed: output.join("\n"), technique: "yaml-depth-limit" };
}

/**
 * Detect if content is JSON or YAML-like
 */
function detectConfigType(content: string): "json" | "yaml" | "unknown" {
  const trimmed = content.trim();

  // JSON starts with { or [
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && isValidJSON(content)) {
    return "json";
  }

  // YAML-like: key: value patterns
  const yamlPattern = /^[\w-]+:\s*(.+)?$/m;
  if (yamlPattern.test(content)) {
    return "yaml";
  }

  return "unknown";
}

export const configCompressor: Compressor = {
  name: "config",
  supportedTypes: ["config"],

  canCompress(content: string): boolean {
    return detectConfigType(content) !== "unknown";
  },

  compress(content: string, options: CompressOptions): CompressedResult {
    const originalTokens = countTokens(content);
    const originalLines = content.split("\n").length;

    const configType = detectConfigType(content);

    let result: { compressed: string; technique: string };

    switch (configType) {
      case "json":
        result = compressJSON(content, options.detail);
        break;
      case "yaml":
        result = compressYAML(content, options.detail);
        break;
      default:
        result = { compressed: content, technique: "none" };
    }

    const compressedTokens = countTokens(result.compressed);
    const compressedLines = result.compressed.split("\n").length;

    const reductionPercent =
      originalTokens > 0 ? Math.round((1 - compressedTokens / originalTokens) * 100) : 0;

    return {
      compressed: result.compressed,
      stats: {
        originalLines,
        compressedLines,
        originalTokens,
        compressedTokens,
        reductionPercent,
        technique: result.technique,
      },
      omittedInfo:
        reductionPercent > 0 ? `Nested structures summarized (${configType} format)` : undefined,
    };
  },
};
