/**
 * Semantic Compress Tool
 *
 * Intelligently compress content by extracting the most important segments
 * using TF-IDF scoring, position weighting, and keyword detection.
 *
 * Phase 2: Rule-based implementation (no ML models)
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import {
  semanticCompressor,
  type SemanticCompressedResult,
} from "../compressors/semantic.js";

/**
 * JSON Schema for MCP tool registration
 */
export const semanticCompressSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "Content to compress",
    },
    targetRatio: {
      type: "number",
      description: "Keep ratio, e.g. 0.5 = 50% (default: 0.5)",
      minimum: 0.1,
      maximum: 0.9,
    },
    preservePatterns: {
      type: "array",
      items: { type: "string" },
      description: "Regex patterns to preserve",
    },
    model: {
      type: "string",
      description: "Model: fast (default)",
      enum: ["fast"],
    },
  },
  required: ["content"],
};

/**
 * Zod schema for runtime input validation
 */
const inputSchema = z.object({
  content: z.string().min(1, "Content is required"),
  targetRatio: z.number().min(0.1).max(0.9).optional().default(0.5),
  preservePatterns: z.array(z.string()).optional(),
  model: z.enum(["fast"]).optional().default("fast"),
});

/**
 * Output interface matching audit specification
 */
interface SemanticCompressOutput {
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  savings: number;
  preservedSegments: string[];
}

/**
 * Format the compression result as markdown for display
 */
function formatOutput(result: SemanticCompressOutput, technique: string): string {
  const parts: string[] = [];

  parts.push("## Semantically Compressed Content\n");
  parts.push("```");
  parts.push(result.compressed);
  parts.push("```\n");

  parts.push("---");
  parts.push("### Compression Statistics\n");
  parts.push(
    `- **Original tokens:** ${result.originalTokens.toLocaleString()}`
  );
  parts.push(
    `- **Compressed tokens:** ${result.compressedTokens.toLocaleString()}`
  );

  const savingsPercent =
    result.originalTokens > 0
      ? Math.round((result.savings / result.originalTokens) * 100)
      : 0;
  parts.push(
    `- **Tokens saved:** ${result.savings.toLocaleString()} (${savingsPercent}%)`
  );
  parts.push(`- **Technique:** ${technique}`);

  if (result.preservedSegments.length > 0) {
    parts.push("\n### Preserved Segments\n");
    const displaySegments = result.preservedSegments.slice(0, 5);
    for (const segment of displaySegments) {
      parts.push(`- \`${segment}\``);
    }
    if (result.preservedSegments.length > 5) {
      parts.push(`- ... and ${result.preservedSegments.length - 5} more`);
    }
  }

  return parts.join("\n");
}

/**
 * Execute semantic compression
 */
export async function executeSemanticCompress(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
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

  const input = parseResult.data;

  // Convert preserve patterns to RegExp
  let preservePatterns: RegExp[] | undefined;
  if (input.preservePatterns) {
    try {
      preservePatterns = input.preservePatterns.map((p) => new RegExp(p, "i"));
    } catch (e) {
      const error = e as Error;
      return {
        content: [
          {
            type: "text",
            text: `Invalid regex pattern: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Run semantic compression
  const result = semanticCompressor.compress(input.content, {
    targetRatio: input.targetRatio,
    preservePatterns,
    detail: "normal",
  }) as SemanticCompressedResult;

  // Build output
  const output: SemanticCompressOutput = {
    compressed: result.compressed,
    originalTokens: result.stats.originalTokens,
    compressedTokens: result.stats.compressedTokens,
    savings: result.stats.originalTokens - result.stats.compressedTokens,
    preservedSegments: result.preservedSegments ?? [],
  };

  // Update session state with tokens saved
  if (output.savings > 0) {
  }

  return {
    content: [
      {
        type: "text",
        text: formatOutput(output, result.stats.technique),
      },
    ],
  };
}

/**
 * Tool definition for MCP registration
 */
export const semanticCompressTool: ToolDefinition = {
  name: "semantic_compress",
  description:
    "TF-IDF based compression. Keeps important segments using position weighting and keyword detection.",
  inputSchema: semanticCompressSchema,
  execute: executeSemanticCompress,
};
