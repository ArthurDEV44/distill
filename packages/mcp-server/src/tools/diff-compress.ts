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
export const diffCompressSchema = {
  type: "object" as const,
  properties: {
    diff: {
      type: "string",
      description: "Git diff output",
    },
    strategy: {
      type: "string",
      description: "hunks-only, summary, or semantic",
      enum: ["hunks-only", "summary", "semantic"],
    },
    maxTokens: {
      type: "number",
      description: "Max output tokens (for semantic)",
    },
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
 * Format the compression result as markdown for display
 */
function formatOutput(output: DiffCompressOutput, strategy: string): string {
  const parts: string[] = [];

  parts.push(`## Compressed Diff (${strategy})\n`);

  // Use appropriate code fence for the compressed content
  if (strategy === "summary") {
    parts.push(output.compressed);
  } else {
    parts.push("```diff");
    parts.push(output.compressed);
    parts.push("```");
  }
  parts.push("");

  parts.push("---");
  parts.push("### Statistics\n");
  parts.push(`- **Files changed:** ${output.filesChanged.length}`);
  parts.push(`- **Additions:** +${output.additions}`);
  parts.push(`- **Deletions:** -${output.deletions}`);
  parts.push(`- **Original tokens:** ${output.originalTokens.toLocaleString()}`);
  parts.push(
    `- **Compressed tokens:** ${output.compressedTokens.toLocaleString()}`
  );

  const savings = output.originalTokens - output.compressedTokens;
  const savingsPercent =
    output.originalTokens > 0
      ? Math.round((savings / output.originalTokens) * 100)
      : 0;
  parts.push(
    `- **Tokens saved:** ${savings.toLocaleString()} (${savingsPercent}%)`
  );

  if (output.filesChanged.length <= 10) {
    parts.push("\n### Files Changed\n");
    for (const file of output.filesChanged) {
      parts.push(`- \`${file}\``);
    }
  } else {
    parts.push(
      `\n### Files Changed (showing 10 of ${output.filesChanged.length})\n`
    );
    for (const file of output.filesChanged.slice(0, 10)) {
      parts.push(`- \`${file}\``);
    }
    parts.push(`- ... and ${output.filesChanged.length - 10} more`);
  }

  return parts.join("\n");
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
