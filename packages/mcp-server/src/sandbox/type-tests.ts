/**
 * Type Tests for Phase 5: Type Improvements
 *
 * Uses expect-type to verify compile-time type behavior.
 * These tests run during type-checking (bun run check-types).
 */

import { expectTypeOf } from "expect-type";
import type { Result } from "neverthrow";

import type {
  ValidatedPath,
  SafePattern,
  SanitizedGitArg,
  SanitizedCode,
} from "./branded-types.js";
import {
  brandAsValidatedPath,
  brandAsSafePattern,
  brandAsSanitizedGitArg,
  brandAsSanitizedCode,
} from "./branded-types.js";
import {
  validatePathResult,
  validatePatternResult,
} from "./security/path-validator.js";
import { buildWrappedCode, executeSanitized } from "./executor.js";
import type { FileError } from "./errors.js";
import { DEFAULT_LIMITS, type ExecutionLimits } from "./types.js";
import { fileError, gitError, parseError } from "./errors.js";

// ============================================================================
// Branded Types Tests
// ============================================================================

// Test: Branded types are not assignable from plain string
// @ts-expect-error - string should not be assignable to ValidatedPath
expectTypeOf<string>().toMatchTypeOf<ValidatedPath>();

// @ts-expect-error - string should not be assignable to SafePattern
expectTypeOf<string>().toMatchTypeOf<SafePattern>();

// @ts-expect-error - string should not be assignable to SanitizedGitArg
expectTypeOf<string>().toMatchTypeOf<SanitizedGitArg>();

// @ts-expect-error - string should not be assignable to SanitizedCode
expectTypeOf<string>().toMatchTypeOf<SanitizedCode>();

// Test: Branded types ARE assignable to string (covariance)
expectTypeOf<ValidatedPath>().toMatchTypeOf<string>();
expectTypeOf<SafePattern>().toMatchTypeOf<string>();
expectTypeOf<SanitizedGitArg>().toMatchTypeOf<string>();

// Test: Branded types are distinct from each other
// @ts-expect-error - ValidatedPath should not be assignable to SafePattern
expectTypeOf<ValidatedPath>().toMatchTypeOf<SafePattern>();

// @ts-expect-error - SafePattern should not be assignable to SanitizedGitArg
expectTypeOf<SafePattern>().toMatchTypeOf<SanitizedGitArg>();

// ============================================================================
// Validation Function Return Types
// ============================================================================

// Test: validatePathResult returns Result<ValidatedPath, FileError>
expectTypeOf(validatePathResult).returns.toMatchTypeOf<
  Result<ValidatedPath, FileError>
>();

// Test: validatePatternResult returns Result<SafePattern, FileError>
expectTypeOf(validatePatternResult).returns.toMatchTypeOf<
  Result<SafePattern, FileError>
>();

// ============================================================================
// Branding Functions
// ============================================================================

// Test: brandAsValidatedPath returns ValidatedPath
expectTypeOf(brandAsValidatedPath).returns.toMatchTypeOf<ValidatedPath>();

// Test: brandAsSafePattern returns SafePattern
expectTypeOf(brandAsSafePattern).returns.toMatchTypeOf<SafePattern>();

// Test: brandAsSanitizedGitArg returns SanitizedGitArg
expectTypeOf(brandAsSanitizedGitArg).returns.toMatchTypeOf<SanitizedGitArg>();

// Test: brandAsSanitizedCode returns SanitizedCode (v0.9.2 US-007)
expectTypeOf(brandAsSanitizedCode).returns.toMatchTypeOf<SanitizedCode>();

// ============================================================================
// buildWrappedCode — structural gate via SanitizedCode (v0.9.2 US-007)
// ============================================================================

// Test: buildWrappedCode's second parameter is SanitizedCode, not plain string.
// Regression for executor.ts: if a future refactor removes `brandAsSanitizedCode`
// at the callsite and passes `code: string` directly, `bun run check-types`
// will fail because string is not assignable to SanitizedCode in a covariant
// (argument) position.
expectTypeOf<Parameters<typeof buildWrappedCode>[1]>().toEqualTypeOf<SanitizedCode>();

// @ts-expect-error - plain string must not be assignable to buildWrappedCode's SanitizedCode parameter
expectTypeOf<string>().toMatchTypeOf<Parameters<typeof buildWrappedCode>[1]>();

// Test: executeSanitized's `code` parameter is SanitizedCode, not plain string.
// This is the boundary wrapper the PRD US-007 AC-3 asks for — any caller that
// tries to pass unsanitized `string` fails `bun run check-types`. Together
// with the buildWrappedCode assertion above, this pins the brand gate at the
// only two functions that can compose the wrapped payload.
expectTypeOf<Parameters<typeof executeSanitized>[1]>().toEqualTypeOf<SanitizedCode>();

// @ts-expect-error - plain string must not be assignable to executeSanitized's SanitizedCode parameter
expectTypeOf<string>().toMatchTypeOf<Parameters<typeof executeSanitized>[1]>();

// ============================================================================
// satisfies Tests
// ============================================================================

// Test: DEFAULT_LIMITS satisfies ExecutionLimits
expectTypeOf(DEFAULT_LIMITS).toMatchTypeOf<ExecutionLimits>();

// Test: DEFAULT_LIMITS preserves literal types (as const)
expectTypeOf(DEFAULT_LIMITS.timeout).toEqualTypeOf<5000>();
expectTypeOf(DEFAULT_LIMITS.maxTimeout).toEqualTypeOf<30000>();
expectTypeOf(DEFAULT_LIMITS.memoryLimit).toEqualTypeOf<128>();
expectTypeOf(DEFAULT_LIMITS.maxOutputTokens).toEqualTypeOf<4000>();

// ============================================================================
// Error Factory Tests
// ============================================================================

// Test: fileError.notFound returns FileError
expectTypeOf(fileError.notFound).returns.toMatchTypeOf<FileError>();

// Test: gitError.blockedCommand returns GitError
expectTypeOf(gitError.blockedCommand).returns.toMatchTypeOf<
  import("./errors.js").GitError
>();

// Test: parseError.unsupportedLanguage returns ParseError
expectTypeOf(parseError.unsupportedLanguage).returns.toMatchTypeOf<
  import("./errors.js").ParseError
>();

// ============================================================================
// Export for module resolution
// ============================================================================

export {};
