/**
 * Path Validator
 *
 * Validates file paths for sandbox access.
 * Provides both legacy interface and Result-based API with branded types.
 */

import * as path from "path";
import * as fs from "fs";
import { ok, err, type Result } from "neverthrow";
import {
  type ValidatedPath,
  type SafePattern,
  brandAsValidatedPath,
  brandAsSafePattern,
} from "../branded-types.js";
import { fileError, type FileError } from "../errors.js";

/**
 * Blocked file patterns (sensitive files)
 * Uses satisfies to ensure type safety while preserving literal types
 */
const BLOCKED_PATTERNS = [
  /\.env($|\.)/i, // Environment files
  /\.pem$/i, // Private keys
  /\.key$/i, // Key files
  /id_rsa/i, // SSH keys
  /id_ed25519/i, // SSH keys
  /credentials/i, // Credentials
  /secrets?\./i, // Secret files
  /\.keystore$/i, // Java keystores
  /\.jks$/i, // Java keystores
  /password/i, // Password files
  /\.htpasswd/i, // Apache passwords
  /\.netrc/i, // Network credentials
  /\.npmrc/i, // NPM credentials
  /\.pypirc/i, // PyPI credentials
] as const satisfies readonly RegExp[];

/**
 * Validation result (legacy interface)
 *
 * `mustRecheckOnOpen` is set when the path did not exist at validation time
 * (so `realpath` could not be called) — consumers MUST re-validate at the
 * actual file-open syscall to close the TOCTOU window.
 */
export interface PathValidation {
  safe: boolean;
  error?: string;
  resolvedPath?: string;
  mustRecheckOnOpen?: boolean;
}

/**
 * Validate a file path for sandbox access (legacy API)
 */
