/**
 * Smart File Read Tool
 *
 * Reads files intelligently using AST analysis to extract only
 * relevant portions (functions, classes, types) instead of full files.
 *
 * Security: Path sandboxing restricts file access to the working directory.
 */

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { z } from "zod";

import {
  parseFile,
  extractElement,
  searchElements,
  extractLines,
  formatStructureSummary,
  hasParserSupport,
  type ExtractedContent,
} from "../ast/index.js";
import { detectLanguageFromPath } from "../utils/language-detector.js";
import { countTokens } from "../utils/token-counter.js";
import type { ToolDefinition } from "./registry.js";
import { getGlobalCache } from "../cache/smart-cache.js";
import { getBlockedPatterns } from "../sandbox/security/path-validator.js";
import type { FileStructure, SupportedLanguage } from "../ast/types.js";

// Parseable languages (excluding json, yaml, unknown)
const PARSEABLE_LANGUAGES: SupportedLanguage[] = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "php",
  "swift",
];

/**
 * Validate and normalize a language string
 */
function validateLanguage(lang: string): SupportedLanguage | null {
  const normalized = lang.toLowerCase().trim() as SupportedLanguage;
  if (PARSEABLE_LANGUAGES.includes(normalized)) {
    return normalized;
  }
  // Handle common aliases
  const aliases: Record<string, SupportedLanguage> = {
    ts: "typescript",
    js: "javascript",
    py: "python",
    golang: "go",
    rs: "rust",
  };
  return aliases[normalized] || null;
}

// Use canonical blocked patterns from sandbox security layer (single source of truth)
const BLOCKED_PATTERNS = getBlockedPatterns();

/**
 * Validate that a file path is safe to read
 * - Must be within the working directory (no directory traversal)
 * - Must not match sensitive file patterns
 */
function validatePath(
  filePath: string,
  workingDir: string
): { safe: boolean; error?: string; resolvedPath?: string } {
  // Resolve to absolute path
  const resolvedPath = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(workingDir, filePath);

  // Normalize both paths for comparison
  const normalizedResolved = path.normalize(resolvedPath);
  const normalizedWorkingDir = path.normalize(workingDir);

  // Check if resolved path is within working directory
  if (!normalizedResolved.startsWith(normalizedWorkingDir + path.sep) &&
      normalizedResolved !== normalizedWorkingDir) {
    return {
      safe: false,
      error: `Access denied: Path '${filePath}' is outside the working directory. Only files within '${workingDir}' can be read.`,
    };
  }

  // Resolve symlinks to prevent escaping the working directory via symlinks
  let realPath: string;
  try {
    realPath = fsSync.realpathSync(normalizedResolved);
    if (!realPath.startsWith(normalizedWorkingDir + path.sep) &&
        realPath !== normalizedWorkingDir) {
      return {
        safe: false,
        error: `Access denied: Path '${filePath}' resolves outside the working directory via symlink.`,
      };
    }
  } catch {
    // File doesn't exist yet or can't be resolved — fall through to fs.access check later
  }

  // Check for blocked patterns
  const basename = path.basename(resolvedPath);
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(basename) || pattern.test(resolvedPath)) {
      return {
        safe: false,
        error: `Access denied: Cannot read sensitive file '${basename}'. This file type is blocked for security reasons.`,
      };
    }
  }

  return { safe: true, resolvedPath };
}

// Minimal schema for MCP - removes rarely-used properties to save tokens
// Full validation is done by Zod inputSchema below
export const smartFileReadSchema = {
  type: "object" as const,
  properties: {
    filePath: {
      type: "string",
      description: "Path to the file to read (relative to working directory)",
    },
    mode: {
      type: "string",
      enum: ["auto", "full", "skeleton", "extract", "search"],
      default: "auto",
      description:
        "auto=detect from params. skeleton=signatures only. extract=element by type+name. search=find by query. full=structure overview.",
    },
    target: {
      type: "object",
      description: "Extract a specific code element by type and name (extract mode)",
      properties: {
        type: {
          enum: ["function", "class", "interface", "type", "variable", "method"],
          description: "Type of element to extract",
        },
        name: {
          type: "string",
          description: "Name of the element to extract",
        },
      },
      required: ["type", "name"],
    },
    query: {
      type: "string",
      description: "Search query to find matching elements (search mode)",
    },
    lines: {
      type: "object",
      description: "Extract specific line range (works in any mode)",
      properties: {
        start: { type: "number", description: "Start line (1-indexed)" },
        end: { type: "number", description: "End line (inclusive)" },
      },
      required: ["start", "end"],
    },
    depth: {
      type: "number",
      enum: [1, 2, 3],
      default: 1,
      description: "Skeleton depth: 1=signatures, 2=+doc preview, 3=+full docs",
    },
  },
  required: ["filePath"],
};

