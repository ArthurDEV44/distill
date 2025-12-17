/**
 * Server Logs Summarizer
 *
 * Summarizes HTTP server logs with request statistics, response times, and error tracking.
 */

import type {
  Summarizer,
  LogSummary,
  LogEntry,
  LogStatistics,
  SummarizeOptions,
  HttpRequestEntry,
} from "./types.js";
import {
  parseLogLine,
  parseTimestamp,
  parseLogLevel,
  calculateTimespan,
  deduplicateEntries,
  filterByTimeframe,
  isKeyEvent,
  formatDuration,
} from "../utils/log-parser.js";
import { MAX_ENTRIES } from "./types.js";

/**
 * HTTP request pattern: GET /api/users 200 45ms
 */
const HTTP_REQUEST_PATTERN =
  /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+(\d{3})(?:\s+(\d+(?:\.\d+)?)\s*m?s)?/i;

/**
 * Alternative patterns for different log formats
 */
const ALT_PATTERNS = [
  // nginx/apache: "GET /path HTTP/1.1" 200 1234
  /"(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+HTTP\/[\d.]+"\s+(\d{3})/i,
  // status=200 path=/api/users method=GET
  /method[=:]\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS).*path[=:]\s*(\/\S*).*status[=:]\s*(\d{3})/i,
];

/**
 * Parse an HTTP request from a log line
 */
function parseHttpRequest(line: string): HttpRequestEntry | null {
  // Try main pattern
  let match = line.match(HTTP_REQUEST_PATTERN);
  if (match) {
    return {
      timestamp: parseTimestamp(line),
      method: (match[1] ?? "GET").toUpperCase(),
      path: match[2] ?? "/",
      statusCode: parseInt(match[3] ?? "0", 10),
      responseTime: match[4] ? parseFloat(match[4]) : undefined,
      raw: line,
    };
  }

  // Try alternative patterns
  for (const pattern of ALT_PATTERNS) {
    match = line.match(pattern);
    if (match) {
      return {
        timestamp: parseTimestamp(line),
        method: (match[1] ?? "GET").toUpperCase(),
        path: match[2] ?? "/",
        statusCode: parseInt(match[3] ?? "0", 10),
        raw: line,
      };
    }
  }

  return null;
}

/**
 * Normalize path for grouping (remove IDs and query strings)
 */
function normalizePath(path: string): string {
  return path
    .split("?")[0] // Remove query string
    ?.replace(/\/\d+/g, "/:id") // Replace numeric IDs
    .replace(/\/[a-f0-9-]{36}/gi, "/:uuid") // Replace UUIDs
    .replace(/\/[a-f0-9]{24}/gi, "/:id") ?? path; // Replace MongoDB ObjectIds
}

/**
 * Server logs summarizer
 */
export const serverLogsSummarizer: Summarizer = {
  name: "server-logs",
  logType: "server",

  canSummarize(logs: string): boolean {
    const lines = logs.split("\n").slice(0, 100); // Sample first 100 lines
    let matches = 0;

    for (const line of lines) {
      if (HTTP_REQUEST_PATTERN.test(line) || ALT_PATTERNS.some((p) => p.test(line))) {
        matches++;
      }
    }

    return matches / lines.length >= 0.1; // At least 10% HTTP requests
  },

  summarize(logs: string, options: SummarizeOptions): LogSummary {
    const lines = logs.split("\n").filter((l) => l.trim());
    const requests: HttpRequestEntry[] = [];
    const errors: LogEntry[] = [];
    const warnings: LogEntry[] = [];
    const keyEvents: LogEntry[] = [];
    const allEntries: LogEntry[] = [];

    // Parse all lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to parse as HTTP request
      const request = parseHttpRequest(trimmed);
      if (request) {
        requests.push(request);

        // Check for error status codes
        if (request.statusCode >= 500) {
          errors.push({
            timestamp: request.timestamp,
            level: "error",
            message: `${request.method} ${request.path} → ${request.statusCode}`,
            count: 1,
            raw: trimmed,
          });
        } else if (request.statusCode >= 400) {
          warnings.push({
            timestamp: request.timestamp,
            level: "warning",
            message: `${request.method} ${request.path} → ${request.statusCode}`,
            count: 1,
            raw: trimmed,
          });
        }
      }

      // Parse as regular log entry
      const entry = parseLogLine(trimmed);
      allEntries.push(entry);

      // Collect errors and warnings from non-request lines
      if (!request) {
        if (entry.level === "error") {
          errors.push(entry);
        } else if (entry.level === "warning") {
          warnings.push(entry);
        }
      }

      // Detect key events
      if (isKeyEvent(trimmed)) {
        keyEvents.push(entry);
      }
    }

    // Filter by timeframe if specified
    const filteredEntries = filterByTimeframe(allEntries, options.timeframe);

    // Calculate endpoint statistics
    const endpointStats = new Map<
      string,
      { count: number; totalTime: number; errorCount: number }
    >();
    const statusCodes = new Map<number, number>();

    for (const req of requests) {
      const key = `${req.method} ${normalizePath(req.path)}`;

      const stats = endpointStats.get(key) || { count: 0, totalTime: 0, errorCount: 0 };
      stats.count++;
      if (req.responseTime) {
        stats.totalTime += req.responseTime;
      }
      if (req.statusCode >= 400) {
        stats.errorCount++;
      }
      endpointStats.set(key, stats);

      // Track status codes
      statusCodes.set(req.statusCode, (statusCodes.get(req.statusCode) || 0) + 1);
    }

    // Calculate timespan
    const timespan = calculateTimespan(filteredEntries);

    // Build endpoint array
    const endpoints = Array.from(endpointStats.entries())
      .map(([key, stats]) => {
        const [method, path] = key.split(" ");
        return {
          method: method ?? "GET",
          path: path ?? "/",
          count: stats.count,
          avgTime: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0,
          errorCount: stats.errorCount,
        };
      })
      .sort((a, b) => b.count - a.count);

    // Calculate average response time
    const totalTime = requests.reduce((sum, r) => sum + (r.responseTime || 0), 0);
    const requestsWithTime = requests.filter((r) => r.responseTime !== undefined).length;
    const avgResponseTime = requestsWithTime > 0 ? Math.round(totalTime / requestsWithTime) : 0;

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
      requestCount: requests.length,
      avgResponseTime,
      endpoints: endpoints.slice(0, MAX_ENTRIES[options.detail].events),
      statusCodes,
    };

    // Build overview
    const overview = buildOverview(statistics, timespan);

    return {
      logType: "server",
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
function buildOverview(stats: LogStatistics, timespan?: { durationFormatted: string }): string {
  const parts: string[] = [];

  if (timespan) {
    parts.push(`Duration: ${timespan.durationFormatted}`);
  }

  if (stats.requestCount !== undefined) {
    parts.push(`${stats.requestCount.toLocaleString()} requests processed`);
  }

  if (stats.avgResponseTime !== undefined && stats.avgResponseTime > 0) {
    parts.push(`avg ${stats.avgResponseTime}ms response time`);
  }

  if (stats.errorCount > 0) {
    parts.push(`${stats.errorCount} errors`);
  }

  return parts.join(", ") || "Server log summary";
}
