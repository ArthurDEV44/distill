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
const BUILD_PATTERNS = [
  /error TS\d+:/i, // TypeScript
  /error\[E\d+\]:/i, // Rust
  /SyntaxError:/i, // JavaScript
  /ModuleNotFoundError:/i, // Python/Node
  /Cannot find module/i, // Node
  /Build failed/i, // Generic build
  /FAILED:/i, // Test failures
  /npm ERR!/i, // npm
  /error: /i, // Generic errors
];

const DIFF_PATTERNS = [
  /^diff --git/m, // Git diff header
  /^@@\s*-\d+,?\d*\s*\+\d+,?\d*\s*@@/m, // Unified diff hunk
  /^---\s+a\//m, // Git diff file marker
  /^\+\+\+\s+b\//m, // Git diff file marker
];

/**
 * Detect extended content type for pipeline selection
 */
export function detectPipelineContentType(content: string): PipelineContentType {
  // Check for diff first (very specific pattern)
  if (DIFF_PATTERNS.some((p) => p.test(content))) {
    return "diff";
  }

  // Check for build output (errors with specific formats)
  if (BUILD_PATTERNS.some((p) => p.test(content))) {
    return "build";
  }

  // Fall back to standard content detection
  // Import dynamically to avoid circular deps
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
