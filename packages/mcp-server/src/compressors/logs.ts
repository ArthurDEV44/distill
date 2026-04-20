/**
 * Logs Compressor
 *
 * Specialized compressor for application logs.
 * Groups similar log entries and summarizes repetitive patterns.
 */

import type { Compressor, CompressOptions, CompressedResult, LineGroup } from "./types.js";
import { countTokens } from "../utils/token-counter.js";

// Log level patterns
const LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "WARNING", "ERROR", "FATAL"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

interface ParsedLogLine {
  raw: string;
  timestamp?: string;
  level?: LogLevel;
  message: string;
  normalizedMessage: string;
}

/**
 * Extract timestamp from log line
 */
function extractTimestamp(line: string): string | undefined {
  // ISO format: 2024-01-15T10:00:01
  const isoMatch = line.match(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?/);
  if (isoMatch) return isoMatch[0];

  // Bracket format: [10:00:01]
  const bracketMatch = line.match(/\[(\d{2}:\d{2}:\d{2})\]/);
  if (bracketMatch) return bracketMatch[1];

  // Syslog format: Jan 15 10:00:01
  const syslogMatch = line.match(/[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/);
  if (syslogMatch) return syslogMatch[0];

  return undefined;
}

/**
 * Extract log level from line
 */
function extractLogLevel(line: string): LogLevel | undefined {
  const upperLine = line.toUpperCase();
  for (const level of LOG_LEVELS) {
    if (upperLine.includes(`[${level}]`) || upperLine.includes(` ${level} `)) {
      return level;
    }
  }
  return undefined;
}

/**
 * Normalize log message for grouping
 */
function normalizeLogMessage(message: string): string {
  return message
    .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?/g, "TIMESTAMP") // Remove timestamps
    .replace(/\[\d{2}:\d{2}:\d{2}\]/g, "[TIMESTAMP]")
    .replace(/\d+\.\d+\.\d+\.\d+/g, "IP") // IP addresses
    .replace(/\d+ms/g, "Nms") // Durations
    .replace(/\d+/g, "N") // Numbers
    .replace(/[a-f0-9]{8,}/gi, "HASH") // Hashes/IDs
    .replace(/"[^"]*"/g, '"STR"') // Quoted strings
    .replace(/'[^']*'/g, "'STR'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a log line into structured data
 */
function parseLogLine(line: string): ParsedLogLine {
  const timestamp = extractTimestamp(line);
  const level = extractLogLevel(line);

  // Remove timestamp and level to get message
  let message = line;
  if (timestamp) {
    message = message.replace(timestamp, "").trim();
  }

  return {
    raw: line,
    timestamp,
    level,
    message,
    normalizedMessage: normalizeLogMessage(message),
  };
}

/**
 * Group log lines by their normalized message
 */
function groupLogLines(lines: string[], preservePatterns?: RegExp[]): Map<string, LineGroup> {
  const groups = new Map<string, LineGroup>();

  for (const line of lines) {
    if (!line.trim()) continue;

    // Check if line should be preserved
    const shouldPreserve = preservePatterns?.some((p) => p.test(line));
    if (shouldPreserve) {
      // Add as unique group
      const key = `preserve_${groups.size}`;
      groups.set(key, {
        pattern: line,
        sample: line,
        lines: [line],
        count: 1,
        hasError: false,
        hasWarning: false,
      });
      continue;
    }

    const parsed = parseLogLine(line);
    const key = parsed.normalizedMessage;

    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.count++;
    } else {
      const isError = parsed.level === "ERROR" || parsed.level === "FATAL";
      const isWarning = parsed.level === "WARN" || parsed.level === "WARNING";

      groups.set(key, {
        pattern: parsed.normalizedMessage,
        sample: line,
        lines: [line],
        count: 1,
        hasError: isError,
        hasWarning: isWarning,
      });
    }
  }

  return groups;
}

