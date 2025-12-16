/**
 * Regex-based Parser for Python, Go, Rust
 *
 * Fallback parser using regex patterns for languages
 * where full AST parsing would require native bindings.
 */

import type {
  CodeElement,
  FileStructure,
  ExtractedContent,
  ExtractionTarget,
  ExtractionOptions,
  LanguageParser,
  SupportedLanguage,
} from "./types.js";
import { createEmptyStructure } from "./types.js";

/**
 * Get line number from character index
 */
function getLineFromIndex(content: string, index: number): number {
  const lines = content.slice(0, index).split("\n");
  return lines.length;
}

/**
 * Find the end of a Python block (based on indentation)
 */
function findPythonBlockEnd(lines: string[], startLine: number): number {
  if (startLine >= lines.length) return startLine;

  const startMatch = lines[startLine]?.match(/^(\s*)/);
  const startIndent = startMatch?.[1]?.length ?? 0;
  let endLine = startLine;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === "") {
      // Empty lines don't end blocks
      continue;
    }

    const currentMatch = line.match(/^(\s*)/);
    const currentIndent = currentMatch?.[1]?.length ?? 0;

    // If we find a line with same or less indentation (and not empty), block ends
    if (currentIndent <= startIndent && line.trim() !== "") {
      break;
    }
    endLine = i;
  }

  return endLine + 1; // 1-indexed
}

/**
 * Find the end of a brace-delimited block (Go, Rust)
 */
function findBraceBlockEnd(content: string, startIndex: number): number {
  let braceCount = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (let i = startIndex; i < content.length; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : "";

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (inString) {
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === "{") {
      braceCount++;
    } else if (char === "}") {
      braceCount--;
      if (braceCount === 0) {
        return i;
      }
    }
  }

  return content.length - 1;
}

// ============================================================================
// Python Parser
// ============================================================================

const PYTHON_IMPORT_PATTERN = /^(?:from\s+[\w.]+\s+)?import\s+.+$/gm;
const PYTHON_FUNCTION_PATTERN = /^(\s*)(async\s+)?def\s+(\w+)\s*\([^)]*\).*?:/gm;
const PYTHON_CLASS_PATTERN = /^(\s*)class\s+(\w+)(?:\([^)]*\))?:/gm;

function extractPythonDocstring(lines: string[], startLine: number): string | undefined {
  const nextLine = lines[startLine]?.trim();
  if (nextLine?.startsWith('"""') || nextLine?.startsWith("'''")) {
    const quote = nextLine.slice(0, 3);
    let docstring = nextLine.slice(3);

    // Single-line docstring
    if (docstring.endsWith(quote)) {
      return docstring.slice(0, -3).trim();
    }

    // Multi-line docstring
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line?.includes(quote)) {
        docstring += "\n" + line.slice(0, line.indexOf(quote));
        return docstring.trim();
      }
      docstring += "\n" + line;
    }
  }
  return undefined;
}

export function parsePython(content: string): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("python", lines.length);

  // Parse imports
  let match;
  while ((match = PYTHON_IMPORT_PATTERN.exec(content)) !== null) {
    const lineNum = getLineFromIndex(content, match.index);
    structure.imports.push({
      type: "import",
      name: match[0].replace(/^from\s+\S+\s+/, "").replace(/^import\s+/, "").split(",")[0]?.trim() ?? "",
      startLine: lineNum,
      endLine: lineNum,
      signature: match[0],
    });
  }

  // Parse functions
  PYTHON_FUNCTION_PATTERN.lastIndex = 0;
  while ((match = PYTHON_FUNCTION_PATTERN.exec(content)) !== null) {
    const startLine = getLineFromIndex(content, match.index);
    const endLine = findPythonBlockEnd(lines, startLine - 1);
    const isAsync = !!match[2];
    const name = match[3] ?? "";

    structure.functions.push({
      type: "function",
      name,
      startLine,
      endLine,
      signature: `${isAsync ? "async " : ""}def ${name}(...)`,
      documentation: extractPythonDocstring(lines, startLine),
      isAsync,
    });
  }

  // Parse classes
  PYTHON_CLASS_PATTERN.lastIndex = 0;
  while ((match = PYTHON_CLASS_PATTERN.exec(content)) !== null) {
    const startLine = getLineFromIndex(content, match.index);
    const endLine = findPythonBlockEnd(lines, startLine - 1);
    const name = match[2] ?? "";

    structure.classes.push({
      type: "class",
      name,
      startLine,
      endLine,
      signature: `class ${name}`,
      documentation: extractPythonDocstring(lines, startLine),
    });
  }

  return structure;
}

