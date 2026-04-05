/**
 * Disposable utilities for explicit resource management.
 * Uses TypeScript 5.2+ `using` keyword for automatic cleanup.
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A disposable timer that auto-clears when disposed.
 */
export interface DisposableTimer extends Disposable {
  /** Whether the timer has expired */
  readonly expired: boolean;
  /** Clear the timer early */
  clear(): void;
}

/**
 * Options for creating a disposable sandbox.
 */
export interface SandboxRuntimeOptions {
  timeout: number;
  memoryLimit: number;
  workingDir: string;
}

/**
 * Result from sandbox execution.
 */
export interface SandboxExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  logs: string[];
}

/**
 * A disposable QuickJS sandbox runtime.
 */
export interface DisposableSandboxRuntime extends AsyncDisposable {
  /** Execute code in the sandbox */
  execute(
    code: string,
    hostFunctions: object
  ): Promise<SandboxExecutionResult>;
  /** Whether the runtime has been disposed */
  readonly disposed: boolean;
}

/**
 * Grouped execution resources (sandbox + timer).
 */
export interface ExecutionResources extends AsyncDisposable {
  sandbox: DisposableSandboxRuntime;
  timer: DisposableTimer;
}

// ============================================================================
// Disposable Timer
// ============================================================================

/**
 * Creates a disposable timeout that auto-clears when disposed.
 * Use with `using` keyword for automatic cleanup.
 *
 * @example
 * ```typescript
 * {
 *   using timer = createTimeout(5000);
 *   await someOperation();
 *   if (timer.expired) throw new Error("Timeout");
 * } // Timer auto-cleared here
 * ```
 */
export function createTimeout(ms: number): DisposableTimer {
  let expired = false;
  const id = setTimeout(() => {
    expired = true;
  }, ms);

  return {
    get expired() {
      return expired;
    },
    clear() {
      clearTimeout(id);
    },
    [Symbol.dispose]() {
      clearTimeout(id);
    },
  };
}

// ============================================================================
// Disposable Sandbox Runtime
// ============================================================================

/**
 * Creates a disposable QuickJS sandbox runtime.
 * Use with `await using` for automatic cleanup.
 *
 * @example
 * ```typescript
 * {
 *   await using sandbox = await createDisposableSandbox(options);
 *   const result = await sandbox.execute(code, hostFunctions);
 * } // Sandbox auto-disposed here
 * ```
 */
export async function createDisposableSandbox(
  options: SandboxRuntimeOptions
): Promise<DisposableSandboxRuntime> {
  // Import QuickJS loader
  const { loadQuickJs } = await import("@sebastianwessel/quickjs");
  const variant = await import("@jitl/quickjs-ng-wasmfile-release-sync");
  const { runSandboxed } = await loadQuickJs(variant.default);

  let disposed = false;

  return {
    get disposed() {
      return disposed;
    },

    async execute(
      code: string,
      hostFunctions: object
    ): Promise<SandboxExecutionResult> {
      if (disposed) {
        return {
          ok: false,
          error: "Sandbox has been disposed",
          logs: [],
        };
      }

      const logs: string[] = [];

      try {
        const result = await runSandboxed(
          async ({ evalCode }) => evalCode(code),
          {
            allowFetch: false,
            allowFs: false,
            executionTimeout: options.timeout,
            memoryLimit: options.memoryLimit * 1024 * 1024,
            console: {
              log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
              error: (...args: unknown[]) =>
                logs.push(`[ERROR] ${args.map(String).join(" ")}`),
              warn: (...args: unknown[]) =>
                logs.push(`[WARN] ${args.map(String).join(" ")}`),
              info: (...args: unknown[]) =>
                logs.push(`[INFO] ${args.map(String).join(" ")}`),
              debug: (...args: unknown[]) =>
                logs.push(`[DEBUG] ${args.map(String).join(" ")}`),
            },
            env: {
              WORKING_DIR: options.workingDir,
              ...(hostFunctions as Record<string, unknown>),
            },
          }
        );

        if (result.ok) {
          return { ok: true, data: result.data, logs };
        } else {
          // Type guard: result is ErrorResponse when ok is false
          const errorResult = result as { ok: false; error: unknown };
          const rawError = errorResult.error;
          const errorMsg = typeof rawError === 'object' && rawError !== null && 'message' in rawError
            ? String((rawError as { message: unknown }).message)
            : String(rawError);
          return { ok: false, error: errorMsg, logs };
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          logs,
        };
      }
    },

    async [Symbol.asyncDispose](): Promise<void> {
      if (disposed) return;
      disposed = true;
      // Note: @sebastianwessel/quickjs handles internal cleanup via Scope
      // This is a defensive marker to prevent reuse
    },
  };
}

// ============================================================================
// Execution Context with DisposableStack
// ============================================================================

/**
 * Creates grouped execution resources.
 * All resources are disposed together, even if one disposal throws.
 *
 * @example
 * ```typescript
 * {
 *   await using resources = await createExecutionResources(options);
 *   const result = await resources.sandbox.execute(code, hostFns);
 *   if (resources.timer.expired) throw new Error("Timeout");
 * } // Both sandbox and timer disposed here
 * ```
 */
export async function createExecutionResources(
  options: SandboxRuntimeOptions
): Promise<ExecutionResources> {
  // Create timer first
  const timer = createTimeout(options.timeout);

  // Create sandbox
  const sandbox = await createDisposableSandbox(options);

  return {
    sandbox,
    timer,
    async [Symbol.asyncDispose]() {
      // Dispose all resources, collecting errors
      const errors: unknown[] = [];

      try {
        timer[Symbol.dispose]();
      } catch (e) {
        errors.push(e);
      }

      try {
        await sandbox[Symbol.asyncDispose]();
      } catch (e) {
        errors.push(e);
      }

      // If any errors occurred, throw the first one
      if (errors.length > 0) {
        throw errors[0];
      }
    },
  };
}

// ============================================================================
// Utility: Disposable wrapper for arbitrary cleanup
// ============================================================================

/**
 * Create a disposable from any cleanup function.
 * Useful for wrapping existing resources.
 */
export function disposable(cleanup: () => void): Disposable {
  return {
    [Symbol.dispose]: cleanup,
  };
}

/**
 * Create an async disposable from any async cleanup function.
 */
export function asyncDisposable(cleanup: () => Promise<void>): AsyncDisposable {
  return {
    [Symbol.asyncDispose]: cleanup,
  };
}
