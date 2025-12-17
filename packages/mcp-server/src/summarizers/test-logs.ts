/**
 * Test Logs Summarizer
 *
 * Summarizes test runner output (Jest, Mocha, Vitest, pytest, etc.).
 */

import type {
  Summarizer,
  LogSummary,
  LogEntry,
  LogStatistics,
  SummarizeOptions,
  TestResultEntry,
} from "./types.js";
import {
  parseLogLine,
  calculateTimespan,
  deduplicateEntries,
  filterByTimeframe,
} from "../utils/log-parser.js";
import { MAX_ENTRIES } from "./types.js";

/**
 * Test result patterns for different frameworks
 */
const TEST_PATTERNS = {
  // Jest/Vitest: ✓ test name (5ms) or ✕ test name
  jest: /^\s*(✓|✕|○)\s+(.+?)(?:\s+\((\d+)\s*m?s\))?$/,
  // Jest: PASS/FAIL src/file.test.ts
  jestFile: /^\s*(PASS|FAIL)\s+(.+\.(?:test|spec)\.[jt]sx?)$/,
  // Mocha: ✓ test name: 5ms or 1) test name
  mocha: /^\s*(?:(\d+)\)|(✓|✔))\s+(.+?)(?::\s*(\d+)ms)?$/,
  // pytest: PASSED/FAILED test_file.py::test_name
  pytest: /^\s*(PASSED|FAILED|SKIPPED|ERROR)\s+(.+?::.+?)(?:\s+\[(\d+)%\])?$/,
  // Generic: [PASS] or [FAIL]
  generic: /^\s*\[(PASS|FAIL|SKIP)\]\s+(.+)$/i,
};

/**
 * Summary line patterns
 */
const SUMMARY_PATTERNS = {
  // Jest: Tests: 5 passed, 1 failed, 6 total
  jest: /Tests?:\s*(\d+)\s*passed?,?\s*(\d+)\s*failed?,?\s*(?:(\d+)\s*skipped?,?\s*)?(\d+)\s*total/i,
  // Jest: Test Suites: 2 passed, 1 failed, 3 total
  jestSuites: /Test Suites?:\s*(\d+)\s*passed?,?\s*(\d+)\s*failed?,?\s*(\d+)\s*total/i,
  // pytest: 5 passed, 1 failed in 2.5s
  pytest: /(\d+)\s*passed?,?\s*(\d+)\s*failed?(?:,?\s*(\d+)\s*skipped?)?.*?in\s*([\d.]+)s/i,
  // Time: 5.123s
  time: /(?:Time|Duration|Ran).*?(\d+(?:\.\d+)?)\s*(?:s|ms|seconds?)/i,
};

/**
 * Parse a test result from a log line
 */
function parseTestResult(line: string): TestResultEntry | null {
  // Try Jest pattern
  let match = line.match(TEST_PATTERNS.jest);
  if (match) {
    const symbol = match[1];
    let status: TestResultEntry["status"] = "pass";
    if (symbol === "✕") status = "fail";
    else if (symbol === "○") status = "skip";

    return {
      name: (match[2] ?? "").trim(),
      status,
      duration: match[3] ? parseInt(match[3], 10) : undefined,
      raw: line,
    };
  }

  // Try Jest file pattern
  match = line.match(TEST_PATTERNS.jestFile);
  if (match) {
    return {
      name: match[2] ?? "",
      status: (match[1] ?? "").toLowerCase() === "pass" ? "pass" : "fail",
      raw: line,
    };
  }

  // Try Mocha pattern
  match = line.match(TEST_PATTERNS.mocha);
  if (match) {
    const isFailNumber = match[1] !== undefined;
    return {
      name: (match[3] ?? "").trim(),
      status: isFailNumber ? "fail" : "pass",
      duration: match[4] ? parseInt(match[4], 10) : undefined,
      raw: line,
    };
  }

  // Try pytest pattern
  match = line.match(TEST_PATTERNS.pytest);
  if (match) {
    const statusStr = (match[1] ?? "").toUpperCase();
    let status: TestResultEntry["status"] = "pass";
    if (statusStr === "FAILED" || statusStr === "ERROR") status = "fail";
    else if (statusStr === "SKIPPED") status = "skip";

    return {
      name: match[2] ?? "",
      status,
      raw: line,
    };
  }

  // Try generic pattern
  match = line.match(TEST_PATTERNS.generic);
  if (match) {
    const statusStr = (match[1] ?? "").toUpperCase();
    let status: TestResultEntry["status"] = "pass";
    if (statusStr === "FAIL") status = "fail";
    else if (statusStr === "SKIP") status = "skip";

    return {
      name: (match[2] ?? "").trim(),
      status,
      raw: line,
    };
  }

  return null;
}

/**
 * Extract summary statistics from summary lines
 */
