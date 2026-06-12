/**
 * Smart File Read — config skeleton (F5).
 *
 * JSON and YAML are listed in SupportedLanguage but have no AST parser, so
 * pre-F5 smart_file_read dumped the whole file. Config files (package.json,
 * tsconfig, k8s manifests, openapi specs) are large and structural, so a
 * key-outline skeleton is the high-value read.
 *
 * JSON uses native JSON.parse for a typed key tree. YAML uses an indent-based
 * line walk (no YAML parser dependency) to keep the structure to `depth` nesting
 * levels and collapse the rest — approximate but dependency-free, which matches
 * Distill's lean-wire posture.
 */

import { countTokens } from "../../utils/token-counter.js";
import type { OutputFormat, SmartReadContext, ToolResult } from "./support.js";

export type ConfigKind = "json" | "yaml";

/** Render a leaf value as a short, type-revealing preview. */
function previewLeaf(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    return value.length > 60 ? JSON.stringify(value.slice(0, 57) + "...") : JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "null";
}

/**
 * Walk a parsed JSON value into indented outline lines. `level` is 1-based: the
 * root's direct children are level 1 (zero indent). A container at `level >=
 * maxDepth` is collapsed to `{N keys}` / `[N items]`.
 */
function walkJson(value: unknown, key: string, level: number, maxDepth: number, out: string[]): void {
  const indent = "  ".repeat(Math.max(0, level - 1));
  const label = `${key}: `;

  if (value === null || typeof value !== "object") {
    out.push(`${indent}${label}${previewLeaf(value)}`);
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${indent}${label}[]`);
      return;
    }
    out.push(`${indent}${label}[${value.length} items]`);
    if (level < maxDepth) {
      walkJson(value[0], "[0]", level + 1, maxDepth, out);
      if (value.length > 1) out.push(`${"  ".repeat(level)}... (${value.length - 1} more)`);
    }
    return;
  }

  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) {
    out.push(`${indent}${label}{}`);
    return;
  }
  if (level >= maxDepth) {
    out.push(`${indent}${label}{${keys.length} keys}`);
    return;
  }
  out.push(`${indent}${label}{`);
  for (const k of keys) {
    walkJson((value as Record<string, unknown>)[k], k, level + 1, maxDepth, out);
  }
  out.push(`${indent}}`);
}

function jsonSkeleton(content: string, depth: number): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null; // signal failure — caller falls back to full file
  }

  if (parsed === null || typeof parsed !== "object") {
    return previewLeaf(parsed);
  }

  const out: string[] = [];
  if (Array.isArray(parsed)) {
    out.push(`[${parsed.length} items]`);
    if (parsed.length > 0 && depth > 1) walkJson(parsed[0], "[0]", 2, depth, out);
    if (parsed.length > 1) out.push(`... (${parsed.length - 1} more)`);
    return out.join("\n");
  }

  for (const k of Object.keys(parsed as Record<string, unknown>)) {
    walkJson((parsed as Record<string, unknown>)[k], k, 1, depth, out);
  }
  return out.join("\n");
}

/**
 * Indent-based YAML outline. Keeps lines whose nesting level (derived from an
 * indent stack) is within `depth`; collapses deeper subtrees into a count.
 * Comments and blank lines are dropped. Approximate by design — this is a
 * structure overview, not a faithful parse.
 */
function yamlSkeleton(content: string, depth: number): string {
  const out: string[] = [];
  const indentStack: number[] = [];
  let collapsed = 0;

  const flushCollapsed = (): void => {
    if (collapsed > 0) {
      out.push(`${"  ".repeat(depth)}... (${collapsed} deeper lines)`);
      collapsed = 0;
    }
  };

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = /^(\s*)/.exec(line)?.[1]?.length ?? 0;
    while (indentStack.length > 0 && indentStack[indentStack.length - 1]! >= indent) {
      indentStack.pop();
    }
    const level = indentStack.length + 1; // 1-based nesting level
    indentStack.push(indent);

    if (level > depth) {
      collapsed++;
      continue;
    }
    flushCollapsed();
    out.push(line.replace(/\s+$/, ""));
  }
  flushCollapsed();
  return out.join("\n");
}

/**
 * Build a structural skeleton for a config file. Returns `null` only when JSON
 * fails to parse (so the caller can fall back to the full-file path). YAML is
 * best-effort and always returns a string.
 */
export function buildConfigSkeleton(content: string, kind: ConfigKind, depth: number): string | null {
  return kind === "json" ? jsonSkeleton(content, depth) : yamlSkeleton(content, depth);
}

function renderConfigOutput(
  body: string,
  filePath: string,
  languageId: string,
  totalLines: number,
  originalContent: string,
  depth: number,
  format: OutputFormat,
): string {
  const originalTokens = countTokens(originalContent);
  const bodyTokens = countTokens(body);
  const savings = originalTokens > 0 ? Math.round((1 - bodyTokens / originalTokens) * 100) : 0;
  const label = languageId.toUpperCase();

  if (format === "markdown") {
    return [
      `## Config Skeleton: ${filePath}`,
      "",
      `**Format:** ${label} | **Depth:** ${depth}`,
      `**Tokens:** ${bodyTokens} (was ${originalTokens}) | **Savings:** ${savings}%`,
      "",
      "```" + languageId,
      body,
      "```",
    ].join("\n");
  }

  return [
    `${filePath} (${languageId}, ${totalLines} lines)`,
    `Config skeleton (depth ${depth}) | Tokens: ${bodyTokens}/${originalTokens} (${savings}% saved)`,
    "",
    body,
  ].join("\n");
}

/**
 * Config-skeleton runner for json/yaml. Returns `null` when no skeleton could be
 * built (JSON parse failure) so the entry dispatcher falls back to the full-file
 * path. Uses mode "skeleton" so the output is marker-wrapped like other
 * compressing modes and feeds the F1 savings telemetry.
 */
export function runConfig(ctx: SmartReadContext, kind: ConfigKind): Promise<ToolResult> | null {
  const { input, content, languageId, totalLines, cacheAndReturn } = ctx;
  const body = buildConfigSkeleton(content, kind, input.depth);
  if (body === null) return null;
  const output = renderConfigOutput(
    body,
    input.filePath,
    languageId,
    totalLines,
    content,
    input.depth,
    input.format,
  );
  return cacheAndReturn(output, "skeleton");
}
