/**
 * Sandbox Module
 *
 * Provides safe code execution with Distill SDK.
 */

export { executeSandbox } from "./executor.js";
export { analyzeCode, sanitizeError } from "./security/index.js";
export { validatePath, validateGlobPattern } from "./security/path-validator.js";
export {
  defangControlTokens,
  wrapUntrustedSandboxOutput,
  UNTRUSTED_OUTPUT_OPEN,
  UNTRUSTED_OUTPUT_CLOSE,
} from "./output-sanitizer.js";
export type {
  ExecutionContext,
  ExecutionResult,
  CtxOptSDK,
  CodeAnalysis,
  CompressResult,
  LogSummary,
  FileStructure,
  CodeElement,
} from "./types.js";
export { DEFAULT_LIMITS } from "./types.js";

// Disposable utilities (TS 5.2+ using keyword)
export {
  createTimeout,
  createDisposableSandbox,
  createExecutionResources,
  disposable,
  asyncDisposable,
} from "./disposables.js";
export type {
  DisposableTimer,
  DisposableSandboxRuntime,
  ExecutionResources,
  SandboxRuntimeOptions,
  SandboxExecutionResult,
} from "./disposables.js";
