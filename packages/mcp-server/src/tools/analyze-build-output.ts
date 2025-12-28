/**
 * Analyze Build Output Tool
 *
 * Analyzes and compresses build tool outputs (tsc, webpack, eslint, etc.)
 * to dramatically reduce tokens while preserving critical information.
 */

import { z } from "zod";
import { analyzeBuildOutput, type BuildTool } from "../parsers/index.js";
import type { ToolDefinition } from "./registry.js";

// Minimal schema
export const analyzeBuildOutputSchema = {
  type: "object" as const,
  properties: {
    output: { type: "string" },
    buildTool: { enum: ["tsc", "eslint", "webpack", "vite", "esbuild", "rust", "go", "generic"] },
    verbosity: { enum: ["minimal", "normal", "detailed"] },
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

  // Format with minimal header
  const header = `[build] ${result.stats.tokensOriginal}→${result.stats.tokensCompressed} tokens (-${result.stats.reductionPercent}%)`;
  const formatted = `${header}\n${result.summary}`;

  return {
    content: [{ type: "text", text: formatted }],
  };
}

export const analyzeBuildOutputTool: ToolDefinition = {
  name: "analyze_build_output",
  description: "Parse and group build errors (tsc, eslint, webpack). 90%+ token reduction.",
  inputSchema: analyzeBuildOutputSchema,
  execute: executeAnalyzeBuildOutput,
};
