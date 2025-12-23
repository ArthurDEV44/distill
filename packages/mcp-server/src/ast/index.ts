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
  LanguageParser,
} from "./types.js";
import { createEmptyStructure } from "./types.js";
import { typescriptParser, parseTypeScript } from "./typescript.js";
import { pythonTreeSitterParser } from "./python/index.js";
import { goTreeSitterParser } from "./go/index.js";
import { rustTreeSitterParser } from "./rust/index.js";
import { phpTreeSitterParser } from "./php/index.js";
import { swiftTreeSitterParser } from "./swift/index.js";

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
 */
export function parseFile(content: string, language: SupportedLanguage): FileStructure {
  const parser = parserRegistry.get(language);

  if (parser) {
    // Special case for JavaScript (use TS parser with isTypeScript=false)
    if (language === "javascript") {
      return parseTypeScript(content, false);
    }
    return parser.parse(content);
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
 * Format file structure as markdown summary
 */
export function formatStructureSummary(structure: FileStructure, filePath: string): string {
  const parts: string[] = [];

  parts.push(`## File Structure: ${filePath}`);
  parts.push("");
  parts.push(`**Language:** ${formatLanguageName(structure.language)}`);
  parts.push(`**Lines:** ${structure.totalLines}`);
  parts.push("");

  // Exports
  if (structure.exports.length > 0) {
    parts.push("### Exports");
    for (const exp of structure.exports) {
      parts.push(`- \`${exp.name}\` (line ${exp.startLine})`);
    }
    parts.push("");
  }

  // Functions
  if (structure.functions.length > 0) {
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
  }

  // Classes
  if (structure.classes.length > 0) {
    parts.push("### Classes");
    for (const cls of structure.classes) {
      const exported = cls.isExported ? "exported " : "";
      parts.push(`- \`${cls.name}\` (${exported}class, lines ${cls.startLine}-${cls.endLine})`);
    }
    parts.push("");
  }

  // Interfaces
  if (structure.interfaces.length > 0) {
    parts.push("### Interfaces");
    for (const iface of structure.interfaces) {
      const exported = iface.isExported ? "exported " : "";
      parts.push(
        `- \`${iface.name}\` (${exported}interface, lines ${iface.startLine}-${iface.endLine})`
      );
    }
    parts.push("");
  }

  // Types
  if (structure.types.length > 0) {
    parts.push("### Types");
    for (const type of structure.types) {
      const exported = type.isExported ? "exported " : "";
      parts.push(`- \`${type.name}\` (${exported}type, lines ${type.startLine}-${type.endLine})`);
    }
    parts.push("");
  }

  // Variables
  if (structure.variables.length > 0) {
    parts.push("### Variables");
    for (const variable of structure.variables) {
      const exported = variable.isExported ? "exported " : "";
      parts.push(
        `- \`${variable.name}\` (${exported}variable, lines ${variable.startLine}-${variable.endLine})`
      );
    }
    parts.push("");
  }

  // Imports (collapsed)
  if (structure.imports.length > 0) {
    parts.push(`### Imports (${structure.imports.length})`);
    const uniqueImports = [...new Set(structure.imports.map((i) => i.name))];
    if (uniqueImports.length <= 5) {
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
