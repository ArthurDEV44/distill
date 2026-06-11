/**
 * Smart File Read — shared support (US-011 decomposition).
 *
 * Holds the cross-mode helpers, the security path validator, the MCP/Zod
 * schemas, and the `SmartReadContext` the entry dispatcher passes to each mode
 * runner. Mode-specific formatting/logic lives in `skeleton.ts` / `extract.ts`
 * / `search.ts`.
 */

import * as fsSync from "fs";
import * as path from "path";
import { z } from "zod";

// US-010: blocked-pattern policy comes from the shared module, not the
// sandbox's internal path validator (no tool→sandbox-internals coupling).
import { getBlockedPatterns } from "../../shared/path-security.js";
import type { FileStructure, SupportedLanguage } from "../../ast/types.js";

export type OutputFormat = "plain" | "markdown";

/** Common MCP tool result shape returned by the tool + every mode runner. */
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

/** Count AST elements (functions, classes, interfaces, types, variables, enums) in a FileStructure. */
export function countElements(s: FileStructure): number {
  return s.functions.length + s.classes.length + s.interfaces.length
    + s.types.length + s.variables.length + s.enums.length;
}

/** A parsed structure with no elements AND no imports/exports — nothing was extracted. */
function isStructureEmpty(s: FileStructure): boolean {
  return countElements(s) === 0 && s.imports.length === 0 && s.exports.length === 0;
}

/**
 * Append an explicit signal when a parse yields no structure, so the LLM is
 * never misled into treating a populated file as empty (US-004). Distinguishes
 * a genuinely empty file ("File is empty.") from a non-empty file that parsed
 * to nothing — the latter is flagged as partial (parser may be unavailable, or
 * the file genuinely has no top-level structure). A structure with any element
 * is returned unchanged.
 */
export function withStructureNote(text: string, structure: FileStructure, content: string): string {
  if (!isStructureEmpty(structure)) return text;
  if (content.trim().length === 0) {
    return `${text}\n\nFile is empty.`;
  }
  return `${text}\n\nStructure partial: no elements extracted. If this file contains code, the parser may be unavailable — retry, or use mode "full" or "lines".`;
}

/** Shared "parser failed to initialize" message (Tree-sitter WASM load error). */
export function parserUnavailableText(filePath: string, languageId: string, totalLines: number): string {
  return `${filePath} (${languageId}, ${totalLines} lines)\nStructure partial: parser unavailable (failed to initialize). Retry, or use mode "full" or "lines".`;
}

// Parseable languages (excluding json, yaml, unknown)
export const PARSEABLE_LANGUAGES: SupportedLanguage[] = [
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
export function validateLanguage(lang: string): SupportedLanguage | null {
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

// Use canonical blocked patterns from shared path-security policy (single source of truth)
const BLOCKED_PATTERNS = getBlockedPatterns();

/**
 * Validate that a file path is safe to read
 * - Must be within the working directory (no directory traversal)
 * - Must not match sensitive file patterns
 */
export function validatePath(
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
export const smartFileReadOutputSchema = {
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

export const inputSchema = z.object({
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

export type SmartReadInput = z.infer<typeof inputSchema>;

/**
 * State + the cache-aware return helper the entry dispatcher builds per request
 * and hands to each mode runner. `cacheAndReturn` caches the raw result, applies
 * the output-budget cap, and wraps in the [DISTILL:COMPRESSED] envelope.
 */
export interface SmartReadContext {
  input: SmartReadInput;
  content: string;
  language: SupportedLanguage;
  languageId: string;
  totalLines: number;
  cacheAndReturn: (result: string, mode: string, elementCount?: number) => Promise<ToolResult>;
}
