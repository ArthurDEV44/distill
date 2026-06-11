/**
 * AST Parser Router
 *
 * Routes parsing requests to the appropriate language parser.
 */

export type {
  SupportedLanguage,
  ElementType,
  CodeElement,
  FileStructure,
  ExtractedContent,
  ExtractionTarget,
  ExtractionOptions,
  ParseOptions,
  LanguageParser,
} from "./types.js";

export { createEmptyStructure } from "./types.js";

import type {
  SupportedLanguage,
  CodeElement,
  FileStructure,
  ExtractedContent,
  ExtractionTarget,
  ExtractionOptions,
  ParseOptions,
  LanguageParser,
} from "./types.js";
import { createEmptyStructure } from "./types.js";
import { typescriptParser, parseTypeScript } from "./typescript.js";
import { quickScan } from "./quick-scan.js";
import { pythonTreeSitterParser } from "./python/index.js";
import { goTreeSitterParser } from "./go/index.js";
import { rustTreeSitterParser } from "./rust/index.js";
import { phpTreeSitterParser } from "./php/index.js";
import { swiftTreeSitterParser } from "./swift/index.js";

// Async parse/extract/search variants. These await Tree-sitter WASM init before
// parsing, so the FIRST call of a cold session returns the real structure
// instead of the empty placeholder the sync parsers emit while WASM warms up
// (US-004). TS/JS use the TS Compiler API (no WASM) and never need these.
import { parsePythonAsync, extractPythonElement, searchPythonElements } from "./python/index.js";
import { parseGoAsync, extractGoElement, searchGoElements } from "./go/index.js";
import { parseRustAsync, extractRustElement, searchRustElements } from "./rust/index.js";
import { parsePhpAsync, extractPhpElement, searchPhpElements } from "./php/index.js";
import { parseSwiftAsync, extractSwiftElement, searchSwiftElements } from "./swift/index.js";

/**
 * Registry of language parsers
 */
const parserRegistry: Map<SupportedLanguage, LanguageParser> = new Map([
  ["typescript", typescriptParser],
  ["javascript", typescriptParser], // JS uses same parser
  ["python", pythonTreeSitterParser], // Tree-sitter based parser
  ["go", goTreeSitterParser], // Tree-sitter based parser
  ["rust", rustTreeSitterParser], // Tree-sitter based parser
  ["php", phpTreeSitterParser], // Tree-sitter based parser
  ["swift", swiftTreeSitterParser], // Tree-sitter based parser
]);

/**
 * Get parser for a language
 */
export function getParser(language: SupportedLanguage): LanguageParser | undefined {
  return parserRegistry.get(language);
}

/**
 * Check if a language has parser support
 */
export function hasParserSupport(language: SupportedLanguage): boolean {
  return parserRegistry.has(language);
}

/**
 * Parse file content and return structure
 * @param mode 'full' for AST parsing, 'quick' for regex-based scan (faster, less detail)
 * @param options ParseOptions to control extraction (detailed: true for signature/documentation)
 */
export function parseFile(
  content: string,
  language: SupportedLanguage,
  mode: "full" | "quick" = "full",
  options: ParseOptions = {}
): FileStructure {
  // Quick mode: use regex-based scan (90% faster, no endLine/signatures)
  if (mode === "quick") {
    return quickScan(content, language);
  }

  const parser = parserRegistry.get(language);

  if (parser) {
    // Special case for JavaScript (use TS parser with isTypeScript=false)
    if (language === "javascript") {
      return parseTypeScript(content, false, options);
    }
    return parser.parse(content, options);
  }

  // No parser available - return minimal structure
  return createEmptyStructure(language, content.split("\n").length);
}

/**
 * Extract a specific element from content
 */
export function extractElement(
  content: string,
  language: SupportedLanguage,
  target: ExtractionTarget,
  options: ExtractionOptions
): ExtractedContent | null {
  const parser = parserRegistry.get(language);

  if (!parser) {
    return null;
  }

  return parser.extractElement(content, target, options);
}

/**
 * Search for elements matching a query
 */
export function searchElements(
  content: string,
  language: SupportedLanguage,
  query: string
): CodeElement[] {
  const parser = parserRegistry.get(language);

  if (!parser) {
    return [];
  }

  return parser.searchElements(content, query);
}

// ============================================================================
// Async parse path (US-004) — awaits Tree-sitter WASM init so a cold session
// never returns a silently-empty structure for a populated file.
// ============================================================================

