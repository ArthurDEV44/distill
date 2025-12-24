/**
 * PHP Tree-sitter Parser
 *
 * AST parser for PHP using Tree-sitter for accurate code analysis.
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
  extractPhpDoc,
  isPublic,
  getFunctionSignature,
  getMethodSignature,
  getClassSignature,
  getInterfaceSignature,
  getTraitSignature,
  getUsePath,
  getUseShortName,
  getConstSignature,
  getConstName,
  createCodeElement,
} from "./utils.js";

// Singleton for lazy initialization
let parserInstance: Parser | null = null;
let phpLanguage: Language | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the path to the PHP WASM file
 */
function getPhpWasmPath(): string {
  const require = createRequire(import.meta.url);
  try {
    const wasmDir = dirname(require.resolve("tree-sitter-wasms/package.json"));
    return join(wasmDir, "out", "tree-sitter-php.wasm");
  } catch {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, "..", "..", "..", "node_modules", "tree-sitter-wasms", "out", "tree-sitter-php.wasm");
  }
}

/**
 * Initialize Tree-sitter and load PHP language
 */
async function initParser(): Promise<void> {
  if (parserInstance && phpLanguage) return;

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    await Parser.init();
    parserInstance = new Parser();
    const wasmPath = getPhpWasmPath();
    // Read WASM file as buffer for reliable loading in all environments
    const wasmBuffer = readFileSync(wasmPath);
    phpLanguage = await Parser.Language.load(wasmBuffer);
    parserInstance.setLanguage(phpLanguage);
  })();

  await initPromise;
}

/**
 * Parse PHP content and extract structure
 */
export function parsePhp(content: string): FileStructure {
  if (!parserInstance || !phpLanguage) {
    initParser().catch(() => {});
    return createEmptyStructure("php", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("php", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Async version of parsePhp
 */
export async function parsePhpAsync(content: string): Promise<FileStructure> {
  await initParser();
  if (!parserInstance) {
    return createEmptyStructure("php", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("php", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Extract file structure from parsed tree
 */
function extractStructure(tree: Tree, content: string): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("php", lines.length);
  const rootNode = tree.rootNode;

  walkNode(rootNode, structure, lines, undefined);

  return structure;
}

/**
 * Recursively walk the AST and extract code elements
 */
function walkNode(
  node: Node,
  structure: FileStructure,
  lines: string[],
  currentClassName: string | undefined
): void {
  switch (node.type) {
    case "namespace_use_declaration": {
      const usePath = getUsePath(node);
      const name = getUseShortName(usePath);

      structure.imports.push(
        createCodeElement("import", name, node, {
          signature: `use ${usePath}`,
        })
      );
      return;
    }

    case "function_definition": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";

      structure.functions.push(
        createCodeElement("function", name, node, {
          signature: getFunctionSignature(node),
          documentation: extractPhpDoc(node, lines),
          isExported: true, // PHP functions are always "exported" in their scope
        })
      );
      return;
    }

    case "class_declaration": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";

      structure.classes.push(
        createCodeElement("class", name, node, {
          signature: getClassSignature(node),
          documentation: extractPhpDoc(node, lines),
          isExported: true,
        })
      );

      // Walk into class body for methods
      const body = node.childForFieldName("body");
      if (body) {
        for (const child of body.children) {
          walkNode(child, structure, lines, name);
        }
      }
      return;
    }

    case "interface_declaration": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";

      structure.interfaces.push(
        createCodeElement("interface", name, node, {
          signature: getInterfaceSignature(node),
          documentation: extractPhpDoc(node, lines),
          isExported: true,
        })
      );

      // Walk into interface body for method signatures
      const body = node.childForFieldName("body");
      if (body) {
        for (const child of body.children) {
          walkNode(child, structure, lines, name);
        }
      }
      return;
    }

    case "trait_declaration": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";

      // Traits are treated as classes
      structure.classes.push(
        createCodeElement("class", name, node, {
          signature: getTraitSignature(node),
          documentation: extractPhpDoc(node, lines),
          isExported: true,
        })
      );

      // Walk into trait body for methods
      const body = node.childForFieldName("body");
      if (body) {
        for (const child of body.children) {
          walkNode(child, structure, lines, name);
        }
      }
      return;
    }

    case "method_declaration": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";
      const isExported = isPublic(node);

      structure.functions.push(
        createCodeElement("method", name, node, {
          signature: getMethodSignature(node),
          documentation: extractPhpDoc(node, lines),
          isExported,
          parent: currentClassName,
        })
      );
      return;
    }

    case "const_declaration": {
      const constName = getConstName(node);

      structure.variables.push(
        createCodeElement("variable", constName, node, {
          signature: getConstSignature(node),
          documentation: extractPhpDoc(node, lines),
          isExported: isPublic(node),
          parent: currentClassName,
        })
      );
      return;
    }
  }

  // Walk children
  for (const child of node.children) {
    walkNode(child, structure, lines, currentClassName);
  }
}

/**
 * Extract a specific element from PHP code
 */
export async function extractPhpElement(
  content: string,
  target: ExtractionTarget,
  options: ExtractionOptions
): Promise<ExtractedContent | null> {
  const structure = await parsePhpAsync(content);

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

  // Find start line (include documentation if requested)
  let startLine = element.startLine;
  if (options.includeComments && element.documentation) {
    for (let i = element.startLine - 2; i >= 0; i--) {
      const line = lines[i]?.trim() ?? "";
      if (line.startsWith("/**") || line.startsWith("*") || line.endsWith("*/")) {
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
export async function searchPhpElements(content: string, query: string): Promise<CodeElement[]> {
  const structure = await parsePhpAsync(content);
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

/**
 * LanguageParser implementation for PHP
 */
export const phpTreeSitterParser: LanguageParser = {
  languages: ["php"],

  parse(content: string, _options?: ParseOptions): FileStructure {
    if (!parserInstance || !phpLanguage) {
      initParser().catch(() => {});
      return parsePhp(content);
    }
    return parsePhp(content);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    if (!parserInstance || !phpLanguage) {
      initParser().catch(() => {});
      return null;
    }

    const structure = parsePhp(content);
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

    if (!element) return null;

    const lines = content.split("\n");
    let startLine = element.startLine;

    if (options.includeComments && element.documentation) {
      for (let i = element.startLine - 2; i >= 0; i--) {
        const line = lines[i]?.trim() ?? "";
        if (line.startsWith("/**") || line.startsWith("*") || line.endsWith("*/")) {
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
    if (!parserInstance || !phpLanguage) {
      initParser().catch(() => {});
      return [];
    }

    const structure = parsePhp(content);
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
  },
};

/**
 * Initialize the PHP parser
 */
export async function initPhpParser(): Promise<void> {
  await initParser();
}