// ============================================================================
// Go Parser
// ============================================================================

const GO_IMPORT_PATTERN = /^import\s+(?:\(\s*([^)]+)\s*\)|"([^"]+)")/gm;
const GO_FUNCTION_PATTERN = /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\([^)]*\)[^{]*\{/gm;
const GO_TYPE_PATTERN = /^type\s+(\w+)\s+(?:struct|interface)\s*\{/gm;

function extractGoDoc(lines: string[], startLine: number): string | undefined {
  const comments: string[] = [];
  for (let i = startLine - 2; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line?.startsWith("//")) {
      comments.unshift(line.slice(2).trim());
    } else if (line === "") {
      continue;
    } else {
      break;
    }
  }
  return comments.length > 0 ? comments.join("\n") : undefined;
}

export function parseGo(content: string): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("go", lines.length);

  // Parse imports
  let match;
  while ((match = GO_IMPORT_PATTERN.exec(content)) !== null) {
    const lineNum = getLineFromIndex(content, match.index);
    const imports = match[1] ?? match[2] ?? "";

    // Handle grouped imports
    const importLines = imports.split("\n").filter((l) => l.trim());
    for (const imp of importLines) {
      const cleaned = imp.replace(/["]/g, "").trim();
      if (cleaned) {
        structure.imports.push({
          type: "import",
          name: cleaned.split("/").pop() ?? cleaned,
          startLine: lineNum,
          endLine: lineNum,
          signature: `import "${cleaned}"`,
        });
      }
    }
  }

  // Parse functions
  GO_FUNCTION_PATTERN.lastIndex = 0;
  while ((match = GO_FUNCTION_PATTERN.exec(content)) !== null) {
    const startLine = getLineFromIndex(content, match.index);
    const endIndex = findBraceBlockEnd(content, match.index + match[0].length - 1);
    const endLine = getLineFromIndex(content, endIndex);
    const name = match[1] ?? "";

    structure.functions.push({
      type: "function",
      name,
      startLine,
      endLine,
      signature: `func ${name}(...)`,
      documentation: extractGoDoc(lines, startLine),
    });
  }

  // Parse types (struct/interface)
  GO_TYPE_PATTERN.lastIndex = 0;
  while ((match = GO_TYPE_PATTERN.exec(content)) !== null) {
    const startLine = getLineFromIndex(content, match.index);
    const endIndex = findBraceBlockEnd(content, match.index + match[0].length - 1);
    const endLine = getLineFromIndex(content, endIndex);
    const name = match[1] ?? "";

    structure.types.push({
      type: "type",
      name,
      startLine,
      endLine,
      signature: match[0].replace(/\s*\{$/, ""),
      documentation: extractGoDoc(lines, startLine),
    });
  }

  return structure;
}

// ============================================================================
// Rust Parser
// ============================================================================

const RUST_USE_PATTERN = /^use\s+[^;]+;/gm;
const RUST_FUNCTION_PATTERN = /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)[^{]*\{/gm;
const RUST_STRUCT_PATTERN = /^(?:pub\s+)?struct\s+(\w+)(?:<[^>]*>)?\s*(?:\{|;|\([^)]*\))/gm;
const RUST_IMPL_PATTERN = /^impl(?:<[^>]*>)?\s+(?:(\w+)\s+for\s+)?(\w+)(?:<[^>]*>)?\s*\{/gm;
const RUST_TRAIT_PATTERN = /^(?:pub\s+)?trait\s+(\w+)(?:<[^>]*>)?\s*\{/gm;
const RUST_ENUM_PATTERN = /^(?:pub\s+)?enum\s+(\w+)(?:<[^>]*>)?\s*\{/gm;

function extractRustDoc(lines: string[], startLine: number): string | undefined {
  const comments: string[] = [];
  for (let i = startLine - 2; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line?.startsWith("///") || line?.startsWith("//!")) {
      comments.unshift(line.slice(3).trim());
    } else if (line === "") {
      continue;
    } else {
      break;
    }
  }
  return comments.length > 0 ? comments.join("\n") : undefined;
}

export function parseRust(content: string): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("rust", lines.length);

  // Parse use statements
  let match;
  while ((match = RUST_USE_PATTERN.exec(content)) !== null) {
    const lineNum = getLineFromIndex(content, match.index);
    structure.imports.push({
      type: "import",
      name: match[0].replace(/^use\s+/, "").replace(/;$/, "").split("::").pop()?.replace(/[{},\s]/g, "") ?? "",
      startLine: lineNum,
      endLine: lineNum,
      signature: match[0],
    });
  }

  // Parse functions
  RUST_FUNCTION_PATTERN.lastIndex = 0;
  while ((match = RUST_FUNCTION_PATTERN.exec(content)) !== null) {
    const startLine = getLineFromIndex(content, match.index);
    const endIndex = findBraceBlockEnd(content, match.index + match[0].length - 1);
    const endLine = getLineFromIndex(content, endIndex);
    const name = match[1] ?? "";
    const isAsync = match[0].includes("async ");
    const isExported = match[0].startsWith("pub ");

    structure.functions.push({
      type: "function",
      name,
      startLine,
      endLine,
      signature: `${isExported ? "pub " : ""}${isAsync ? "async " : ""}fn ${name}(...)`,
      documentation: extractRustDoc(lines, startLine),
      isAsync,
      isExported,
    });
  }

  // Parse structs
  RUST_STRUCT_PATTERN.lastIndex = 0;
  while ((match = RUST_STRUCT_PATTERN.exec(content)) !== null) {
    const startLine = getLineFromIndex(content, match.index);
    let endLine = startLine;

    // Check if it's a brace-delimited struct
    if (match[0].includes("{")) {
      const endIndex = findBraceBlockEnd(content, match.index + match[0].length - 1);
      endLine = getLineFromIndex(content, endIndex);
    }

    const name = match[1] ?? "";
    const isExported = match[0].startsWith("pub ");

    structure.classes.push({
      type: "class",
      name,
      startLine,
      endLine,
      signature: `${isExported ? "pub " : ""}struct ${name}`,
      documentation: extractRustDoc(lines, startLine),
      isExported,
    });
  }

  // Parse traits (as interfaces)
  RUST_TRAIT_PATTERN.lastIndex = 0;
  while ((match = RUST_TRAIT_PATTERN.exec(content)) !== null) {
    const startLine = getLineFromIndex(content, match.index);
    const endIndex = findBraceBlockEnd(content, match.index + match[0].length - 1);
    const endLine = getLineFromIndex(content, endIndex);
    const name = match[1] ?? "";
    const isExported = match[0].startsWith("pub ");

    structure.interfaces.push({
      type: "interface",
      name,
      startLine,
      endLine,
      signature: `${isExported ? "pub " : ""}trait ${name}`,
      documentation: extractRustDoc(lines, startLine),
      isExported,
    });
  }

  // Parse enums (as types)
  RUST_ENUM_PATTERN.lastIndex = 0;
  while ((match = RUST_ENUM_PATTERN.exec(content)) !== null) {
    const startLine = getLineFromIndex(content, match.index);
    const endIndex = findBraceBlockEnd(content, match.index + match[0].length - 1);
    const endLine = getLineFromIndex(content, endIndex);
    const name = match[1] ?? "";
    const isExported = match[0].startsWith("pub ");

    structure.types.push({
      type: "type",
      name,
      startLine,
      endLine,
      signature: `${isExported ? "pub " : ""}enum ${name}`,
      documentation: extractRustDoc(lines, startLine),
      isExported,
    });
  }

  return structure;
}

// ============================================================================
// Generic Extraction
// ============================================================================

function extractElement(
  content: string,
  structure: FileStructure,
  target: ExtractionTarget,
  options: ExtractionOptions
): ExtractedContent | null {
  let element: CodeElement | undefined;

  switch (target.type) {
    case "function":
    case "method":
      element = structure.functions.find((f) => f.name === target.name);
      break;
    case "class":
      element = structure.classes.find((c) => c.name === target.name);
      break;
    case "interface":
      element = structure.interfaces.find((i) => i.name === target.name);
      break;
    case "type":
      element = structure.types.find((t) => t.name === target.name);
      break;
    case "variable":
      element = structure.variables.find((v) => v.name === target.name);
      break;
  }

  if (!element) {
    return null;
  }

  const lines = content.split("\n");

  // Find documentation if present
  let startLine = element.startLine;
  if (options.includeComments && element.documentation) {
    // Look for doc comments above
    for (let i = element.startLine - 2; i >= 0; i--) {
      const line = lines[i]?.trim() ?? "";
      if (
        line.startsWith("///") ||
        line.startsWith("//!") ||
        line.startsWith("//") ||
        line.startsWith("#") ||
        line.startsWith('"""') ||
        line.startsWith("'''")
      ) {
        startLine = i + 1;
      } else if (line === "") {
        continue;
      } else {
        break;
      }
    }
  }

  const extractedLines = lines.slice(startLine - 1, element.endLine);
  const extractedCode = extractedLines.join("\n");

  // Find related imports (simple approach: check if import name appears in code)
  const relatedImports: string[] = [];
  if (options.includeImports) {
    for (const imp of structure.imports) {
      if (extractedCode.includes(imp.name)) {
        const importLine = lines[imp.startLine - 1];
        if (importLine && !relatedImports.includes(importLine)) {
          relatedImports.push(importLine);
        }
      }
    }
  }

  return {
    content: extractedCode,
    elements: [element],
    relatedImports,
    startLine,
    endLine: element.endLine,
  };
}

function searchElements(structure: FileStructure, query: string): CodeElement[] {
  const queryLower = query.toLowerCase();
  const results: CodeElement[] = [];

  const allElements = [
    ...structure.functions,
    ...structure.classes,
    ...structure.interfaces,
    ...structure.types,
    ...structure.variables,
  ];

  for (const element of allElements) {
    if (
      element.name.toLowerCase().includes(queryLower) ||
      element.signature?.toLowerCase().includes(queryLower) ||
      element.documentation?.toLowerCase().includes(queryLower)
    ) {
      results.push(element);
    }
  }

  return results;
}

// ============================================================================
// Language Parsers
// ============================================================================

export const pythonParser: LanguageParser = {
  languages: ["python"],

  parse(content: string): FileStructure {
    return parsePython(content);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    const structure = parsePython(content);
    return extractElement(content, structure, target, options);
  },

  searchElements(content: string, query: string): CodeElement[] {
    const structure = parsePython(content);
    return searchElements(structure, query);
  },
};

export const goParser: LanguageParser = {
  languages: ["go"],

  parse(content: string): FileStructure {
    return parseGo(content);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    const structure = parseGo(content);
    return extractElement(content, structure, target, options);
  },

  searchElements(content: string, query: string): CodeElement[] {
    const structure = parseGo(content);
    return searchElements(structure, query);
  },
};

export const rustParser: LanguageParser = {
  languages: ["rust"],

  parse(content: string): FileStructure {
    return parseRust(content);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    const structure = parseRust(content);
    return extractElement(content, structure, target, options);
  },

  searchElements(content: string, query: string): CodeElement[] {
    const structure = parseRust(content);
    return searchElements(structure, query);
  },
};
