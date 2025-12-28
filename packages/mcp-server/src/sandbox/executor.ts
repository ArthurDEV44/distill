/**
 * Sandbox Executor
 *
 * Executes user code in a sandboxed environment with ctxopt SDK.
 * Uses Function constructor with restricted scope for isolation.
 */

import * as fs from "fs";
import * as path from "path";
import { glob } from "fs/promises";
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
  createFilesAPI,
  createGitAPI,
  createSearchAPI,
  createAnalyzeAPI,
  createPipelineAPI,
  createMultifileAPI,
  createConversationAPI,
} from "./sdk/index.js";
import { analyzeCode, sanitizeError } from "./security/index.js";
import { validatePath, validateGlobPattern } from "./security/path-validator.js";
import type {
  ExecutionContext,
  ExecutionResult,
  HostCallbacks,
  CtxOptSDK,
  DEFAULT_LIMITS,
} from "./types.js";

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
      const searchDir = path.dirname(validation.resolvedPath!);
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
 * Create the SDK object for sandbox
 */
function createSDK(workingDir: string): CtxOptSDK {
  const callbacks = createHostCallbacks(workingDir);
  const filesAPI = createFilesAPI(callbacks);

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
    git: createGitAPI(workingDir),
    search: createSearchAPI(workingDir, callbacks),
    analyze: createAnalyzeAPI(workingDir, callbacks),
    pipeline: createPipelineAPI(workingDir, callbacks),
    multifile: createMultifileAPI(workingDir, callbacks),
    conversation: createConversationAPI(workingDir, callbacks),
  };
}

/**
 * Execute code in sandbox
 */
export async function executeSandbox(
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

    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Execution timeout")), context.timeout);
    });

    const result = await Promise.race([sandboxedFn(ctx), timeoutPromise]);

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
}
