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

// Minimal schema - errorPattern rarely used
export const deduplicateErrorsSchema = {
  type: "object" as const,
  properties: {
    content: { type: "string" },
    threshold: { type: "number" },
    keepFirst: { type: "number" },
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

  if (result.groups.size === 0) {
    return {
      content: [{ type: "text", text: "No errors detected." }],
    };
  }

  // Formatted groups
  const formattedGroups = formatGroups(result, "markdown", options);

  // Minimal header
  const header = `[dedup] ${stats.uniqueErrors} patterns, ${stats.totalDuplicates} duplicates removed (-${stats.reductionPercent}%)`;

  return {
    content: [{ type: "text", text: `${header}\n${formattedGroups}` }],
  };
}

export const deduplicateErrorsTool: ToolDefinition = {
  name: "deduplicate_errors",
  description:
    "Group repeated errors. Shows unique patterns with count and affected files.",
  inputSchema: deduplicateErrorsSchema,
  execute: executeDeduplicateErrors,
};
