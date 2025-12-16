/**
 * Output Similarity Calculator
 *
 * Calculates similarity between command outputs to detect
 * retry loops with similar errors.
 */

import { createHash } from "crypto";

/**
 * Generate a short hash of the output for quick comparison
 */
export function hashOutput(output: string): string {
  return createHash("sha256").update(output).digest("hex").slice(0, 16);
}

/**
 * Calculate similarity percentage between two hashes
 * Returns 100 if identical, 0 otherwise (hash-based)
 */
export function calculateHashSimilarity(hash1: string, hash2: string): number {
  return hash1 === hash2 ? 100 : 0;
}

/**
 * Count error lines in output (lines containing "error", "Error", "ERROR")
 */
export function countErrors(output: string): number {
  const errorPattern = /\b(error|Error|ERROR|fail|Fail|FAIL)\b/gi;
  const lines = output.split("\n");
  return lines.filter((line) => errorPattern.test(line)).length;
}

/**
 * Count warning lines in output
 */
export function countWarnings(output: string): number {
  const warningPattern = /\b(warning|Warning|WARNING|warn|Warn|WARN)\b/gi;
  const lines = output.split("\n");
  return lines.filter((line) => warningPattern.test(line)).length;
}

/**
 * Extract error count from common build output patterns
 * e.g., "Found 147 errors" or "147 errors"
 */
export function extractErrorCount(output: string): number | null {
  // TypeScript: "Found X error(s)"
  const tsMatch = output.match(/Found\s+(\d+)\s+error/i);
  if (tsMatch) {
    return parseInt(tsMatch[1] ?? "0", 10);
  }

  // ESLint: "X error(s)"
  const eslintMatch = output.match(/(\d+)\s+error/i);
  if (eslintMatch) {
    return parseInt(eslintMatch[1] ?? "0", 10);
  }

  // Generic: count error lines
  return null;
}

/**
 * Analyze the trend of errors across multiple outputs
 */
export interface ErrorTrendAnalysis {
  trend: "same" | "decreasing" | "increasing" | "fluctuating" | "unknown";
  errorCounts: number[];
  firstCount: number;
  lastCount: number;
  delta: number;
}

export function analyzeErrorTrend(outputs: string[]): ErrorTrendAnalysis {
  if (outputs.length === 0) {
    return {
      trend: "unknown",
      errorCounts: [],
      firstCount: 0,
      lastCount: 0,
      delta: 0,
    };
  }

  const errorCounts = outputs.map((output) => {
    const extracted = extractErrorCount(output);
    return extracted ?? countErrors(output);
  });

  const firstCount = errorCounts[0] ?? 0;
  const lastCount = errorCounts[errorCounts.length - 1] ?? 0;
  const delta = lastCount - firstCount;

  // Determine trend
  let trend: ErrorTrendAnalysis["trend"] = "unknown";

  if (errorCounts.length >= 2) {
    const allSame = errorCounts.every((c) => c === firstCount);
    if (allSame) {
      trend = "same";
    } else {
      // Check if monotonically increasing or decreasing
      let increasing = true;
      let decreasing = true;

      for (let i = 1; i < errorCounts.length; i++) {
        const prev = errorCounts[i - 1] ?? 0;
        const curr = errorCounts[i] ?? 0;
        if (curr < prev) increasing = false;
        if (curr > prev) decreasing = false;
      }

      if (decreasing && delta < 0) {
        trend = "decreasing";
      } else if (increasing && delta > 0) {
        trend = "increasing";
      } else {
        trend = "fluctuating";
      }
    }
  }

  return {
    trend,
    errorCounts,
    firstCount,
    lastCount,
    delta,
  };
}

/**
 * Calculate overall similarity between current output and history
 */
export function calculateOutputSimilarity(historyHashes: string[], currentHash: string): number {
  if (historyHashes.length === 0) return 0;

  // Count how many previous outputs match exactly
  const matches = historyHashes.filter((h) => h === currentHash).length;

  // Return percentage of matches
  return Math.round((matches / historyHashes.length) * 100);
}

/**
 * Format a timespan for display
 */
export function formatTimespan(startTime: Date, endTime: Date | number): string {
  const start = startTime.getTime();
  const end = typeof endTime === "number" ? endTime : endTime.getTime();
  const diffMs = end - start;

  if (diffMs < 60000) {
    const seconds = Math.round(diffMs / 1000);
    return `last ${seconds} seconds`;
  } else if (diffMs < 3600000) {
    const minutes = Math.round(diffMs / 60000);
    return `last ${minutes} minute${minutes > 1 ? "s" : ""}`;
  } else {
    const hours = Math.round(diffMs / 3600000);
    return `last ${hours} hour${hours > 1 ? "s" : ""}`;
  }
}
