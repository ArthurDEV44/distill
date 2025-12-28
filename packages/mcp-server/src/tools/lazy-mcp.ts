/**
 * Lazy MCP - Pattern for 95% token reduction
 *
 * Implements the lazy-mcp pattern where only 2 meta-tools are exposed:
 * - browse_tools: Navigate the tool hierarchy
 * - run_tool: Execute any tool by name
 *
 * This reduces initial context from ~15,000 tokens to ~800 tokens.
 *
 * @see https://github.com/voicetreelab/lazy-mcp
 */

import type { ToolDefinition, ToolExecuteResult } from "./registry.js";
import { getDynamicLoader, TOOL_CATALOG, type ToolCategory } from "./dynamic-loader.js";

// ============================================================================
// browse_tools - Navigate the tool hierarchy
// ============================================================================

const browseToolsSchema = {
  type: "object" as const,
  properties: {
    category: {
      type: "string",
      enum: ["compress", "analyze", "logs", "code", "pipeline"],
    },
  },
};

interface BrowseToolsArgs {
  category?: ToolCategory;
}

async function executeBrowseTools(args: unknown): Promise<ToolExecuteResult> {
  const { category } = args as BrowseToolsArgs;
  const loader = getDynamicLoader();

  if (!category) {
    // Return category overview with tool counts
    const categories = new Map<ToolCategory, number>();
    for (const tool of TOOL_CATALOG) {
      if (tool.category !== "core") {
        categories.set(tool.category, (categories.get(tool.category) || 0) + 1);
      }
    }

    const lines = ["ctxopt/", ""];
    for (const [cat, count] of categories) {
      lines.push(`  ${cat}/ (${count} tools)`);
    }
    lines.push("");
    lines.push("Use category to list tools. Use run_tool to execute.");

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }

  // Return tools in category
  const tools = loader.getToolsByCategory(category);

  if (tools.length === 0) {
    return {
      content: [{ type: "text", text: `No tools in category: ${category}` }],
    };
  }

  const lines = [`ctxopt/${category}/`, ""];
  for (const tool of tools) {
    lines.push(`  ${tool.name}: ${tool.description}`);
  }
  lines.push("");
  const firstTool = tools[0];
  if (firstTool) {
    lines.push(`run_tool name="${firstTool.name}" args={...}`);
  }

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

export const browseToolsTool: ToolDefinition = {
  name: "browse_tools",
  description: "List tool categories or tools in a category. Omit category for overview.",
  inputSchema: browseToolsSchema,
  execute: executeBrowseTools,
};

// ============================================================================
// run_tool - Execute any tool by name
// ============================================================================

const runToolSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    args: { type: "object" },
  },
  required: ["name"],
};

interface RunToolArgs {
  name: string;
  args?: Record<string, unknown>;
}

// Registry reference for tool execution (set by server)
let registryRef: {
  execute: (name: string, args: unknown) => Promise<ToolExecuteResult>;
} | null = null;

/**
 * Set the registry reference for tool execution
 * Called by the server during initialization
 */
export function setLazyMcpRegistry(registry: {
  execute: (name: string, args: unknown) => Promise<ToolExecuteResult>;
}): void {
  registryRef = registry;
}

async function executeRunTool(args: unknown): Promise<ToolExecuteResult> {
  const { name, args: toolArgs = {} } = args as RunToolArgs;

  // Check if tool exists in catalog
  const toolMeta = TOOL_CATALOG.find((t) => t.name === name);
  if (!toolMeta) {
    const available = TOOL_CATALOG.map((t) => t.name).join(", ");
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}\n\nAvailable: ${available}`,
        },
      ],
      isError: true,
    };
  }

  // Load tool if not already loaded
  const loader = getDynamicLoader();
  if (!loader.isLoaded(name)) {
    await loader.loadByNames([name]);
  }

  // Execute via registry (which applies middleware)
  if (!registryRef) {
    // Fallback: direct execution without middleware
    const loadedTools = loader.getLoadedTools();
    const tool = loadedTools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Failed to load tool: ${name}` }],
        isError: true,
      };
    }
    return tool.execute(toolArgs);
  }

  // Use registry for proper middleware chain
  const result = await registryRef.execute(name, toolArgs);
  return {
    content: result.content,
    isError: result.isError,
  };
}

export const runToolTool: ToolDefinition = {
  name: "run_tool",
  description: "Execute a tool by name. Use browse_tools to find tools.",
  inputSchema: runToolSchema,
  execute: executeRunTool,
};

// ============================================================================
// Lazy MCP meta-tools collection
// ============================================================================

export const lazyMcpTools: ToolDefinition[] = [browseToolsTool, runToolTool];

/**
 * Calculate token savings from lazy loading
 */
export function calculateLazySavings(): {
  lazyTokens: number;
  fullTokens: number;
  savingsPercent: number;
} {
  // Approximate token counts based on schema sizes
  const lazyTokens = 150; // 2 simple tools with minimal schemas
  const fullTokens = TOOL_CATALOG.length * 100; // ~100 tokens per tool definition

  return {
    lazyTokens,
    fullTokens,
    savingsPercent: Math.round((1 - lazyTokens / fullTokens) * 100),
  };
}
