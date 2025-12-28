/**
 * @ctxopt/mcp-server
 *
 * MCP Server for CtxOpt - Context Engineering Optimizer
 *
 * Provides tools for analyzing and optimizing LLM context usage.
 */

// Server
export { createServer, runServer, type ServerConfig, type ServerInstance, type LoadingMode } from "./server.js";

// State management

// Cache
export * from "./cache/index.js";

// Middleware
export * from "./middleware/index.js";

// Tools
export { analyzeContext } from "./tools/analyze-context.js";
export { optimizationTips } from "./tools/optimization-tips.js";
export { analyzeBuildOutputTool, executeAnalyzeBuildOutput } from "./tools/analyze-build-output.js";
export { smartCacheTool, executeSmartCache } from "./tools/smart-cache-tool.js";
export { createToolRegistry, type ToolRegistry, type ToolDefinition } from "./tools/registry.js";
export {
  getDynamicLoader,
  resetDynamicLoader,
  TOOL_CATALOG,
  type ToolCategory,
  type ToolMetadata,
  DynamicToolLoader,
} from "./tools/dynamic-loader.js";
export { discoverToolsTool } from "./tools/discover-tools.js";
export {
  browseToolsTool,
  runToolTool,
  lazyMcpTools,
  setLazyMcpRegistry,
  calculateLazySavings,
} from "./tools/lazy-mcp.js";

// Parsers
export * from "./parsers/index.js";

// Utils
export * from "./utils/index.js";
