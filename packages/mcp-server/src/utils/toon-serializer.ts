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

// ============================================
// Generic Result Serialization
// ============================================

/**
 * Result schema for TOON serialization
 */
export interface ResultSchema {
  /** Name of the result type */
  name: string;
  /** Fields to include in output */
  fields?: string[];
  /** Maximum depth for nested objects */
  maxDepth?: number;
}

/**
 * Verbosity options for result serialization
 */
export interface ResultSerializerOptions {
  /** Verbosity level */
  verbosity?: "minimal" | "normal" | "detailed";
  /** Include statistics */
  includeStats?: boolean;
  /** Maximum string length for values */
  maxValueLength?: number;
}

/**
 * Serialize any result to TOON format
 *
 * Converts objects, arrays, and primitives to compact TOON notation.
 *
 * Output formats:
 * - Object: `name{field1,field2}: value1, value2`
 * - Array: `items[N]: item1, item2, ...`
 * - Stats: `stats: original→compressed (-X%)`
 */
export function serializeResultToToon(
  result: unknown,
  schema: ResultSchema,
  options: ResultSerializerOptions = {}
): string {
  const {
    verbosity = "normal",
    includeStats = true,
    maxValueLength = verbosity === "minimal" ? 50 : verbosity === "normal" ? 100 : 200,
  } = options;

  const lines: string[] = [];

  if (result === null || result === undefined) {
    return `${schema.name}: (empty)`;
  }

  if (Array.isArray(result)) {
    return serializeArrayToToon(result, schema.name, maxValueLength, verbosity);
  }

  if (typeof result === "object") {
    return serializeObjectToToon(
      result as Record<string, unknown>,
      schema,
      maxValueLength,
      verbosity,
      includeStats
    );
  }

  // Primitive value
  return `${schema.name}: ${truncateValue(String(result), maxValueLength)}`;
}

/**
 * Serialize array to TOON format
 */
function serializeArrayToToon(
  arr: unknown[],
  name: string,
  maxValueLength: number,
  verbosity: string
): string {
  const lines: string[] = [];
  const maxItems = verbosity === "minimal" ? 5 : verbosity === "normal" ? 15 : 50;

  lines.push(`${name}[${arr.length}]:`);

  const items = arr.slice(0, maxItems);
  for (const item of items) {
    if (typeof item === "object" && item !== null) {
      // Compact object representation
      const obj = item as Record<string, unknown>;
      const keys = Object.keys(obj).slice(0, 4);
      const values = keys.map((k) => `${k}:${formatCompactValue(obj[k], maxValueLength)}`);
      lines.push(`  ${values.join(" ")}`);
    } else {
      lines.push(`  ${truncateValue(String(item), maxValueLength)}`);
    }
  }

  if (arr.length > maxItems) {
    lines.push(`  ... +${arr.length - maxItems} more`);
  }

  return lines.join("\n");
}

/**
 * Serialize object to TOON format
 */
function serializeObjectToToon(
  obj: Record<string, unknown>,
  schema: ResultSchema,
  maxValueLength: number,
  verbosity: string,
  includeStats: boolean
): string {
  const lines: string[] = [];

  // Determine fields to include
  const fields = schema.fields || Object.keys(obj);

  // Check for stats object
  const hasStats = includeStats && "stats" in obj && typeof obj.stats === "object";

  // Format header with stats if present
  if (hasStats) {
    const stats = obj.stats as Record<string, unknown>;
    const statsLine = formatStatsLine(stats);
    if (statsLine) {
      lines.push(`[${schema.name}] ${statsLine}`);
    } else {
      lines.push(`[${schema.name}]`);
    }
  } else {
    lines.push(`[${schema.name}]`);
  }

  // Serialize each field
  for (const field of fields) {
    if (field === "stats" && hasStats) continue; // Already shown in header
    if (!(field in obj)) continue;

    const value = obj[field];
    const formatted = formatFieldValue(field, value, maxValueLength, verbosity);
    if (formatted) {
      lines.push(formatted);
    }
  }

  return lines.join("\n");
}

