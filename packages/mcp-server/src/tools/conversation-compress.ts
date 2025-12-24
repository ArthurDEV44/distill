/**
 * Conversation Compress Tool
 *
 * MCP tool for compressing conversation history to reduce tokens
 * while preserving key information.
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import {
  compressConversation,
  type ConversationMessage,
} from "../compressors/conversation.js";

// JSON Schema for MCP
export const conversationCompressSchema = {
  type: "object" as const,
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: {
            type: "string",
            enum: ["user", "assistant", "system"],
            description: "Message role",
          },
          content: {
            type: "string",
            description: "Message content",
          },
        },
        required: ["role", "content"],
      },
      description: "Array of conversation messages to compress",
    },
    strategy: {
      type: "string",
      enum: ["rolling-summary", "key-extraction", "hybrid"],
      description:
        "Compression strategy: rolling-summary (paragraph), key-extraction (bullet points), hybrid (both)",
    },
    maxTokens: {
      type: "number",
      description: "Target maximum tokens for output (best effort)",
    },
    preserveSystem: {
      type: "boolean",
      description: "Keep original system messages intact (default: true)",
    },
    preserveLastN: {
      type: "number",
      description: "Keep last N messages intact without compression (default: 2)",
    },
  },
  required: ["messages", "strategy", "maxTokens"],
};

// Zod schema for validation
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const inputSchema = z.object({
  messages: z.array(messageSchema),
  strategy: z.enum(["rolling-summary", "key-extraction", "hybrid"]),
  maxTokens: z.number().positive(),
  preserveSystem: z.boolean().optional().default(true),
  preserveLastN: z.number().min(0).optional().default(2),
});

/**
 * Execute conversation compression
 */
export async function executeConversationCompress(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = inputSchema.parse(args);

  // Validate input
  if (input.messages.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: "No messages to compress.",
        },
      ],
    };
  }

  // Perform compression
  const result = compressConversation(input.messages as ConversationMessage[], {
    strategy: input.strategy,
    maxTokens: input.maxTokens,
    preserveSystem: input.preserveSystem,
    preserveLastN: input.preserveLastN,
  });

  // Format output
  const output: string[] = [
    `## Conversation Compressed`,
    "",
    `**Strategy:** ${input.strategy}`,
    `**Messages:** ${result.compressedMessages.length} (was ${input.messages.length})`,
    `**Tokens:** ${result.compressedTokens} (was ${result.originalTokens}) | **Savings:** ${result.savings}%`,
    "",
  ];

  // Add summary if available
  if (result.summary) {
    output.push("### Summary");
    output.push(result.summary);
    output.push("");
  }

  // Add key points if available
  if (result.keyPoints && result.keyPoints.length > 0) {
    output.push("### Key Points Extracted");
    for (const point of result.keyPoints) {
      output.push(`- ${point}`);
    }
    output.push("");
  }

  // Add compressed messages as JSON
  output.push("### Compressed Messages");
  output.push("```json");
  output.push(JSON.stringify(result.compressedMessages, null, 2));
  output.push("```");

  return { content: [{ type: "text", text: output.join("\n") }] };
}

/**
 * Conversation Compress Tool Definition
 */
export const conversationCompressTool: ToolDefinition = {
  name: "conversation_compress",
  description:
    "Compress chat history. Strategies: rolling-summary, key-extraction, hybrid.",
  inputSchema: conversationCompressSchema,
  execute: executeConversationCompress,
};
