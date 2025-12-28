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
// Minimal schema - model has only one value, preservePatterns rarely used
export const semanticCompressSchema = {
  type: "object" as const,
  properties: {
    content: { type: "string" },
    targetRatio: { type: "number" },
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
 * Format the compression result - minimal header to save tokens
 */
function formatOutput(result: SemanticCompressOutput, _technique: string): string {
  const savingsPercent =
    result.originalTokens > 0
      ? Math.round((result.savings / result.originalTokens) * 100)
      : 0;
  const header = `[semantic] ${result.originalTokens}→${result.compressedTokens} tokens (-${savingsPercent}%)`;
  return `${header}\n${result.compressed}`;
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
  description: "TF-IDF compression. Keeps important segments by relevance scoring.",
  inputSchema: semanticCompressSchema,
  execute: executeSemanticCompress,
};