type AsyncParseFn = (content: string) => Promise<FileStructure>;
type AsyncExtractFn = (
  content: string,
  target: ExtractionTarget,
  options: ExtractionOptions
) => Promise<ExtractedContent | null>;
type AsyncSearchFn = (content: string, query: string) => Promise<CodeElement[]>;

/** Languages whose parser is Tree-sitter WASM-backed (need async init). */
const asyncParserRegistry: Map<SupportedLanguage, AsyncParseFn> = new Map([
  ["python", parsePythonAsync],
  ["go", parseGoAsync],
  ["rust", parseRustAsync],
  ["php", parsePhpAsync],
  ["swift", parseSwiftAsync],
]);

const asyncExtractorRegistry: Map<SupportedLanguage, AsyncExtractFn> = new Map([
  ["python", extractPythonElement],
  ["go", extractGoElement],
  ["rust", extractRustElement],
  ["php", extractPhpElement],
  ["swift", extractSwiftElement],
]);

const asyncSearcherRegistry: Map<SupportedLanguage, AsyncSearchFn> = new Map([
  ["python", searchPythonElements],
  ["go", searchGoElements],
  ["rust", searchRustElements],
  ["php", searchPhpElements],
  ["swift", searchSwiftElements],
]);

/**
 * True for languages whose parser requires async Tree-sitter WASM init. TS/JS
 * (TS Compiler API) and json/yaml/unknown return false — their sync parse is
 * already complete and correct on the first call.
 */
export function isTreeSitterLanguage(language: SupportedLanguage): boolean {
  return asyncParserRegistry.has(language);
}

/**
 * Async counterpart of {@link parseFile}. For the 5 Tree-sitter grammars it
 * awaits WASM init (so the first cold call returns the real structure, not the
 * empty placeholder the sync path emits); for everything else it falls through
 * to the sync path, which has no init to wait for. Throws if WASM init fails —
 * callers can distinguish "parser unavailable" from "no structure".
 */
export async function parseFileAsync(
  content: string,
  language: SupportedLanguage,
  mode: "full" | "quick" = "full",
  options: ParseOptions = {}
): Promise<FileStructure> {
  if (mode === "quick") return quickScan(content, language);
  const asyncParse = asyncParserRegistry.get(language);
  if (asyncParse) return asyncParse(content);
  return parseFile(content, language, mode, options);
}

/** Async counterpart of {@link extractElement} — awaits Tree-sitter init. */
export async function extractElementAsync(
  content: string,
  language: SupportedLanguage,
  target: ExtractionTarget,
  options: ExtractionOptions
): Promise<ExtractedContent | null> {
  const asyncExtract = asyncExtractorRegistry.get(language);
  if (asyncExtract) return asyncExtract(content, target, options);
  return extractElement(content, language, target, options);
}

/** Async counterpart of {@link searchElements} — awaits Tree-sitter init. */
export async function searchElementsAsync(
  content: string,
  language: SupportedLanguage,
  query: string
): Promise<CodeElement[]> {
  const asyncSearch = asyncSearcherRegistry.get(language);
  if (asyncSearch) return asyncSearch(content, query);
  return searchElements(content, language, query);
}

/**
 * Extract lines from content
 */
export function extractLines(
  content: string,
  startLine: number,
  endLine: number
): ExtractedContent {
  const lines = content.split("\n");
  const totalLines = lines.length;

  // Clamp line numbers
  const start = Math.max(1, Math.min(startLine, totalLines));
  const end = Math.max(start, Math.min(endLine, totalLines));

  const extractedLines = lines.slice(start - 1, end);

  return {
    content: extractedLines.join("\n"),
    elements: [],
    relatedImports: [],
    startLine: start,
    endLine: end,
  };
}

/**
 * Format file structure as summary
 */
