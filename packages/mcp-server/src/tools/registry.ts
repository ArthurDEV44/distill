/**
 * Tools Registry
 *
 * Central registry for all MCP tools with unified execution.
 * Verbose-mode logging is inlined here (formerly the middleware/ abstraction).
 */

import { countTokens } from "../utils/token-counter.js";

/**
 * Execution context passed to tool handlers at call time.
 */
export interface ToolContext {
  toolName: string;
  arguments: Record<string, unknown>;
  startTime: number;
  metadata: Record<string, unknown>;
}

/**
 * Registry-level result returned by {@link ToolRegistry.execute}.
 */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** Structured JSON matching outputSchema (MCP 2025-06-18) */
  structuredContent?: Record<string, unknown>;
  tokensIn: number;
  tokensOut: number;
  tokensSaved: number;
  wasFiltered: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Tool annotations per MCP 2025-06-18 specification
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/tools
 */
export interface ToolAnnotations {
  /** Tool only reads data, doesn't modify state */
  readOnlyHint?: boolean;
  /** Tool may perform destructive operations */
  destructiveHint?: boolean;
  /** Tool is idempotent (same input = same result) */
  idempotentHint?: boolean;
  /** Tool may take a long time to execute */
  longRunningHint?: boolean;
  /** Tool interacts with external systems outside the local environment (MCP 2025-03-26). Spec default: true. */
  openWorldHint?: boolean;
  /** Human-readable title for the tool */
  title?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Output schema for structured result validation (MCP 2025-06-18) */
  outputSchema?: Record<string, unknown>;
  /** Tool behavior annotations for LLM guidance */
  annotations?: ToolAnnotations;
  execute: (args: unknown) => Promise<ToolExecuteResult>;
}

export interface ToolExecuteResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  /** Structured JSON matching outputSchema (MCP 2025-06-18) */
  structuredContent?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Verbose-mode logging (inlined from former middleware/logging.ts)
// -----------------------------------------------------------------------------

const LOG_COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
} as const;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  return `${(tokens / 1000).toFixed(1)}k`;
}

function logBefore(toolName: string, args: Record<string, unknown>): void {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.error(
    `${LOG_COLORS.dim}[${timestamp}]${LOG_COLORS.reset} ${LOG_COLORS.cyan}→${LOG_COLORS.reset} ${toolName}`,
    args
  );
}

function logAfter(ctx: ToolContext, result: ToolResult): void {
  const duration = Date.now() - ctx.startTime;
  const timestamp = new Date().toISOString().slice(11, 23);

  const statusColor = result.isError ? LOG_COLORS.red : LOG_COLORS.green;
  const statusIcon = result.isError ? "✗" : "✓";

  const parts = [
    `${LOG_COLORS.dim}[${timestamp}]${LOG_COLORS.reset}`,
    `${statusColor}${statusIcon}${LOG_COLORS.reset}`,
    ctx.toolName,
    `${LOG_COLORS.dim}(${formatDuration(duration)})${LOG_COLORS.reset}`,
  ];

  if (result.tokensOut > 0) {
    parts.push(`${LOG_COLORS.dim}tokens:${formatTokens(result.tokensOut)}${LOG_COLORS.reset}`);
  }

  if (result.tokensSaved > 0) {
    parts.push(`${LOG_COLORS.green}saved:${formatTokens(result.tokensSaved)}${LOG_COLORS.reset}`);
  }

  if (result.wasFiltered) {
    parts.push(`${LOG_COLORS.yellow}[filtered]${LOG_COLORS.reset}`);
  }

  if (result.isError) {
    const errMsg = (result.metadata as { error?: string }).error ?? "";
    if (errMsg) {
      parts.push(`${LOG_COLORS.red}Error: ${errMsg}${LOG_COLORS.reset}`);
    }
  }

  console.error(parts.join(" "));
}

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private verbose: boolean;
  private changeCallbacks: Array<() => void> = [];

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Toggle verbose logging at runtime (used by tests and the CLI).
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Register callback for tool list changes
   */
  onToolsChanged(callback: () => void): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * Emit tool list change notification
   */
  private emitChange(): void {
    for (const cb of this.changeCallbacks) {
      try {
        cb();
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): this {
    this.tools.set(tool.name, tool);
    this.emitChange();
    return this;
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const result = this.tools.delete(name);
    if (result) {
      this.emitChange();
    }
    return result;
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool definitions for MCP ListTools response
   * Includes outputSchema and annotations per MCP 2025-06-18 spec
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: ToolAnnotations;
  }> {
    return this.list().map((tool) => {
      const def: {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations?: ToolAnnotations;
      } = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      };

      // NOTE: outputSchema intentionally excluded from tools/list response.
      // Older Claude Code versions silently drop tools with outputSchema (Issue #25081).
      // structuredContent is still returned in tool call results.

      // Include annotations if defined
      if (tool.annotations) {
        def.annotations = tool.annotations;
      }

      return def;
    });
  }

  /**
   * Execute a tool.
   *
   * Verbose-mode logging runs as two inline `if (verbose)` blocks: one before
   * the handler (→ toolName, args) and one after (✓/✗ toolName, duration,
   * tokensOut, tokensSaved, filtered flag, error message). The after-block
   * fires on both the happy and catch paths, so thrown errors are still logged.
   */
  async execute(name: string, args: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
        tokensIn: 0,
        tokensOut: 0,
        tokensSaved: 0,
        wasFiltered: false,
        metadata: {},
      };
    }

    // Count input tokens using centralized counter
    const inputText = JSON.stringify(args);
    const tokensIn = countTokens(inputText);

    // Build tool context
    const ctx: ToolContext = {
      toolName: name,
      arguments: args as Record<string, unknown>,
      startTime: Date.now(),
      metadata: {},
    };

    if (this.verbose) {
      logBefore(ctx.toolName, ctx.arguments);
    }

    let result: ToolResult;
    try {
      const executeResult = await tool.execute(ctx.arguments);

      const outputText = executeResult.content.map((c) => c.text).join("\n");
      const tokensOut = countTokens(outputText);

      result = {
        content: executeResult.content,
        isError: executeResult.isError ?? false,
        structuredContent: executeResult.structuredContent,
        tokensIn,
        tokensOut,
        tokensSaved: 0,
        wasFiltered: false,
        metadata: {},
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result = {
        content: [{ type: "text", text: `Error executing ${name}: ${err.message}` }],
        isError: true,
        tokensIn,
        tokensOut: 0,
        tokensSaved: 0,
        wasFiltered: false,
        metadata: { error: err.message },
      };
    }

    if (this.verbose) {
      logAfter(ctx, result);
    }

    return result;
  }
}

/**
 * Create a new tool registry instance. Pass `verbose: true` to enable
 * stderr logging around every tool call.
 */
export function createToolRegistry(verbose: boolean = false): ToolRegistry {
  return new ToolRegistry(verbose);
}
