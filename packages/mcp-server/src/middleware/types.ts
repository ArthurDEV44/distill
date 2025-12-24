/**
 * Middleware Types
 *
 * Defines the interface for middleware that can intercept and transform
 * tool calls before and after execution.
 */

export interface MiddlewareError {
  middlewareName: string;
  phase: "beforeTool" | "afterTool" | "onError";
  error: Error;
  timestamp: number;
}

export interface ToolContext {
  toolName: string;
  arguments: Record<string, unknown>;
  startTime: number;
  metadata: Record<string, unknown>;
  /** Errors encountered during middleware execution (non-fatal) */
  middlewareErrors: MiddlewareError[];
}

export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
  tokensIn: number;
  tokensOut: number;
  tokensSaved: number;
  wasFiltered: boolean;
  metadata: Record<string, unknown>;
}

export interface Middleware {
  name: string;
  priority: number; // Lower runs first

  /**
   * Called before tool execution.
   * Return null to skip the tool execution.
   * Return modified context to continue.
   */
  beforeTool?(ctx: ToolContext): Promise<ToolContext | null>;

  /**
   * Called after tool execution.
   * Can modify the result before returning to the client.
   */
  afterTool?(ctx: ToolContext, result: ToolResult): Promise<ToolResult>;

  /**
   * Called on error during tool execution.
   * Can transform or suppress errors.
   */
  onError?(ctx: ToolContext, error: Error): Promise<ToolResult | null>;
}

export type MiddlewareFactory = (config: MiddlewareConfig) => Middleware;

export interface MiddlewareConfig {
  verbose: boolean;
  [key: string]: unknown;
}