/**
 * Output schema per MCP 2025-06-18 spec
 */
const smartFileReadOutputSchema = {
  type: "object" as const,
  properties: {
    filePath: { type: "string", description: "Path to the file read" },
    language: { type: "string", description: "Detected programming language" },
    totalLines: { type: "number", description: "Total lines in file" },
    content: { type: "string", description: "Extracted content or structure summary" },
    mode: {
      type: "string",
      enum: ["full", "skeleton", "extract", "search", "lines"],
      description: "Extraction mode used",
    },
  },
  required: ["filePath", "content"],
};

const inputSchema = z.object({
  filePath: z.string(),
  mode: z.enum(["auto", "full", "skeleton", "extract", "search"]).optional().default("auto"),
  target: z
    .object({
      type: z.enum(["function", "class", "interface", "type", "variable", "method"]),
      name: z.string(),
    })
    .optional(),
  query: z.string().optional(),
  includeImports: z.boolean().optional().default(true),
  includeComments: z.boolean().optional().default(true),
  lines: z
    .object({
      start: z.number(),
      end: z.number(),
    })
    .optional(),
  depth: z.number().int().min(1).max(3).optional().default(1),
  cache: z.boolean().optional().default(true),
  language: z.string().optional(),
  format: z.enum(["plain", "markdown"]).optional().default("plain"),
});

type OutputFormat = "plain" | "markdown";

function formatExtractedContent(
  extracted: ExtractedContent,
  filePath: string,
  language: string,
  totalLines: number,
  includeImports: boolean,
  format: OutputFormat = "plain"
): string {
  const parts: string[] = [];
  const element = extracted.elements[0];
  const md = format === "markdown";

  if (element) {
    parts.push(md ? `## Extracted: ${element.type} \`${element.name}\`` : `[${element.type}] ${element.name}`);
  } else {
    parts.push(md ? `## Extracted: lines ${extracted.startLine}-${extracted.endLine}` : `[lines ${extracted.startLine}-${extracted.endLine}]`);
  }

  parts.push(md ? "" : `${filePath}:${extracted.startLine}-${extracted.endLine} (${language}, ${totalLines} lines)`);
  if (md) {
    parts.push(`**File:** ${filePath}`);
    parts.push(`**Lines:** ${extracted.startLine}-${extracted.endLine} of ${totalLines}`);
    parts.push("");
  }

  // Add related imports if present
  if (includeImports && extracted.relatedImports.length > 0) {
    if (md) parts.push("```" + language);
    parts.push("// Related imports");
    for (const imp of extracted.relatedImports) {
      parts.push(imp);
    }
    parts.push("");
    parts.push(extracted.content);
    if (md) parts.push("```");
  } else {
    if (md) parts.push("```" + language);
    parts.push(extracted.content);
    if (md) parts.push("```");
  }

  // Token savings estimate
  const extractedLines = extracted.endLine - extracted.startLine + 1;
  const savedLines = totalLines - extractedLines;
  if (savedLines > 0 && totalLines > 10) {
    const savingsPercent = Math.round((savedLines / totalLines) * 100);
    parts.push(md ? "" : "---");
    parts.push(
      md
        ? `**Extracted:** ${extractedLines} lines (of ${totalLines}) - ${savingsPercent}% reduction`
        : `Extracted: ${extractedLines}/${totalLines} lines (${savingsPercent}% reduction)`
    );
  }

  return parts.join("\n");
}

