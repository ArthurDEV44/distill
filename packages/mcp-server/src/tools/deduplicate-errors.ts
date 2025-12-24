/**
 * Deduplicate Errors Tool
 *
 * Detects and deduplicates repetitive errors in build/test outputs,
 * keeping only unique occurrences with counters.
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import {
  groupBySignature,
  formatGroups,
  calculateStats,
  type GroupOptions,
} from "../utils/signature-grouper.js";

export const deduplicateErrorsSchema = {
  type: "object" as const,
  properties: {
    content: {
      type: "string",
      description: "Content with potentially duplicated errors (build output, test results, logs)",
    },
    threshold: {
      type: "number",
      description: "Minimum occurrences to consider as duplicate (default: 2)",
    },
    keepFirst: {
      type: "number",
      description: "Number of first unique occurrences to keep in full (default: 1)",
    },
    errorPattern: {
      type: "string",
      description: "Custom regex pattern to identify error lines (optional)",
    },
  },
  required: ["content"],
};

const inputSchema = z.object({
  content: z.string(),
  threshold: z.number().min(1).optional().default(2),
  keepFirst: z.number().min(0).optional().default(1),
  errorPattern: z.string().optional(),
});

export async function executeDeduplicateErrors(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { content, threshold, keepFirst, errorPattern } = inputSchema.parse(args);

  // Parse custom pattern if provided
  let customPattern: RegExp | undefined;
  if (errorPattern) {
    try {
      customPattern = new RegExp(errorPattern, "gm");
    } catch {
      return {
        content: [
          {
            type: "text",
            text: `**Error:** Invalid regex pattern: ${errorPattern}`,
          },
        ],
      };
    }
  }

  // Split content into lines
  const lines = content.split("\n");

  // Group by signature
  const options: Partial<GroupOptions> = {
    threshold,
    keepFirst,
    customPattern,
  };

  const result = groupBySignature(lines, options);
  const stats = calculateStats(result);

  // Format output
  const parts: string[] = [];

  // Header
  parts.push("## Error Deduplication Results\n");

  if (result.groups.size === 0) {
    parts.push("No errors detected in the content.\n");
    return {
      content: [{ type: "text", text: parts.join("\n") }],
    };
  }

  // Summary
  const duplicatedGroups = Array.from(result.groups.values()).filter((g) => g.count >= threshold);
  parts.push(
    `**${stats.uniqueErrors} unique pattern${stats.uniqueErrors !== 1 ? "s" : ""}** found from ${stats.originalLines} total lines`
  );
  if (duplicatedGroups.length > 0) {
    parts.push(
      `**${duplicatedGroups.length} pattern${duplicatedGroups.length !== 1 ? "s" : ""}** have duplicates (${stats.totalDuplicates} total duplicates removed)`
    );
  }
  parts.push("");

  // Formatted groups
  const formattedGroups = formatGroups(result, options);
  if (formattedGroups.trim()) {
    parts.push(formattedGroups);
  }

  // Statistics section
  parts.push("---");
  parts.push("## Statistics\n");
  parts.push("| Metric | Value |");
  parts.push("|--------|-------|");
  parts.push(`| Original lines | ${stats.originalLines} |`);
  parts.push(`| Deduplicated to | ${stats.deduplicatedLines} |`);
  parts.push(`| Unique patterns | ${stats.uniqueErrors} |`);
  parts.push(`| Duplicates removed | ${stats.totalDuplicates} |`);
  parts.push(`| **Reduction** | **${stats.reductionPercent}%** |`);

  // Estimate token savings (rough estimate: ~4 chars per token)
  const originalTokens = Math.ceil(content.length / 4);
  const outputText = parts.join("\n");
  const compressedTokens = Math.ceil(outputText.length / 4);
  const tokensSaved = Math.max(0, originalTokens - compressedTokens);

  if (tokensSaved > 0) {
    parts.push("");
    parts.push(`*Estimated tokens saved: ~${tokensSaved.toLocaleString()}*`);

    // Update session state
  }

  return {
    content: [{ type: "text", text: parts.join("\n") }],
  };
}

export const deduplicateErrorsTool: ToolDefinition = {
  name: "deduplicate_errors",
  description:
    "Group repeated errors. Shows unique patterns with count and affected files.",
  inputSchema: deduplicateErrorsSchema,
  execute: executeDeduplicateErrors,
};
