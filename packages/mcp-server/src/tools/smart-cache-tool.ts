/**
 * Smart Cache MCP Tool
 *
 * Exposes cache operations for user interaction:
 * - get: Retrieve cached content
 * - set: Store content in cache
 * - invalidate: Remove specific entries
 * - stats: View cache statistics
 * - clear: Clear all cache entries
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import { getGlobalCache, type CacheStats } from "../cache/index.js";

// Minimal schema - ttl/tokenCount rarely used
export const smartCacheSchema = {
  type: "object" as const,
  properties: {
    action: { enum: ["get", "set", "invalidate", "invalidate_path", "stats", "clear", "keys"] },
    key: { type: "string" },
    value: { type: "string" },
    filePath: { type: "string" },
  },
  required: ["action"],
};

const inputSchema = z.object({
  action: z.enum([
    "get",
    "set",
    "invalidate",
    "invalidate_path",
    "stats",
    "clear",
    "keys",
  ]),
  key: z.string().optional(),
  value: z.string().optional(),
  filePath: z.string().optional(),
  ttl: z.number().optional(),
  tokenCount: z.number().optional(),
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatStats(stats: CacheStats): string {
  const parts: string[] = [];
  parts.push("## Cache Statistics\n");
  parts.push("| Metric | Value |");
  parts.push("|--------|-------|");
  parts.push(`| Entries | ${stats.entries} |`);
  parts.push(`| Hits | ${stats.hits} |`);
  parts.push(`| Misses | ${stats.misses} |`);
  parts.push(`| Hit Rate | ${stats.hitRate}% |`);
  parts.push(`| Tokens Saved | ${stats.tokensSaved.toLocaleString()} |`);
  parts.push(`| Memory Usage | ${formatBytes(stats.memorySizeBytes)} |`);
  parts.push(`| Evictions | ${stats.evictions} |`);
  parts.push(`| Invalidations | ${stats.invalidations} |`);
  return parts.join("\n");
}

export async function executeSmartCache(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const input = inputSchema.parse(args);
  const cache = getGlobalCache();

  switch (input.action) {
    case "get": {
      if (!input.key) {
        return {
          content: [
            { type: "text", text: "Error: 'key' is required for get action" },
          ],
          isError: true,
        };
      }
      const result = await cache.get<unknown>(input.key);
      if (result.hit) {
        return {
          content: [
            {
              type: "text",
              text: `## Cache Hit\n\n**Key:** \`${input.key}\`\n\n**Value:**\n\`\`\`json\n${JSON.stringify(result.value, null, 2)}\n\`\`\``,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `## Cache Miss\n\n**Key:** \`${input.key}\`\n**Reason:** ${result.missReason || "not_found"}`,
            },
          ],
        };
      }
    }

    case "set": {
      if (!input.key) {
        return {
          content: [
            { type: "text", text: "Error: 'key' is required for set action" },
          ],
          isError: true,
        };
      }
      if (!input.value) {
        return {
          content: [
            { type: "text", text: "Error: 'value' is required for set action" },
          ],
          isError: true,
        };
      }
      let value: unknown;
      try {
        value = JSON.parse(input.value);
      } catch {
        value = input.value; // Store as string if not valid JSON
      }
      await cache.set(input.key, value, {
        ttl: input.ttl,
        filePath: input.filePath,
        tokenCount: input.tokenCount,
      });
      return {
        content: [
          {
            type: "text",
            text: `## Cached Successfully\n\n**Key:** \`${input.key}\`\n**TTL:** ${input.ttl ? `${input.ttl}ms` : "default (30min)"}\n**File Path:** ${input.filePath || "none"}`,
          },
        ],
      };
    }

    case "invalidate": {
      if (!input.key) {
        return {
          content: [
            {
              type: "text",
              text: "Error: 'key' is required for invalidate action",
            },
          ],
          isError: true,
        };
      }
      const removed = cache.invalidate(input.key);
      return {
        content: [
          {
            type: "text",
            text: removed
              ? `## Invalidated\n\n**Key:** \`${input.key}\``
              : `## Not Found\n\n**Key:** \`${input.key}\` was not in cache`,
          },
        ],
      };
    }

    case "invalidate_path": {
      if (!input.filePath) {
        return {
          content: [
            {
              type: "text",
              text: "Error: 'filePath' is required for invalidate_path action",
            },
          ],
          isError: true,
        };
      }
      const count = cache.invalidateByPath(input.filePath);
      return {
        content: [
          {
            type: "text",
            text: `## Invalidated by Path\n\n**Path:** \`${input.filePath}\`\n**Entries Removed:** ${count}`,
          },
        ],
      };
    }

    case "stats": {
      const stats = cache.getStats();
      return {
        content: [{ type: "text", text: formatStats(stats) }],
      };
    }

    case "clear": {
      cache.clear();
      return {
        content: [
          {
            type: "text",
            text: "## Cache Cleared\n\nAll entries have been removed.",
          },
        ],
      };
    }

    case "keys": {
      const keys = cache.getKeys();
      const keyList =
        keys.length > 0
          ? keys.map((k) => `- \`${k}\``).join("\n")
          : "_No entries in cache_";
      return {
        content: [
          {
            type: "text",
            text: `## Cached Keys (${keys.length})\n\n${keyList}`,
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown action: ${input.action}` }],
        isError: true,
      };
  }
}

export const smartCacheTool: ToolDefinition = {
  name: "smart_cache",
  description: "Manage cache. Actions: get, set, invalidate, stats, clear, keys.",
  inputSchema: smartCacheSchema,
  execute: executeSmartCache,
};