function formatSearchResults(
  results: ReturnType<typeof searchElements>,
  filePath: string,
  query: string,
  format: OutputFormat = "plain"
): string {
  const parts: string[] = [];
  const md = format === "markdown";

  parts.push(md ? `## Search Results: "${query}"` : `Search: "${query}" in ${filePath}`);
  if (md) {
    parts.push(`**File:** ${filePath}`);
    parts.push(`**Matches:** ${results.length}`);
    parts.push("");
  } else {
    parts.push(`Matches: ${results.length}`);
  }

  if (results.length === 0) {
    parts.push("No matches found.");
    return parts.join("\n");
  }

  for (const element of results) {
    const prefix = element.parent ? `${element.parent}.` : "";
    const exported = element.isExported ? " (exported)" : "";
    const async = element.isAsync ? " async" : "";

    if (md) {
      parts.push(
        `- **${element.type}** \`${prefix}${element.name}\`${exported}${async} - lines ${element.startLine}-${element.endLine}`
      );
      if (element.signature) {
        parts.push(`  \`${element.signature}\``);
      }
      if (element.documentation) {
        const docPreview = element.documentation.split("\n")[0]?.slice(0, 80);
        if (docPreview) {
          parts.push(`  _${docPreview}${element.documentation.length > 80 ? "..." : ""}_`);
        }
      }
    } else {
      parts.push(`${element.type} ${prefix}${element.name}${exported}${async} (${element.startLine}-${element.endLine})`);
    }
  }

  if (md) {
    parts.push("");
    parts.push("Use `target: { type, name }` to extract a specific element.");
  }

  return parts.join("\n");
}

/**
 * Format file structure as a code skeleton with actual signatures.
 * Absorbs the deleted code_skeleton tool's formatSkeletonByDepth.
 *
 * Depth levels:
 * - 1: Signatures only (minimal)
 * - 2: Signatures + inline doc preview (first line of JSDoc)
 * - 3: Full signatures with complete documentation
 */
function formatSkeletonOutput(
  structure: FileStructure,
  filePath: string,
  languageId: string,
  totalLines: number,
  originalContent: string,
  depth: number = 1,
  format: OutputFormat = "plain",
): string {
  const parts: string[] = [];
  const md = format === "markdown";
  const skeletonLines: string[] = [];

  // Helper to emit a signature line with optional documentation based on depth.
  // depth 1: signature only. depth 2: signature // first-line-doc. depth 3: full /** doc */ block before signature.
  const emitWithDoc = (sig: string, doc: string | undefined, indent: string = "") => {
    if (doc && depth === 3) {
      skeletonLines.push(`${indent}/** ${doc} */`);
      skeletonLines.push(`${indent}${sig}`);
    } else if (doc && depth === 2) {
      skeletonLines.push(`${indent}${sig} // ${doc.split("\n")[0]}`);
    } else {
      skeletonLines.push(`${indent}${sig}`);
    }
  };

  // Types
  if (structure.types?.length) {
    for (const t of structure.types) {
      const exported = t.isExported ? "export " : "";
      emitWithDoc(`${exported}${t.signature || `type ${t.name}`}`, t.documentation);
    }
    skeletonLines.push("");
  }

  // Interfaces
  if (structure.interfaces?.length) {
    for (const iface of structure.interfaces) {
      const exported = iface.isExported ? "export " : "";
      emitWithDoc(`${exported}${iface.signature || `interface ${iface.name}`}`, iface.documentation);
    }
    skeletonLines.push("");
  }

  // Top-level functions (not methods)
  const topLevelFunctions = structure.functions?.filter((f) => !f.parent) || [];
  if (topLevelFunctions.length > 0) {
    for (const fn of topLevelFunctions) {
      const exported = fn.isExported ? "export " : "";
      const asyncMod = fn.isAsync ? "async " : "";
      const sig = fn.signature || `function ${fn.name}()`;
      emitWithDoc(`${exported}${asyncMod}${sig}`, fn.documentation);
    }
    skeletonLines.push("");
  }

  // Classes with methods
  if (structure.classes?.length) {
    for (const cls of structure.classes) {
      const exported = cls.isExported ? "export " : "";
      emitWithDoc(`${exported}class ${cls.name} {`, cls.documentation);

      const methods = structure.functions?.filter((f) => f.parent === cls.name) || [];
      for (const m of methods) {
        const asyncMod = m.isAsync ? "async " : "";
        const sig = m.signature || `${m.name}()`;
        emitWithDoc(`${asyncMod}${sig}`, m.documentation, "  ");
      }
      skeletonLines.push("}");
      skeletonLines.push("");
    }
  }

  // Exported variables
  const exportedVars = structure.variables?.filter((v) => v.isExported) || [];
  if (exportedVars.length > 0) {
    for (const v of exportedVars) {
      emitWithDoc(`export ${v.signature || `const ${v.name}`}`, v.documentation);
    }
    skeletonLines.push("");
  }

  const skeleton = skeletonLines.join("\n").trim();

  // Token statistics (use fast approximation for very large files to avoid blocking event loop)
  const originalTokens = originalContent.length > 200_000
    ? Math.ceil(originalContent.length / 4)
    : countTokens(originalContent);
  const skeletonTokens = countTokens(skeleton);
  const savings = originalTokens > 0 ? Math.round((1 - skeletonTokens / originalTokens) * 100) : 0;
  const depthLabels = ["", "signatures", "signatures+docs", "full"];

  if (md) {
    parts.push(`## Code Skeleton: ${filePath}`);
    parts.push("");
    parts.push(`**Language:** ${languageId} | **Depth:** ${depth} (${depthLabels[depth]})`);
    parts.push(`**Tokens:** ${skeletonTokens} (was ${originalTokens}) | **Savings:** ${savings}%`);
    parts.push("");
    parts.push("```" + languageId);
    parts.push(skeleton);
    parts.push("```");
  } else {
    parts.push(`${filePath} (${languageId}, ${totalLines} lines)`);
    parts.push(`Depth: ${depth} (${depthLabels[depth]}) | Tokens: ${skeletonTokens}/${originalTokens} (${savings}% saved)`);
    parts.push("");
    parts.push(skeleton);
  }

  return parts.join("\n");
}

