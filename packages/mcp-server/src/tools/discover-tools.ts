/**
 * Discover Tools - Meta-tool for dynamic tool discovery
 *
 * Allows LLMs to discover and load available tools on-demand,
 * reducing initial token consumption by ~80%.
 *
 * Supports TOON output format for additional ~40% token savings.
 */

import type { ToolDefinition } from "./registry.js";
import { getDynamicLoader, TOOL_CATALOG, type ToolCategory } from "./dynamic-loader.js";
import {
  serializeToolsToToon,
  serializeToolsToToonTabular,
  serializeMetadataToToon,
  serializeMetadataToToonTabular,
  compareTokens,
  type ToolMetadataLite,
} from "../utils/toon-serializer.js";

// Minimal schema - descriptions in tool description, not properties
const discoverToolsSchema = {
  type: "object" as const,
  properties: {
    query: { type: "string" },
    category: { enum: ["compress", "analyze", "logs", "code", "pipeline"] },
    load: { type: "boolean" },
    format: { enum: ["list", "toon", "toon-tabular"] },
  },
};

type OutputFormat = "list" | "toon" | "toon-tabular";

interface DiscoverToolsArgs {
  query?: string;
  category?: ToolCategory;
  load?: boolean;
  format?: OutputFormat;
}

async function executeDiscoverTools(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { query, category, load = false, format = "list" } = args as DiscoverToolsArgs;
  const loader = getDynamicLoader();

  // Get matching tools metadata
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

  // Handle TOON format output
  if (format === "toon" || format === "toon-tabular") {
    return formatToonOutput(matches, format, load, loadedCount);
  }

  // Default list format
  return formatListOutput(matches, loader, load, loadedCount);
}

/**
 * Format output as TOON (Token-Oriented Object Notation)
 *
 * When load=false, uses lightweight metadata-only TOON (no schema loading).
 * When load=true, loads full definitions and includes parameter info.
 */
async function formatToonOutput(
  matches: Array<{ name: string; category: ToolCategory; description: string }>,
  format: "toon" | "toon-tabular",
  load: boolean,
  loadedCount: number
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  if (matches.length === 0) {
    return {
      content: [{ type: "text", text: "No tools found.\nCategories: compress|analyze|logs|code|pipeline" }],
    };
  }

  const loader = getDynamicLoader();
  let toonOutput: string;
  let savingsNote: string;

  if (load) {
    // Load full tool definitions to get schemas for detailed TOON output
    const toolDefs = await loader.loadByNames(matches.map((m) => m.name));

    // Build category map
    const categories = new Map<string, string>();
    for (const m of matches) {
      categories.set(m.name, m.category);
    }

    // Serialize to full TOON with parameters
    if (format === "toon-tabular") {
      toonOutput = serializeToolsToToonTabular(toolDefs);
    } else {
      toonOutput = serializeToolsToToon(toolDefs, {
        groupByCategory: true,
        categories,
      });
    }

    const stats = compareTokens(toolDefs);
    savingsNote = `[tokens] json:${stats.json} → toon:${format === "toon-tabular" ? stats.toonTabular : stats.toon} (-${stats.savings}%)`;
  } else {
    // Use lightweight metadata-only TOON (no loading required)
    const metadata: ToolMetadataLite[] = matches.map((m) => ({
      name: m.name,
      category: m.category,
      description: m.description,
    }));

    if (format === "toon-tabular") {
      toonOutput = serializeMetadataToToonTabular(metadata);
    } else {
      toonOutput = serializeMetadataToToon(metadata, { groupByCategory: true });
    }

    savingsNote = "[lazy] metadata only (use load:true for full schemas)";
  }

  const lines = [toonOutput, "", savingsNote];

  if (load) {
    lines.push(`[loaded] ${loadedCount} tools activated`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

/**
 * Format output as standard list
 */
function formatListOutput(
  matches: Array<{ name: string; category: ToolCategory; description: string }>,
  loader: ReturnType<typeof getDynamicLoader>,
  load: boolean,
  loadedCount: number
): { content: Array<{ type: "text"; text: string }> } {
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
