/**
 * Context Budget Tool
 *
 * Proactive token budget management - analyze content BEFORE sending to LLM
 * to estimate costs, check budget constraints, and get optimization recommendations.
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import { countTokens } from "../utils/token-counter.js";
import { detectContentType } from "../utils/content-detector.js";
import { estimateOutputTokens } from "../utils/output-estimator.js";
import {
  ANTHROPIC_MODELS,
  DEFAULT_MODEL,
  type AnthropicModel,
  calculateCost,
  formatCost,
  calculateContextUsage,
} from "@ctxopt/shared";

/**
 * JSON Schema for MCP tool registration
 */
export const contextBudgetSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "The content/prompt to analyze for budget estimation",
    },
    model: {
      type: "string",
      description:
        "Target model (claude-opus-4-20250514, claude-sonnet-4-20250514, claude-3-5-haiku-20241022). Default: claude-sonnet-4-20250514",
      enum: [
        "claude-opus-4-20250514",
        "claude-sonnet-4-20250514",
        "claude-3-5-haiku-20241022",
      ],
    },
    budgetTokens: {
      type: "number",
      description:
        "Optional maximum token budget. If set, will check if content fits within budget.",
      minimum: 50,
    },
    includeEstimatedOutput: {
      type: "boolean",
      description:
        "Include estimated output tokens in calculations. Default: true",
    },
  },
  required: ["content"],
};

/**
 * Zod schema for runtime validation
 */
const inputSchema = z.object({
  content: z.string().min(1, "Content is required"),
  model: z
    .enum([
      "claude-opus-4-20250514",
      "claude-sonnet-4-20250514",
      "claude-3-5-haiku-20241022",
    ])
    .optional()
    .default(DEFAULT_MODEL),
  budgetTokens: z.number().min(50).optional(),
  includeEstimatedOutput: z.boolean().optional().default(true),
});

/**
 * A recommendation for optimizing content
 */
interface Recommendation {
  /** Action description */
  action: string;
  /** MCP tool to use */
  tool: string;
  /** Expected savings percentage */
  expectedSavings: number;
  /** Detailed description */
  description: string;
}

/**
 * Content analysis result
 */
interface ContentAnalysis {
  hasCode: boolean;
  hasLogs: boolean;
  hasErrors: boolean;
  hasDuplicates: boolean;
  isLongProse: boolean;
  tokenCount: number;
}

/**
 * Full output of the context budget analysis
 */
interface ContextBudgetOutput {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalEstimatedTokens: number;
  estimatedCostUSD: number;
  contextUsagePercent: number;
  withinBudget: boolean;
  budgetRemaining: number | null;
  recommendations: Recommendation[];
  autoOptimizeAvailable: boolean;
  potentialSavingsPercent: number;
}

/**
 * Analyze content for optimization opportunities
 */
function analyzeContent(content: string, tokenCount: number): ContentAnalysis {
  const lines = content.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  const uniqueLines = new Set(nonEmptyLines);
  const duplicateRatio =
    nonEmptyLines.length > 0
      ? 1 - uniqueLines.size / nonEmptyLines.length
      : 0;

  return {
    hasCode:
      /```|\bfunction\b|\bclass\b|\bconst\b|\blet\b|\bvar\b|\bimport\b|\bexport\b|def\s+\w+|func\s+\w+|fn\s+\w+/.test(
        content
      ),
    hasLogs:
      /\[(INFO|DEBUG|WARN|ERROR|FATAL|TRACE)\]|\b(INFO|DEBUG|WARN|ERROR|FATAL)\b:|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(
        content
      ),
    hasErrors:
      /\b(error|exception|failed|failure|stack\s*trace|traceback|panic)\b/i.test(
        content
      ) || /at\s+\w+\s*\(/.test(content),
    hasDuplicates: duplicateRatio > 0.2, // >20% duplicates
    isLongProse: tokenCount > 2000 && !/```/.test(content),
    tokenCount,
  };
}

/**
 * Generate optimization recommendations based on content analysis
 */