export async function executeSmartFileRead(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean; structuredContent?: Record<string, unknown> }> {
  const input = inputSchema.parse(args);
  const workingDir = process.cwd();

  // Validate path for security (sandboxing)
  const validation = validatePath(input.filePath, workingDir);
  if (!validation.safe || !validation.resolvedPath) {
    return {
      content: [{ type: "text", text: validation.error || "Invalid path" }],
      isError: true,
    };
  }

  const resolvedPath = validation.resolvedPath;

  // Check if file exists
  try {
    await fs.access(resolvedPath);
  } catch {
    return {
      content: [{ type: "text", text: `File not found: ${input.filePath}` }],
      isError: true,
    };
  }

  // Read file content
  const content = await fs.readFile(resolvedPath, "utf-8");
  const totalLines = content.split("\n").length;

  // Detect or force language
  let language: SupportedLanguage;
  if (input.language) {
    const forcedLang = validateLanguage(input.language);
    if (!forcedLang) {
      return {
        content: [
          {
            type: "text",
            text: `Unsupported language: '${input.language}'. Supported: ${PARSEABLE_LANGUAGES.join(", ")} (or aliases: ts, js, py, golang, rs)`,
          },
        ],
        isError: true,
      };
    }
    language = forcedLang;
  } else {
    language = detectLanguageFromPath(resolvedPath);
  }
  const languageId =
    language === "typescript" ? "typescript" : language === "javascript" ? "javascript" : language;

  // Resolve effective mode from explicit mode or param presence
  let effectiveMode = input.mode;
  if (effectiveMode === "auto") {
    if (input.target) effectiveMode = "extract";
    else if (input.query) effectiveMode = "search";
    else effectiveMode = "full";
  }

  // Helper to build structuredContent for MCP 2025-06-18
  const buildStructured = (text: string, mode: string) => ({
    filePath: input.filePath,
    language: languageId,
    totalLines,
    content: text,
    mode,
  });

  // Cache setup
  const cache = getGlobalCache();
  const cacheKey = `smart-read:${resolvedPath}:${JSON.stringify({
    mode: effectiveMode,
    target: input.target,
    query: input.query,
    depth: input.depth,
    lines: input.lines,
    language: input.language,
    format: input.format,
  })}`;

  // Check cache if enabled
  if (input.cache !== false) {
    const cached = await cache.get<string>(cacheKey);
    if (cached.hit && cached.value) {
      return {
        content: [{ type: "text", text: cached.value + "\n\n_(from cache)_" }],
        structuredContent: buildStructured(cached.value, effectiveMode),
      };
    }
  }

  // Helper to cache and return result with structuredContent
  const cacheAndReturn = async (result: string, mode: string) => {
    if (input.cache !== false) {
      await cache.set(cacheKey, result, { filePath: resolvedPath });
    }
    return {
      content: [{ type: "text" as const, text: result }],
      structuredContent: buildStructured(result, mode),
    };
  };

  // Line extraction always works regardless of mode
  if (input.lines) {
    const extracted = extractLines(content, input.lines.start, input.lines.end);
    const result = formatExtractedContent(
      extracted,
      input.filePath,
      languageId,
      totalLines,
      false,
      input.format
    );
    return {
      content: [{ type: "text", text: result }],
      structuredContent: buildStructured(result, "lines"),
    };
  }

  // Skeleton mode: handle before hasParserSupport to return empty (not error) for unsupported langs
  if (effectiveMode === "skeleton") {
    if (!hasParserSupport(language)) {
      // Return empty skeleton for unsupported languages (not an error per US-006)
      const emptyResult = `${input.filePath} (${languageId}, ${totalLines} lines)\nNo AST support for ${languageId} — skeleton not available. Use mode \"full\" or \"lines\" instead.`;
      return cacheAndReturn(emptyResult, "skeleton");
    }
    const structure = parseFile(content, language); // full AST parse for real signatures
    const skeleton = formatSkeletonOutput(
      structure, input.filePath, languageId, totalLines, content, input.depth, input.format
    );
    return cacheAndReturn(skeleton, "skeleton");
  }

  // Check parser support for remaining modes
  if (!hasParserSupport(language)) {
    const parts: string[] = [];
    const md = input.format === "markdown";
    if (md) {
      parts.push(`## File: ${input.filePath}`);
      parts.push("");
      parts.push(`**Language:** ${language} (no AST support, returning full file)`);
      parts.push(`**Lines:** ${totalLines}`);
      parts.push("");
      parts.push("```" + languageId);
    } else {
      parts.push(`${input.filePath} (${language}, ${totalLines} lines, no AST support)`);
    }
    parts.push(content);
    if (md) parts.push("```");

    const text = parts.join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: buildStructured(text, "full"),
    };
  }

  // Extract mode
  if (effectiveMode === "extract") {
    if (!input.target) {
      return {
        content: [{ type: "text", text: "Extract mode requires 'target' param with type and name." }],
        isError: true,
      };
    }
    const extracted = extractElement(content, language, input.target, {
      includeImports: input.includeImports,
      includeComments: input.includeComments,
    });

    if (!extracted) {
      return {
        content: [
          {
            type: "text",
            text: `${input.target.type} '${input.target.name}' not found in ${input.filePath}`,
          },
        ],
        isError: true,
      };
    }

    const result = formatExtractedContent(
      extracted,
      input.filePath,
      languageId,
      totalLines,
      input.includeImports,
      input.format
    );
    return cacheAndReturn(result, "extract");
  }

  // Search mode
  if (effectiveMode === "search") {
    if (!input.query) {
      return {
        content: [{ type: "text", text: "Search mode requires 'query' param." }],
        isError: true,
      };
    }
    const results = searchElements(content, language, input.query);
    const result = formatSearchResults(results, input.filePath, input.query, input.format);
    return cacheAndReturn(result, "search");
  }

  // Full mode (default): return file structure summary
  const structure = parseFile(content, language);
  const summary = formatStructureSummary(structure, input.filePath, input.format);

  return cacheAndReturn(summary, "full");
}

