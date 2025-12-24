/**
 * @ctxopt/mcp-server
 *
 * MCP Server for CtxOpt - Context Engineering Optimizer
 *
 * Provides tools for analyzing and optimizing LLM context usage.
 */

// Server
export { createServer, runServer, type ServerConfig, type ServerInstance } from "./server.js";

// State management
export * from "./state/index.js";

// Cache
export * from "./cache/index.js";

// Middleware
export * from "./middleware/index.js";

// Tools
export { analyzeContext } from "./tools/analyze-context.js";
export { getStats } from "./tools/get-stats.js";
export { optimizationTips } from "./tools/optimization-tips.js";
export { sessionStatsTool, executeSessionStats } from "./tools/session-stats.js";
export { analyzeBuildOutputTool, executeAnalyzeBuildOutput } from "./tools/analyze-build-output.js";
export { smartCacheTool, executeSmartCache } from "./tools/smart-cache-tool.js";
export { createToolRegistry, type ToolRegistry, type ToolDefinition } from "./tools/registry.js";

// Parsers
export * from "./parsers/index.js";

// Utils
export * from "./utils/index.js";
