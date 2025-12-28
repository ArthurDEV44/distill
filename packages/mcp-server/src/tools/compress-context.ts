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

// Minimal schema - preservePatterns rarely used
export const compressContextSchema = {
  type: "object" as const,
  properties: {
    content: { type: "string" },
    contentType: { enum: ["logs", "stacktrace", "config", "code", "generic"] },
    targetRatio: { type: "number" },
    detail: { enum: ["minimal", "normal", "detailed"] },
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
  _omittedInfo?: string
): string {
  // Minimal header to save tokens
  const header = `[${contentType}] ${stats.originalTokens}→${stats.compressedTokens} tokens (-${stats.reductionPercent}%)`;
  return `${header}\n${compressed}`;
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
  description: "Compress verbose text (logs, stack traces, configs). 40-90% reduction.",
  inputSchema: compressContextSchema,
  execute: executeCompressContext,
};
