/**
 * Conversation Memory Tool
 *
 * Manages long conversation context with decision extraction
 * and context restoration capabilities.
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import {
  compressConversation,
  compressConversationWithMemory,
  extractDecisions,
  extractCodeReferences,
  restoreContext,
  type ConversationMessage,
  type ConversationMemory,
} from "../compressors/conversation.js";
import { getSessionTracker } from "../analytics/session-tracker.js";
import { getOutputConfig } from "../config/output-config.js";
import {
  serializeResultToToon,
  type ResultSchema,
} from "../utils/toon-serializer.js";

// Global memory storage for session persistence
let sessionMemory: ConversationMemory | null = null;

export const conversationMemorySchema = {
  type: "object" as const,
  properties: {
    action: {
      type: "string",
      enum: ["compress", "restore", "get_memory", "clear", "extract_decisions"],
      description: "Action to perform",
    },
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["user", "assistant", "system"] },
          content: { type: "string" },
        },
        required: ["role", "content"],
      },
      description: "Conversation messages (for compress action)",
    },
    strategy: {
      type: "string",
      enum: ["rolling-summary", "key-extraction", "hybrid"],
      description: "Compression strategy (default: hybrid)",
    },
    maxTokens: {
      type: "number",
      description: "Maximum tokens for output (default: 10000)",
    },
    preserveLastN: {
      type: "number",
      description: "Number of recent messages to preserve (default: 2)",
    },
    includeSummary: {
      type: "boolean",
      description: "Include summary in restored context (default: true)",
    },
    includeDecisions: {
      type: "boolean",
      description: "Include decisions in restored context (default: true)",
    },
    includeCodeRefs: {
      type: "boolean",
      description: "Include code references in restored context (default: true)",
    },
    recentMessages: {
      type: "number",
      description: "Number of recent messages to include in restoration (default: 3)",
    },
  },
  required: ["action"],
};

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const inputSchema = z.object({
  action: z.enum(["compress", "restore", "get_memory", "clear", "extract_decisions"]),
  messages: z.array(messageSchema).optional(),
  strategy: z
    .enum(["rolling-summary", "key-extraction", "hybrid"])
    .optional()
    .default("hybrid"),
  maxTokens: z.number().optional().default(10000),
  preserveLastN: z.number().optional().default(2),
  includeSummary: z.boolean().optional().default(true),
  includeDecisions: z.boolean().optional().default(true),
  includeCodeRefs: z.boolean().optional().default(true),
  recentMessages: z.number().optional().default(3),
});

/**
 * Format memory summary for display
 */
function formatMemorySummary(memory: ConversationMemory): string {
  const parts: string[] = [];

  parts.push("[Memory Summary]");
  parts.push(`Summary: ${memory.summary}`);
  parts.push(`Decisions: ${memory.decisions.length}`);
  parts.push(`Code References: ${memory.codeReferences.length}`);
  parts.push(`Messages: ${memory.compressedHistory.length}`);
  parts.push(`Last Updated: ${new Date(memory.lastUpdated).toISOString()}`);

  if (memory.decisions.length > 0) {
    parts.push("");
    parts.push("[Recent Decisions]");
    for (const d of memory.decisions.slice(-5)) {
      parts.push(`- ${d.decision}`);
    }
  }

  if (memory.codeReferences.length > 0) {
    parts.push("");
    parts.push("[Code References]");
    const created = memory.codeReferences.filter((r) => r.action === "created");
    const modified = memory.codeReferences.filter((r) => r.action === "modified");

    if (created.length > 0) {
      parts.push(`Created: ${created.map((r) => r.file).slice(0, 5).join(", ")}`);
    }
    if (modified.length > 0) {
      parts.push(`Modified: ${modified.map((r) => r.file).slice(0, 5).join(", ")}`);
    }
  }

  return parts.join("\n");
}

/**
 * Format output based on config
 */
function formatOutput(result: unknown, name: string): string {
  const config = getOutputConfig();

  if (config.mode === "toon" || config.useToon) {
    const schema: ResultSchema = { name };
    return serializeResultToToon(result, schema, {
      verbosity: config.verbosity,
      includeStats: config.includeStats,
    });
  }

  if (typeof result === "string") {
    return result;
  }

  return JSON.stringify(result, null, 2);
}