function generateRecommendations(analysis: ContentAnalysis): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Rule 1: Code content -> smart_file_read
  if (analysis.hasCode && analysis.tokenCount > 500) {
    recommendations.push({
      action: "Extract only relevant code sections",
      tool: "smart_file_read",
      expectedSavings: 60,
      description:
        "Use smart_file_read to extract specific functions/classes instead of full file content. Typical savings: 50-70%.",
    });
  }

  // Rule 2: Logs -> summarize_logs
  if (analysis.hasLogs) {
    recommendations.push({
      action: "Summarize log output",
      tool: "summarize_logs",
      expectedSavings: 85,
      description:
        "Use summarize_logs to extract key events, errors, and patterns. Typical savings: 80-90%.",
    });
  }

  // Rule 3: Errors + duplicates -> deduplicate_errors
  if (analysis.hasErrors && analysis.hasDuplicates) {
    recommendations.push({
      action: "Deduplicate repeated errors",
      tool: "deduplicate_errors",
      expectedSavings: 80,
      description:
        "Use deduplicate_errors to group identical error messages. Typical savings: 80-95%.",
    });
  } else if (analysis.hasErrors) {
    // Rule 4: Errors alone -> auto_optimize
    recommendations.push({
      action: "Compress error output",
      tool: "auto_optimize",
      expectedSavings: 70,
      description:
        "Use auto_optimize to intelligently compress error output. Typical savings: 60-90%.",
    });
  }

  // Rule 5: Long prose -> semantic_compress
  if (analysis.isLongProse) {
    recommendations.push({
      action: "Apply semantic compression",
      tool: "semantic_compress",
      expectedSavings: 50,
      description:
        "Use semantic_compress to preserve key information while reducing verbosity. Typical savings: 40-60%.",
    });
  }

  // Rule 6: Duplicates without errors -> compress_context
  if (analysis.hasDuplicates && !analysis.hasErrors) {
    recommendations.push({
      action: "Remove redundant content",
      tool: "compress_context",
      expectedSavings: 45,
      description:
        "Use compress_context to eliminate duplicate lines and normalize whitespace. Typical savings: 40-60%.",
    });
  }

  // Rule 7: Large generic content -> auto_optimize (fallback)
  if (analysis.tokenCount > 3000 && recommendations.length === 0) {
    recommendations.push({
      action: "Auto-optimize content",
      tool: "auto_optimize",
      expectedSavings: 50,
      description:
        "Use auto_optimize to automatically detect content type and apply best compression strategy.",
    });
  }

  return recommendations;
}

/**
 * Format the analysis result as markdown
 */
function formatOutput(result: ContextBudgetOutput, model: string): string {
  const modelInfo = ANTHROPIC_MODELS[model as AnthropicModel];
  const modelName = modelInfo?.name || model;

  const parts: string[] = [];

  parts.push("## Context Budget Analysis\n");

  // Token summary table
  parts.push("### Token Estimate\n");
  parts.push("| Metric | Value |");
  parts.push("|--------|-------|");
  parts.push(`| Input Tokens | ${result.inputTokens.toLocaleString()} |`);
  parts.push(
    `| Estimated Output | ${result.estimatedOutputTokens.toLocaleString()} |`
  );
  parts.push(
    `| **Total Estimated** | **${result.totalEstimatedTokens.toLocaleString()}** |`
  );
  parts.push(
    `| Estimated Cost | ${formatCost(result.estimatedCostUSD * 1_000_000)} |`
  );
  parts.push(`| Context Usage | ${result.contextUsagePercent}% |`);
  parts.push(`| Model | ${modelName} |\n`);

  // Budget status
  if (result.budgetRemaining !== null) {
    const withinBudget = result.withinBudget;
    const status = withinBudget ? "Within Budget" : "**OVER BUDGET**";
    const icon = withinBudget ? "" : "";
    const remaining = withinBudget
      ? `${result.budgetRemaining.toLocaleString()} tokens remaining`
      : `${Math.abs(result.budgetRemaining).toLocaleString()} tokens over limit`;

    parts.push(`### Budget Status: ${icon} ${status}`);
    parts.push(`${remaining}\n`);
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    parts.push("### Optimization Recommendations\n");

    for (const rec of result.recommendations) {
      parts.push(`**${rec.action}** (~${rec.expectedSavings}% savings)`);
      parts.push(`- Tool: \`${rec.tool}\``);
      parts.push(`- ${rec.description}\n`);
    }

    parts.push(
      `**Potential Savings:** Up to ${result.potentialSavingsPercent}% reduction possible\n`
    );
  } else {
    parts.push("### Status\n");
    parts.push(
      "Content is already well-optimized. No immediate recommendations.\n"
    );
  }

  // Quick action hint
  if (result.autoOptimizeAvailable) {
    parts.push("---");
    parts.push(
      "*Tip: Use `auto_optimize` to automatically apply the best compression strategy.*"
    );
  }

  return parts.join("\n");
}

