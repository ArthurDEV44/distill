/**
 * TOON Serializer for MCP Tools
 *
 * Converts MCP tool definitions to TOON (Token-Oriented Object Notation)
 * format for ~40% token reduction when presenting tools to LLMs.
 *
 * TOON spec: https://toonformat.dev/
 */

import type { ToolDefinition } from "../tools/registry.js";
import type { ToolCategory } from "../tools/dynamic-loader.js";
import { countTokens } from "./token-counter.js";

/**
 * Lightweight tool metadata for lazy serialization
 */
export interface ToolMetadataLite {
  name: string;
  category: ToolCategory;
  description: string;
  keywords?: string[];
}

export interface ToonSerializerOptions {
  /** Include parameter details (default: true) */
  includeParams?: boolean;
  /** Include category grouping (default: true) */
  groupByCategory?: boolean;
  /** Category for each tool (optional) */
  categories?: Map<string, string>;
}

interface ParamInfo {
  name: string;
  type: string;
  required: boolean;
  enumValues?: string[];
}

/**
 * Extract parameter info from JSON Schema
 */
function extractParams(schema: Record<string, unknown>): ParamInfo[] {
  const params: ParamInfo[] = [];
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = (schema.required as string[]) || [];

  if (!properties) return params;

  for (const [name, prop] of Object.entries(properties)) {
    const info: ParamInfo = {
      name,
      type: inferType(prop),
      required: required.includes(name),
    };

    if (prop.enum) {
      info.enumValues = prop.enum as string[];
    }

    params.push(info);
  }

  return params;
}

/**
 * Infer a compact type string from JSON Schema property
 */
function inferType(prop: Record<string, unknown>): string {
  if (prop.enum) {
    const values = prop.enum as string[];
    if (values.length <= 4) {
      return values.join("|");
    }
    return `${values.slice(0, 3).join("|")}|...`;
  }

  if (prop.type === "string") return "str";
  if (prop.type === "boolean") return "bool";
  if (prop.type === "number" || prop.type === "integer") return "num";
  if (prop.type === "array") return "arr";

  if (prop.properties) {
    // Nested object - extract key names
    const keys = Object.keys(prop.properties as Record<string, unknown>);
    if (keys.length <= 3) {
      return `{${keys.join(",")}}`;
    }
    return `{${keys.slice(0, 2).join(",")},...}`;
  }

  if (prop.type === "object") return "obj";

  return "any";
}

/**
 * Format parameters in TOON style
 */
function formatParams(params: ParamInfo[]): string {
  if (params.length === 0) return "";

  const parts: string[] = [];

  for (const p of params) {
    const optional = p.required ? "" : "?";
    const type = p.type !== "str" ? `:${p.type}` : "";
    parts.push(`${p.name}${optional}${type}`);
  }

  return parts.join(" ");
}

/**
 * Serialize a single tool to TOON format
 */
function serializeTool(tool: ToolDefinition, indent: string = "  "): string {
  const params = extractParams(tool.inputSchema as Record<string, unknown>);
  const paramStr = formatParams(params);

  // Truncate description to save tokens
  const desc = tool.description.length > 60
    ? tool.description.slice(0, 57) + "..."
    : tool.description;

  if (paramStr) {
    return `${indent}${tool.name}(${paramStr}) → ${desc}`;
  }
  return `${indent}${tool.name}() → ${desc}`;
}

/**
 * Serialize tools to TOON format
 *
 * Output format:
 * ```
 * tools[N]:
 *   tool_name(param1 param2?:type) → Description
 *   ...
 * ```
 */
export function serializeToolsToToon(
  tools: ToolDefinition[],
  options: ToonSerializerOptions = {}
): string {
  const { groupByCategory = false, categories } = options;

  const lines: string[] = [];

  if (groupByCategory && categories) {
    // Group tools by category
    const byCategory = new Map<string, ToolDefinition[]>();

    for (const tool of tools) {
      const cat = categories.get(tool.name) || "other";
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(tool);
    }

    for (const [cat, catTools] of byCategory) {
      lines.push(`${cat}[${catTools.length}]:`);
      for (const tool of catTools) {
        lines.push(serializeTool(tool));
      }
    }
  } else {
    // Flat list
    lines.push(`tools[${tools.length}]:`);
    for (const tool of tools) {
      lines.push(serializeTool(tool));
    }
  }

  return lines.join("\n");
}

