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
import type { SessionState } from "../state/session.js";
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
      description: "Absolute or relative path to the file to read",
    },
    target: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["function", "class", "interface", "type", "variable", "method"],
          description: "Type of code element to extract",
        },
        name: {
          type: "string",
          description: "Name of the element to extract",
        },
      },
      required: ["type", "name"],
      description: "Specific code element to extract (function, class, etc.)",
    },
    query: {
      type: "string",
      description: "Search query to find relevant code elements by name or content",
    },
    includeImports: {
      type: "boolean",
      description: "Include related import statements (default: true)",
    },
    includeComments: {
      type: "boolean",
      description: "Include JSDoc/docstring comments (default: true)",
    },
    lines: {
      type: "object",
      properties: {
        start: {
          type: "number",
          description: "Start line number (1-indexed)",
        },
        end: {
          type: "number",
          description: "End line number (1-indexed, inclusive)",
        },
      },
      required: ["start", "end"],
      description: "Extract a specific line range",
    },
    skeleton: {
      type: "boolean",
      description:
        "Extract only function/class signatures without bodies (skeleton mode). Great for getting an overview of a large file.",
    },
    cache: {
      type: "boolean",
      description:
        "Use smart cache for parsed results (default: true). Set to false to bypass cache.",
    },
    language: {
      type: "string",
      description:
        "Force language detection instead of auto-detecting from file extension. Values: typescript, javascript, python, go, rust, php, swift (or aliases: ts, js, py, golang, rs)",
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
});

function formatExtractedContent(
  extracted: ExtractedContent,
  filePath: string,
  language: string,
  totalLines: number,
  includeImports: boolean
): string {
  const parts: string[] = [];
  const element = extracted.elements[0];

  if (element) {
    parts.push(`## Extracted: ${element.type} \`${element.name}\``);
  } else {
    parts.push(`## Extracted: lines ${extracted.startLine}-${extracted.endLine}`);
  }

  parts.push("");
  parts.push(`**File:** ${filePath}`);
  parts.push(`**Lines:** ${extracted.startLine}-${extracted.endLine} of ${totalLines}`);
  parts.push("");

  // Add related imports if present
  if (includeImports && extracted.relatedImports.length > 0) {
    parts.push("```" + language);
    parts.push("// Related imports");
    for (const imp of extracted.relatedImports) {
      parts.push(imp);
    }
    parts.push("");
    parts.push(extracted.content);
    parts.push("```");
  } else {
    parts.push("```" + language);
    parts.push(extracted.content);
    parts.push("```");
  }

  // Token savings estimate
  const extractedLines = extracted.endLine - extracted.startLine + 1;
  const savedLines = totalLines - extractedLines;
  if (savedLines > 0 && totalLines > 10) {
    const savingsPercent = Math.round((savedLines / totalLines) * 100);
    parts.push("");
    parts.push(
      `**Extracted:** ${extractedLines} lines (of ${totalLines}) - ${savingsPercent}% reduction`
    );
  }

  return parts.join("\n");
}