/**
 * Execute the context-budget tool
 */
export async function executeContextBudget(
  args: unknown
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  // Validate input
  const parseResult = inputSchema.safeParse(args);
  if (!parseResult.success) {
    return {
      content: [
        {
          type: "text",
          text: `Invalid input: ${parseResult.error.errors.map((e) => e.message).join(", ")}`,
        },
      ],
      isError: true,
    };
  }

  const { content, model, budgetTokens, includeEstimatedOutput } =
    parseResult.data;

  // Count input tokens
  const inputTokens = countTokens(content);

  // Detect content type
  const contentType = detectContentType(content);

  // Analyze content for recommendations
  const analysis = analyzeContent(content, inputTokens);

  // Estimate output tokens
  const outputEstimate = includeEstimatedOutput
    ? estimateOutputTokens(content, inputTokens, contentType)
    : { estimated: 0, confidence: "high" as const, reasoning: "Disabled" };

  const estimatedOutputTokens = outputEstimate.estimated;
  const totalEstimatedTokens = inputTokens + estimatedOutputTokens;

  // Calculate cost
  const costs = calculateCost(model, inputTokens, estimatedOutputTokens);
  const estimatedCostUSD = costs.totalCostMicros / 1_000_000;

  // Calculate context usage
  const contextUsagePercent = calculateContextUsage(totalEstimatedTokens, model);

  // Budget check
  const withinBudget = budgetTokens
    ? totalEstimatedTokens <= budgetTokens
    : true;
  const budgetRemaining = budgetTokens
    ? budgetTokens - totalEstimatedTokens
    : null;

  // Generate recommendations
  const recommendations = generateRecommendations(analysis);

  // Calculate potential savings (max of all recommendations)
  const potentialSavingsPercent =
    recommendations.length > 0
      ? Math.min(95, Math.max(...recommendations.map((r) => r.expectedSavings)))
      : 0;

  // Determine if auto_optimize can help
  const autoOptimizeAvailable =
    inputTokens > 500 &&
    (analysis.hasLogs ||
      analysis.hasErrors ||
      analysis.hasDuplicates ||
      analysis.isLongProse);

  const result: ContextBudgetOutput = {
    inputTokens,
    estimatedOutputTokens,
    totalEstimatedTokens,
    estimatedCostUSD,
    contextUsagePercent,
    withinBudget,
    budgetRemaining,
    recommendations,
    autoOptimizeAvailable,
    potentialSavingsPercent,
  };

  const formatted = formatOutput(result, model);

  return {
    content: [{ type: "text", text: formatted }],
  };
}

/**
 * Tool definition for MCP registration
 */
export const contextBudgetTool: ToolDefinition = {
  name: "context_budget",
  description: `Proactive token budget management - analyze content BEFORE sending to LLM.

Use this tool to:
- **Estimate total tokens** (input + estimated output) before making a request
- **Calculate expected cost** based on the target model
- **Check budget constraints** - verify content fits within a token budget
- **Get optimization recommendations** - specific MCP tools to reduce tokens

Unlike analyze_context (post-hoc analysis), context_budget is designed for pre-flight checks and budget planning.

Example use cases:
- Before sending a large prompt, check estimated cost
- When budget-constrained, get tool recommendations to reduce tokens
- Validate that content will fit within context window`,
  inputSchema: contextBudgetSchema,
  execute: executeContextBudget,
};
