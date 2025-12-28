/**
 * Path Validator
 *
 * Validates file paths for sandbox access.
 * Reuses patterns from smart-file-read.ts for consistency.
 */

import * as path from "path";
import * as fs from "fs";

/**
 * Blocked file patterns (sensitive files)
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
];

/**
 * Validation result
 */
export interface PathValidation {
  safe: boolean;
  error?: string;
  resolvedPath?: string;
}

/**
 * Validate a file path for sandbox access
 */
export function validatePath(
  filePath: string,
  workingDir: string
): PathValidation {
  try {
    // Normalize and resolve path
    const normalizedPath = path.normalize(filePath);
    const resolvedPath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.resolve(workingDir, normalizedPath);

    // Check if path is within working directory
    const relative = path.relative(workingDir, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return {
        safe: false,
        error: `Path must be within working directory: ${workingDir}`,
      };
    }

    // Check for symlinks that might escape
    try {
      const realPath = fs.realpathSync(resolvedPath);
      const realRelative = path.relative(workingDir, realPath);
      if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
        return {
          safe: false,
          error: "Symlink escapes working directory",
        };
      }
    } catch {
      // File doesn't exist yet, that's okay for validation
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
    };
  } catch (error) {
    return {
      safe: false,
      error: `Invalid path: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

/**
 * Validate a glob pattern
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
