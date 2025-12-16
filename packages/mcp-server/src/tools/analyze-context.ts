import { encodingForModel } from "js-tiktoken";
import { z } from "zod";
import {
  ANTHROPIC_MODELS,
  calculateCost,
  formatCost,
  calculateContextUsage,
} from "@ctxopt/shared";
import type { ServerConfig } from "../server";

export const analyzeContextSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "The prompt or context content to analyze",
    },
    model: {
      type: "string",
      description: "The target model (default: claude-sonnet-4-20250514)",
      enum: Object.keys(ANTHROPIC_MODELS),
    },
  },
  required: ["content"],
};

const inputSchema = z.object({
  content: z.string(),
  model: z.string().optional().default("claude-sonnet-4-20250514"),
});

export async function analyzeContext(
  args: unknown,
  _config: ServerConfig
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { content, model } = inputSchema.parse(args);

  // Count tokens using tiktoken (cl100k_base is compatible with Claude)
  const encoding = encodingForModel("gpt-4");
  const tokens = encoding.encode(content);
  const tokenCount = tokens.length;

  // Calculate costs (assuming this is input)
  const costs = calculateCost(model, tokenCount, 0);
  const contextUsage = calculateContextUsage(tokenCount, model);

  // Analyze content for optimization opportunities
  const suggestions: string[] = [];

  // Check context size
  if (contextUsage > 80) {
    suggestions.push(
      `- **Critical**: Context uses ${contextUsage}% of the window. Consider summarizing older messages.`
    );
  } else if (contextUsage > 50) {
    suggestions.push(
      `- **Warning**: Context uses ${contextUsage}% of the window. Monitor growth.`
    );
  }

  // Check for potential redundancy (simple heuristic)
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const uniqueLines = new Set(lines);
  if (uniqueLines.size < lines.length * 0.9) {
    const duplicatePercent = Math.round(
      ((lines.length - uniqueLines.size) / lines.length) * 100
    );
    suggestions.push(
      `- **Redundancy detected**: ~${duplicatePercent}% duplicate lines found. Consider deduplication.`
    );
  }

  // Check for long system prompts
  const systemPromptMatch = content.match(/system[:\s]/i);
  if (systemPromptMatch && tokenCount > 2000) {
    suggestions.push(
      `- **Tip**: Long system prompt detected. Consider extracting reusable parts to reduce per-request tokens.`
    );
  }

  // Check for verbose formatting
  if (content.includes("```") && tokenCount > 5000) {
    const codeBlockCount = (content.match(/```/g) || []).length / 2;
    if (codeBlockCount > 3) {
      suggestions.push(
        `- **Tip**: ${Math.floor(codeBlockCount)} code blocks detected. Consider including only relevant snippets.`
      );
    }
  }

  const modelInfo = ANTHROPIC_MODELS[model as keyof typeof ANTHROPIC_MODELS];
  const modelName = modelInfo?.name || model;

  const result = `## Context Analysis

**Token Count:** ${tokenCount.toLocaleString()} tokens
**Model:** ${modelName}
**Estimated Input Cost:** ${formatCost(costs.inputCostMicros)}
**Context Window Usage:** ${contextUsage}%

${
  suggestions.length > 0
    ? `### Optimization Suggestions\n\n${suggestions.join("\n")}`
    : "### Status\n\n Context looks well-optimized!"
}

---
*Analyzed by CtxOpt*`;

  return {
    content: [{ type: "text", text: result }],
  };
}
