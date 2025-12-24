/**
 * Rust Tree-sitter Parser
 *
 * AST parser for Rust using Tree-sitter for accurate code analysis.
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
  extractRustDoc,
  hasVisibility,
  isAsyncFn,
  getFunctionSignature,
  getStructSignature,
  getEnumSignature,
  getTraitSignature,
  getImplSignature,
  getImplTypeName,
  getUsePath,
  getUseShortName,
  getConstSignature,
  getTypeAliasSignature,
  createCodeElement,
} from "./utils.js";

// Singleton for lazy initialization
let parserInstance: Parser | null = null;
let rustLanguage: Language | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the path to the Rust WASM file
 */
function getRustWasmPath(): string {
  const require = createRequire(import.meta.url);
  try {
    const wasmDir = dirname(require.resolve("tree-sitter-wasms/package.json"));
    return join(wasmDir, "out", "tree-sitter-rust.wasm");
  } catch {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, "..", "..", "..", "node_modules", "tree-sitter-wasms", "out", "tree-sitter-rust.wasm");
  }
}

/**
 * Initialize Tree-sitter and load Rust language
 */
async function initParser(): Promise<void> {
  if (parserInstance && rustLanguage) return;

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    await Parser.init();
    parserInstance = new Parser();
    const wasmPath = getRustWasmPath();
    // Read WASM file as buffer for reliable loading in all environments
    const wasmBuffer = readFileSync(wasmPath);
    rustLanguage = await Parser.Language.load(wasmBuffer);
    parserInstance.setLanguage(rustLanguage);
  })();

  await initPromise;
}

/**
 * Check if a node is at module level (top level)
 */
function isModuleLevel(node: Node): boolean {
  return node.parent?.type === "source_file";
}

/**
 * Parse Rust content and extract structure
 */
export function parseRust(content: string): FileStructure {
  if (!parserInstance || !rustLanguage) {
    initParser().catch(() => {});
    return createEmptyStructure("rust", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("rust", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Async version of parseRust
 */
export async function parseRustAsync(content: string): Promise<FileStructure> {
  await initParser();
  if (!parserInstance) {
    return createEmptyStructure("rust", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("rust", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Extract file structure from parsed tree
 */
function extractStructure(tree: Tree, content: string): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("rust", lines.length);
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
  currentImplType: string | undefined
): void {
  switch (node.type) {
    case "use_declaration": {
      const usePath = getUsePath(node);
      const name = getUseShortName(usePath);

      structure.imports.push(
        createCodeElement("import", name, node, {
          signature: `use ${usePath}`,
        })
      );
      return;
    }

    case "function_item": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";
      const isAsync = isAsyncFn(node);
      const isExported = hasVisibility(node);

      // If inside an impl block, treat as method
      if (currentImplType) {
        structure.functions.push(
          createCodeElement("method", name, node, {
            signature: getFunctionSignature(node),
            documentation: extractRustDoc(node, lines),
            isAsync,
            isExported,
            parent: currentImplType,
          })
        );
      } else {
        structure.functions.push(
          createCodeElement("function", name, node, {
            signature: getFunctionSignature(node),
            documentation: extractRustDoc(node, lines),
            isAsync,
            isExported,
          })
        );
      }
      return;
    }

    case "struct_item": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";
      const isExported = hasVisibility(node);

      structure.classes.push(
        createCodeElement("class", name, node, {
          signature: getStructSignature(node),
          documentation: extractRustDoc(node, lines),
          isExported,
        })
      );
      return;
    }

    case "enum_item": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";
      const isExported = hasVisibility(node);

      structure.classes.push(
        createCodeElement("class", name, node, {
          signature: getEnumSignature(node),
          documentation: extractRustDoc(node, lines),
          isExported,
        })
      );
      return;
    }

    case "trait_item": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";
      const isExported = hasVisibility(node);

      structure.interfaces.push(
        createCodeElement("interface", name, node, {
          signature: getTraitSignature(node),
          documentation: extractRustDoc(node, lines),
          isExported,
        })
      );
      return;
    }

    case "impl_item": {
      const typeName = getImplTypeName(node);

      // Walk into impl block with the type name as context
      const body = node.childForFieldName("body");
      if (body) {
        for (const child of body.children) {
          walkNode(child, structure, lines, typeName);
        }
      }
      return;
    }

    case "type_item": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";
      const isExported = hasVisibility(node);

      structure.types.push(
        createCodeElement("type", name, node, {
          signature: getTypeAliasSignature(node),
          documentation: extractRustDoc(node, lines),
          isExported,
        })
      );
      return;
    }

    case "const_item": {
      if (isModuleLevel(node)) {
        const nameNode = node.childForFieldName("name");
        const name = nameNode?.text ?? "unknown";
        const isExported = hasVisibility(node);

        structure.variables.push(
          createCodeElement("variable", name, node, {
            signature: getConstSignature(node, "const"),
            documentation: extractRustDoc(node, lines),
            isExported,
          })
        );
      }
      return;
    }

    case "static_item": {
      if (isModuleLevel(node)) {
        const nameNode = node.childForFieldName("name");
        const name = nameNode?.text ?? "unknown";
        const isExported = hasVisibility(node);

        structure.variables.push(
          createCodeElement("variable", name, node, {
            signature: getConstSignature(node, "static"),
            documentation: extractRustDoc(node, lines),
            isExported,
          })
        );
      }
      return;
    }
  }

  // Walk children
  for (const child of node.children) {
    walkNode(child, structure, lines, currentImplType);
  }
}

/**
 * Extract a specific element from Rust code
 */
export async function extractRustElement(
  content: string,
  target: ExtractionTarget,
  options: ExtractionOptions
): Promise<ExtractedContent | null> {
  const structure = await parseRustAsync(content);

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
      if (line.startsWith("///") || line.startsWith("//!")) {
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
export async function searchRustElements(content: string, query: string): Promise<CodeElement[]> {
  const structure = await parseRustAsync(content);
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
 * LanguageParser implementation for Rust
 */
export const rustTreeSitterParser: LanguageParser = {
  languages: ["rust"],

  parse(content: string, _options?: ParseOptions): FileStructure {
    if (!parserInstance || !rustLanguage) {
      initParser().catch(() => {});
      return parseRust(content);
    }
    return parseRust(content);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    if (!parserInstance || !rustLanguage) {
      initParser().catch(() => {});
      return null;
    }

    const structure = parseRust(content);
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
        if (line.startsWith("///") || line.startsWith("//!")) {
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
    if (!parserInstance || !rustLanguage) {
      initParser().catch(() => {});
      return [];
    }

    const structure = parseRust(content);
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
 * Initialize the Rust parser
 */
export async function initRustParser(): Promise<void> {
  await initParser();
}