export function validatePath(
  filePath: string,
  workingDir: string
): PathValidation {
  try {
    // Pre-realpath the workingDir once so a symlinked root (macOS
    // `/tmp` → `/private/tmp`, bind mounts, etc.) does not produce
    // false-positive "escape" rejections for legitimate in-tree paths.
    // Fallback: if the directory does not exist yet, treat the raw
    // string as the root (preserves v0.9.1 best-effort behaviour).
    let resolvedWorkingDir: string;
    try {
      resolvedWorkingDir = fs.realpathSync(workingDir);
    } catch {
      resolvedWorkingDir = workingDir;
    }

    // Normalize and resolve path
    const normalizedPath = path.normalize(filePath);
    const resolvedPath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.resolve(resolvedWorkingDir, normalizedPath);

    // Check if path is within working directory
    const relative = path.relative(resolvedWorkingDir, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return {
        safe: false,
        error: `Path must be within working directory: ${workingDir}`,
      };
    }

    // Check for symlinks that might escape.
    // If realpath throws (path does not exist yet), we flag the result so
    // downstream read/write syscalls MUST re-validate right before the open —
    // this closes the TOCTOU window where a symlink could be planted between
    // validation and use.
    let mustRecheckOnOpen = false;
    try {
      const realPath = fs.realpathSync(resolvedPath);
      const realRelative = path.relative(resolvedWorkingDir, realPath);
      if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
        return {
          safe: false,
          error: "Symlink escapes working directory",
        };
      }
    } catch {
      mustRecheckOnOpen = true;
    }

    // Check against blocked patterns
    const fileName = path.basename(resolvedPath);
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(fileName) || pattern.test(resolvedPath)) {
        return {
          safe: false,
          error: `Access to ${fileName} is blocked for security`,
        };
      }
    }

    return {
      safe: true,
      resolvedPath,
      mustRecheckOnOpen,
    };
  } catch (error) {
    return {
      safe: false,
      error: `Invalid path: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

/**
 * Validate a glob pattern (legacy API)
 */
export function validateGlobPattern(
  pattern: string,
  workingDir: string
): PathValidation {
  // Check for path traversal in pattern
  if (pattern.includes("..")) {
    return {
      safe: false,
      error: "Glob pattern cannot contain path traversal (..)",
    };
  }

  // Check for absolute paths
  if (path.isAbsolute(pattern)) {
    return {
      safe: false,
      error: "Glob pattern must be relative to working directory",
    };
  }

  // Check for blocked patterns in glob
  for (const blocked of BLOCKED_PATTERNS) {
    if (blocked.test(pattern)) {
      return {
        safe: false,
        error: `Glob pattern matches blocked file types`,
      };
    }
  }

  return {
    safe: true,
    resolvedPath: path.join(workingDir, pattern),
  };
}

// ============================================================================
// Result-based API with Branded Types
// ============================================================================

/**
 * Validate a file path and return a branded ValidatedPath on success.
 *
 * @param filePath - The path to validate
 * @param workingDir - The sandbox working directory
 * @returns Result<ValidatedPath, FileError>
 *
 * @example
 * ```typescript
 * const result = validatePathResult("src/index.ts", "/project");
 * if (result.isOk()) {
 *   // result.value is ValidatedPath, safe to use
 *   const content = fs.readFileSync(result.value);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export function validatePathResult(
  filePath: string,
  workingDir: string
): Result<ValidatedPath, FileError> {
  const validation = validatePath(filePath, workingDir);

  if (!validation.safe) {
    return err(
      fileError.pathValidation(filePath, validation.error ?? "Unknown validation error")
    );
  }

  // Brand the validated path
  return ok(brandAsValidatedPath(validation.resolvedPath!));
}

/**
 * Validate a glob pattern and return a branded SafePattern on success.
 *
 * @param pattern - The glob pattern to validate
 * @param workingDir - The sandbox working directory
 * @returns Result<SafePattern, FileError>
 *
 * @example
 * ```typescript
 * const result = validatePatternResult("src/**\/*.ts", "/project");
 * if (result.isOk()) {
 *   // result.value is SafePattern, safe to use for glob operations
 *   const files = glob.sync(result.value);
 * }
 * ```
 */
export function validatePatternResult(
  pattern: string,
  workingDir: string
): Result<SafePattern, FileError> {
  const validation = validateGlobPattern(pattern, workingDir);

  if (!validation.safe) {
    return err(
      fileError.patternInvalid(pattern, validation.error ?? "Unknown validation error")
    );
  }

  // Brand the validated pattern
  return ok(brandAsSafePattern(pattern));
}

/**
 * Resolve a path via `realpath` and return it only if the resolved target is
 * still within `workingDir`. Returns null when the symlink escapes the tree,
 * when the target does not exist, or when the call fails for any reason.
 *
 * `workingDir` is also realpath-resolved so that a symlinked workingDir (e.g.
 * macOS `/tmp` → `/private/tmp`) does not produce a false "escape" verdict.
 *
 * Used by sandbox directory walkers to refuse symlink entries that would
 * otherwise leak paths outside the sandbox.
 */
export function resolveWithinWorkingDir(
  targetPath: string,
  workingDir: string
): string | null {
  try {
    const realTarget = fs.realpathSync(targetPath);
    const realRoot = fs.realpathSync(workingDir);
    const rel = path.relative(realRoot, realTarget);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return realTarget;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a path matches any blocked patterns.
 * Useful for pre-validation checks.
 */
export function isBlockedPath(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return BLOCKED_PATTERNS.some(
    (pattern) => pattern.test(fileName) || pattern.test(filePath)
  );
}

/**
 * Get the list of blocked patterns (for documentation/testing).
 */
export function getBlockedPatterns(): readonly RegExp[] {
  return BLOCKED_PATTERNS;
}

// ============================================================================
// TOCTOU-safe file read helpers (US-005)
// ============================================================================

/**
 * Re-validate a path at file-open time.
 *
 * Re-resolves the path via `realpathSync` and ensures the target is still
 * within `workingDir`. This runs *immediately* before the consuming syscall
 * so that a symlink planted between the initial validation and the read is
 * refused.
 *
 * @returns `ok(realPath)` if the path still resolves inside `workingDir`;
 *   `err(FileError)` with code `PATH_VALIDATION_FAILED_AT_OPEN` or
 *   `FILE_NOT_FOUND` otherwise.
 */
export function reValidateAtOpen(
  resolvedPath: string,
  workingDir: string
): Result<string, FileError> {
  let realPath: string;
  try {
    realPath = fs.realpathSync(resolvedPath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return err(fileError.notFound(`${resolvedPath}: ${msg}`));
  }
  try {
    const realRoot = fs.realpathSync(workingDir);
    const rel = path.relative(realRoot, realPath);
    if (rel !== "" && (rel.startsWith("..") || path.isAbsolute(rel))) {
      return err(
        fileError.pathValidationAtOpen(
          resolvedPath,
          "resolved path escapes working directory"
        )
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return err(fileError.pathValidationAtOpen(resolvedPath, msg));
  }
  return ok(realPath);
}

/**
 * Validate → re-validate at open → read. Use this instead of raw
 * `fs.readFileSync` anywhere inside the sandbox. Throws on any failure so
 * legacy throwing callers (QuickJS bridge) can surface errors directly.
 *
 * @param filePath - Absolute or workingDir-relative path.
 * @param workingDir - Sandbox working directory.
 */
export function safeReadFileSyncLegacy(
  filePath: string,
  workingDir: string
): string {
  const validation = validatePath(filePath, workingDir);
  if (!validation.safe || !validation.resolvedPath) {
    throw new Error(validation.error || "Invalid path");
  }
  const recheck = reValidateAtOpen(validation.resolvedPath, workingDir);
  if (recheck.isErr()) {
    throw new Error(recheck.error.message);
  }
  return fs.readFileSync(recheck.value, "utf-8");
}
