/**
 * Compress Context Tool
 *
 * Compresses verbose text content (logs, stack traces, configs)
 * while preserving essential information.
 */

import { z } from "zod";

import { compressContent, analyzeContent, type ContentType, type DetailLevel } from "../compressors/index.js";
import { getContentTypeDescription } from "../utils/content-detector.js";
import type { ToolDefinition } from "./registry.js";

export const compressContextSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "The text content to compress (logs, stack trace, config, etc.)",
    },
    contentType: {
      type: "string",
      description: "Type of content (auto-detected if not provided)",
      enum: ["logs", "stacktrace", "config", "code", "generic"],
    },
    targetRatio: {
      type: "number",
      description: "Target compression ratio (0.1 = keep 10% of original). Optional hint.",
    },
    preservePatterns: {
      type: "array",
      items: { type: "string" },
      description: "Regex patterns to preserve (lines matching these won't be compressed)",
    },
    detail: {
      type: "string",
      description: "Level of detail in output (default: normal)",
      enum: ["minimal", "normal", "detailed"],
    },
  },
  required: ["content"],
};

const inputSchema = z.object({
  content: z.string(),
  contentType: z.enum(["logs", "stacktrace", "config", "code", "generic"]).optional(),
  targetRatio: z.number().min(0.01).max(1).optional(),
  preservePatterns: z.array(z.string()).optional(),
  detail: z.enum(["minimal", "normal", "detailed"]).optional().default("normal"),
});

/**
 * Format compression result as markdown
 */
function formatResult(
  compressed: string,
  stats: {
    originalLines: number;
    compressedLines: number;
    originalTokens: number;
    compressedTokens: number;
    reductionPercent: number;
    technique: string;
  },
  contentType: ContentType,
  omittedInfo?: string
): string {
  const parts: string[] = [];

  // Compressed content
  parts.push("## Compressed Content");
  parts.push("");
  parts.push("```");
  parts.push(compressed);
  parts.push("```");
  parts.push("");

  // Statistics
  parts.push("---");
  parts.push("### Compression Statistics");
  parts.push(`- **Content type:** ${getContentTypeDescription(contentType)}`);
  parts.push(`- **Technique:** ${stats.technique}`);
  parts.push(`- **Original:** ${stats.originalLines} lines, ${stats.originalTokens.toLocaleString()} tokens`);
  parts.push(`- **Compressed:** ${stats.compressedLines} lines, ${stats.compressedTokens.toLocaleString()} tokens`);
  parts.push(`- **Reduction:** ${stats.reductionPercent}%`);

  if (omittedInfo) {
    parts.push(`- **Note:** ${omittedInfo}`);
  }

  return parts.join("\n");
}

export async function executeCompressContext(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = inputSchema.parse(args);

  // Convert preserve patterns to RegExp
  const preservePatterns = input.preservePatterns?.map((p) => new RegExp(p));

  // Analyze content if type not provided
  const analysis = analyzeContent(input.content);
  const contentType = (input.contentType ?? analysis.detectedType) as ContentType;

  // Compress
  const result = compressContent(input.content, {
    contentType,
    detail: input.detail as DetailLevel,
    targetRatio: input.targetRatio,
    preservePatterns,
  });

  // Update session state with token savings
  const tokensSaved = result.stats.originalTokens - result.stats.compressedTokens;
  if (tokensSaved > 0) {
  }

  // Format output
  const formatted = formatResult(
    result.compressed,
    result.stats,
    contentType,
    result.omittedInfo
  );

  return {
    content: [{ type: "text", text: formatted }],
  };
}

export const compressContextTool: ToolDefinition = {
  name: "compress_context",
  description: `Compress verbose text content (logs, stack traces, configs) to reduce tokens by 40-90%.
Use this tool when you have large outputs that would consume too many tokens.
Auto-detects content type and applies the best compression strategy.`,
  inputSchema: compressContextSchema,
  execute: executeCompressContext,
};
