/**
 * Sandbox Executor
 *
 * Executes user code in the QuickJS WebAssembly sandbox (secure isolation).
 * QuickJS is the single execution path — no environment toggle can disable it
 * (per OWASP A02:2025, a user-toggleable sandbox bypass is a reportable
 * misconfiguration).
 */

import {
  compressAuto,
  countTokens,
} from "./sdk/index.js";
import { analyzeCode, sanitizeError } from "./security/index.js";
import type {
  ExecutionContext,
  ExecutionResult,
} from "./types.js";

import {
  generateGuestSDKCode,
  createHostBridge,
} from "./quickjs/index.js";

import {
  createDisposableSandbox,
  type DisposableSandboxRuntime,
  type SandboxExecutionResult,
} from "./disposables.js";
import {
  brandAsSanitizedCode,
  type SanitizedCode,
} from "./branded-types.js";

/**
 * Compose the QuickJS-facing wrapper around user code.
 *
 * The `safeCode` parameter is typed as `SanitizedCode` — a brand that can only
 * be produced by `brandAsSanitizedCode`, which MUST be called after
 * `analyzeCode` confirms the code passes the static-analysis layer. Removing
 * the brand call at the callsite below will produce a TypeScript error here,
 * keeping the "all user code went through the analyzer" guarantee structural
 * rather than convention-based.
 *
 * The returned string is a plain `string` because QuickJS does not care about
 * brands; the brand demonstrates the `analyzeCode` gate and is not propagated
 * into the wrapped payload.
 *
 * @public (exported so type-tests.ts can anchor its regression assertions to
 *         the real signature; invoked locally by `executeSandbox` below)
 */
export function buildWrappedCode(
  guestSDK: string,
  safeCode: SanitizedCode
): string {
  return `
${guestSDK}

const __userFn = async () => {
  ${safeCode}
};

export default await __userFn();
`;
}

/**
 * Execute a `SanitizedCode` payload in the given sandbox runtime.
 *
 * This wrapper is the only intended way to reach `sandbox.execute` with user
 * code: the `SanitizedCode` parameter forces callers to produce the brand via
 * `brandAsSanitizedCode`, which the project convention (and the PRD) ties to
 * a successful `analyzeCode` result. `DisposableSandboxRuntime.execute` still
 * accepts `string` because its argument is the *wrapped* QuickJS payload
 * (guest SDK + user code template); making it accept `SanitizedCode` would
 * mis-label that composed string. Threading the brand through this wrapper
 * gives the "user code went through the analyzer" guarantee at the
 * sandbox-execute boundary without lying about what the inner API consumes.
 *
 * @public (exported for type-tests.ts regression anchoring — not a public
 *          API surface; production callers live in this file).
 */
export async function executeSanitized(
  sandbox: DisposableSandboxRuntime,
  code: SanitizedCode,
  guestSDK: string,
  hostFunctions: object
): Promise<SandboxExecutionResult> {
  const wrappedCode = buildWrappedCode(guestSDK, code);
  return sandbox.execute(wrappedCode, hostFunctions);
}

/**
 * Execute code in the QuickJS sandbox.
 * Uses `await using` for automatic resource cleanup.
 */
export async function executeSandbox(
  code: string,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const startTime = Date.now();

  // Defense in depth: static analysis before the sandbox runs the code.
  const analysis = analyzeCode(code);
  if (!analysis.safe) {
    return {
      success: false,
      output: null,
      error: `Blocked patterns: ${analysis.blockedPatterns.join(", ")}`,
      stats: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: 0,
      },
    };
  }

  // Brand the analyzed code so the downstream wrapper composition is
  // compile-time gated by `analyzeCode`. Reaching `buildWrappedCode` without
  // this call fails `bun run check-types`.
  const safeCode = brandAsSanitizedCode(code);

  await using sandbox = await createDisposableSandbox({
    timeout: context.timeout,
    memoryLimit: context.memoryLimit,
    workingDir: context.workingDir,
  });

  try {
    const hostFunctions = createHostBridge(context.workingDir);
    const guestSDK = generateGuestSDKCode();

    const result = await executeSanitized(
      sandbox,
      safeCode,
      guestSDK,
      hostFunctions
    );

    if (!result.ok) {
      return {
        success: false,
        output: null,
        error: sanitizeError(new Error(result.error || "Execution failed"), context.workingDir),
        stats: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: 0,
        },
        logs: result.logs,
      };
    }

    const outputStr = JSON.stringify(result.data, null, 2) ?? "";
    const tokensUsed = outputStr.length === 0 ? 0 : countTokens(outputStr);

    if (tokensUsed > context.maxOutputTokens) {
      const compressed = compressAuto(outputStr);
      return {
        success: true,
        output: compressed.compressed,
        stats: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: compressed.stats.compressed,
        },
        logs: result.logs,
      };
    }

    return {
      success: true,
      output: result.data,
      stats: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed,
      },
      logs: result.logs,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      success: false,
      output: null,
      error: sanitizeError(err, context.workingDir),
      stats: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: 0,
      },
    };
  }
}
