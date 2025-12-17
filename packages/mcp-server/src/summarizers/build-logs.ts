/**
 * Build Logs Summarizer
 *
 * Summarizes build tool output (webpack, vite, tsc, esbuild, etc.).
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
  parseLogLevel,
  calculateTimespan,
  deduplicateEntries,
  filterByTimeframe,
  isKeyEvent,
} from "../utils/log-parser.js";
import { MAX_ENTRIES } from "./types.js";

/**
 * Build tool detection patterns
 */
const BUILD_TOOL_PATTERNS = {
  webpack: /\b(webpack|Module|chunk|bundle)\b/i,
  vite: /\b(vite|hmr|pre-bundling)\b/i,
  tsc: /\b(tsc|typescript|\.ts\(\d+,\d+\)|error TS\d+)\b/i,
  esbuild: /\b(esbuild|bundled?)\b/i,
  rollup: /\b(rollup|bundle)\b/i,
  npm: /\b(npm|added \d+ package|npm WARN|npm ERR)\b/i,
};

/**
 * Build error patterns
 */
const ERROR_PATTERNS = [
  // TypeScript: error TS2304: Cannot find name 'foo'
  /error\s+TS(\d+):\s*(.+)/i,
  // ESLint: error  rule-name  message
  /error\s+([a-z\-@\/]+)\s+(.+)/i,
  // Webpack: Module not found
  /Module not found:\s*(.+)/i,
  // Generic: ERROR: message
  /\bERROR[:\s]+(.+)/i,
  // npm ERR!
  /npm ERR!\s*(.+)/,
];

/**
 * Build duration patterns
 */
const DURATION_PATTERNS = [
  // Built in 1.23s
  /Built?\s+in\s+(\d+(?:\.\d+)?)\s*(s|ms)/i,
  // Done in 1.23s
  /Done\s+in\s+(\d+(?:\.\d+)?)\s*(s|ms)/i,
  // Time: 1234ms
  /Time:\s*(\d+(?:\.\d+)?)\s*(s|ms)/i,
  // Compiled in 1.23s
  /Compiled?\s+in\s+(\d+(?:\.\d+)?)\s*(s|ms)/i,
];

/**
 * Bundle size patterns
 */
const SIZE_PATTERNS = [
  // dist/main.js  45.2 kB
  /(\S+\.(?:js|css|mjs))\s+(\d+(?:\.\d+)?)\s*(B|KB|MB|kB)/i,
  // gzipped: 12.3 kB
  /gzip(?:ped)?:\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|kB)/i,
];

/**
 * Parse build duration from logs
 */
function parseBuildDuration(logs: string): number | undefined {
  for (const pattern of DURATION_PATTERNS) {
    const match = logs.match(pattern);
    if (match) {
      const value = parseFloat(match[1] ?? "0");
      const unit = (match[2] ?? "ms").toLowerCase();
      return unit === "s" ? value * 1000 : value;
    }
  }
  return undefined;
}

/**
 * Parse bundle sizes from logs
 */
function parseBundleSizes(logs: string): Array<{ file: string; size: number; unit: string }> {
  const sizes: Array<{ file: string; size: number; unit: string }> = [];
  const lines = logs.split("\n");

  for (const line of lines) {
    const match = line.match(SIZE_PATTERNS[0] as RegExp);
    if (match) {
      sizes.push({
        file: match[1] ?? "",
        size: parseFloat(match[2] ?? "0"),
        unit: match[3] ?? "B",
      });
    }
  }

  return sizes;
}

/**
 * Detect build tool from logs
 */
function detectBuildTool(logs: string): string {
  for (const [tool, pattern] of Object.entries(BUILD_TOOL_PATTERNS)) {
    if (pattern.test(logs)) {
      return tool;
    }
  }
  return "generic";
}

/**
 * Build logs summarizer
 */
