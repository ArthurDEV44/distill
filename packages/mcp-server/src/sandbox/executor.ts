/**
 * Sandbox Executor
 *
 * Executes user code in a sandboxed environment with Distill SDK.
 *
 * Supports two execution modes:
 * - QuickJS (default): Uses WebAssembly sandbox (secure isolation)
 * - Legacy: Uses Function constructor (fast but not fully isolated)
 *
 * Set DISTILL_LEGACY_EXECUTOR=true to use legacy mode.
 * DISTILL_USE_QUICKJS is deprecated — QuickJS is now the default.
 */

import * as fs from "fs";
import * as path from "path";
import {
  compressAuto,
  compressLogs,
  compressDiff,
  compressSemantic,
  codeParse,
  codeExtract,
  codeSkeleton,
  countTokens,
  detectType,
  detectLanguage,
  // Use legacy APIs that throw on error (for backward compat at boundary)
  createFilesAPILegacy,
  createGitAPILegacy,
  createSearchAPILegacy,
  createAnalyzeAPI,
  createPipelineAPI,
  createMultifileAPI,
  createConversationAPI,
  createFluentPipelineAPI,
} from "./sdk/index.js";
import { analyzeCode, sanitizeError } from "./security/index.js";
import { validatePath, validateGlobPattern } from "./security/path-validator.js";
import type {
  ExecutionContext,
  ExecutionResult,
  HostCallbacks,
  CtxOptSDK,
} from "./types.js";

// QuickJS imports (lazy loaded)
import {
  createQuickJSRuntime,
  generateGuestSDKCode,
  createHostBridge,
} from "./quickjs/index.js";

// Disposable utilities for resource management (TS 5.2+ using keyword)
import { createTimeout, createDisposableSandbox } from "./disposables.js";

/**
 * Resolve executor mode from environment variables.
 *
 * Priority: DISTILL_LEGACY_EXECUTOR (new) > DISTILL_USE_QUICKJS (deprecated) > default (QuickJS)
 *
 * NOTE: This runs once at module load time. The result is frozen for the process lifetime.
 * Tests cannot change the mode by mutating process.env after import.
 */
function resolveExecutorMode(): boolean {
  const legacyEnv = process.env.DISTILL_LEGACY_EXECUTOR;
  const oldEnv = process.env.DISTILL_USE_QUICKJS;

  // New env var: DISTILL_LEGACY_EXECUTOR=true → legacy mode
  if (legacyEnv !== undefined) {
    if (legacyEnv === "true") {
      console.error(
        "[distill] WARNING: Legacy executor active (new Function). Limited isolation. Set DISTILL_LEGACY_EXECUTOR=false for QuickJS WASM sandbox."
      );
      return false; // QuickJS disabled
    }
    // Non-"true" value — warn and use default (QuickJS)
    console.error(
      `[distill] WARNING: DISTILL_LEGACY_EXECUTOR="${legacyEnv}" not recognized. Only "true" enables legacy mode. Using QuickJS.`
    );
    return true;
  }

  // Deprecated env var: DISTILL_USE_QUICKJS
  if (oldEnv !== undefined) {
    if (oldEnv === "true") {
      // Was opt-in for QuickJS, now the default — harmless but stale
      console.error(
        "[distill] DEPRECATED: DISTILL_USE_QUICKJS=true is now the default. You can remove this variable."
      );
      return true;
    }
    // Any value other than "true" previously meant legacy mode (since the old check was === "true")
    console.error(
      "[distill] DEPRECATED: DISTILL_USE_QUICKJS is deprecated. Use DISTILL_LEGACY_EXECUTOR=true instead."
    );
    return false;
  }

  // Default: QuickJS enabled
  return true;
}

/** Frozen at module load time — see resolveExecutorMode() JSDoc. */
const USE_QUICKJS = resolveExecutorMode();

// Log active executor mode at startup
console.error(
  `[distill] Sandbox executor: ${USE_QUICKJS ? "QuickJS WASM (secure)" : "Legacy (new Function)"}`
);

/**
 * Create host callbacks for file operations
 */
function createHostCallbacks(workingDir: string): HostCallbacks {
  return {
    readFile(filePath: string): string {
      const validation = validatePath(filePath, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error || "Invalid path");
      }
      return fs.readFileSync(validation.resolvedPath!, "utf-8");
    },

    fileExists(filePath: string): boolean {
      const validation = validatePath(filePath, workingDir);
      if (!validation.safe) {
        return false;
      }
      try {
        fs.accessSync(validation.resolvedPath!);
        return true;
      } catch {
        return false;
      }
    },

    glob(pattern: string): string[] {
      const validation = validateGlobPattern(pattern, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error || "Invalid glob pattern");
      }

      // Synchronous glob using fs
      const results: string[] = [];
      const basePattern = path.basename(pattern);

      function walkDir(dir: string, relativePath: string = ""): void {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.join(relativePath, entry.name);

            if (entry.isDirectory()) {
              if (pattern.includes("**")) {
                walkDir(fullPath, relPath);
              }
            } else if (entry.isFile()) {
              // Simple glob matching
              if (matchesPattern(entry.name, basePattern)) {
                results.push(relPath);
              }
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }

      walkDir(workingDir);
      return results.slice(0, 100); // Limit results
    },
  };
}

