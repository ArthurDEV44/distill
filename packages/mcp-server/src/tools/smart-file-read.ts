/**
 * Smart File Read Tool
 *
 * Reads files intelligently using AST analysis to extract only
 * relevant portions (functions, classes, types) instead of full files.
 *
 * Security: Path sandboxing restricts file access to the working directory.
 *
 * Decomposed (US-011) into `smart-file-read/`:
 *   - support.ts   — helpers, security path validator, schemas, SmartReadContext
 *   - skeleton.ts  — skeleton mode (formatSkeletonOutput + runSkeleton)
 *   - extract.ts   — extract mode (formatExtractedContent + runExtract)
 *   - search.ts    — search mode (formatSearchResults + runSearch)
 * This entry file is the thin dispatcher (path/lang/mode resolution + cache) and
 * the tool definition; `lines` and `full` modes stay inline as they are trivial.
 */

import * as fs from "fs/promises";

import {
  parseFileAsync,
  extractLines,
  formatStructureSummary,
  hasParserSupport,
} from "../ast/index.js";
import type { FileStructure, SupportedLanguage } from "../ast/types.js";
import { detectLanguageFromPath } from "../utils/language-detector.js";
import { maybeWrapInMarker } from "../utils/distill-marker.js";
import type { ToolDefinition } from "./registry.js";
import { getGlobalCache } from "../cache/smart-cache.js";
import { MAX_OUTPUT_CHARS } from "../constants.js";

import {
  validatePath,
  validateLanguage,
  PARSEABLE_LANGUAGES,
  withStructureNote,
  countElements,
  parserUnavailableText,
  smartFileReadSchema,
  smartFileReadOutputSchema,
  inputSchema,
  type ToolResult,
  type SmartReadContext,
} from "./smart-file-read/support.js";
import { runSkeleton } from "./smart-file-read/skeleton.js";
import { runExtract, formatExtractedContent } from "./smart-file-read/extract.js";
import { runSearch } from "./smart-file-read/search.js";

export { smartFileReadSchema } from "./smart-file-read/support.js";

export async function executeSmartFileRead(args: unknown): Promise<ToolResult> {
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

  // Read file content with a single guarded read. No separate fs.access
  // pre-check: that opened a TOCTOU window (file swapped between access and
  // read) and double-stat'd. The guard distinguishes "not found" from other
  // I/O errors and never leaks the absolute host path (uses input.filePath).
  let content: string;
  try {
    content = await fs.readFile(resolvedPath, "utf-8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT") {
      return {
        content: [{ type: "text", text: `File not found: ${input.filePath}` }],
        isError: true,
      };
    }
    const reason =
      code === "EISDIR"
        ? "path is a directory"
        : code === "EACCES"
          ? "permission denied"
          : "could not be read (not a readable text file?)";
    return {
      content: [{ type: "text", text: `Cannot read ${input.filePath}: ${reason}.` }],
      isError: true,
    };
  }
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
  const buildStructured = (text: string, mode: string, truncated = false, elementCount = 0) => ({
    filePath: input.filePath,
    language: languageId,
    totalLines,
    content: text,
    mode,
    outputChars: text.length,
    truncated,
    elementCount,
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

  // US-008: wrap output in the [DISTILL:COMPRESSED] envelope when the mode is
  // a compressing mode AND the emitted text is < 50% of the raw file. Gated by
  // DISTILL_COMPRESSED_MARKERS env var.
  const originalSize = content.length;
  const WRAP_MODES = new Set(["skeleton", "extract", "search"]);
  const wrapIfCompressed = (text: string, mode: string): string => {
    if (!WRAP_MODES.has(mode)) return text;
    if (originalSize === 0) return text;
    const ratio = text.length / originalSize;
    return maybeWrapInMarker(text, {
      ratio,
      method: mode,
      shouldWrap: ratio < 0.5,
    });
  };

  // Check cache if enabled
  if (input.cache !== false) {
    const cached = await cache.get<string>(cacheKey);
    if (cached.hit && cached.value) {
      // Wrap the raw cached payload BEFORE appending the cache annotation so
      // the ratio denominator matches the live (cacheAndReturn) path. Otherwise
      // the extra "_(from cache)_" bytes inflate the ratio and can flip the
      // wrap decision at the 0.5 threshold.
      const wrappedValue = wrapIfCompressed(cached.value, effectiveMode);
      let cachedText = wrappedValue + "\n\n_(from cache)_";
      let cachedTruncated = false;
      if (cachedText.length > MAX_OUTPUT_CHARS) {
        cachedTruncated = true;
        const truncMsg = `\n[... showing truncated output. Use extract mode for specific elements.]`;
        cachedText = cachedText.slice(0, MAX_OUTPUT_CHARS - truncMsg.length) + truncMsg;
      }
      const sc = buildStructured(cached.value, effectiveMode, cachedTruncated);
      sc.outputChars = cachedText.length; // outputChars must match content[0].text.length
      return {
        content: [{ type: "text", text: cachedText }],
        structuredContent: sc,
      };
    }
  }

  // Helper to cache and return result with structuredContent + output budget cap
  const cacheAndReturn = async (result: string, mode: string, elementCount = 0): Promise<ToolResult> => {
    if (input.cache !== false) {
      await cache.set(cacheKey, result, { filePath: resolvedPath });
    }
    let text = result;
    let truncated = false;
    if (text.length > MAX_OUTPUT_CHARS) {
      truncated = true;
      const truncMsg = `\n[... showing truncated output. Use extract mode for specific elements.]`;
      text = text.slice(0, MAX_OUTPUT_CHARS - truncMsg.length) + truncMsg;
    }
    return {
      content: [{ type: "text" as const, text: wrapIfCompressed(text, mode) }],
      structuredContent: buildStructured(text, mode, truncated, elementCount),
    };
  };

  const ctx: SmartReadContext = { input, content, language, languageId, totalLines, cacheAndReturn };

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

  // Skeleton mode: handle before hasParserSupport (runSkeleton returns empty, not error, for unsupported langs)
  if (effectiveMode === "skeleton") {
    return runSkeleton(ctx);
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
    return cacheAndReturn(text, "full");
  }

  // Extract mode
  if (effectiveMode === "extract") {
    return runExtract(ctx);
  }

  // Search mode
  if (effectiveMode === "search") {
    return runSearch(ctx);
  }

  // Full mode (default): return file structure summary
  let structure: FileStructure;
  try {
    structure = await parseFileAsync(content, language);
  } catch {
    return cacheAndReturn(parserUnavailableText(input.filePath, languageId, totalLines), "full");
  }
  const summary = formatStructureSummary(structure, input.filePath, input.format);

  return cacheAndReturn(withStructureNote(summary, structure, content), "full", countElements(structure));
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
    "For unsupported languages, returns full file content (graceful fallback, not error).\n\n" +
    "MARKER: When DISTILL_COMPRESSED_MARKERS=1 is set and the emitted text is " +
    "< 50% of the raw file size, skeleton/extract/search output is wrapped in " +
    "[DISTILL:COMPRESSED ratio=X.XX method=<mode>] ... [/DISTILL:COMPRESSED]. " +
    "Full-file and lines modes are never wrapped.",
  inputSchema: smartFileReadSchema,
  outputSchema: smartFileReadOutputSchema,
  annotations: {
    title: "Smart File Read",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  execute: executeSmartFileRead,
};
