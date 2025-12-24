/**
 * Smart File Read Tool
 *
 * Reads files intelligently using AST analysis to extract only
 * relevant portions (functions, classes, types) instead of full files.
 *
 * Security: Path sandboxing restricts file access to the working directory.
 */

import * as fs from "fs/promises";
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
import type { ToolDefinition } from "./registry.js";
import { getGlobalCache } from "../cache/smart-cache.js";
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

// Sensitive file patterns that should never be read
const BLOCKED_PATTERNS = [
  /\.env($|\.)/i, // .env files
  /\.pem$/i, // Private keys
  /\.key$/i, // Key files
  /id_rsa/i, // SSH keys
  /id_ed25519/i, // SSH keys
  /credentials/i, // Credentials files
  /secrets?\./i, // Secret files
  /\.keystore$/i, // Java keystores
];

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

export const smartFileReadSchema = {
  type: "object" as const,
  properties: {
    filePath: {
      type: "string",
      description: "Path to file",
    },
    target: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["function", "class", "interface", "type", "variable", "method"],
          description: "Element type",
        },
        name: {
          type: "string",
          description: "Element name",
        },
      },
      required: ["type", "name"],
      description: "Extract specific element",
    },
    query: {
      type: "string",
      description: "Search by name or content",
    },
    includeImports: {
      type: "boolean",
      description: "Include imports (default: true)",
    },
    includeComments: {
      type: "boolean",
      description: "Include docs (default: true)",
    },
    lines: {
      type: "object",
      properties: {
        start: {
          type: "number",
          description: "Start line",
        },
        end: {
          type: "number",
          description: "End line",
        },
      },
      required: ["start", "end"],
      description: "Line range",
    },
    skeleton: {
      type: "boolean",
      description: "Signatures only, no bodies",
    },
    cache: {
      type: "boolean",
      description: "Use cache (default: true)",
    },
    language: {
      type: "string",
      description: "Force language (ts, js, py, go, rust, php, swift)",
    },
    format: {
      type: "string",
      enum: ["plain", "markdown"],
      description: "Output format (default: plain)",
    },
  },
  required: ["filePath"],
};

