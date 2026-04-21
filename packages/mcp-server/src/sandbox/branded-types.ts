/**
 * Branded Types for Compile-Time Path Safety
 *
 * Branded types provide compile-time guarantees that values have been validated.
 * A branded type cannot be assigned from a plain string - it must go through
 * a validation function first.
 *
 * @example
 * ```typescript
 * const path: string = "/some/path";
 * const validated: ValidatedPath = path; // Error: string not assignable to ValidatedPath
 *
 * const result = validatePathResult(path, workingDir);
 * if (result.isOk()) {
 *   const validated: ValidatedPath = result.value; // OK
 * }
 * ```
 */

// Brand symbol for nominal typing
declare const __brand: unique symbol;

/**
 * Brand utility type - creates a nominal type from a base type
 * The brand is purely compile-time and has no runtime overhead
 */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ============================================================================
// Branded Types
// ============================================================================

/**
 * A file path that has been validated to be:
 * - Within the sandbox working directory
 * - Not containing path traversal attacks
 * - Not matching blocked sensitive file patterns
 * - Symlink-resolved to prevent escapes
 */
export type ValidatedPath = Brand<string, "ValidatedPath">;

/**
 * A glob pattern that has been validated to be:
 * - Not containing path traversal (..)
 * - Not an absolute path
 * - Not matching sensitive file patterns
 */
export type SafePattern = Brand<string, "SafePattern">;

/**
 * A git command argument that has been sanitized:
 * - No shell metacharacters
 * - No newlines or control characters
 * - Safe for shell execution
 */
export type SanitizedGitArg = Brand<string, "SanitizedGitArg">;

/**
 * User code that has passed security checks:
 * - No blocked patterns (require, process, etc.)
 * - Safe for sandbox execution
 */
export type SanitizedCode = Brand<string, "SanitizedCode">;

// ============================================================================
// Branding Utilities
// ============================================================================

/**
 * Brand a string as a ValidatedPath.
 * INTERNAL USE ONLY - call this only after validation succeeds.
 *
 * @internal
 */
export function brandAsValidatedPath(path: string): ValidatedPath {
  return path as ValidatedPath;
}

/**
 * Brand a string as a SafePattern.
 * INTERNAL USE ONLY - call this only after validation succeeds.
 *
 * @internal
 */
export function brandAsSafePattern(pattern: string): SafePattern {
  return pattern as SafePattern;
}

/**
 * Brand a string as a SanitizedGitArg.
 * INTERNAL USE ONLY - call this only after sanitization succeeds.
 *
 * @internal
 */
export function brandAsSanitizedGitArg(arg: string): SanitizedGitArg {
  return arg as SanitizedGitArg;
}

/**
 * Brand a string as SanitizedCode.
 * INTERNAL USE ONLY - call this only after code validation succeeds.
 *
 * @internal
 */
export function brandAsSanitizedCode(code: string): SanitizedCode {
  return code as SanitizedCode;
}

// ============================================================================
// Unwrap Utilities
// ============================================================================

// NOTE: Runtime `is*` type guards were removed in v0.9.1 (PRD US-014).
// They were all identical `typeof value === "string"` checks, which gave
// a false sense of safety. Brand-specific validation belongs in the
// producers (validatePathResult, validatePatternResult, sanitizeGitArg)
// — not in consumer-side runtime guards. Compile-time enforcement is
// covered by sandbox/type-tests.ts.

/**
 * Extract the underlying string from a branded type.
 * Use when you need to pass to external APIs that expect plain strings.
 */
export function unwrapBrandedString<T extends string>(branded: Brand<string, T>): string {
  return branded as string;
}