export const smartFileReadTool: ToolDefinition = {
  name: "smart_file_read",
  description:
    "Read code with AST extraction — get functions, classes, signatures without loading the full file.\n\n" +
    "WHEN TO USE: Instead of built-in Read when you need specific code elements from supported languages " +
    "(TypeScript, JavaScript, Python, Go, Rust, PHP, Swift). Saves 50-90% tokens vs full file read.\n\n" +
    "HOW TO FORMAT:\n" +
    '- Extract a function: smart_file_read({ filePath: "src/server.ts", mode: "extract", target: { type: "function", name: "createServer" } })\n' +
    '- Code skeleton: smart_file_read({ filePath: "src/server.ts", mode: "skeleton", depth: 2 })\n' +
    '- Search elements: smart_file_read({ filePath: "src/server.ts", mode: "search", query: "handle" })\n' +
    '- Structure overview: smart_file_read({ filePath: "src/server.ts" })\n' +
    '- Line range: smart_file_read({ filePath: "src/server.ts", lines: { start: 10, end: 50 } })\n\n' +
    "Modes: auto (detect from params), skeleton (signatures, depth 1-3), extract (element by type+name), " +
    "search (find by query), full (structure overview).\n\n" +
    "WHAT TO EXPECT: Extracted content with file metadata and token savings stats. " +
    "For unsupported languages, returns full file content (graceful fallback, not error).",
  inputSchema: smartFileReadSchema,
  outputSchema: smartFileReadOutputSchema,
  annotations: {
    title: "Smart File Read",
    readOnlyHint: true,
    idempotentHint: true,
  },
  execute: executeSmartFileRead,
};
