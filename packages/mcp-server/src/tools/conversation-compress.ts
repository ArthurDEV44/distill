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

// Minimal schema - preserveSystem/preserveLastN rarely changed
export const conversationCompressSchema = {
  type: "object" as const,
  properties: {
    messages: {
      type: "array",
      items: {
        properties: { role: { enum: ["user", "assistant", "system"] }, content: { type: "string" } },
      },
    },
    strategy: { enum: ["rolling-summary", "key-extraction", "hybrid"] },
    maxTokens: { type: "number" },
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

  // Minimal header
  const header = `[conversation] ${result.originalTokens}→${result.compressedTokens} tokens (-${result.savings}%), ${input.messages.length}→${result.compressedMessages.length} msgs`;

  // Compact output
  const parts: string[] = [header];
  if (result.summary) parts.push(result.summary);
  if (result.keyPoints?.length) parts.push(result.keyPoints.map(p => `• ${p}`).join("\n"));
  parts.push(JSON.stringify(result.compressedMessages));

  return { content: [{ type: "text", text: parts.join("\n") }] };
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
