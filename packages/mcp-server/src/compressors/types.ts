/**
 * Compressor Types
 *
 * Shared type definitions for context compressors.
 */

export type ContentType = "logs" | "stacktrace" | "config" | "code" | "generic";

export type DetailLevel = "minimal" | "normal" | "detailed";

export interface CompressOptions {
  /** Target compression ratio (0.1 = 10% of original) */
  targetRatio?: number;
  /** Patterns to preserve (will not be compressed) */
  preservePatterns?: RegExp[];
  /** Level of detail in output */
  detail: DetailLevel;
  /**
   * F2: the active task/query. Consumed by the semantic compressor for
   * query-aware segment selection (task-relevant segments are lifted in the
   * ranking); ignored by compressors that do not rank by importance.
   */
  query?: string;
}

export interface CompressedResult {
  /** Compressed content */
  compressed: string;
  /** Compression statistics */
  stats: CompressionStats;
  /** Description of omitted information */
  omittedInfo?: string;
}

export interface CompressionStats {
  /** Number of lines in original content */
  originalLines: number;
  /** Number of lines after compression */
  compressedLines: number;
  /** Token count of original content */
  originalTokens: number;
  /** Token count after compression */
  compressedTokens: number;
  /** Percentage of tokens saved */
  reductionPercent: number;
  /** Technique used for compression */
  technique: string;
}

export interface Compressor {
  /** Compressor name */
  name: string;
  /** Content types this compressor can handle */
  supportedTypes: ContentType[];
  /** Check if this compressor can handle the content */
  canCompress(content: string): boolean;
  /** Compress the content */
  compress(content: string, options: CompressOptions): CompressedResult;
}

/**
 * Line group for deduplication
 */
export interface LineGroup {
  /** Normalized pattern for matching */
  pattern: string;
  /** First occurrence of this pattern */
  sample: string;
  /** All lines matching this pattern */
  lines: string[];
  /** Number of occurrences */
  count: number;
  /** Whether this group contains errors */
  hasError: boolean;
  /** Whether this group contains warnings */
  hasWarning: boolean;
}

// =============================================================================
// Diff Compression Types
// =============================================================================

/**
 * Parsed diff hunk
 */
export interface DiffHunk {
  /** Original file line start */
  oldStart: number;
  /** Original file line count */
  oldCount: number;
  /** New file line start */
  newStart: number;
  /** New file line count */
  newCount: number;
  /** The hunk content (including +/- prefixes) */
  content: string;
  /** Lines added in this hunk */
  additions: number;
  /** Lines removed in this hunk */
  deletions: number;
}

/**
 * Parsed file diff
 */
export interface FileDiff {
  /** Old file path (null if new file) */
  oldPath: string | null;
  /** New file path (null if deleted file) */
  newPath: string | null;
  /** File status */
  status: "modified" | "added" | "deleted" | "renamed";
  /** Binary file indicator */
  isBinary: boolean;
  /** Hunks in this file */
  hunks: DiffHunk[];
  /** Total additions */
  additions: number;
  /** Total deletions */
  deletions: number;
}

/**
 * Complete parsed diff
 */
export interface ParsedDiff {
  /** All file diffs */
  files: FileDiff[];
  /** Total additions across all files */
  totalAdditions: number;
  /** Total deletions across all files */
  totalDeletions: number;
}

/**
 * Diff compression strategy
 */
export type DiffStrategy = "hunks-only" | "summary" | "semantic";

/**
 * Diff compression options
 */
export interface DiffCompressOptions {
  /** Compression strategy */
  strategy: DiffStrategy;
  /** Maximum tokens for output (semantic strategy) */
  maxTokens?: number;
  /** Number of context lines to keep (hunks-only strategy) */
  contextLines?: number;
}

/**
 * Diff compression result
 */
export interface DiffCompressedResult {
  /** Compressed diff content */
  compressed: string;
  /** List of changed file paths */
  filesChanged: string[];
  /** Summary of changes */
  summary: string;
  /** Total additions */
  additions: number;
  /** Total deletions */
  deletions: number;
  /** Compression statistics */
  stats: CompressionStats;
}