/**
 * Format statistics line for header
 */
function formatStatsLine(stats: Record<string, unknown>): string {
  const parts: string[] = [];

  // Token reduction stats
  if ("original" in stats && "compressed" in stats) {
    const original = stats.original as number;
    const compressed = stats.compressed as number;
    const percent = "reductionPercent" in stats
      ? stats.reductionPercent
      : Math.round((1 - compressed / original) * 100);
    parts.push(`${original}→${compressed} tokens (-${percent}%)`);
  }

  // Other common stats
  if ("filesProcessed" in stats) {
    parts.push(`${stats.filesProcessed} files`);
  }
  if ("executionTimeMs" in stats) {
    parts.push(`${stats.executionTimeMs}ms`);
  }

  return parts.join(", ");
}

/**
 * Format a single field value
 */
function formatFieldValue(
  field: string,
  value: unknown,
  maxValueLength: number,
  verbosity: string
): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const maxItems = verbosity === "minimal" ? 3 : verbosity === "normal" ? 5 : 10;
    const items = value.slice(0, maxItems).map((v) => formatCompactValue(v, maxValueLength / 2));
    const suffix = value.length > maxItems ? ` +${value.length - maxItems}` : "";
    return `${field}[${value.length}]: ${items.join(", ")}${suffix}`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).slice(0, 3);
    const vals = keys.map((k) => `${k}:${formatCompactValue(obj[k], 30)}`);
    return `${field}: {${vals.join(", ")}}`;
  }

  if (typeof value === "string" && value.length > maxValueLength) {
    return `${field}: ${truncateValue(value, maxValueLength)}`;
  }

  return `${field}: ${value}`;
}

/**
 * Format value compactly for inline display
 */
function formatCompactValue(value: unknown, maxLen: number): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return truncateValue(value, maxLen);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "T" : "F";
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return `{...}`;
  return String(value);
}

/**
 * Truncate string value
 */
function truncateValue(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 3) + "...";
}

/**
 * Serialize result to tabular TOON format (most compact)
 */
export function serializeResultToToonTabular(
  result: unknown,
  schema: ResultSchema
): string {
  if (result === null || result === undefined) {
    return `${schema.name}: -`;
  }

  if (Array.isArray(result)) {
    const lines: string[] = [];
    const fields = result.length > 0 && typeof result[0] === "object"
      ? Object.keys(result[0] as object).slice(0, 4)
      : [];

    if (fields.length > 0) {
      lines.push(`${schema.name}[${result.length}]{${fields.join(",")}}:`);
      for (const item of result.slice(0, 20)) {
        const obj = item as Record<string, unknown>;
        const values = fields.map((f) => escapeTabularValue(formatCompactValue(obj[f], 30)));
        lines.push(`  ${values.join(",")}`);
      }
      if (result.length > 20) {
        lines.push(`  ... +${result.length - 20} more`);
      }
    } else {
      lines.push(`${schema.name}[${result.length}]: ${result.slice(0, 10).join(", ")}`);
    }

    return lines.join("\n");
  }

  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    const fields = schema.fields || Object.keys(obj).slice(0, 6);
    const values = fields.map((f) => `${f}:${formatCompactValue(obj[f], 40)}`);
    return `${schema.name}: ${values.join(", ")}`;
  }

  return `${schema.name}: ${result}`;
}

/**
 * Format output based on global configuration
 *
 * Uses the output config singleton to determine format.
 */
export function formatOutputWithConfig(
  result: unknown,
  schema: ResultSchema
): string {
  // Import dynamically to avoid circular dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getOutputConfig, shouldUseToon } = require("../config/output-config.js");

  const config = getOutputConfig();

  if (shouldUseToon()) {
    if (config.mode === "toon") {
      return serializeResultToToonTabular(result, schema);
    }
    return serializeResultToToon(result, schema, {
      verbosity: config.verbosity,
      includeStats: config.includeStats,
    });
  }

  // Default structured output
  return serializeResultToToon(result, schema, {
    verbosity: config.verbosity,
    includeStats: config.includeStats,
  });
}
