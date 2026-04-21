/**
 * Sandbox Error Types
 *
 * Discriminated union types for type-safe error handling with neverthrow.
 * Each error has a unique `code` for pattern matching.
 * Uses satisfies to ensure factory functions return correct types.
 */

// ============================================================================
// File Errors
// ============================================================================

export type FileError =
  | { code: "FILE_NOT_FOUND"; path: string; message: string }
  | { code: "FILE_READ_ERROR"; path: string; message: string }
  | { code: "PATH_VALIDATION_FAILED"; path: string; reason: string; message: string }
  | { code: "PATH_VALIDATION_FAILED_AT_OPEN"; path: string; reason: string; message: string }
  | { code: "PATTERN_INVALID"; pattern: string; message: string };

/** Interface for FileError factory */
interface FileErrorFactory {
  readonly notFound: (path: string) => FileError;
  readonly readError: (path: string, error: string) => FileError;
  readonly pathValidation: (path: string, reason: string) => FileError;
  readonly pathValidationAtOpen: (path: string, reason: string) => FileError;
  readonly patternInvalid: (pattern: string, reason: string) => FileError;
}

/** Helper functions to create FileError instances */
export const fileError = {
  notFound: (path: string): FileError => ({
    code: "FILE_NOT_FOUND",
    path,
    message: `File not found: ${path}`,
  }),

  readError: (path: string, error: string): FileError => ({
    code: "FILE_READ_ERROR",
    path,
    message: `Failed to read ${path}: ${error}`,
  }),

  pathValidation: (path: string, reason: string): FileError => ({
    code: "PATH_VALIDATION_FAILED",
    path,
    reason,
    message: `Path validation failed for ${path}: ${reason}`,
  }),

  // Distinct from pathValidation — raised when re-validation at file-open time
  // rejects a path that passed initial validation (TOCTOU window closed).
  pathValidationAtOpen: (path: string, reason: string): FileError => ({
    code: "PATH_VALIDATION_FAILED_AT_OPEN",
    path,
    reason,
    message: `Path validation failed at open time for ${path}: ${reason}`,
  }),

  patternInvalid: (pattern: string, reason: string): FileError => ({
    code: "PATTERN_INVALID",
    pattern,
    message: `Invalid pattern '${pattern}': ${reason}`,
  }),
} as const satisfies FileErrorFactory;

// ============================================================================
// Git Errors
// ============================================================================

export type GitError =
  | { code: "GIT_NOT_REPO"; path: string; message: string }
  | { code: "GIT_COMMAND_FAILED"; command: string; stderr: string; message: string }
  | { code: "GIT_BLOCKED_COMMAND"; command: string; message: string }
  | { code: "GIT_INVALID_ARG"; arg: string; message: string };

/** Interface for GitError factory */
interface GitErrorFactory {
  readonly notRepo: (path: string) => GitError;
  readonly commandFailed: (command: string, stderr: string) => GitError;
  readonly blockedCommand: (command: string) => GitError;
  readonly invalidArg: (arg: string) => GitError;
}

/** Helper functions to create GitError instances */
export const gitError = {
  notRepo: (path: string): GitError => ({
    code: "GIT_NOT_REPO",
    path,
    message: `Not a git repository: ${path}`,
  }),

  commandFailed: (command: string, stderr: string): GitError => ({
    code: "GIT_COMMAND_FAILED",
    command,
    stderr,
    message: `Git command failed: ${command}`,
  }),

  blockedCommand: (command: string): GitError => ({
    code: "GIT_BLOCKED_COMMAND",
    command,
    message: `Git command blocked for security: ${command}`,
  }),

  invalidArg: (arg: string): GitError => ({
    code: "GIT_INVALID_ARG",
    arg,
    message: `Invalid git argument: ${arg}`,
  }),
} as const satisfies GitErrorFactory;

// ============================================================================
// Parse Errors
// ============================================================================

export type ParseError =
  | { code: "UNSUPPORTED_LANGUAGE"; language: string; message: string }
  | { code: "PARSE_FAILED"; language: string; error: string; message: string }
  | { code: "ELEMENT_NOT_FOUND"; type: string; name: string; message: string };

/** Interface for ParseError factory */
interface ParseErrorFactory {
  readonly unsupportedLanguage: (language: string) => ParseError;
  readonly parseFailed: (language: string, error: string) => ParseError;
  readonly elementNotFound: (type: string, name: string) => ParseError;
}

/** Helper functions to create ParseError instances */
export const parseError = {
  unsupportedLanguage: (language: string): ParseError => ({
    code: "UNSUPPORTED_LANGUAGE",
    language,
    message: `Unsupported language: ${language}`,
  }),

  parseFailed: (language: string, error: string): ParseError => ({
    code: "PARSE_FAILED",
    language,
    error,
    message: `Failed to parse ${language}: ${error}`,
  }),

  elementNotFound: (type: string, name: string): ParseError => ({
    code: "ELEMENT_NOT_FOUND",
    type,
    name,
    message: `${type} '${name}' not found`,
  }),
} as const satisfies ParseErrorFactory;

// ============================================================================
// Search Errors
// ============================================================================

