/**
 * Pipeline Definitions
 *
 * Defines the automatic tool chains for different content types.
 * Each pipeline is an ordered list of tool names to execute sequentially.
 */

import type { ContentType } from "../compressors/types.js";

/**
 * Extended content type for pipeline detection
 */
export type PipelineContentType = ContentType | "build" | "diff";

/**
 * Pipeline definition with metadata
 */
export interface PipelineDefinition {
  /** Ordered list of tool names to execute */
  tools: string[];
  /** Human-readable description */
  description: string;
  /** Expected token savings range */
  expectedSavings: string;
}

/**
 * Pipeline definitions by content type
 *
 * Each pipeline chains tools that work well together:
 * - First tool does initial processing
 * - Subsequent tools refine the output
 * - Order matters: earlier tools prepare data for later ones
 */
export const PIPELINE_DEFINITIONS: Record<PipelineContentType, PipelineDefinition> = {
  /**
   * Build output (npm, tsc, webpack, etc.)
   * analyze-build-output parses and groups errors
   * deduplicate-errors removes repeated similar errors
   */
  build: {
    tools: ["analyze_build_output", "deduplicate_errors"],
    description: "Parse build errors, then deduplicate similar messages",
    expectedSavings: "90-98%",
  },

  /**
   * Log files (server, application, test output)
   * summarize-logs extracts key information and groups patterns
   */
  logs: {
    tools: ["summarize_logs"],
    description: "Summarize log patterns and extract key events",
    expectedSavings: "80-90%",
  },

  /**
   * Stack traces and error dumps
   * deduplicate-errors groups similar traces
   * semantic-compress extracts most important parts
   */
  stacktrace: {
    tools: ["deduplicate_errors", "semantic_compress"],
    description: "Group similar errors, then extract important content",
    expectedSavings: "70-85%",
  },

  /**
   * Git diffs
   * diff-compress with auto-selected strategy
   */
  diff: {
    tools: ["diff_compress"],
    description: "Compress git diff output",
    expectedSavings: "50-95%",
  },

  /**
   * Configuration files (JSON, YAML, TOML)
   * compress-context handles structured data
   */
  config: {
    tools: ["compress_context"],
    description: "Compress configuration data",
    expectedSavings: "30-60%",
  },

  /**
   * Source code
   * semantic-compress extracts important code sections
   */
  code: {
    tools: ["semantic_compress"],
    description: "Extract important code sections",
    expectedSavings: "40-60%",
  },

  /**
   * Generic content (fallback)
   * semantic-compress using TF-IDF scoring
   */
  generic: {
    tools: ["semantic_compress"],
    description: "Apply semantic compression",
    expectedSavings: "40-60%",
  },
};

/**
 * Detection patterns for extended content types
 */

/**
 * Log patterns - used for scoring log-like content
 * These patterns match individual lines, not the whole content
 */
