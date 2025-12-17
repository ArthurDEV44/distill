/**
 * Log Summarizer Types
 *
 * Common types and interfaces for log summarization.
 */

export type LogType = "server" | "test" | "build" | "application" | "generic";
export type FocusArea = "errors" | "warnings" | "performance" | "timeline";
export type DetailLevel = "minimal" | "normal" | "detailed";
export type LogLevel = "error" | "warning" | "info" | "debug";

/**
 * A single parsed log entry
 */
export interface LogEntry {
  /** Timestamp if present */
  timestamp?: string;
  /** Log level */
  level: LogLevel;
  /** Main message content */
  message: string;
  /** Number of occurrences if deduplicated */
  count: number;
  /** Additional context (stack trace, etc.) */
  context?: string;
  /** Original raw line */
  raw: string;
}

/**
 * HTTP request entry for server logs
 */
export interface HttpRequestEntry {
  timestamp?: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime?: number;
  raw: string;
}

/**
 * Test result entry for test logs
 */
export interface TestResultEntry {
  name: string;
  status: "pass" | "fail" | "skip" | "pending";
  duration?: number;
  error?: string;
  raw: string;
}

/**
 * Timespan information
 */
export interface Timespan {
  start: string;
  end: string;
  durationMs: number;
  durationFormatted: string;
}

/**
 * Statistics extracted from logs
 */
export interface LogStatistics {
  /** Time range of logs */
  timespan?: Timespan;
  /** Total lines processed */
  totalLines: number;
  /** Count by log level */
  errorCount: number;
  warningCount: number;
  infoCount: number;
  debugCount: number;

  // Server-specific
  requestCount?: number;
  avgResponseTime?: number;
  endpoints?: Array<{
    method: string;
    path: string;
    count: number;
    avgTime: number;
    errorCount: number;
  }>;
  statusCodes?: Map<number, number>;

  // Test-specific
  passCount?: number;
  failCount?: number;
  skipCount?: number;
  testDuration?: number;

  // Build-specific
  buildDuration?: number;
  compiledFiles?: number;
  bundleSize?: number;
}

/**
 * Complete log summary result
 */
export interface LogSummary {
  /** Type of log detected/specified */
  logType: LogType;
  /** Brief overview text */
  overview: string;
  /** Error entries (deduplicated) */
  errors: LogEntry[];
  /** Warning entries (deduplicated) */
  warnings: LogEntry[];
  /** Key events timeline */
  keyEvents: LogEntry[];
  /** Computed statistics */
  statistics: LogStatistics;
}

/**
 * Options for summarization
 */
export interface SummarizeOptions {
  /** Type of log (auto-detected if not provided) */
  logType?: LogType;
  /** Areas to focus on */
  focus?: FocusArea[];
  /** Level of detail */
  detail: DetailLevel;
  /** Time range filter */
  timeframe?: {
    start?: string;
    end?: string;
  };
}

/**
 * Summarizer interface for different log types
 */
export interface Summarizer {
  /** Summarizer name */
  name: string;
  /** Log type this summarizer handles */
  logType: LogType;
  /** Check if this summarizer can handle the given logs */
  canSummarize(logs: string): boolean;
  /** Generate summary from logs */
  summarize(logs: string, options: SummarizeOptions): LogSummary;
}

/**
 * Detail level thresholds
 */
export const DETAIL_THRESHOLDS: Record<DetailLevel, number> = {
  minimal: 3,
  normal: 5,
  detailed: 10,
};

/**
 * Maximum entries per section by detail level
 */
export const MAX_ENTRIES: Record<DetailLevel, { errors: number; warnings: number; events: number }> =
  {
    minimal: { errors: 5, warnings: 3, events: 5 },
    normal: { errors: 10, warnings: 5, events: 10 },
    detailed: { errors: 20, warnings: 10, events: 20 },
  };
