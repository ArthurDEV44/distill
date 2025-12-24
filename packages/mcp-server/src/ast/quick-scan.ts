/**
 * Quick Scan - Regex-based fast scanning for top-level declarations
 *
 * Provides 90% faster parsing for skeleton mode by using regex
 * instead of full AST parsing. Trade-off: no endLine, no signatures.
 */

import type { SupportedLanguage, FileStructure, CodeElement } from "./types.js";

interface QuickElement {
  name: string;
  line: number;
  exported: boolean;
  isAsync?: boolean;
}

interface QuickScanResult {
  functions: QuickElement[];
  classes: QuickElement[];
  interfaces: QuickElement[];
  types: QuickElement[];
  variables: QuickElement[];
  imports: string[];
}

// TypeScript/JavaScript patterns
const TS_PATTERNS = {
  // export async function foo(
  function: /^\s*(export\s+)?(async\s+)?function\s+(\w+)/,
  // export class Foo
  class: /^\s*(export\s+)?class\s+(\w+)/,
  // export interface Foo
  interface: /^\s*(export\s+)?interface\s+(\w+)/,
  // export type Foo
  type: /^\s*(export\s+)?type\s+(\w+)/,
  // export const foo = or export const foo:
  constExport: /^\s*export\s+const\s+(\w+)\s*[=:]/,
  // import ... from or import "
  import: /^\s*import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?["']([^"']+)["']/,
};

