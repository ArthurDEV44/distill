/**
 * Diff Compress Tool
 *
 * Compress git diff output to reduce tokens while preserving essential changes.
 * Supports three strategies: hunks-only, summary, and semantic.
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import { compressDiff } from "../compressors/diff.js";

/**
 * JSON Schema for MCP tool registration
 */
// Minimal schema
export const diffCompressSchema = {
  type: "object" as const,
  properties: {
    diff: { type: "string" },
    strategy: { enum: ["hunks-only", "summary", "semantic"] },
    maxTokens: { type: "number" },
  },
  required: ["diff", "strategy"],
};

/**
 * Zod schema for runtime input validation
 */
const inputSchema = z.object({
  diff: z.string().min(1, "Diff content is required"),
  strategy: z.enum(["hunks-only", "summary", "semantic"]),
  maxTokens: z.number().positive().optional(),
});

/**
 * Output interface matching specification
 */
interface DiffCompressOutput {
  compressed: string;
  filesChanged: string[];
  summary: string;
  additions: number;
  deletions: number;
  originalTokens: number;
  compressedTokens: number;
}

/**
 * Format the compression result - minimal header to save tokens
 */
function formatOutput(output: DiffCompressOutput, _strategy: string): string {
  const savingsPercent =
    output.originalTokens > 0
      ? Math.round(((output.originalTokens - output.compressedTokens) / output.originalTokens) * 100)
      : 0;
  const header = `[diff] ${output.filesChanged.length} files, +${output.additions}/-${output.deletions}, ${output.originalTokens}→${output.compressedTokens} tokens (-${savingsPercent}%)`;
  return `${header}\n${output.compressed}`;
}

/**
 * Execute diff compression
 */
export async function executeDiffCompress(
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

  const input = parseResult.data;

  // Compress diff
  const result = compressDiff(input.diff, {
    strategy: input.strategy,
    maxTokens: input.maxTokens,
  });

  // Build output
  const output: DiffCompressOutput = {
    compressed: result.compressed,
    filesChanged: result.filesChanged,
    summary: result.summary,
    additions: result.additions,
    deletions: result.deletions,
    originalTokens: result.stats.originalTokens,
    compressedTokens: result.stats.compressedTokens,
  };

  // Update session state with tokens saved
  const tokensSaved = output.originalTokens - output.compressedTokens;
  if (tokensSaved > 0) {
  }

  return {
    content: [
      {
        type: "text",
        text: formatOutput(output, input.strategy),
      },
    ],
  };
}

/**
 * Tool definition for MCP registration
 */
export const diffCompressTool: ToolDefinition = {
  name: "diff_compress",
  description:
    "Compress git diff. Strategies: hunks-only, summary, semantic.",
  inputSchema: diffCompressSchema,
  execute: executeDiffCompress,
};