/**
 * Escape commas in TOON tabular values
 */
function escapeTabularValue(value: string): string {
  // If value contains comma, wrap in quotes (TOON spec)
  if (value.includes(",")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize tools to tabular TOON format (most compact)
 *
 * Output format:
 * ```
 * tools[N]{name,params,desc}:
 *   auto_optimize,content hint?:enum agg?:bool,Auto-compress 80-95%
 *   ...
 * ```
 */
export function serializeToolsToToonTabular(
  tools: ToolDefinition[]
): string {
  const lines: string[] = [];
  lines.push(`tools[${tools.length}]{name,params,desc}:`);

  for (const tool of tools) {
    const params = extractParams(tool.inputSchema as Record<string, unknown>);
    const paramStr = formatParams(params);

    // Truncate and escape description for tabular format
    let desc = tool.description.length > 50
      ? tool.description.slice(0, 47) + "..."
      : tool.description;
    desc = escapeTabularValue(desc);

    lines.push(`  ${tool.name},${paramStr || "-"},${desc}`);
  }

  return lines.join("\n");
}

/**
 * Compare token counts between JSON and TOON
 */
export function compareTokens(
  tools: ToolDefinition[]
): { json: number; toon: number; toonTabular: number; savings: number } {
  const jsonStr = JSON.stringify(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
  );

  const toonStr = serializeToolsToToon(tools);
  const toonTabularStr = serializeToolsToToonTabular(tools);

  const jsonTokens = countTokens(jsonStr);
  const toonTokens = countTokens(toonStr);
  const toonTabularTokens = countTokens(toonTabularStr);

  const bestToon = Math.min(toonTokens, toonTabularTokens);
  const savings = Math.round((1 - bestToon / jsonTokens) * 100);

  return {
    json: jsonTokens,
    toon: toonTokens,
    toonTabular: toonTabularTokens,
    savings,
  };
}

/**
 * Serialize tool metadata to lightweight TOON format (no schema loading)
 *
 * Used for lazy loading - shows available tools without loading full definitions.
 * Output format:
 * ```
 * tools[N]:
 *   tool_name → Description [keywords]
 *   ...
 * ```
 */
export function serializeMetadataToToon(
  metadata: ToolMetadataLite[],
  options: { groupByCategory?: boolean } = {}
): string {
  const { groupByCategory = true } = options;
  const lines: string[] = [];

  if (groupByCategory) {
    const byCategory = new Map<string, ToolMetadataLite[]>();

    for (const tool of metadata) {
      const cat = tool.category;
      if (!byCategory.has(cat)) {
        byCategory.set(cat, []);
      }
      byCategory.get(cat)!.push(tool);
    }

    for (const [cat, catTools] of byCategory) {
      lines.push(`${cat}[${catTools.length}]:`);
      for (const tool of catTools) {
        const desc = tool.description.length > 50
          ? tool.description.slice(0, 47) + "..."
          : tool.description;
        lines.push(`  ${tool.name} → ${desc}`);
      }
    }
  } else {
    lines.push(`tools[${metadata.length}]:`);
    for (const tool of metadata) {
      const desc = tool.description.length > 50
        ? tool.description.slice(0, 47) + "..."
        : tool.description;
      lines.push(`  ${tool.name} → ${desc}`);
    }
  }

  return lines.join("\n");
}

/**
 * Serialize tool metadata to lightweight tabular TOON format
 */
export function serializeMetadataToToonTabular(
  metadata: ToolMetadataLite[]
): string {
  const lines: string[] = [];
  lines.push(`tools[${metadata.length}]{name,desc}:`);

  for (const tool of metadata) {
    let desc = tool.description.length > 50
      ? tool.description.slice(0, 47) + "..."
      : tool.description;
    // Escape commas
    if (desc.includes(",")) {
      desc = `"${desc.replace(/"/g, '""')}"`;
    }
    lines.push(`  ${tool.name},${desc}`);
  }

  return lines.join("\n");
}
