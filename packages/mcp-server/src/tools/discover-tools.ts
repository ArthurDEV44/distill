/**
 * Discover Tools - Meta-tool for dynamic tool discovery
 *
 * Allows LLMs to discover and load available tools on-demand,
 * reducing initial token consumption by ~80%.
 */

import type { ToolDefinition } from "./registry.js";
import { getDynamicLoader, type ToolCategory } from "./dynamic-loader.js";

// Minimal schema - descriptions in tool description, not properties
const discoverToolsSchema = {
  type: "object" as const,
  properties: {
    query: { type: "string" },
    category: { enum: ["compress", "analyze", "logs", "code", "pipeline"] },
    load: { type: "boolean" },
  },
};

interface DiscoverToolsArgs {
  query?: string;
  category?: ToolCategory;
  load?: boolean;
}

async function executeDiscoverTools(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { query, category, load = false } = args as DiscoverToolsArgs;
  const loader = getDynamicLoader();

  // Get matching tools
  let matches: Array<{ name: string; category: ToolCategory; description: string }>;

  if (query) {
    matches = loader.searchTools(query).map((t) => ({
      name: t.name,
      category: t.category,
      description: t.description,
    }));
  } else if (category) {
    matches = loader.getToolsByCategory(category).map((t) => ({
      name: t.name,
      category: t.category,
      description: t.description,
    }));
  } else {
    // List all available tools
    matches = loader.getAvailableTools();
  }

  // Load tools if requested
  let loadedCount = 0;
  if (load && matches.length > 0) {
    const names = matches.map((m) => m.name);
    const loaded = await loader.loadByNames(names);
    loadedCount = loaded.length;
  }

  // Format output
  const lines: string[] = [];

  if (matches.length === 0) {
    lines.push("No tools found matching your criteria.");
    lines.push("");
    lines.push("Available categories: compress, analyze, logs, code, pipeline");
  } else {
    // Group by category for better readability
    const byCategory = new Map<string, typeof matches>();
    for (const tool of matches) {
      const cat = tool.category;
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(tool);
    }

    lines.push(`Found ${matches.length} tools:`);
    lines.push("");

    for (const [cat, tools] of byCategory) {
      lines.push(`[${cat}]`);
      for (const t of tools) {
        const status = loader.isLoaded(t.name) ? "*" : " ";
        lines.push(`${status} ${t.name}: ${t.description}`);
      }
      lines.push("");
    }

    if (load) {
      lines.push(`Loaded ${loadedCount} new tools. They are now available for use.`);
    } else {
      lines.push("Use load:true to activate these tools.");
    }
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

export const discoverToolsTool: ToolDefinition = {
  name: "discover_tools",
  description: "Find and load optimization tools. Categories: compress, analyze, logs, code, pipeline.",
  inputSchema: discoverToolsSchema,
  execute: executeDiscoverTools,
};