/**
 * Simple glob pattern matching
 */
function matchesPattern(filename: string, pattern: string): boolean {
  // Handle common patterns
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1);
    return filename.endsWith(ext);
  }
  return filename === pattern;
}

/**
 * Create the SDK object for sandbox (legacy mode)
 * Uses legacy throwing APIs for backward compatibility
 */
function createSDK(workingDir: string): CtxOptSDK {
  const callbacks = createHostCallbacks(workingDir);
  const filesAPI = createFilesAPILegacy(callbacks);

  return {
    compress: {
      auto: compressAuto,
      logs: compressLogs,
      diff: compressDiff,
      semantic: compressSemantic,
    },
    code: {
      parse: codeParse,
      extract: codeExtract,
      skeleton: codeSkeleton,
    },
    files: filesAPI,
    utils: {
      countTokens,
      detectType,
      detectLanguage,
    },
    git: createGitAPILegacy(workingDir),
    search: createSearchAPILegacy(workingDir, callbacks),
    analyze: createAnalyzeAPI(workingDir, callbacks),
    pipeline: createPipelineAPI(workingDir, callbacks),
    multifile: createMultifileAPI(workingDir, callbacks),
    conversation: createConversationAPI(workingDir, callbacks),
    pipe: createFluentPipelineAPI(workingDir, callbacks),
  };
}

/**
 * Execute code using QuickJS WebAssembly sandbox (secure)
 * Uses `await using` for automatic resource cleanup.
 */
async function executeSandboxQuickJS(
  code: string,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const startTime = Date.now();

  // Security: analyze code before execution (defense in depth)
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

  // Use `await using` for automatic sandbox cleanup
  await using sandbox = await createDisposableSandbox({
    timeout: context.timeout,
    memoryLimit: context.memoryLimit,
    workingDir: context.workingDir,
  });

  try {
    // Create host bridge with all SDK functions
    const hostFunctions = createHostBridge(context.workingDir);

    // Generate guest SDK code
    const guestSDK = generateGuestSDKCode();

    // Wrap user code with SDK
    const wrappedCode = `
${guestSDK}

const __userFn = async () => {
  ${code}
};

export default await __userFn();
`;

    // Execute in sandbox
    const result = await sandbox.execute(wrappedCode, hostFunctions);

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

    // Count output tokens
    const outputStr = JSON.stringify(result.data, null, 2);
    const tokensUsed = countTokens(outputStr);

    // Check output size
    if (tokensUsed > context.maxOutputTokens) {
      // Auto-compress large output
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
} // Sandbox auto-disposed here

/**
 * Execute code using legacy Function constructor (fast but not fully isolated)
 * Uses `using` for automatic timer cleanup.
 */
async function executeSandboxLegacy(
  code: string,
  context: ExecutionContext
): Promise<ExecutionResult> {
  const startTime = Date.now();

  // Security: analyze code before execution
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

  // Use `using` for automatic timer cleanup
  using timer = createTimeout(context.timeout);

  try {
    // Create SDK
    const ctx = createSDK(context.workingDir);

    // Wrap code in async function
    const wrappedCode = `
      return (async function() {
        ${code}
      })();
    `;

    // Create sandboxed function
    // Note: This is not fully isolated, but provides some protection
    const sandboxedFn = new Function("ctx", wrappedCode);

    // Execute with timeout check
    const executionPromise = sandboxedFn(ctx) as Promise<unknown>;

    // Race against timeout using disposable timer
    const result = await Promise.race([
      executionPromise,
      new Promise<never>((_, reject) => {
        const checkInterval = setInterval(() => {
          if (timer.expired) {
            clearInterval(checkInterval);
            reject(new Error("Execution timeout"));
          }
        }, 50);
        // Cleanup interval when execution completes
        executionPromise.finally(() => clearInterval(checkInterval));
      }),
    ]);

    // Count output tokens
    const outputStr = JSON.stringify(result, null, 2);
    const tokensUsed = countTokens(outputStr);

    // Check output size
    if (tokensUsed > context.maxOutputTokens) {
      // Auto-compress large output
      const compressed = compressAuto(outputStr);
      return {
        success: true,
        output: compressed.compressed,
        stats: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: compressed.stats.compressed,
        },
      };
    }

    return {
      success: true,
      output: result,
      stats: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed,
      },
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
} // Timer auto-cleared here

/**
 * Execute code in sandbox
 *
 * Uses QuickJS WebAssembly sandbox by default.
 * Set DISTILL_LEGACY_EXECUTOR=true to use legacy Function constructor.
 */
export async function executeSandbox(
  code: string,
  context: ExecutionContext
): Promise<ExecutionResult> {
  if (USE_QUICKJS) {
    return executeSandboxQuickJS(code, context);
  }
  return executeSandboxLegacy(code, context);
}

/**
 * Check if QuickJS sandbox is enabled
 */
export function isQuickJSEnabled(): boolean {
  return USE_QUICKJS;
}