const inputSchema = z.object({
  filePath: z.string(),
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
  skeleton: z.boolean().optional().default(false),
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
 * Format file structure as a skeleton (signatures only, no bodies)
 * This provides a compact overview of a file's API surface.
 */
function formatSkeletonOutput(
  structure: FileStructure,
  filePath: string,
  languageId: string,
  totalLines: number,
  format: OutputFormat = "plain"
): string {
  const parts: string[] = [];
  const md = format === "markdown";

  parts.push(md ? `## File Skeleton: ${filePath}` : `${filePath} (${languageId}, ${totalLines} lines)`);
  if (md) {
    parts.push("");
    parts.push(`**Language:** ${languageId}`);
    parts.push(`**Total Lines:** ${totalLines}`);
    parts.push("");
  }

  let elementCount = 0;

  // Imports summary (collapsed, max 3)
  if (structure.imports?.length) {
    if (md) {
      parts.push(`### Imports (${structure.imports.length})`);
      const displayImports = structure.imports.slice(0, 3);
      for (const imp of displayImports) {
        parts.push(`- \`${imp}\``);
      }
      if (structure.imports.length > 3) {
        parts.push(`- ... and ${structure.imports.length - 3} more`);
      }
      parts.push("");
    } else {
      const importList = structure.imports.slice(0, 3).join(", ");
      const more = structure.imports.length > 3 ? ` +${structure.imports.length - 3}` : "";
      parts.push(`IMPORTS: ${importList}${more}`);
    }
  }

  // Types and Interfaces (no line numbers in plain - minor elements)
  if (structure.types?.length) {
    if (md) {
      parts.push("### Types/Interfaces");
      for (const t of structure.types) {
        const exported = t.isExported ? "export " : "";
        parts.push(`- \`${exported}${t.signature || t.name}\``);
        elementCount++;
      }
      parts.push("");
    } else {
      const typeList = structure.types.map(t => t.name).join(", ");
      parts.push(`TYPES: ${typeList}`);
      elementCount += structure.types.length;
    }
  }

  // Functions (signatures only)
  const functions = structure.functions?.filter((f) => !f.parent) || [];
  if (functions.length) {
    if (md) {
      parts.push("### Functions");
      for (const fn of functions) {
        const exported = fn.isExported ? "export " : "";
        const asyncMod = fn.isAsync ? "async " : "";
        const sig = fn.signature || `${fn.name}()`;
        parts.push(`- \`${exported}${asyncMod}${sig}\` (lines ${fn.startLine}-${fn.endLine})`);
        elementCount++;
      }
      parts.push("");
    } else {
      const fnList = functions.map(fn => `${fn.name} (${fn.startLine}-${fn.endLine})`).join(", ");
      parts.push(`FUNCTIONS: ${fnList}`);
      elementCount += functions.length;
    }
  }

  // Classes with method signatures
  if (structure.classes?.length) {
    if (md) {
      parts.push("### Classes");
      for (const cls of structure.classes) {
        const exported = cls.isExported ? "export " : "";
        parts.push(`- \`${exported}class ${cls.name}\` (lines ${cls.startLine}-${cls.endLine})`);
        elementCount++;

        const methods = structure.functions?.filter((f) => f.parent === cls.name) || [];
        for (const m of methods) {
          const asyncMod = m.isAsync ? "async " : "";
          const sig = m.signature || `${m.name}()`;
          parts.push(`  - \`${asyncMod}${sig}\``);
        }
      }
      parts.push("");
    } else {
      const clsList = structure.classes.map(cls => {
        const methods = structure.functions?.filter((f) => f.parent === cls.name) || [];
        const methodNames = methods.length > 0 ? ` [${methods.map(m => m.name).join(", ")}]` : "";
        return `${cls.name} (${cls.startLine}-${cls.endLine})${methodNames}`;
      }).join(", ");
      parts.push(`CLASSES: ${clsList}`);
      elementCount += structure.classes.length;
    }
  }

  // Variables (exported only for skeleton)
  const exportedVars = structure.variables?.filter((v) => v.isExported) || [];
  if (exportedVars.length) {
    if (md) {
      parts.push("### Exported Variables");
      for (const v of exportedVars) {
        parts.push(`- \`${v.signature || v.name}\``);
        elementCount++;
      }
      parts.push("");
    } else {
      const varList = exportedVars.map(v => v.name).join(", ");
      parts.push(`EXPORTS: ${varList}`);
      elementCount += exportedVars.length;
    }
  }

  // Skeleton summary
  if (md) {
    parts.push("---");
    parts.push(
      `**Skeleton:** ${elementCount} elements extracted (use \`target\` to get full implementation)`
    );
  }

  return parts.join("\n");
}

export async function executeSmartFileRead(
  args: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = inputSchema.parse(args);
  const workingDir = process.cwd();

  // Validate path for security (sandboxing)
  const validation = validatePath(input.filePath, workingDir);
  if (!validation.safe || !validation.resolvedPath) {
    return {
      content: [{ type: "text", text: validation.error || "Invalid path" }],
    };
  }

  const resolvedPath = validation.resolvedPath;

  // Check if file exists
  try {
    await fs.access(resolvedPath);
  } catch {
    return {
      content: [{ type: "text", text: `File not found: ${resolvedPath}` }],
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
      };
    }
    language = forcedLang;
  } else {
    language = detectLanguageFromPath(resolvedPath);
  }
  const languageId =
    language === "typescript" ? "typescript" : language === "javascript" ? "javascript" : language;

  // Cache setup
  const cache = getGlobalCache();
  const cacheKey = `smart-read:${resolvedPath}:${JSON.stringify({
    target: input.target,
    query: input.query,
    skeleton: input.skeleton,
    lines: input.lines,
    language: input.language,
    format: input.format,
  })}`;

  // Check cache if enabled
  if (input.cache !== false) {
    const cached = await cache.get<string>(cacheKey);
    if (cached.hit && cached.value) {
      return { content: [{ type: "text", text: cached.value + "\n\n_📦 (from cache)_" }] };
    }
  }

  // Helper to cache and return result
  const cacheAndReturn = async (result: string) => {
    if (input.cache !== false) {
      await cache.set(cacheKey, result, { filePath: resolvedPath });
    }
    return { content: [{ type: "text" as const, text: result }] };
  };

  // Priority 1: Extract specific line range (no caching - simple operation)
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
    return { content: [{ type: "text", text: result }] };
  }

  // Check if we have parser support
  if (!hasParserSupport(language)) {
    // Fallback: return full file with warning
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

    return { content: [{ type: "text", text: parts.join("\n") }] };
  }

  // Priority 2: Skeleton mode - signatures only overview
  if (input.skeleton) {
    const structure = parseFile(content, language);
    const skeleton = formatSkeletonOutput(structure, input.filePath, languageId, totalLines, input.format);
    return cacheAndReturn(skeleton);
  }

  // Priority 3: Extract specific target element
  if (input.target) {
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
    return cacheAndReturn(result);
  }

  // Priority 4: Search by query
  if (input.query) {
    const results = searchElements(content, language, input.query);
    const result = formatSearchResults(results, input.filePath, input.query, input.format);
    return cacheAndReturn(result);
  }

  // Default: Return file structure summary
  const structure = parseFile(content, language);
  const summary = formatStructureSummary(structure, input.filePath, input.format);

  return cacheAndReturn(summary);
}

export const smartFileReadTool: ToolDefinition = {
  name: "smart_file_read",
  description:
    "Read files with AST extraction. Modes: structure (default), target, query, lines, skeleton. Supports TS, JS, Python, Go, Rust, PHP, Swift.",
  inputSchema: smartFileReadSchema,
  execute: executeSmartFileRead,
};
