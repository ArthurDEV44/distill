/**
 * Log Parser Utilities
 *
 * Common functions for parsing log files across different formats.
 */

import type { LogType, LogLevel, LogEntry, Timespan } from "../summarizers/types.js";

/**
 * Timestamp patterns for common log formats
 */
const TIMESTAMP_PATTERNS = [
  // ISO 8601: 2024-01-15T10:30:45.123Z or 2024-01-15 10:30:45
  /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/,
  // Bracket format: [10:30:45] or [2024-01-15 10:30:45]
  /\[(\d{4}-\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}(?:\.\d+)?\]/,
  // Syslog: Jan 15 10:30:45
  /([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/,
  // Unix timestamp: 1705315845
  /\b(\d{10,13})\b/,
  // Time only: 10:30:45.123
  /\b(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\b/,
];

/**
 * Log level patterns
 */
const LOG_LEVEL_PATTERNS: Array<{ pattern: RegExp; level: LogLevel }> = [
  { pattern: /\b(ERROR|ERR|FATAL|CRITICAL)\b/i, level: "error" },
  { pattern: /\b(WARN(?:ING)?)\b/i, level: "warning" },
  { pattern: /\b(INFO)\b/i, level: "info" },
  { pattern: /\b(DEBUG|TRACE|VERBOSE)\b/i, level: "debug" },
];

/**
 * Log type detection patterns
 */
const LOG_TYPE_PATTERNS: Array<{ type: LogType; patterns: RegExp[]; threshold: number }> = [
  {
    type: "server",
    patterns: [
      /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\/\S+\s+\d{3}/,
      /\bHTTP\/\d\.\d\b/,
      /\b(request|response|endpoint)\b/i,
      /\bstatus\s*[:=]\s*\d{3}\b/i,
    ],
    threshold: 0.1, // 10% of lines
  },
  {
    type: "test",
    patterns: [
      /\b(PASS|FAIL|SKIP|PENDING)\b/,
      /\b(describe|it|test|expect|assert)\s*\(/,
      /\b(jest|mocha|vitest|pytest|unittest)\b/i,
      /\bTest\s+(Suites?|Cases?)\b/i,
      /✓|✕|●/,
    ],
    threshold: 0.05, // 5% of lines
  },
  {
    type: "build",
    patterns: [
      /\b(webpack|vite|esbuild|rollup|parcel)\b/i,
      /\b(tsc|typescript|Compiling|Bundling)\b/i,
      /\b(npm|yarn|pnpm|bun)\s+(run|build|install)\b/i,
      /\bBuilt?\s+in\s+\d+/i,
      /\.(js|ts|tsx|jsx|css|scss)\s+\d+(\.\d+)?\s*(KB|MB|bytes)/i,
    ],
    threshold: 0.05,
  },
  {
    type: "application",
    patterns: [
      /\[\s*(INFO|DEBUG|WARN|ERROR|TRACE|FATAL)\s*\]/i,
      /\b(INFO|DEBUG|WARN|ERROR)\s*[-:]/i,
    ],
    threshold: 0.3, // 30% of lines
  },
];

/**
 * Extract timestamp from a log line
 */
export function parseTimestamp(line: string): string | undefined {
  for (const pattern of TIMESTAMP_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      return match[1] ?? match[0];
    }
  }
  return undefined;
}

/**
 * Extract log level from a log line
 */
export function parseLogLevel(line: string): LogLevel {
  for (const { pattern, level } of LOG_LEVEL_PATTERNS) {
    if (pattern.test(line)) {
      return level;
    }
  }
  return "info"; // Default
}

/**
 * Parse a single log line into a LogEntry
 */
export function parseLogLine(line: string): LogEntry {
  const trimmed = line.trim();
  const timestamp = parseTimestamp(trimmed);
  const level = parseLogLevel(trimmed);

  // Extract message by removing timestamp and level prefix
  let message = trimmed;

  // Remove timestamp
  if (timestamp) {
    message = message.replace(timestamp, "").trim();
  }

  // Remove level indicator
  message = message
    .replace(/^\[?\s*(ERROR|WARN(?:ING)?|INFO|DEBUG|TRACE|FATAL)\s*\]?\s*[-:.]?\s*/i, "")
    .trim();

  // Remove leading brackets/dashes
  message = message.replace(/^[\[\]\-:]+\s*/, "").trim();

  return {
    timestamp,
    level,
    message: message || trimmed,
    count: 1,
    raw: trimmed,
  };
}

/**
 * Detect the type of log based on content patterns
 */
export function detectLogType(logs: string): LogType {
  const lines = logs.split("\n").filter((l) => l.trim());
  const totalLines = lines.length;

  if (totalLines === 0) return "generic";

  // Check each log type
  for (const { type, patterns, threshold } of LOG_TYPE_PATTERNS) {
    let matchingLines = 0;
    for (const line of lines) {
      if (patterns.some((p) => p.test(line))) {
        matchingLines++;
      }
    }

    if (matchingLines / totalLines >= threshold) {
      return type;
    }
  }

  return "generic";
}

/**
 * Calculate timespan from log entries
 */
export function calculateTimespan(entries: LogEntry[]): Timespan | undefined {
  const timestamps: Date[] = [];

  for (const entry of entries) {
    if (entry.timestamp) {
      const date = parseDate(entry.timestamp);
      if (date) {
        timestamps.push(date);
      }
    }
  }

  if (timestamps.length < 2) return undefined;

  timestamps.sort((a, b) => a.getTime() - b.getTime());

  const start = timestamps[0];
  const end = timestamps[timestamps.length - 1];

  if (!start || !end) return undefined;

  const durationMs = end.getTime() - start.getTime();

  return {
    start: formatTimestamp(start),
    end: formatTimestamp(end),
    durationMs,
    durationFormatted: formatDuration(durationMs),
  };
}

/**
 * Parse a timestamp string into a Date
 */
function parseDate(timestamp: string): Date | undefined {
  // Try ISO format first
  const isoDate = new Date(timestamp);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try Unix timestamp (seconds or milliseconds)
  const unixMatch = timestamp.match(/^(\d{10,13})$/);
  if (unixMatch) {
    const ts = parseInt(unixMatch[1] ?? "0", 10);
    return new Date(ts.toString().length === 10 ? ts * 1000 : ts);
  }

  // Try time only (assume today)
  const timeMatch = timestamp.match(/^(\d{2}):(\d{2}):(\d{2})/);
  if (timeMatch) {
    const now = new Date();
    now.setHours(
      parseInt(timeMatch[1] ?? "0", 10),
      parseInt(timeMatch[2] ?? "0", 10),
      parseInt(timeMatch[3] ?? "0", 10)
    );
    return now;
  }

  return undefined;
}

/**
 * Format a Date as a readable timestamp
 */
function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

/**
 * Format duration in milliseconds to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;

  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

/**
 * Deduplicate log entries by normalized message
 */
export function deduplicateEntries(entries: LogEntry[]): LogEntry[] {
  const groups = new Map<string, LogEntry>();

  for (const entry of entries) {
    // Normalize message for grouping
    const key = normalizeForGrouping(entry.message);

    if (groups.has(key)) {
      const existing = groups.get(key)!;
      existing.count++;
    } else {
      groups.set(key, { ...entry });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

/**
 * Normalize a message for grouping similar entries
 */
function normalizeForGrouping(message: string): string {
  return message
    .replace(/\d+(\.\d+)?/g, "<N>") // Numbers
    .replace(/[a-f0-9]{8,}/gi, "<HASH>") // Hashes
    .replace(/\/[\w\-\.\/]+/g, "<PATH>") // Paths
    .replace(/'[^']*'/g, "'<STR>'") // Single quoted strings
    .replace(/"[^"]*"/g, '"<STR>"') // Double quoted strings
    .toLowerCase()
    .trim();
}

/**
 * Filter entries by time range
 */
export function filterByTimeframe(
  entries: LogEntry[],
  timeframe?: { start?: string; end?: string }
): LogEntry[] {
  if (!timeframe || (!timeframe.start && !timeframe.end)) {
    return entries;
  }

  const startDate = timeframe.start ? parseDate(timeframe.start) : undefined;
  const endDate = timeframe.end ? parseDate(timeframe.end) : undefined;

  return entries.filter((entry) => {
    if (!entry.timestamp) return true;

    const entryDate = parseDate(entry.timestamp);
    if (!entryDate) return true;

    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;

    return true;
  });
}

/**
 * Check if a line indicates a key event
 */
export function isKeyEvent(line: string): boolean {
  const keyEventPatterns = [
    /\b(start(?:ed|ing)?|stop(?:ped|ping)?|shutdown|restart)\b/i,
    /\b(connect(?:ed|ing)?|disconnect(?:ed|ing)?|reconnect)\b/i,
    /\b(initialized?|ready|listening)\b/i,
    /\b(crash(?:ed)?|panic|abort(?:ed)?)\b/i,
    /\b(deploy(?:ed|ing)?|release|version)\b/i,
    /\b(ERROR|FATAL|CRITICAL)\b/i,
    /\bport\s+\d+\b/i,
    /\bserver\b/i,
  ];

  return keyEventPatterns.some((p) => p.test(line));
}
