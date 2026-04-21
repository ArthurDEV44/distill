/**
 * Generic Logs Summarizer
 *
 * Fallback summarizer for application logs that don't match a specialized
 * shape (server/test/build). Composes three internal modules — `scoring`
 * (BM25 + multi-factor importance), `clustering` (semantic grouping), and
 * `pattern-extraction` (template mining) — into the entry-selection +
 * representative-sample pipeline. These modules are load-bearing for the
 * generic path, not optional enhancements.
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
import { createLogScorer, getBalancedTopEntries } from "./scoring.js";
import { clusterLogs, selectRepresentatives } from "./clustering.js";
import { extractPatterns, getPatternStats } from "./pattern-extraction.js";

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
    const allEntries: LogEntry[] = [];

    // Parse all lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const entry = parseLogLine(trimmed);
      allEntries.push(entry);
    }

    // Filter by timeframe if specified
    const filteredEntries = filterByTimeframe(allEntries, options.timeframe);

    // Score entries (BM25 + multi-factor importance) for ranking.
    const scorer = createLogScorer(filteredEntries);
    const scoredEntries = scorer.scoreAll();

    // Get errors and warnings using scoring
    const scoredErrors = scorer.getByLevel("error", MAX_ENTRIES[options.detail].errors * 2);
    const scoredWarnings = scorer.getByLevel("warning", MAX_ENTRIES[options.detail].warnings * 2);

    // Convert to LogEntry and deduplicate
    const errors = deduplicateEntries(
      scoredErrors.map((e) => ({
        timestamp: e.timestamp,
        level: e.level,
        message: e.message,
        count: e.count,
        context: e.context,
        raw: e.raw,
      }))
    );

    const warnings = deduplicateEntries(
      scoredWarnings.map((e) => ({
        timestamp: e.timestamp,
        level: e.level,
        message: e.message,
        count: e.count,
        context: e.context,
        raw: e.raw,
      }))
    );

    // Cluster semantically-similar entries and pick one representative per
    // cluster as the key-events stream.
    const clusters = clusterLogs(filteredEntries, {
      similarityThreshold: 0.7,
      maxClusters: MAX_ENTRIES[options.detail].events * 2,
    });

    // Get representatives from clusters as key events
    const clusterRepresentatives = selectRepresentatives(clusters, 1);
    const keyEvents = clusterRepresentatives
      .slice(0, MAX_ENTRIES[options.detail].events)
      .map((e) => ({
        timestamp: e.timestamp,
        level: e.level,
        message: e.message,
        count: e.count,
        context: e.context,
        raw: e.raw,
      }));

    // Calculate timespan
    const timespan = calculateTimespan(filteredEntries);

    // Mine recurring templates and feed their stats into the statistics block.
    const patterns = extractPatterns(filteredEntries, { maxPatterns: 10 });
    const patternStats = getPatternStats(patterns);

    // Build statistics
    const statistics: LogStatistics = {
      timespan,
      totalLines: lines.length,
      errorCount: filteredEntries.filter((e) => e.level === "error").length,
      warningCount: filteredEntries.filter((e) => e.level === "warning").length,
      infoCount: filteredEntries.filter((e) => e.level === "info").length,
      debugCount: filteredEntries.filter((e) => e.level === "debug").length,
    };

    // Build enhanced overview with pattern info
    const overview = buildOverview(statistics, patternStats.totalPatterns, clusters.length);

    return {
      logType: options.logType || "generic",
      overview,
      errors: errors.slice(0, MAX_ENTRIES[options.detail].errors),
      warnings: warnings.slice(0, MAX_ENTRIES[options.detail].warnings),
      keyEvents,
      statistics,
    };
  },
};

/**
 * Build overview text with enhanced pattern and cluster info
 */
function buildOverview(
  stats: LogStatistics,
  patternCount: number = 0,
  clusterCount: number = 0
): string {
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

  // Add pattern and cluster info for enhanced summary
  const extras: string[] = [];
  if (patternCount > 0) {
    extras.push(`${patternCount} patterns`);
  }
  if (clusterCount > 0) {
    extras.push(`${clusterCount} clusters`);
  }
  if (extras.length > 0) {
    parts.push(`[${extras.join(", ")}]`);
  }

  return parts.join(" ") || "Log summary";
}