export const buildLogsSummarizer: Summarizer = {
  name: "build-logs",
  logType: "build",

  canSummarize(logs: string): boolean {
    const indicators = [
      /\b(webpack|vite|esbuild|rollup|parcel|tsc)\b/i,
      /\b(Compiling|Bundling|Building)\b/i,
      /\berror\s+TS\d+\b/,
      /\bModule not found\b/i,
      /\bBuilt?\s+in\b/i,
      /\.(js|ts|tsx|jsx)\s+\d+(\.\d+)?\s*(KB|MB|B)/i,
    ];

    return indicators.some((p) => p.test(logs));
  },

  summarize(logs: string, options: SummarizeOptions): LogSummary {
    const lines = logs.split("\n").filter((l) => l.trim());
    const errors: LogEntry[] = [];
    const warnings: LogEntry[] = [];
    const keyEvents: LogEntry[] = [];
    const allEntries: LogEntry[] = [];

    const buildTool = detectBuildTool(logs);
    const buildDuration = parseBuildDuration(logs);
    const bundleSizes = parseBundleSizes(logs);

    // Track TypeScript errors by code
    const tsErrorCodes = new Map<string, number>();

    // Parse all lines
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const entry = parseLogLine(trimmed);
      allEntries.push(entry);

      // Check for errors
      let isError = false;
      for (const pattern of ERROR_PATTERNS) {
        const match = trimmed.match(pattern);
        if (match) {
          isError = true;
          errors.push({
            level: "error",
            message: match[2] ?? match[1] ?? trimmed,
            count: 1,
            raw: trimmed,
          });

          // Track TS error codes
          const tsMatch = trimmed.match(/TS(\d+)/);
          if (tsMatch) {
            const code = `TS${tsMatch[1]}`;
            tsErrorCodes.set(code, (tsErrorCodes.get(code) || 0) + 1);
          }
          break;
        }
      }

      // Check for warnings
      if (!isError && /\bwarn(?:ing)?\b/i.test(trimmed)) {
        warnings.push({
          level: "warning",
          message: entry.message,
          count: 1,
          raw: trimmed,
        });
      }

      // Detect key events
      if (isKeyEvent(trimmed) || /\b(start|done|finish|complet|success|fail)\b/i.test(trimmed)) {
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

    // Calculate total bundle size
    let totalBundleSize = 0;
    for (const { size, unit } of bundleSizes) {
      const multiplier = unit.toLowerCase() === "kb" ? 1024 : unit.toLowerCase() === "mb" ? 1024 * 1024 : 1;
      totalBundleSize += size * multiplier;
    }

    // Build statistics
    const statistics: LogStatistics = {
      timespan,
      totalLines: lines.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount: allEntries.filter((e) => e.level === "info").length,
      debugCount: allEntries.filter((e) => e.level === "debug").length,
      buildDuration,
      compiledFiles: bundleSizes.length,
      bundleSize: totalBundleSize > 0 ? totalBundleSize : undefined,
    };

    // Build overview
    const overview = buildOverview(buildTool, statistics, tsErrorCodes);

    return {
      logType: "build",
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
function buildOverview(
  buildTool: string,
  stats: LogStatistics,
  tsErrorCodes: Map<string, number>
): string {
  const parts: string[] = [`${buildTool} build`];

  if (stats.buildDuration) {
    parts.push(`completed in ${(stats.buildDuration / 1000).toFixed(2)}s`);
  }

  if (stats.errorCount > 0) {
    parts.push(`${stats.errorCount} errors`);

    // Add top TS error codes
    if (tsErrorCodes.size > 0) {
      const topCodes = Array.from(tsErrorCodes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([code, count]) => `${code}(${count})`)
        .join(", ");
      parts.push(`[${topCodes}]`);
    }
  } else {
    parts.push("successful");
  }

  if (stats.bundleSize && stats.bundleSize > 0) {
    const sizeKB = (stats.bundleSize / 1024).toFixed(1);
    parts.push(`${sizeKB} KB total`);
  }

  return parts.join(" - ");
}
