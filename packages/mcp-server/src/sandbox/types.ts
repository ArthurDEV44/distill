/**
 * Sandbox Types
 *
 * Type definitions for the code execution SDK.
 */

import type { SupportedLanguage, ElementType } from "../ast/types.js";
import type { ContentType } from "../compressors/types.js";

/**
 * Execution context passed to sandbox
 */
export interface ExecutionContext {
  workingDir: string;
  timeout: number;
  memoryLimit: number;
  maxOutputTokens: number;
}

/**
 * Default execution limits
 */
export const DEFAULT_LIMITS = {
  timeout: 5000, // 5 seconds
  maxTimeout: 30000, // 30 seconds max
  memoryLimit: 128, // 128MB
  maxOutputTokens: 4000,
} as const;

/**
 * Compression result from SDK
 */
export interface CompressResult {
  compressed: string;
  stats: {
    original: number;
    compressed: number;
    reductionPercent: number;
  };
}

/**
 * Log summary result
 */
export interface LogSummary {
  summary: string;
  stats: {
    totalLines: number;
    errorCount: number;
    warningCount: number;
  };
}

/**
 * Code element from AST parsing
 */
export interface CodeElement {
  type: ElementType;
  name: string;
  startLine: number;
  endLine?: number;
  signature?: string;
  documentation?: string;
}

/**
 * File structure from parsing
 */
export interface FileStructure {
  language: SupportedLanguage;
  functions: CodeElement[];
  classes: CodeElement[];
  interfaces: CodeElement[];
  types: CodeElement[];
  variables: CodeElement[];
  imports: CodeElement[];
  exports: CodeElement[];
}

/**
 * Extraction target for code elements
 */
export interface ExtractionTarget {
  type: ElementType;
  name: string;
}

/**
 * SDK functions available in sandbox
 */
export interface CtxOptSDK {
  compress: {
    auto: (content: string, hint?: string) => CompressResult;
    logs: (logs: string) => LogSummary;
    diff: (diff: string) => CompressResult;
    semantic: (content: string, ratio?: number) => CompressResult;
  };

  code: {
    parse: (content: string, language: SupportedLanguage) => FileStructure;
    extract: (
      content: string,
      language: SupportedLanguage,
      target: ExtractionTarget
    ) => string | null;
    skeleton: (content: string, language: SupportedLanguage) => string;
  };

  files: {
    read: (path: string) => string;
    exists: (path: string) => boolean;
    glob: (pattern: string) => string[];
  };

  utils: {
    countTokens: (text: string) => number;
    detectType: (content: string) => ContentType;
    detectLanguage: (filePath: string) => SupportedLanguage;
  };

  git: {
    diff: (ref?: string) => GitDiff;
    log: (limit?: number) => GitCommit[];
    blame: (file: string, line?: number) => GitBlame;
    status: () => GitStatus;
    branch: () => GitBranch;
  };
}

/**
 * Execution result from sandbox
 */
export interface ExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
  stats: {
    executionTimeMs: number;
    tokensUsed: number;
  };
}

/**
 * Code analysis result for security
 */
export interface CodeAnalysis {
  safe: boolean;
  warnings: string[];
  blockedPatterns: string[];
}

/**
 * Host callbacks for sandbox file operations
 */
export interface HostCallbacks {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  glob: (pattern: string) => string[];
}

// ============================================
// Git Types
// ============================================

/**
 * Git diff result
 */
export interface GitDiff {
  raw: string;
  files: GitFileChange[];
  stats: {
    additions: number;
    deletions: number;
  };
}

/**
 * Individual file change in a diff
 */
export interface GitFileChange {
  file: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

/**
 * Git commit information
 */
export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

/**
 * Git blame result
 */
export interface GitBlame {
  lines: GitBlameLine[];
}

/**
 * Individual blame line
 */
export interface GitBlameLine {
  hash: string;
  author: string;
  date: string;
  line: number;
  content: string;
}

/**
 * Git repository status
 */
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
}

/**
 * Git branch information
 */
export interface GitBranch {
  current: string;
  branches: string[];
}
