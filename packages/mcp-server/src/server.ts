import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { analyzeContext, analyzeContextSchema } from "./tools/analyze-context.js";
import { getStats, getStatsSchema } from "./tools/get-stats.js";
import { optimizationTips, optimizationTipsSchema } from "./tools/optimization-tips.js";

export interface ServerConfig {
  apiKey?: string;
  apiBaseUrl?: string;
}

export function createServer(config: ServerConfig = {}) {
  const server = new Server(
    {
      name: "@ctxopt/mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "analyze_context",
        description:
          "Analyze a prompt or context for token usage and optimization opportunities. Returns token count, estimated cost, and suggestions for improvement.",
        inputSchema: analyzeContextSchema,
      },
      {
        name: "get_stats",
        description:
          "Get usage statistics for the current session or project. Shows token usage, costs, and trends.",
        inputSchema: getStatsSchema,
      },
      {
        name: "optimization_tips",
        description:
          "Get context engineering best practices and optimization tips based on your usage patterns.",
        inputSchema: optimizationTipsSchema,
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "analyze_context":
        return analyzeContext(args, config);

      case "get_stats":
        return getStats(args, config);

      case "optimization_tips":
        return optimizationTips(args, config);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

export async function runServer(config: ServerConfig = {}) {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CtxOpt MCP Server running on stdio");
}
