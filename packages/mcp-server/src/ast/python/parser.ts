/**
 * Python Tree-sitter Parser
 *
 * AST parser for Python using Tree-sitter for accurate code analysis.
 */

import { Parser, Language, type Tree, type Node } from "web-tree-sitter";
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  CodeElement,
  FileStructure,
  ExtractedContent,
  ExtractionTarget,
  ExtractionOptions,
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
    pythonLanguage = await Language.load(wasmPath);
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
  // Check if there's an async keyword before def
  let sibling = node.previousSibling;
  while (sibling) {
    if (sibling.type === "async") return true;
    sibling = sibling.previousSibling;
  }

  // Also check parent for decorated_definition
  if (node.parent?.type === "decorated_definition") {
    let decoratedSibling = node.parent.previousSibling;
    while (decoratedSibling) {
      if (decoratedSibling.type === "async") return true;
      decoratedSibling = decoratedSibling.previousSibling;
    }
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
 */
export function parsePython(content: string): FileStructure {
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
  structure = extractStructure(tree, content);

  return structure;
}

/**
 * Async version of parsePython for initial calls
 */
export async function parsePythonAsync(content: string): Promise<FileStructure> {
  await initParser();
  if (!parserInstance) {
    return createEmptyStructure("python", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("python", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Extract file structure from parsed tree
 */
function extractStructure(tree: Tree, content: string): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("python", lines.length);
  const rootNode = tree.rootNode;

  // Walk the tree and extract elements
  walkNode(rootNode, structure, lines);

  return structure;
}

/**
 * Recursively walk the AST and extract code elements
 */
function walkNode(node: Node, structure: FileStructure, lines: string[]): void {
  switch (node.type) {
    case "import_statement":
    case "import_from_statement": {
      structure.imports.push(
        createCodeElement("import", getImportName(node), node, {
          signature: getImportSignature(node),
        })
      );
      break;
    }

    case "function_definition": {
      if (isModuleLevel(node)) {
        const nameNode = node.childForFieldName("name");
        const bodyNode = getBodyNode(node);
        const isAsync = isAsyncFunction(node);

        structure.functions.push(
          createCodeElement("function", nameNode?.text ?? "unknown", node, {
            signature: getFunctionSignature(node, isAsync),
            documentation: extractDocstring(bodyNode),
            isAsync,
          })
        );
      } else {
        // It's a method
        const nameNode = node.childForFieldName("name");
        const bodyNode = getBodyNode(node);
        const isAsync = isAsyncFunction(node);
        const parentClass = getParentClassName(node);

        structure.functions.push(
          createCodeElement("method", nameNode?.text ?? "unknown", node, {
            signature: getFunctionSignature(node, isAsync),
            documentation: extractDocstring(bodyNode),
            isAsync,
            parent: parentClass,
          })
        );
      }
      break;
    }

    case "class_definition": {
      const nameNode = node.childForFieldName("name");
      const bodyNode = getBodyNode(node);

      structure.classes.push(
        createCodeElement("class", nameNode?.text ?? "unknown", node, {
          signature: getClassSignature(node),
          documentation: extractDocstring(bodyNode),
        })
      );

      // Walk into class body to find methods
      if (bodyNode) {
        for (const child of bodyNode.children) {
          walkNode(child, structure, lines);
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
            structure.variables.push(
              createCodeElement("variable", leftNode.text, node, {
                signature: node.text.split("\n")[0],
              })
            );
          }
        }
      }
      break;
    }

    case "decorated_definition": {
      // Let the child function/class handle itself
      for (const child of node.children) {
        walkNode(child, structure, lines);
      }
      return; // Don't walk again
    }
  }

  // Walk children
  for (const child of node.children) {
    walkNode(child, structure, lines);
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

  parse(content: string): FileStructure {
    // Synchronous parse - requires parser to be initialized first
    // If not initialized, return empty structure
    // The async initialization will happen on first tool call
    if (!parserInstance || !pythonLanguage) {
      // Trigger async init for next call
      initParser().catch(() => {});
      return parsePython(content);
    }
    return parsePython(content);
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

    const structure = parsePython(content);
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

    const structure = parsePython(content);
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