function extractSummaryStats(
  logs: string
): { passed?: number; failed?: number; skipped?: number; duration?: number } | null {
  // Try Jest pattern
  let match = logs.match(SUMMARY_PATTERNS.jest);
  if (match) {
    return {
      passed: parseInt(match[1] ?? "0", 10),
      failed: parseInt(match[2] ?? "0", 10),
      skipped: match[3] ? parseInt(match[3], 10) : 0,
    };
  }

  // Try pytest pattern
  match = logs.match(SUMMARY_PATTERNS.pytest);
  if (match) {
    return {
      passed: parseInt(match[1] ?? "0", 10),
      failed: parseInt(match[2] ?? "0", 10),
      skipped: match[3] ? parseInt(match[3], 10) : 0,
      duration: parseFloat(match[4] ?? "0") * 1000, // Convert to ms
    };
  }

  return null;
}

/**
 * Test logs summarizer
 */
export const testLogsSummarizer: Summarizer = {
  name: "test-logs",
  logType: "test",

  canSummarize(logs: string): boolean {
    const indicators = [
      /\b(PASS|FAIL|SKIP)\b/,
      /\b(describe|it|test)\s*\(/,
      /✓|✕|○/,
      /\bTest(?:s|Suites?):/,
      /\bpytest\b/i,
      /\b(jest|vitest|mocha)\b/i,
    ];

    return indicators.some((p) => p.test(logs));
  },

  summarize(logs: string, options: SummarizeOptions): LogSummary {
    const lines = logs.split("\n").filter((l) => l.trim());
    const testResults: TestResultEntry[] = [];
    const errors: LogEntry[] = [];
    const warnings: LogEntry[] = [];
    const keyEvents: LogEntry[] = [];
    const allEntries: LogEntry[] = [];

    // Try to extract summary stats from the logs
    const summaryStats = extractSummaryStats(logs);

    // Parse all lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to parse as test result
      const testResult = parseTestResult(trimmed);
      if (testResult) {
        testResults.push(testResult);

        if (testResult.status === "fail") {
          errors.push({
            level: "error",
            message: `FAIL: ${testResult.name}`,
            count: 1,
            raw: trimmed,
          });
        }
      }

      // Parse as regular log entry
      const entry = parseLogLine(trimmed);
      allEntries.push(entry);

      // Collect errors from non-test lines
      if (!testResult && entry.level === "error") {
        errors.push(entry);
      }
      if (entry.level === "warning") {
        warnings.push(entry);
      }
    }

    // Filter by timeframe if specified
    const filteredEntries = filterByTimeframe(allEntries, options.timeframe);

    // Calculate test statistics
    const passCount =
      summaryStats?.passed ?? testResults.filter((t) => t.status === "pass").length;
    const failCount =
      summaryStats?.failed ?? testResults.filter((t) => t.status === "fail").length;
    const skipCount =
      summaryStats?.skipped ?? testResults.filter((t) => t.status === "skip").length;
    const totalTests = passCount + failCount + skipCount;

    // Calculate test duration
    const testDuration =
      summaryStats?.duration ??
      testResults.reduce((sum, t) => sum + (t.duration || 0), 0);

    // Calculate timespan
    const timespan = calculateTimespan(filteredEntries);

    // Deduplicate errors
    const deduplicatedErrors = deduplicateEntries(errors);

    // Get failed test names
    const failedTests = testResults
      .filter((t) => t.status === "fail")
      .map((t) => ({
        level: "error" as const,
        message: t.name,
        count: 1,
        raw: t.raw,
        context: t.error,
      }));

    // Build statistics
    const statistics: LogStatistics = {
      timespan,
      totalLines: lines.length,
      errorCount: failCount,
      warningCount: warnings.length,
      infoCount: allEntries.filter((e) => e.level === "info").length,
      debugCount: allEntries.filter((e) => e.level === "debug").length,
      passCount,
      failCount,
      skipCount,
      testDuration,
    };

    // Build overview
    const overview = buildOverview(statistics, totalTests);

    // Key events: test file results
    const fileResults = lines
      .filter((l) => TEST_PATTERNS.jestFile.test(l))
      .map((l) => parseLogLine(l));

    return {
      logType: "test",
      overview,
      errors: failedTests.length > 0 ? failedTests : deduplicatedErrors.slice(0, MAX_ENTRIES[options.detail].errors),
      warnings: deduplicateEntries(warnings).slice(0, MAX_ENTRIES[options.detail].warnings),
      keyEvents: fileResults.slice(0, MAX_ENTRIES[options.detail].events),
      statistics,
    };
  },
};

/**
 * Build overview text
 */
function buildOverview(stats: LogStatistics, totalTests: number): string {
  const parts: string[] = [];

  if (totalTests > 0) {
    const passRate = Math.round(((stats.passCount ?? 0) / totalTests) * 100);
    parts.push(`${totalTests} tests: ${stats.passCount} passed, ${stats.failCount} failed`);
    if (stats.skipCount && stats.skipCount > 0) {
      parts.push(`${stats.skipCount} skipped`);
    }
    parts.push(`(${passRate}% pass rate)`);
  }

  if (stats.testDuration && stats.testDuration > 0) {
    parts.push(`in ${(stats.testDuration / 1000).toFixed(2)}s`);
  }

  return parts.join(" ") || "Test log summary";
}
