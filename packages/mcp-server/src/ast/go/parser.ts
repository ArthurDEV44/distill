/**
 * Go Tree-sitter Parser
 *
 * AST parser for Go using Tree-sitter for accurate code analysis.
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
  LanguageParser,
} from "../types.js";
import { createEmptyStructure } from "../types.js";
import {
  extractGoDoc,
  getFunctionSignature,
  getMethodSignature,
  getTypeSignature,
  isExported,
  getReceiverType,
  createCodeElement,
  getImportPath,
  getImportName,
  getImportAlias,
} from "./utils.js";

// Singleton for lazy initialization
let parserInstance: Parser | null = null;
let goLanguage: Language | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the path to the Go WASM file
 */
function getGoWasmPath(): string {
  const require = createRequire(import.meta.url);
  try {
    const wasmDir = dirname(require.resolve("tree-sitter-wasms/package.json"));
    return join(wasmDir, "out", "tree-sitter-go.wasm");
  } catch {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, "..", "..", "..", "node_modules", "tree-sitter-wasms", "out", "tree-sitter-go.wasm");
  }
}

/**
 * Initialize Tree-sitter and load Go language
 */
async function initParser(): Promise<void> {
  if (parserInstance && goLanguage) return;

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    await Parser.init();
    parserInstance = new Parser();
    const wasmPath = getGoWasmPath();
    // Read WASM file as buffer for reliable loading in all environments
    const wasmBuffer = readFileSync(wasmPath);
    goLanguage = await Parser.Language.load(wasmBuffer);
    parserInstance.setLanguage(goLanguage);
  })();

  await initPromise;
}

/**
 * Check if a node is at package level
 */
function isPackageLevel(node: Node): boolean {
  return node.parent?.type === "source_file";
}

/**
 * Parse Go content and extract structure
 */
export function parseGo(content: string): FileStructure {
  if (!parserInstance || !goLanguage) {
    initParser().catch(() => {});
    return createEmptyStructure("go", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("go", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Async version of parseGo
 */
export async function parseGoAsync(content: string): Promise<FileStructure> {
  await initParser();
  if (!parserInstance) {
    return createEmptyStructure("go", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("go", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Extract file structure from parsed tree
 */
function extractStructure(tree: Tree, content: string): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("go", lines.length);
  const rootNode = tree.rootNode;

  walkNode(rootNode, structure, lines);

  return structure;
}

/**
 * Recursively walk the AST and extract code elements
 */
function walkNode(node: Node, structure: FileStructure, lines: string[]): void {
  switch (node.type) {
    case "import_declaration": {
      // Handle both single and grouped imports
      for (const child of node.namedChildren) {
        if (child.type === "import_spec") {
          processImportSpec(child, structure);
        } else if (child.type === "import_spec_list") {
          for (const spec of child.namedChildren) {
            if (spec.type === "import_spec") {
              processImportSpec(spec, structure);
            }
          }
        }
      }
      return;
    }

    case "function_declaration": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";

      structure.functions.push(
        createCodeElement("function", name, node, {
          signature: getFunctionSignature(node),
          documentation: extractGoDoc(node, lines),
          isExported: isExported(name),
        })
      );
      return;
    }

    case "method_declaration": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? "unknown";
      const receiverType = getReceiverType(node);

      structure.functions.push(
        createCodeElement("method", name, node, {
          signature: getMethodSignature(node),
          documentation: extractGoDoc(node, lines),
          isExported: isExported(name),
          parent: receiverType,
        })
      );
      return;
    }

    case "type_declaration": {
      // Process type specs inside
      for (const child of node.namedChildren) {
        if (child.type === "type_spec") {
          processTypeSpec(child, structure, lines);
        }
      }
      return;
    }

    case "var_declaration": {
      if (isPackageLevel(node)) {
        for (const child of node.namedChildren) {
          if (child.type === "var_spec") {
            const nameNode = child.childForFieldName("name");
            const name = nameNode?.text ?? "";
            if (name) {
              structure.variables.push(
                createCodeElement("variable", name, node, {
                  signature: `var ${name}`,
                  documentation: extractGoDoc(node, lines),
                  isExported: isExported(name),
                })
              );
            }
          }
        }
      }
      return;
    }

    case "const_declaration": {
      if (isPackageLevel(node)) {
        for (const child of node.namedChildren) {
          if (child.type === "const_spec") {
            const nameNode = child.childForFieldName("name");
            const name = nameNode?.text ?? "";
            if (name) {
              structure.variables.push(
                createCodeElement("variable", name, node, {
                  signature: `const ${name}`,
                  documentation: extractGoDoc(node, lines),
                  isExported: isExported(name),
                })
              );
            }
          }
        }
      }
      return;
    }
  }

  // Walk children
  for (const child of node.children) {
    walkNode(child, structure, lines);
  }
}

/**
 * Process an import spec
 */
function processImportSpec(node: Node, structure: FileStructure): void {
  const importPath = getImportPath(node);
  const alias = getImportAlias(node);
  const name = alias ?? getImportName(importPath);

  structure.imports.push(
    createCodeElement("import", name, node, {
      signature: alias ? `import ${alias} "${importPath}"` : `import "${importPath}"`,
    })
  );
}

/**
 * Process a type spec (struct, interface, alias)
 */
function processTypeSpec(node: Node, structure: FileStructure, lines: string[]): void {
  const nameNode = node.childForFieldName("name");
  const typeNode = node.childForFieldName("type");
  const name = nameNode?.text ?? "unknown";

  if (!typeNode) return;

  if (typeNode.type === "struct_type") {
    structure.classes.push(
      createCodeElement("class", name, node, {
        signature: getTypeSignature(node, "struct"),
        documentation: extractGoDoc(node.parent ?? node, lines),
        isExported: isExported(name),
      })
    );
  } else if (typeNode.type === "interface_type") {
    structure.interfaces.push(
      createCodeElement("interface", name, node, {
        signature: getTypeSignature(node, "interface"),
        documentation: extractGoDoc(node.parent ?? node, lines),
        isExported: isExported(name),
      })
    );
  } else {
    // Type alias
    structure.types.push(
      createCodeElement("type", name, node, {
        signature: `type ${name} ${typeNode.text}`,
        documentation: extractGoDoc(node.parent ?? node, lines),
        isExported: isExported(name),
      })
    );
  }
}

/**
 * Extract a specific element from Go code
 */
export async function extractGoElement(
  content: string,
  target: ExtractionTarget,
  options: ExtractionOptions
): Promise<ExtractedContent | null> {
  const structure = await parseGoAsync(content);

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
      if (line.startsWith("//")) {
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
export async function searchGoElements(content: string, query: string): Promise<CodeElement[]> {
  const structure = await parseGoAsync(content);
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
 * LanguageParser implementation for Go
 */
export const goTreeSitterParser: LanguageParser = {
  languages: ["go"],

  parse(content: string): FileStructure {
    if (!parserInstance || !goLanguage) {
      initParser().catch(() => {});
      return parseGo(content);
    }
    return parseGo(content);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    if (!parserInstance || !goLanguage) {
      initParser().catch(() => {});
      return null;
    }

    const structure = parseGo(content);
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
        if (line.startsWith("//")) {
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
    if (!parserInstance || !goLanguage) {
      initParser().catch(() => {});
      return [];
    }

    const structure = parseGo(content);
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
 * Initialize the Go parser
 */
export async function initGoParser(): Promise<void> {
  await initParser();
}
