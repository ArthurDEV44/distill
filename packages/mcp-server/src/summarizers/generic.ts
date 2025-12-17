/**
 * Generic Logs Summarizer
 *
 * Fallback summarizer for application logs that don't match specific patterns.
 */

import type {
  Summarizer,
  LogSummary,
  LogEntry,
  LogStatistics,
  SummarizeOptions,
} from "./types.js";
import {
  parseLogLine,
  calculateTimespan,
  deduplicateEntries,
  filterByTimeframe,
  isKeyEvent,
} from "../utils/log-parser.js";
import { MAX_ENTRIES } from "./types.js";

/**
 * Generic logs summarizer
 */
export const genericSummarizer: Summarizer = {
  name: "generic",
  logType: "generic",

  canSummarize(_logs: string): boolean {
    // Generic summarizer can handle anything
    return true;
  },

  summarize(logs: string, options: SummarizeOptions): LogSummary {
    const lines = logs.split("\n").filter((l) => l.trim());
    const errors: LogEntry[] = [];
    const warnings: LogEntry[] = [];
    const keyEvents: LogEntry[] = [];
    const allEntries: LogEntry[] = [];

    // Parse all lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const entry = parseLogLine(trimmed);
      allEntries.push(entry);

      // Categorize by level
      switch (entry.level) {
        case "error":
          errors.push(entry);
          break;
        case "warning":
          warnings.push(entry);
          break;
      }

      // Detect key events
      if (isKeyEvent(trimmed)) {
        keyEvents.push(entry);
      }
    }

    // Filter by timeframe if specified
    const filteredEntries = filterByTimeframe(allEntries, options.timeframe);

    // Calculate timespan
    const timespan = calculateTimespan(filteredEntries);

    // Deduplicate errors and warnings
    const deduplicatedErrors = deduplicateEntries(errors);
    const deduplicatedWarnings = deduplicateEntries(warnings);

    // Build statistics
    const statistics: LogStatistics = {
      timespan,
      totalLines: lines.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount: allEntries.filter((e) => e.level === "info").length,
      debugCount: allEntries.filter((e) => e.level === "debug").length,
    };

    // Build overview
    const overview = buildOverview(statistics);

    return {
      logType: options.logType || "generic",
      overview,
      errors: deduplicatedErrors.slice(0, MAX_ENTRIES[options.detail].errors),
      warnings: deduplicatedWarnings.slice(0, MAX_ENTRIES[options.detail].warnings),
      keyEvents: keyEvents.slice(0, MAX_ENTRIES[options.detail].events),
      statistics,
    };
  },
};

/**
 * Build overview text
 */
function buildOverview(stats: LogStatistics): string {
  const parts: string[] = [];

  parts.push(`${stats.totalLines.toLocaleString()} lines`);

  if (stats.timespan) {
    parts.push(`spanning ${stats.timespan.durationFormatted}`);
  }

  const levelCounts: string[] = [];
  if (stats.errorCount > 0) levelCounts.push(`${stats.errorCount} errors`);
  if (stats.warningCount > 0) levelCounts.push(`${stats.warningCount} warnings`);
  if (stats.infoCount > 0) levelCounts.push(`${stats.infoCount} info`);

  if (levelCounts.length > 0) {
    parts.push(`(${levelCounts.join(", ")})`);
  }

  return parts.join(" ") || "Log summary";
}
