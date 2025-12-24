/**
 * Analyze Build Output Tool
 *
 * Analyzes and compresses build tool outputs (tsc, webpack, eslint, etc.)
 * to dramatically reduce tokens while preserving critical information.
 */

import { z } from "zod";
import { analyzeBuildOutput, type BuildTool } from "../parsers/index.js";
import type { ToolDefinition } from "./registry.js";

export const analyzeBuildOutputSchema = {
  type: "object" as const,
  properties: {
    output: {
      type: "string",
      description: "The raw build output to analyze (from npm, tsc, webpack, etc.)",
    },
    buildTool: {
      type: "string",
      description: "Build tool type (auto-detected if not provided)",
      enum: ["tsc", "eslint", "webpack", "vite", "esbuild", "rust", "go", "generic"],
    },
    verbosity: {
      type: "string",
      description: "Level of detail in the summary (default: normal)",
      enum: ["minimal", "normal", "detailed"],
    },
  },
  required: ["output"],
};

const inputSchema = z.object({
  output: z.string(),
  buildTool: z
    .enum(["tsc", "eslint", "webpack", "vite", "esbuild", "rust", "go", "generic"])
    .optional(),
  verbosity: z.enum(["minimal", "normal", "detailed"]).optional().default("normal"),
});

export async function executeAnalyzeBuildOutput(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { output, buildTool, verbosity } = inputSchema.parse(args);

  // Analyze the build output
  const result = analyzeBuildOutput(output, {
    buildTool: buildTool as BuildTool | undefined,
    verbosity,
  });

  // Format the result
  const parts: string[] = [];

  // Summary
  parts.push(result.summary);
  parts.push("");

  // Statistics
  parts.push("---");
  parts.push("### Statistics");
  parts.push(`- **Original tokens:** ${result.stats.tokensOriginal.toLocaleString()}`);
  parts.push(`- **Compressed tokens:** ${result.stats.tokensCompressed.toLocaleString()}`);
  parts.push(`- **Reduction:** ${result.stats.reductionPercent}%`);

  return {
    content: [{ type: "text", text: parts.join("\n") }],
  };
}

export const analyzeBuildOutputTool: ToolDefinition = {
  name: "analyze_build_output",
  description: `Analyze and compress build output (npm, tsc, webpack, eslint, etc.) to reduce tokens by 90%+.
Use this tool when you have verbose build errors to get a concise summary with grouped errors and fix suggestions.`,
  inputSchema: analyzeBuildOutputSchema,
  execute: executeAnalyzeBuildOutput,
};
