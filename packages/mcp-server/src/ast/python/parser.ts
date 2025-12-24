/**
 * Python Tree-sitter Parser
 *
 * AST parser for Python using Tree-sitter for accurate code analysis.
 */

import Parser from "web-tree-sitter";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

type Language = Parser.Language;
type Tree = Parser.Tree;
type Node = Parser.SyntaxNode;
import type {
  CodeElement,
  FileStructure,
  ExtractedContent,
  ExtractionTarget,
  ExtractionOptions,
  ParseOptions,
  LanguageParser,
} from "../types.js";
import { createEmptyStructure } from "../types.js";
import {
  extractDocstring,
  getFunctionSignature,
  getClassSignature,
  createCodeElement,
  getBodyNode,
  getImportName,
  getImportSignature,
} from "./utils.js";

// Singleton for lazy initialization
let parserInstance: Parser | null = null;
let pythonLanguage: Language | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the path to the Python WASM file
 */
function getPythonWasmPath(): string {
  // Use createRequire to resolve the path in ESM context
  const require = createRequire(import.meta.url);
  try {
    const wasmDir = dirname(require.resolve("tree-sitter-wasms/package.json"));
    return join(wasmDir, "out", "tree-sitter-python.wasm");
  } catch {
    // Fallback: try common locations
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, "..", "..", "..", "node_modules", "tree-sitter-wasms", "out", "tree-sitter-python.wasm");
  }
}

/**
 * Initialize Tree-sitter and load Python language
 */
async function initParser(): Promise<void> {
  if (parserInstance && pythonLanguage) return;

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    await Parser.init();
    parserInstance = new Parser();
    const wasmPath = getPythonWasmPath();
    // Read WASM file as buffer for reliable loading in all environments
    const wasmBuffer = readFileSync(wasmPath);
    pythonLanguage = await Parser.Language.load(wasmBuffer);
    parserInstance.setLanguage(pythonLanguage);
  })();

  await initPromise;
}

/**
 * Parse Python code and return AST tree
 */
async function parseCode(content: string): Promise<Tree | null> {
  await initParser();
  if (!parserInstance) {
    throw new Error("Parser not initialized");
  }
  return parserInstance.parse(content);
}

/**
 * Check if a node is at module level (not nested inside a class or function)
 */
function isModuleLevel(node: Node): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "function_definition" || parent.type === "class_definition") {
      return false;
    }
    parent = parent.parent;
  }
  return true;
}

/**
 * Check if a function is async
 */
function isAsyncFunction(node: Node): boolean {
  // In Tree-sitter Python, 'async' is a child of function_definition
  for (const child of node.children) {
    if (child.type === "async") return true;
  }
  return false;
}

/**
 * Get the parent class name if this function is a method
 */
function getParentClassName(node: Node): string | undefined {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "class_definition") {
      const nameNode = parent.childForFieldName("name");
      return nameNode?.text;
    }
    parent = parent.parent;
  }
  return undefined;
}

/**
 * Parse Python content and extract structure
 * @param options ParseOptions - set detailed: true for signature/documentation
 */