export function formatStructureSummary(
  structure: FileStructure,
  filePath: string,
  format: "plain" | "markdown" = "plain"
): string {
  const parts: string[] = [];
  const md = format === "markdown";

  if (md) {
    parts.push(`## File Structure: ${filePath}`);
    parts.push("");
    parts.push(`**Language:** ${formatLanguageName(structure.language)}`);
    parts.push(`**Lines:** ${structure.totalLines}`);
    parts.push("");
  } else {
    parts.push(`${filePath} (${formatLanguageName(structure.language)}, ${structure.totalLines} lines)`);
  }

  // Exports
  if (structure.exports.length > 0) {
    if (md) {
      parts.push("### Exports");
      for (const exp of structure.exports) {
        parts.push(`- \`${exp.name}\` (line ${exp.startLine})`);
      }
      parts.push("");
    } else {
      const expList = structure.exports.map(e => e.name).join(", ");
      parts.push(`EXPORTS: ${expList}`);
    }
  }

  // Functions
  if (structure.functions.length > 0) {
    if (md) {
      parts.push("### Functions");
      for (const func of structure.functions) {
        const prefix = func.type === "method" ? `${func.parent}.` : "";
        const async = func.isAsync ? "async " : "";
        const exported = func.isExported ? "exported " : "";
        parts.push(
          `- \`${prefix}${func.name}\` (${exported}${async}${func.type}, lines ${func.startLine}-${func.endLine})`
        );
      }
      parts.push("");
    } else {
      const fnList = structure.functions.map(f => `${f.name} (${f.startLine}-${f.endLine})`).join(", ");
      parts.push(`FUNCTIONS: ${fnList}`);
    }
  }

  // Classes
  if (structure.classes.length > 0) {
    if (md) {
      parts.push("### Classes");
      for (const cls of structure.classes) {
        const exported = cls.isExported ? "exported " : "";
        parts.push(`- \`${cls.name}\` (${exported}class, lines ${cls.startLine}-${cls.endLine})`);
      }
      parts.push("");
    } else {
      const clsList = structure.classes.map(c => `${c.name} (${c.startLine}-${c.endLine})`).join(", ");
      parts.push(`CLASSES: ${clsList}`);
    }
  }

  // Interfaces (no line numbers in plain - minor elements)
  if (structure.interfaces.length > 0) {
    if (md) {
      parts.push("### Interfaces");
      for (const iface of structure.interfaces) {
        const exported = iface.isExported ? "exported " : "";
        parts.push(
          `- \`${iface.name}\` (${exported}interface, lines ${iface.startLine}-${iface.endLine})`
        );
      }
      parts.push("");
    } else {
      const ifList = structure.interfaces.map(i => i.name).join(", ");
      parts.push(`INTERFACES: ${ifList}`);
    }
  }

  // Types (no line numbers in plain - minor elements)
  if (structure.types.length > 0) {
    if (md) {
      parts.push("### Types");
      for (const type of structure.types) {
        const exported = type.isExported ? "exported " : "";
        parts.push(`- \`${type.name}\` (${exported}type, lines ${type.startLine}-${type.endLine})`);
      }
      parts.push("");
    } else {
      const typeList = structure.types.map(t => t.name).join(", ");
      parts.push(`TYPES: ${typeList}`);
    }
  }

  // Variables (exported only)
  const exportedVars = structure.variables.filter(v => v.isExported);
  if (exportedVars.length > 0) {
    if (md) {
      parts.push("### Exported Variables");
      for (const variable of exportedVars) {
        parts.push(
          `- \`${variable.name}\` (variable, lines ${variable.startLine}-${variable.endLine})`
        );
      }
      parts.push("");
    } else {
      const varList = exportedVars.map(v => v.name).join(", ");
      parts.push(`EXPORTS: ${varList}`);
    }
  }

  // Imports (collapsed, max 3)
  if (structure.imports.length > 0) {
    const uniqueImports = [...new Set(structure.imports.map((i) => i.name))];
    if (md) {
      parts.push(`### Imports (${structure.imports.length})`);
      if (uniqueImports.length <= 3) {
        for (const name of uniqueImports) {
          parts.push(`- \`${name}\``);
        }
      } else {
        for (const name of uniqueImports.slice(0, 3)) {
          parts.push(`- \`${name}\``);
        }
        parts.push(`- ... and ${uniqueImports.length - 3} more`);
      }
      parts.push("");
    } else {
      const importList = uniqueImports.slice(0, 3).join(", ");
      const more = uniqueImports.length > 3 ? ` +${uniqueImports.length - 3}` : "";
      parts.push(`IMPORTS: ${importList}${more}`);
    }
  }

  return parts.join("\n");
}

function formatLanguageName(language: SupportedLanguage): string {
  const names: Record<SupportedLanguage, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    python: "Python",
    go: "Go",
    rust: "Rust",
    php: "PHP",
    swift: "Swift",
    json: "JSON",
    yaml: "YAML",
    unknown: "Unknown",
  };
  return names[language];
}
