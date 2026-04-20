/**
 * Generic Compressor
 *
 * Fallback compressor for unrecognized content types.
 * Uses line deduplication and repetition detection.
 */

import type { Compressor, CompressOptions, CompressedResult, LineGroup } from "./types.js";
import { countTokens } from "../utils/token-counter.js";

/**
 * Normalize a line for pattern matching (remove numbers, normalize whitespace)
 */
function normalizeLine(line: string): string {
  return line
    .replace(/\d+/g, "N") // Replace numbers
    .replace(/0x[a-fA-F0-9]+/g, "HEX") // Replace hex values
    .replace(/[a-f0-9]{8,}/gi, "HASH") // Replace hash-like strings
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Check if a line contains error indicators
 */
function isErrorLine(line: string): boolean {
  return /\b(error|Error|ERROR|fail|Fail|FAIL|fatal|Fatal|FATAL)\b/.test(line);
}

/**
 * Check if a line contains warning indicators
 */
function isWarningLine(line: string): boolean {
  return /\b(warn|Warn|WARN|warning|Warning|WARNING)\b/.test(line);
}

/**
 * Check if a line matches any preserve pattern
 */
function shouldPreserve(line: string, patterns?: RegExp[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => pattern.test(line));
}

/**
 * Group lines by their normalized pattern
 */
function groupLines(lines: string[], preservePatterns?: RegExp[]): LineGroup[] {
  const groups: Map<string, LineGroup> = new Map();
  const result: LineGroup[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Always keep preserved lines as individual groups
    if (shouldPreserve(line, preservePatterns)) {
      result.push({
        pattern: line,
        sample: line,
        lines: [line],
        count: 1,
        hasError: isErrorLine(line),
        hasWarning: isWarningLine(line),
      });
      continue;
    }

    const normalized = normalizeLine(line);
    const existing = groups.get(normalized);

    if (existing) {
      existing.lines.push(line);
      existing.count++;
      if (isErrorLine(line)) existing.hasError = true;
      if (isWarningLine(line)) existing.hasWarning = true;
    } else {
      const group: LineGroup = {
        pattern: normalized,
        sample: line,
        lines: [line],
        count: 1,
        hasError: isErrorLine(line),
        hasWarning: isWarningLine(line),
      };
      groups.set(normalized, group);
    }
  }

  // Add grouped lines to result
  result.push(...groups.values());

  return result;
}

/**
 * Compress grouped lines based on detail level
 */
function compressGroups(groups: LineGroup[], detail: "minimal" | "normal" | "detailed"): string[] {
  const output: string[] = [];
  const threshold = detail === "minimal" ? 2 : detail === "normal" ? 3 : 5;

  for (const group of groups) {
    // Always show errors and warnings fully
    if (group.hasError || group.hasWarning) {
      if (detail === "detailed" || group.count <= threshold) {
        output.push(...group.lines);
      } else {
        output.push(group.sample);
        if (group.count > 1) {
          output.push(`  ... (${group.count - 1} similar ${group.hasError ? "errors" : "warnings"})`);
        }
      }
      continue;
    }

    // Regular lines: show sample and count if above threshold
    if (group.count <= threshold) {
      output.push(...group.lines);
    } else {
      output.push(group.sample);
      output.push(`  ... (${group.count - 1} similar lines omitted)`);
    }
  }

  return output;
}

/**
 * Detect consecutive repeating lines
 */
function compressConsecutiveRepeats(lines: string[], threshold: number = 3): string[] {
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const currentLine = lines[i];
    let repeatCount = 1;

    // Count consecutive identical or similar lines
    while (i + repeatCount < lines.length) {
      const nextLine = lines[i + repeatCount];
      if (
        nextLine === currentLine ||
        normalizeLine(nextLine ?? "") === normalizeLine(currentLine ?? "")
      ) {
        repeatCount++;
      } else {
        break;
      }
    }

    if (repeatCount >= threshold) {
      output.push(currentLine ?? "");
      output.push(`  ... (repeated ${repeatCount - 1} more times)`);
    } else {
      for (let j = 0; j < repeatCount; j++) {
        output.push(lines[i + j] ?? "");
      }
    }

    i += repeatCount;
  }

  return output;
}

export const genericCompressor: Compressor = {
  name: "generic",
  supportedTypes: ["generic", "code"],

  canCompress(_content: string): boolean {
    // Generic compressor can always compress
    return true;
  },

  compress(content: string, options: CompressOptions): CompressedResult {
    const lines = content.split("\n");
    const originalTokens = countTokens(content);

    // First pass: compress consecutive repeats
    const afterRepeats = compressConsecutiveRepeats(lines);

    // Second pass: group and deduplicate similar lines
    const groups = groupLines(afterRepeats, options.preservePatterns);
    const compressedLines = compressGroups(groups, options.detail);

    const compressed = compressedLines.join("\n");
    const compressedTokens = countTokens(compressed);

    const reductionPercent =
      originalTokens > 0 ? Math.round((1 - compressedTokens / originalTokens) * 100) : 0;

    // Build omitted info
    const totalOmitted = lines.length - compressedLines.length;
    const omittedInfo =
      totalOmitted > 0 ? `${totalOmitted} lines omitted through deduplication` : undefined;

    return {
      compressed,
      stats: {
        originalLines: lines.length,
        compressedLines: compressedLines.length,
        originalTokens,
        compressedTokens,
        reductionPercent,
        technique: "line-deduplication",
      },
      omittedInfo,
    };
  },
};