const LOG_LINE_PATTERNS = [
  /^\[\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/, // [2025-12-23 10:15:23]
  /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/, // 2025-12-23 10:15:23
  /^\[\w+\]\s+(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)[\s:]/i, // [tag] INFO:
  /^(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)[\s:\[]/i, // INFO: at start
  /^\d{2}:\d{2}:\d{2}[.,]\d{3}\s+(INFO|WARN|ERROR|DEBUG)/i, // 10:15:23.456 INFO
  /^time="[^"]+"\s+level=/, // logrus style
  /^{"(level|time|timestamp|msg)":/, // JSON logs
  /^\[[A-Z]+\]\s*\d{4}-\d{2}-\d{2}/, // [INFO] 2025-12-23
  /^\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/, // syslog: Dec 23 10:15:23
  /^\w{3}\s{1,2}\d{1,2}\s+\d{2}:\d{2}:\d{2}/, // syslog with padding: Dec  3 10:15:23
  /^<\d+>\w{3}\s+\d{1,2}/, // syslog with priority: <134>Dec 23
  /^<\d+>\d/, // syslog priority with timestamp
  /\|\s*(INFO|WARN|ERROR|DEBUG|TRACE)\s*\|/i, // | INFO | format
  /\s(INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL):\s/i, // embedded log level: "app: ERROR: msg"
  /^\S+\s+\S+\[\d+\]:/, // daemon format: app[1234]:
];

/**
 * Build error patterns - specific error formats from compilers/bundlers
 * These are very specific to build tools, not general error messages
 */
const BUILD_LINE_PATTERNS = [
  /error TS\d+:/i, // TypeScript: error TS2304
  /error\[E\d+\]:/i, // Rust: error[E0425]
  /:\d+:\d+:\s*error:/i, // GCC/Clang: file:10:5: error:
  /\(\d+,\d+\):\s*error/i, // C#/TS: file(10,5): error
  /npm ERR!/i, // npm specific
  /ENOENT:|EACCES:|EPERM:/i, // Node.js errors
  /Module not found.*Can't resolve/i, // Webpack
  /SyntaxError:.*unexpected token/i, // Parse errors
  /ModuleNotFoundError: No module named/i, // Python
  /error: aborting due to/i, // Rust
  /FAILURE: Build failed/i, // Gradle
  /BUILD FAILED/i, // Ant/Maven
  /error CS\d+:/i, // C# compiler
];

const DIFF_PATTERNS = [
  /^diff --git/m, // Git diff header
  /^@@\s*-\d+,?\d*\s*\+\d+,?\d*\s*@@/m, // Unified diff hunk
  /^---\s+a\//m, // Git diff file marker
  /^\+\+\+\s+b\//m, // Git diff file marker
];

/**
 * Count how many lines match any of the given patterns
 */
function countMatchingLines(lines: string[], patterns: RegExp[]): number {
  let count = 0;
  for (const line of lines) {
    if (patterns.some((p) => p.test(line))) {
      count++;
    }
  }
  return count;
}

/**
 * Detect extended content type for pipeline selection
 *
 * Uses a scoring-based approach to handle content that might match multiple types.
 * For example, server logs with errors should be detected as "logs" not "build".
 */
export function detectPipelineContentType(content: string): PipelineContentType {
  // Check for diff first (very specific pattern, no ambiguity)
  if (DIFF_PATTERNS.some((p) => p.test(content))) {
    return "diff";
  }

  // Split into lines for scoring
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return "generic";
  }

  // Count matches for each type
  const logMatches = countMatchingLines(lines, LOG_LINE_PATTERNS);
  const buildMatches = countMatchingLines(lines, BUILD_LINE_PATTERNS);

  // Calculate percentages
  const logPercent = logMatches / lines.length;
  const buildPercent = buildMatches / lines.length;

  // If we have significant log patterns (>10% of lines), prefer logs
  // This handles the case where logs contain some error messages
  if (logPercent >= 0.1 && logMatches >= 2) {
    // Even if there are some build-like patterns, if log patterns are dominant, it's logs
    if (logMatches >= buildMatches || logPercent >= 0.2) {
      return "logs";
    }
  }

  // Strong build signal: specific compiler errors (even a few are significant)
  if (buildMatches >= 1 && buildPercent >= 0.05) {
    // Make sure it's not actually logs with some errors
    // Build output typically has concentrated errors, not spread throughout
    if (buildMatches > logMatches || logPercent < 0.1) {
      return "build";
    }
  }

  // Fallback: if we have any log patterns, treat as logs
  if (logMatches > 0) {
    return "logs";
  }

  // If we have build patterns but didn't trigger above, still treat as build
  if (buildMatches > 0) {
    return "build";
  }

  // Fall back to generic
  return "generic";
}

/**
 * Get the pipeline definition for a content type
 */
export function getPipelineForType(type: PipelineContentType): PipelineDefinition {
  return PIPELINE_DEFINITIONS[type] ?? PIPELINE_DEFINITIONS.generic;
}

/**
 * List all available pipeline types
 */
export function getAvailablePipelines(): Array<{
  type: PipelineContentType;
  definition: PipelineDefinition;
}> {
  return Object.entries(PIPELINE_DEFINITIONS).map(([type, definition]) => ({
    type: type as PipelineContentType,
    definition,
  }));
}