export type SearchError =
  | { code: "INVALID_REGEX"; pattern: string; error: string; message: string }
  | { code: "SEARCH_FAILED"; message: string };

/** Interface for SearchError factory */
interface SearchErrorFactory {
  readonly invalidRegex: (pattern: string, error: string) => SearchError;
  readonly searchFailed: (error: string) => SearchError;
}

/** Helper functions to create SearchError instances */
export const searchError = {
  invalidRegex: (pattern: string, error: string): SearchError => ({
    code: "INVALID_REGEX",
    pattern,
    error,
    message: `Invalid regex '${pattern}': ${error}`,
  }),

  searchFailed: (error: string): SearchError => ({
    code: "SEARCH_FAILED",
    message: `Search failed: ${error}`,
  }),
} as const satisfies SearchErrorFactory;

// ============================================================================
// Compress Errors
// ============================================================================

export type CompressError =
  | { code: "COMPRESS_FAILED"; contentType: string; message: string }
  | { code: "INVALID_RATIO"; ratio: number; message: string };

/** Interface for CompressError factory */
interface CompressErrorFactory {
  readonly failed: (contentType: string, error: string) => CompressError;
  readonly invalidRatio: (ratio: number) => CompressError;
}

/** Helper functions to create CompressError instances */
export const compressError = {
  failed: (contentType: string, error: string): CompressError => ({
    code: "COMPRESS_FAILED",
    contentType,
    message: `Compression failed for ${contentType}: ${error}`,
  }),

  invalidRatio: (ratio: number): CompressError => ({
    code: "INVALID_RATIO",
    ratio,
    message: `Invalid compression ratio: ${ratio} (must be between 0 and 1)`,
  }),
} as const satisfies CompressErrorFactory;

// ============================================================================
// Execution Errors
// ============================================================================

export type ExecutionError =
  | { code: "TIMEOUT"; elapsed: number; limit: number; message: string }
  | { code: "BLOCKED_CODE"; patterns: string[]; message: string }
  | { code: "EXECUTION_FAILED"; error: string; stack?: string; message: string }
  | { code: "MEMORY_EXCEEDED"; message: string };

/** Interface for ExecutionError factory */
interface ExecutionErrorFactory {
  readonly timeout: (elapsed: number, limit: number) => ExecutionError;
  readonly blockedCode: (patterns: string[]) => ExecutionError;
  readonly failed: (error: string, stack?: string) => ExecutionError;
  readonly memoryExceeded: () => ExecutionError;
}

/** Helper functions to create ExecutionError instances */
export const executionError = {
  timeout: (elapsed: number, limit: number): ExecutionError => ({
    code: "TIMEOUT",
    elapsed,
    limit,
    message: `Execution timeout: ${elapsed}ms exceeded ${limit}ms limit`,
  }),

  blockedCode: (patterns: string[]): ExecutionError => ({
    code: "BLOCKED_CODE",
    patterns,
    message: `Blocked patterns detected: ${patterns.join(", ")}`,
  }),

  failed: (error: string, stack?: string): ExecutionError => ({
    code: "EXECUTION_FAILED",
    error,
    stack,
    message: `Execution failed: ${error}`,
  }),

  memoryExceeded: (): ExecutionError => ({
    code: "MEMORY_EXCEEDED",
    message: "Memory limit exceeded",
  }),
} as const satisfies ExecutionErrorFactory;

// ============================================================================
// Combined SDK Error
// ============================================================================

/** Union of all SDK error types */
export type SdkError =
  | FileError
  | GitError
  | ParseError
  | SearchError
  | CompressError
  | ExecutionError;

// ============================================================================
// Error Type Guards
// ============================================================================

export function isFileError(error: SdkError): error is FileError {
  return (
    error.code === "FILE_NOT_FOUND" ||
    error.code === "FILE_READ_ERROR" ||
    error.code === "PATH_VALIDATION_FAILED" ||
    error.code === "PATH_VALIDATION_FAILED_AT_OPEN" ||
    error.code === "PATTERN_INVALID"
  );
}

export function isGitError(error: SdkError): error is GitError {
  return (
    error.code === "GIT_NOT_REPO" ||
    error.code === "GIT_COMMAND_FAILED" ||
    error.code === "GIT_BLOCKED_COMMAND" ||
    error.code === "GIT_INVALID_ARG"
  );
}

export function isParseError(error: SdkError): error is ParseError {
  return (
    error.code === "UNSUPPORTED_LANGUAGE" ||
    error.code === "PARSE_FAILED" ||
    error.code === "ELEMENT_NOT_FOUND"
  );
}

export function isSearchError(error: SdkError): error is SearchError {
  return error.code === "INVALID_REGEX" || error.code === "SEARCH_FAILED";
}

export function isCompressError(error: SdkError): error is CompressError {
  return error.code === "COMPRESS_FAILED" || error.code === "INVALID_RATIO";
}

export function isExecutionError(error: SdkError): error is ExecutionError {
  return (
    error.code === "TIMEOUT" ||
    error.code === "BLOCKED_CODE" ||
    error.code === "EXECUTION_FAILED" ||
    error.code === "MEMORY_EXCEEDED"
  );
}
