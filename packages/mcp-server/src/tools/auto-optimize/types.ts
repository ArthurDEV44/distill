/**
 * Auto-Optimize shared types (US-012 decomposition).
 */

export type OutputFormat = "plain" | "markdown";

export type Strategy =
  | "auto"
  | "logs"
  | "build"
  | "diff"
  | "stacktrace"
  | "code"
  | "semantic"
  | "config"
  | "errors";

export type ResponseFormat = "minimal" | "normal" | "detailed";

export interface AutoOptimizeArgs {
  content: string;
  strategy?: Strategy;
  hint?: "build" | "logs" | "errors" | "code" | "auto";
  aggressive?: boolean;
  preservePatterns?: string[];
  format?: OutputFormat;
  response_format?: ResponseFormat;
  /** F2: active task/query for query-aware semantic compression. */
  task?: string;
}

export interface OptimizationResult {
  optimizedContent: string;
  detectedType: string;
  originalTokens: number;
  optimizedTokens: number;
  savingsPercent: number;
  method: string;
}