export function parsePython(content: string, options: ParseOptions = {}): FileStructure {
  const { detailed = false } = options;

  // Use synchronous parsing for the interface
  // Tree-sitter is async for initialization but sync for parsing after that
  let structure: FileStructure | null = null;

  // We need to handle async initialization
  // For now, use a sync approach with cached parser
  if (!parserInstance || !pythonLanguage) {
    // Return empty structure if parser not ready
    // The async version will be called on first use
    return createEmptyStructure("python", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("python", content.split("\n").length);
  }
  structure = extractStructure(tree, content, detailed);

  return structure;
}

/**
 * Async version of parsePython for initial calls
 */
export async function parsePythonAsync(content: string, options: ParseOptions = {}): Promise<FileStructure> {
  const { detailed = false } = options;

  await initParser();
  if (!parserInstance) {
    return createEmptyStructure("python", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("python", content.split("\n").length);
  }
  return extractStructure(tree, content, detailed);
}

/**
 * Extract file structure from parsed tree
 */
function extractStructure(tree: Tree, content: string, detailed: boolean = false): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("python", lines.length);
  const rootNode = tree.rootNode;

  // Walk the tree and extract elements
  walkNode(rootNode, structure, lines, detailed);

  return structure;
}

/**
 * Recursively walk the AST and extract code elements
 * @param detailed When true, extract signature and documentation
 */
function walkNode(node: Node, structure: FileStructure, lines: string[], detailed: boolean): void {
  switch (node.type) {
    case "import_statement":
    case "import_from_statement": {
      const opts: Parameters<typeof createCodeElement>[3] = {};
      if (detailed) {
        opts.signature = getImportSignature(node);
      }
      structure.imports.push(
        createCodeElement("import", getImportName(node), node, opts)
      );
      break;
    }

    case "function_definition": {
      if (isModuleLevel(node)) {
        const nameNode = node.childForFieldName("name");
        const bodyNode = getBodyNode(node);
        const isAsync = isAsyncFunction(node);

        const opts: Parameters<typeof createCodeElement>[3] = { isAsync };
        if (detailed) {
          opts.signature = getFunctionSignature(node, isAsync);
          opts.documentation = extractDocstring(bodyNode);
        }
        structure.functions.push(
          createCodeElement("function", nameNode?.text ?? "unknown", node, opts)
        );
      } else {
        // It's a method
        const nameNode = node.childForFieldName("name");
        const bodyNode = getBodyNode(node);
        const isAsync = isAsyncFunction(node);
        const parentClass = getParentClassName(node);

        const opts: Parameters<typeof createCodeElement>[3] = { isAsync, parent: parentClass };
        if (detailed) {
          opts.signature = getFunctionSignature(node, isAsync);
          opts.documentation = extractDocstring(bodyNode);
        }
        structure.functions.push(
          createCodeElement("method", nameNode?.text ?? "unknown", node, opts)
        );
      }
      break;
    }

    case "class_definition": {
      const nameNode = node.childForFieldName("name");
      const bodyNode = getBodyNode(node);

      const opts: Parameters<typeof createCodeElement>[3] = {};
      if (detailed) {
        opts.signature = getClassSignature(node);
        opts.documentation = extractDocstring(bodyNode);
      }
      structure.classes.push(
        createCodeElement("class", nameNode?.text ?? "unknown", node, opts)
      );

      // Walk into class body to find methods
      if (bodyNode) {
        for (const child of bodyNode.children) {
          walkNode(child, structure, lines, detailed);
        }
      }
      return; // Don't walk children again
    }

    case "expression_statement": {
      // Check for module-level assignments (variables)
      if (isModuleLevel(node)) {
        const assignment = node.firstNamedChild;
        if (assignment?.type === "assignment") {
          const leftNode = assignment.childForFieldName("left");
          if (leftNode?.type === "identifier") {
            const opts: Parameters<typeof createCodeElement>[3] = {};
            if (detailed) {
              opts.signature = node.text.split("\n")[0];
            }
            structure.variables.push(
              createCodeElement("variable", leftNode.text, node, opts)
            );
          }
        }
      }
      break;
    }

    case "decorated_definition": {
      // Let the child function/class handle itself
      for (const child of node.children) {
        walkNode(child, structure, lines, detailed);
      }
      return; // Don't walk again
    }
  }

  // Walk children
  for (const child of node.children) {
    walkNode(child, structure, lines, detailed);
  }
}

/**
 * Extract a specific element from Python code
 */
export async function extractPythonElement(
  content: string,
  target: ExtractionTarget,
  options: ExtractionOptions
): Promise<ExtractedContent | null> {
  const structure = await parsePythonAsync(content);

  let element: CodeElement | undefined;

  switch (target.type) {
    case "function":
    case "method":
      element = structure.functions.find((f) => f.name === target.name);
      break;
    case "class":
      element = structure.classes.find((c) => c.name === target.name);
      break;
    case "variable":
      element = structure.variables.find((v) => v.name === target.name);
      break;
  }

  if (!element) {
    return null;
  }

  const lines = content.split("\n");

  // Find start line (include documentation if requested)
  let startLine = element.startLine;
  if (options.includeComments && element.documentation) {
    // Look for docstrings/comments above the element
    for (let i = element.startLine - 2; i >= 0; i--) {
      const line = lines[i]?.trim() ?? "";
      if (line.startsWith("#") || line.startsWith('"""') || line.startsWith("'''") || line.startsWith("@")) {
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

  // Find related imports
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

/**
 * Search for elements matching a query
 */
export async function searchPythonElements(content: string, query: string): Promise<CodeElement[]> {
  const structure = await parsePythonAsync(content);
  const queryLower = query.toLowerCase();
  const results: CodeElement[] = [];

  const allElements = [...structure.functions, ...structure.classes, ...structure.variables];

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

/**
 * LanguageParser implementation for Python
 */
export const pythonTreeSitterParser: LanguageParser = {
  languages: ["python"],

  parse(content: string, options?: ParseOptions): FileStructure {
    // Synchronous parse - requires parser to be initialized first
    // If not initialized, return empty structure
    // The async initialization will happen on first tool call
    if (!parserInstance || !pythonLanguage) {
      // Trigger async init for next call
      initParser().catch(() => {});
      return parsePython(content, options);
    }
    return parsePython(content, options);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    // This is sync interface but we need async
    // For now, ensure parser is initialized and use sync parsing
    if (!parserInstance || !pythonLanguage) {
      // Can't do async in sync interface, return null
      // Trigger init for next call
      initParser().catch(() => {});
      return null;
    }

    // Extraction needs detailed parsing for proper display
    const structure = parsePython(content, { detailed: true });
    let element: CodeElement | undefined;

    switch (target.type) {
      case "function":
      case "method":
        element = structure.functions.find((f) => f.name === target.name);
        break;
      case "class":
        element = structure.classes.find((c) => c.name === target.name);
        break;
      case "variable":
        element = structure.variables.find((v) => v.name === target.name);
        break;
    }

    if (!element) return null;

    const lines = content.split("\n");
    let startLine = element.startLine;

    if (options.includeComments && element.documentation) {
      for (let i = element.startLine - 2; i >= 0; i--) {
        const line = lines[i]?.trim() ?? "";
        if (line.startsWith("#") || line.startsWith('"""') || line.startsWith("'''") || line.startsWith("@")) {
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
  },

  searchElements(content: string, query: string): CodeElement[] {
    if (!parserInstance || !pythonLanguage) {
      initParser().catch(() => {});
      return [];
    }

    // Search needs detailed parsing to match against signature/documentation
    const structure = parsePython(content, { detailed: true });
    const queryLower = query.toLowerCase();
    const results: CodeElement[] = [];

    const allElements = [...structure.functions, ...structure.classes, ...structure.variables];

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
  },
};

/**
 * Initialize the parser (call this at server startup)
 */
export async function initPythonParser(): Promise<void> {
  await initParser();
}
