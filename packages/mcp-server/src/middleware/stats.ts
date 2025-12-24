/**
 * Stats Middleware
 *
 * Tracks command history and token usage in the session state.
 */

import type { Middleware, ToolContext, ToolResult, MiddlewareConfig } from "./types.js";
import { addCommand, checkRetryPattern, markRetryWarned } from "../state/session.js";

export function createStatsMiddleware(_config: MiddlewareConfig): Middleware {
  return {
    name: "stats",
    priority: 100, // Run last in beforeTool, first in afterTool

    async beforeTool(ctx: ToolContext): Promise<ToolContext> {
      // Check for retry patterns
      const commandKey = `${ctx.toolName}:${JSON.stringify(ctx.arguments)}`;
      const pattern = checkRetryPattern(ctx.state, commandKey);

      if (pattern && !pattern.wasWarned) {
        // Add warning to metadata
        ctx.metadata.retryWarning = {
          command: ctx.toolName,
          count: pattern.count,
          message: `This command has been repeated ${pattern.count} times. Consider a different approach.`,
        };
        markRetryWarned(ctx.state, commandKey);
      }

      return ctx;
    },

    async afterTool(ctx: ToolContext, result: ToolResult): Promise<ToolResult> {
      const duration = Date.now() - ctx.startTime;

      // Record command in history
      addCommand(ctx.state, {
        command: JSON.stringify(ctx.arguments),
        toolName: ctx.toolName,
        timestamp: new Date(),
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        tokensSaved: result.tokensSaved,
        wasFiltered: result.wasFiltered,
        durationMs: duration,
      });

      // Add retry warning to result if present
      if (ctx.metadata.retryWarning) {
        const warning = ctx.metadata.retryWarning as { message: string };
        const warningText = `\n\n⚠️ **Retry Pattern Detected**: ${warning.message}`;
        const firstContent = result.content[0];

        if (firstContent && firstContent.type === "text") {
          firstContent.text += warningText;
        }
      }

      return result;
    },
  };
}