function formatSearchResults(
  results: ReturnType<typeof searchElements>,
  filePath: string,
  query: string
): string {
  const parts: string[] = [];

  parts.push(`## Search Results: "${query}"`);
  parts.push(`**File:** ${filePath}`);
  parts.push(`**Matches:** ${results.length}`);
  parts.push("");

  if (results.length === 0) {
    parts.push("No matches found.");
    return parts.join("\n");
  }

  for (const element of results) {
    const prefix = element.parent ? `${element.parent}.` : "";
    const exported = element.isExported ? " (exported)" : "";
    const async = element.isAsync ? " async" : "";

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
  }

  parts.push("");
  parts.push("Use `target: { type, name }` to extract a specific element.");

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
  totalLines: number
): string {
  const parts: string[] = [];
  parts.push(`## File Skeleton: ${filePath}`);
  parts.push("");
  parts.push(`**Language:** ${languageId}`);
  parts.push(`**Total Lines:** ${totalLines}`);
  parts.push("");

  let elementCount = 0;

  // Imports summary (collapsed)
  if (structure.imports?.length) {
    parts.push(`### Imports (${structure.imports.length})`);
    // Show first 5 imports, summarize rest
    const displayImports = structure.imports.slice(0, 5);
    for (const imp of displayImports) {
      parts.push(`- \`${imp}\``);
    }
    if (structure.imports.length > 5) {
      parts.push(`- ... and ${structure.imports.length - 5} more`);
    }
    parts.push("");
  }

  // Types and Interfaces
  if (structure.types?.length) {
    parts.push("### Types/Interfaces");
    for (const t of structure.types) {
      const exported = t.isExported ? "export " : "";
      parts.push(`- \`${exported}${t.signature || t.name}\``);
      elementCount++;
    }
    parts.push("");
  }

  // Functions (signatures only)
  const functions = structure.functions?.filter((f) => !f.parent) || [];
  if (functions.length) {
    parts.push("### Functions");
    for (const fn of functions) {
      const exported = fn.isExported ? "export " : "";
      const asyncMod = fn.isAsync ? "async " : "";
      const sig = fn.signature || `${fn.name}()`;
      parts.push(`- \`${exported}${asyncMod}${sig}\` (lines ${fn.startLine}-${fn.endLine})`);
      elementCount++;
    }
    parts.push("");
  }

  // Classes with method signatures
  if (structure.classes?.length) {
    parts.push("### Classes");
    for (const cls of structure.classes) {
      const exported = cls.isExported ? "export " : "";
      parts.push(`- \`${exported}class ${cls.name}\` (lines ${cls.startLine}-${cls.endLine})`);
      elementCount++;

      // Methods
      const methods = structure.functions?.filter((f) => f.parent === cls.name) || [];
      for (const m of methods) {
        const asyncMod = m.isAsync ? "async " : "";
        const sig = m.signature || `${m.name}()`;
        parts.push(`  - \`${asyncMod}${sig}\``);
      }
    }
    parts.push("");
  }

  // Variables (exported only for skeleton)
  const exportedVars = structure.variables?.filter((v) => v.isExported) || [];
  if (exportedVars.length) {
    parts.push("### Exported Variables");
    for (const v of exportedVars) {
      parts.push(`- \`${v.signature || v.name}\``);
      elementCount++;
    }
    parts.push("");
  }

  // Skeleton summary
  parts.push("---");
  parts.push(
    `**Skeleton:** ${elementCount} elements extracted (use \`target\` to get full implementation)`
  );

  return parts.join("\n");
}

export async function executeSmartFileRead(
  args: unknown,
  _state: SessionState
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
      false
    );
    return { content: [{ type: "text", text: result }] };
  }

  // Check if we have parser support
  if (!hasParserSupport(language)) {
    // Fallback: return full file with warning
    const parts: string[] = [];
    parts.push(`## File: ${input.filePath}`);
    parts.push("");
    parts.push(`**Language:** ${language} (no AST support, returning full file)`);
    parts.push(`**Lines:** ${totalLines}`);
    parts.push("");
    parts.push("```" + languageId);
    parts.push(content);
    parts.push("```");

    return { content: [{ type: "text", text: parts.join("\n") }] };
  }

  // Priority 2: Skeleton mode - signatures only overview
  if (input.skeleton) {
    const structure = parseFile(content, language);
    const skeleton = formatSkeletonOutput(structure, input.filePath, languageId, totalLines);
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
      input.includeImports
    );
    return cacheAndReturn(result);
  }

  // Priority 4: Search by query
  if (input.query) {
    const results = searchElements(content, language, input.query);
    const result = formatSearchResults(results, input.filePath, input.query);
    return cacheAndReturn(result);
  }

  // Default: Return file structure summary
  const structure = parseFile(content, language);
  const summary = formatStructureSummary(structure, input.filePath);

  return cacheAndReturn(summary);
}

export const smartFileReadTool: ToolDefinition = {
  name: "smart_file_read",
  description: `Read files intelligently using AST analysis.

Instead of reading entire files, extract only what you need:
- **Without arguments**: Get file structure overview (functions, classes, types)
- **With target**: Extract a specific function, class, or type by name
- **With query**: Search for code elements matching a pattern
- **With lines**: Extract a specific line range
- **With skeleton**: Get signatures only (no implementation bodies)

Supports: TypeScript, JavaScript (full AST), Python, Go, Rust, PHP, Swift.

Examples:
- Structure: { "filePath": "src/utils.ts" }
- Extract function: { "filePath": "src/utils.ts", "target": { "type": "function", "name": "parseConfig" } }
- Search: { "filePath": "src/utils.ts", "query": "parse" }
- Lines: { "filePath": "src/utils.ts", "lines": { "start": 10, "end": 50 } }
- Skeleton: { "filePath": "src/utils.ts", "skeleton": true }
- Force language: { "filePath": "src/utils.ts", "language": "typescript" }`,
  inputSchema: smartFileReadSchema,
  execute: executeSmartFileRead,
};