/**
 * Execute conversation memory tool
 */
async function executeConversationMemory(
  args: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const input = inputSchema.parse(args);

  switch (input.action) {
    case "compress": {
      if (!input.messages || input.messages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Error: messages array required for compress action",
            },
          ],
        };
      }

      const messages = input.messages as ConversationMessage[];
      const result = compressConversationWithMemory(messages, {
        strategy: input.strategy,
        maxTokens: input.maxTokens,
        preserveSystem: true,
        preserveLastN: input.preserveLastN,
      });

      // Store in session memory
      sessionMemory = result.memory;

      // Track usage
      const tokensSaved = result.stats.originalTokens - result.stats.compressedTokens;
      getSessionTracker().recordInvocation(
        "conversation_memory",
        result.stats.originalTokens,
        result.stats.compressedTokens,
        tokensSaved,
        0
      );

      const output = [
        `[Compressed] ${result.stats.originalTokens}→${result.stats.compressedTokens} tokens (-${Math.round((1 - result.stats.compressedTokens / result.stats.originalTokens) * 100)}%)`,
        `Decisions: ${result.stats.decisionsExtracted}, Code Refs: ${result.stats.codeRefsFound}`,
        "",
        result.context,
      ].join("\n");

      return {
        content: [{ type: "text", text: output }],
      };
    }

    case "restore": {
      if (!sessionMemory) {
        return {
          content: [
            {
              type: "text",
              text: "No memory stored. Use compress action first.",
            },
          ],
        };
      }

      const context = restoreContext(sessionMemory, {
        includeSummary: input.includeSummary,
        includeDecisions: input.includeDecisions,
        includeCodeRefs: input.includeCodeRefs,
        recentMessages: input.recentMessages,
      });

      return {
        content: [{ type: "text", text: context }],
      };
    }

    case "get_memory": {
      if (!sessionMemory) {
        return {
          content: [
            {
              type: "text",
              text: "No memory stored. Use compress action first.",
            },
          ],
        };
      }

      const output = formatMemorySummary(sessionMemory);
      return {
        content: [{ type: "text", text: output }],
      };
    }

    case "clear": {
      sessionMemory = null;
      return {
        content: [
          {
            type: "text",
            text: "Memory cleared.",
          },
        ],
      };
    }

    case "extract_decisions": {
      if (!input.messages || input.messages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Error: messages array required for extract_decisions action",
            },
          ],
        };
      }

      const messages = input.messages as ConversationMessage[];
      const decisions = extractDecisions(messages);
      const codeRefs = extractCodeReferences(messages);

      const parts: string[] = [];

      parts.push(`[Extracted] ${decisions.length} decisions, ${codeRefs.length} code references`);
      parts.push("");

      if (decisions.length > 0) {
        parts.push("[Decisions]");
        for (const d of decisions) {
          parts.push(`- ${d.decision}`);
        }
        parts.push("");
      }

      if (codeRefs.length > 0) {
        parts.push("[Code References]");
        const byAction = new Map<string, string[]>();
        for (const ref of codeRefs) {
          if (!byAction.has(ref.action)) {
            byAction.set(ref.action, []);
          }
          byAction.get(ref.action)!.push(ref.file);
        }
        for (const [action, files] of byAction) {
          parts.push(`${action}: ${files.join(", ")}`);
        }
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown action: ${input.action}`,
          },
        ],
      };
  }
}

export const conversationMemoryTool: ToolDefinition = {
  name: "conversation_memory",
  description:
    "Manage long conversation context. Actions: compress (with decision extraction), restore, get_memory, clear, extract_decisions.",
  inputSchema: conversationMemorySchema,
  execute: executeConversationMemory,
};

/**
 * Get current session memory (for SDK use)
 */
export function getSessionMemory(): ConversationMemory | null {
  return sessionMemory;
}

/**
 * Set session memory (for SDK use)
 */
export function setSessionMemory(memory: ConversationMemory | null): void {
  sessionMemory = memory;
}