// Python patterns
const PY_PATTERNS = {
  // def foo(
  function: /^def\s+(\w+)\s*\(/,
  // async def foo(
  asyncFunction: /^async\s+def\s+(\w+)\s*\(/,
  // class Foo:
  class: /^class\s+(\w+)/,
  // from x import y or import x
  import: /^(?:from\s+(\S+)\s+import|import\s+(\S+))/,
};

// Go patterns
const GO_PATTERNS = {
  // func Foo( or func (r *Receiver) Foo(
  function: /^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/,
  // type Foo struct/interface
  type: /^type\s+(\w+)\s+(?:struct|interface)/,
  // import "x" or import ( multiline )
  import: /^import\s+(?:\(\s*)?["']?([^"'\s)]+)/,
};

/**
 * Quick scan TypeScript/JavaScript content
 */
export function quickScanTypeScript(content: string): QuickScanResult {
  const lines = content.split("\n");
  const result: QuickScanResult = {
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    variables: [],
    imports: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lineNum = i + 1; // 1-indexed

    // Functions
    const fnMatch = line.match(TS_PATTERNS.function);
    if (fnMatch?.[3]) {
      result.functions.push({
        name: fnMatch[3],
        line: lineNum,
        exported: !!fnMatch[1],
        isAsync: !!fnMatch[2],
      });
      continue;
    }

    // Classes
    const classMatch = line.match(TS_PATTERNS.class);
    if (classMatch?.[2]) {
      result.classes.push({
        name: classMatch[2],
        line: lineNum,
        exported: !!classMatch[1],
      });
      continue;
    }

    // Interfaces
    const ifaceMatch = line.match(TS_PATTERNS.interface);
    if (ifaceMatch?.[2]) {
      result.interfaces.push({
        name: ifaceMatch[2],
        line: lineNum,
        exported: !!ifaceMatch[1],
      });
      continue;
    }

    // Types
    const typeMatch = line.match(TS_PATTERNS.type);
    if (typeMatch?.[2]) {
      result.types.push({
        name: typeMatch[2],
        line: lineNum,
        exported: !!typeMatch[1],
      });
      continue;
    }

    // Exported const
    const constMatch = line.match(TS_PATTERNS.constExport);
    if (constMatch?.[1]) {
      result.variables.push({
        name: constMatch[1],
        line: lineNum,
        exported: true,
      });
      continue;
    }

    // Imports
    const importMatch = line.match(TS_PATTERNS.import);
    if (importMatch?.[1]) {
      result.imports.push(importMatch[1]);
    }
  }

  return result;
}

/**
 * Quick scan Python content
 */
export function quickScanPython(content: string): QuickScanResult {
  const lines = content.split("\n");
  const result: QuickScanResult = {
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    variables: [],
    imports: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lineNum = i + 1;

    // Async functions
    const asyncMatch = line.match(PY_PATTERNS.asyncFunction);
    if (asyncMatch?.[1]) {
      result.functions.push({
        name: asyncMatch[1],
        line: lineNum,
        exported: true, // Python doesn't have export keyword
        isAsync: true,
      });
      continue;
    }

    // Functions
    const fnMatch = line.match(PY_PATTERNS.function);
    if (fnMatch?.[1]) {
      result.functions.push({
        name: fnMatch[1],
        line: lineNum,
        exported: true,
      });
      continue;
    }

    // Classes
    const classMatch = line.match(PY_PATTERNS.class);
    if (classMatch?.[1]) {
      result.classes.push({
        name: classMatch[1],
        line: lineNum,
        exported: true,
      });
      continue;
    }

    // Imports
    const importMatch = line.match(PY_PATTERNS.import);
    const importName = importMatch?.[1] || importMatch?.[2];
    if (importName) {
      result.imports.push(importName);
    }
  }

  return result;
}

/**
 * Quick scan Go content
 */
export function quickScanGo(content: string): QuickScanResult {
  const lines = content.split("\n");
  const result: QuickScanResult = {
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    variables: [],
    imports: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lineNum = i + 1;

    // Functions
    const fnMatch = line.match(GO_PATTERNS.function);
    const fnName = fnMatch?.[1];
    if (fnName && fnName.length > 0) {
      const firstChar = fnName[0]!;
      result.functions.push({
        name: fnName,
        line: lineNum,
        exported: firstChar === firstChar.toUpperCase(), // Go: uppercase = exported
      });
      continue;
    }

    // Types (struct/interface)
    const typeMatch = line.match(GO_PATTERNS.type);
    const typeName = typeMatch?.[1];
    if (typeName && typeName.length > 0) {
      const firstChar = typeName[0]!;
      result.types.push({
        name: typeName,
        line: lineNum,
        exported: firstChar === firstChar.toUpperCase(),
      });
      continue;
    }

    // Imports
    const importMatch = line.match(GO_PATTERNS.import);
    if (importMatch?.[1]) {
      result.imports.push(importMatch[1]);
    }
  }

  return result;
}

/**
 * Convert QuickScanResult to FileStructure
 */
function toCodeElement(el: QuickElement, type: string): CodeElement {
  return {
    type: type as CodeElement["type"],
    name: el.name,
    startLine: el.line,
    endLine: el.line, // Quick mode: no endLine
    isExported: el.exported,
    isAsync: el.isAsync,
  };
}

export function convertToFileStructure(
  scan: QuickScanResult,
  language: SupportedLanguage,
  totalLines: number
): FileStructure {
  return {
    language,
    totalLines,
    functions: scan.functions.map((f) => toCodeElement(f, "function")),
    classes: scan.classes.map((c) => toCodeElement(c, "class")),
    interfaces: scan.interfaces.map((i) => toCodeElement(i, "interface")),
    types: scan.types.map((t) => toCodeElement(t, "type")),
    variables: scan.variables.map((v) => toCodeElement(v, "variable")),
    imports: scan.imports.map((name) => ({
      type: "import" as const,
      name,
      startLine: 0,
      endLine: 0,
    })),
    exports: [], // Not tracked in quick mode
  };
}

/**
 * Quick scan content based on language
 */
export function quickScan(
  content: string,
  language: SupportedLanguage
): FileStructure {
  const totalLines = content.split("\n").length;

  let scanResult: QuickScanResult;

  switch (language) {
    case "typescript":
    case "javascript":
      scanResult = quickScanTypeScript(content);
      break;
    case "python":
      scanResult = quickScanPython(content);
      break;
    case "go":
      scanResult = quickScanGo(content);
      break;
    default:
      // Fallback: empty structure for unsupported languages
      scanResult = {
        functions: [],
        classes: [],
        interfaces: [],
        types: [],
        variables: [],
        imports: [],
      };
  }

  return convertToFileStructure(scanResult, language, totalLines);
}
