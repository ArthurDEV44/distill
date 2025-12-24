/**
 * Tools Registry
 *
 * Central registry for all MCP tools with unified execution.
 */

import type { ToolContext, ToolResult } from "../middleware/types.js";
import type { MiddlewareChain } from "../middleware/chain.js";
import { countTokens } from "../utils/token-counter.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: unknown) => Promise<ToolExecuteResult>;
}

export interface ToolExecuteResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private middlewareChain: MiddlewareChain | null = null;

  /**
   * Set the middleware chain to use for tool execution
   */
  setMiddlewareChain(chain: MiddlewareChain): void {
    this.middlewareChain = chain;
  }

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
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
   */
  getToolDefinitions(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Execute a tool with middleware chain
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

    // Create tool context with error tracking
    const ctx: ToolContext = {
      toolName: name,
      arguments: args as Record<string, unknown>,
      startTime: Date.now(),
      metadata: {},
      middlewareErrors: [],
    };

    try {
      // Execute beforeTool middlewares
      let currentCtx: ToolContext | null = ctx;
      if (this.middlewareChain) {
        currentCtx = await this.middlewareChain.executeBefore(ctx);
        if (currentCtx === null) {
          // Middleware skipped execution
          return {
            content: [{ type: "text", text: "Tool execution skipped by middleware" }],
            isError: false,
            tokensIn,
            tokensOut: 0,
            tokensSaved: 0,
            wasFiltered: true,
            metadata: { skippedBy: "middleware" },
          };
        }
      }

      // Execute tool
      const executeResult = await tool.execute(currentCtx.arguments);

      // Count output tokens using centralized counter
      const outputText = executeResult.content.map((c) => c.text).join("\n");
      const tokensOut = countTokens(outputText);

      // Create result
      let result: ToolResult = {
        content: executeResult.content,
        isError: executeResult.isError ?? false,
        tokensIn,
        tokensOut,
        tokensSaved: 0,
        wasFiltered: false,
        metadata: {},
      };

      // Execute afterTool middlewares
      if (this.middlewareChain) {
        result = await this.middlewareChain.executeAfter(currentCtx, result);
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Try to handle error with middleware
      if (this.middlewareChain) {
        const handledResult = await this.middlewareChain.executeOnError(ctx, err);
        if (handledResult) {
          return handledResult;
        }
      }

      // Return error result
      return {
        content: [{ type: "text", text: `Error executing ${name}: ${err.message}` }],
        isError: true,
        tokensIn,
        tokensOut: 0,
        tokensSaved: 0,
        wasFiltered: false,
        metadata: { error: err.message },
      };
    }
  }
}

/**
 * Create a new tool registry instance
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}
