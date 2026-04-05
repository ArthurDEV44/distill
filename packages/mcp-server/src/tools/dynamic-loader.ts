/**
 * Dynamic Tool Loader
 *
 * Provides the 3 core tools that make up the Distill MCP server.
 */

import type { ToolDefinition } from "./registry.js";
import { autoOptimizeTool } from "./auto-optimize.js";
import { smartFileReadTool } from "./smart-file-read.js";
import { codeExecuteTool } from "./code-execute.js";

export type ToolCategory = "compress" | "analyze" | "logs" | "code" | "pipeline" | "core";

export function getAllTools(): ToolDefinition[] {
  return [
    autoOptimizeTool,
    smartFileReadTool,
    codeExecuteTool,
  ];
}