/**
 * Generate compressed output from groups
 */
function generateCompressedOutput(
  groups: Map<string, LineGroup>,
  detail: "minimal" | "normal" | "detailed"
): string[] {
  const output: string[] = [];

  // Sort: errors first, then warnings, then by count (descending)
  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    if (a.hasError && !b.hasError) return -1;
    if (!a.hasError && b.hasError) return 1;
    if (a.hasWarning && !b.hasWarning) return -1;
    if (!a.hasWarning && b.hasWarning) return 1;
    return b.count - a.count;
  });

  const threshold = detail === "minimal" ? 2 : detail === "normal" ? 3 : 5;

  for (const group of sortedGroups) {
    // Always show errors and warnings
    if (group.hasError || group.hasWarning) {
      if (detail === "detailed") {
        output.push(...group.lines);
      } else {
        output.push(group.sample);
        if (group.count > 1) {
          output.push(`  ... (${group.count - 1} similar entries)`);
        }
      }
      continue;
    }

    // Regular logs
    if (group.count <= threshold) {
      if (detail === "detailed") {
        output.push(...group.lines);
      } else {
        output.push(group.sample);
        if (group.count > 1) {
          output.push(`  ... (${group.count - 1} similar entries)`);
        }
      }
    } else {
      output.push(group.sample);
      output.push(`  ... (${group.count - 1} similar entries omitted)`);
    }
  }

  return output;
}

/**
 * Generate summary statistics
 */
function generateSummary(groups: Map<string, LineGroup>): string {
  let errorCount = 0;
  let warnCount = 0;
  let infoCount = 0;

  for (const group of groups.values()) {
    if (group.hasError) {
      errorCount += group.count;
    } else if (group.hasWarning) {
      warnCount += group.count;
    } else {
      infoCount += group.count;
    }
  }

  const parts: string[] = [];
  parts.push("### Log Summary");
  parts.push(`- **Errors:** ${errorCount}`);
  parts.push(`- **Warnings:** ${warnCount}`);
  parts.push(`- **Info/Other:** ${infoCount}`);
  parts.push(`- **Unique patterns:** ${groups.size}`);

  return parts.join("\n");
}

export const logsCompressor: Compressor = {
  name: "logs",
  supportedTypes: ["logs"],

  canCompress(content: string): boolean {
    // Check for log-like patterns
    const logPatterns = [
      /\[\s*(INFO|DEBUG|WARN|WARNING|ERROR|TRACE|FATAL)\s*\]/i,
      /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/,
      /^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/m,
    ];

    return logPatterns.some((pattern) => pattern.test(content));
  },

  compress(content: string, options: CompressOptions): CompressedResult {
    const lines = content.split("\n");
    const originalTokens = countTokens(content);

    // Group log lines
    const groups = groupLogLines(lines, options.preservePatterns);

    // Generate compressed output
    const compressedLines = generateCompressedOutput(groups, options.detail);

    // Add summary if not minimal
    if (options.detail !== "minimal") {
      compressedLines.push("");
      compressedLines.push("---");
      compressedLines.push(generateSummary(groups));
    }

    const compressed = compressedLines.join("\n");
    const compressedTokens = countTokens(compressed);

    const reductionPercent =
      originalTokens > 0 ? Math.round((1 - compressedTokens / originalTokens) * 100) : 0;

    // Count omitted
    const totalOriginal = Array.from(groups.values()).reduce((sum, g) => sum + g.count, 0);
    const omittedCount = totalOriginal - compressedLines.filter((l) => l.trim() && !l.startsWith("  ...")).length;

    return {
      compressed,
      stats: {
        originalLines: lines.length,
        compressedLines: compressedLines.length,
        originalTokens,
        compressedTokens,
        reductionPercent,
        technique: "log-grouping",
      },
      omittedInfo: omittedCount > 0 ? `${omittedCount} repetitive log entries summarized` : undefined,
    };
  },
};
