/**
 * Shared path-security policy (US-010).
 *
 * Single source of truth for the sensitive-file denylist, consumed by BOTH the
 * sandbox path validator (`sandbox/security/path-validator.ts`) and the
 * `smart_file_read` tool. Previously the tool imported `getBlockedPatterns`
 * from the sandbox's internal validator, coupling a tool to a sibling's
 * security internals; the policy now lives here, importable by either side
 * without crossing a tool/sandbox boundary.
 *
 * This module holds POLICY only — the pattern list plus pure predicates. The
 * TOCTOU/realpath validation MECHANISM (validate-then-recheck-at-open) stays in
 * the sandbox path validator and is unchanged.
 */

import * as path from "path";

/**
 * Blocked file patterns (sensitive files).
 * Uses `satisfies` to preserve literal types while guaranteeing `RegExp[]`.
 */
export const BLOCKED_PATTERNS = [
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
 * Check if a path matches any blocked pattern (basename or full path).
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
