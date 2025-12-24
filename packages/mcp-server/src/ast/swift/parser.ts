/**
 * Swift Tree-sitter Parser
 *
 * AST parser for Swift using Tree-sitter for accurate code analysis.
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
  extractSwiftDoc,
  isPublic,
  isAsync,
  getFunctionSignature,
  getMethodSignature,
  getClassSignature,
  getStructSignature,
  getProtocolSignature,
  getEnumSignature,
  getExtensionSignature,
  getTypealiasSignature,
  getImportPath,
  getVariableSignature,
  createCodeElement,
} from "./utils.js";

// Singleton for lazy initialization
let parserInstance: Parser | null = null;
let swiftLanguage: Language | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Get the path to the Swift WASM file
 */
function getSwiftWasmPath(): string {
  const require = createRequire(import.meta.url);
  try {
    const wasmDir = dirname(require.resolve("tree-sitter-wasms/package.json"));
    return join(wasmDir, "out", "tree-sitter-swift.wasm");
  } catch {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, "..", "..", "..", "node_modules", "tree-sitter-wasms", "out", "tree-sitter-swift.wasm");
  }
}

/**
 * Initialize Tree-sitter and load Swift language
 */
async function initParser(): Promise<void> {
  if (parserInstance && swiftLanguage) return;

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    await Parser.init();
    parserInstance = new Parser();
    const wasmPath = getSwiftWasmPath();
    // Read WASM file as buffer for reliable loading in all environments
    const wasmBuffer = readFileSync(wasmPath);
    swiftLanguage = await Parser.Language.load(wasmBuffer);
    parserInstance.setLanguage(swiftLanguage);
  })();

  await initPromise;
}

/**
 * Parse Swift content and extract structure
 */
export function parseSwift(content: string): FileStructure {
  if (!parserInstance || !swiftLanguage) {
    initParser().catch(() => {});
    return createEmptyStructure("swift", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("swift", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Async version of parseSwift
 */
export async function parseSwiftAsync(content: string): Promise<FileStructure> {
  await initParser();
  if (!parserInstance) {
    return createEmptyStructure("swift", content.split("\n").length);
  }

  const tree = parserInstance.parse(content);
  if (!tree) {
    return createEmptyStructure("swift", content.split("\n").length);
  }
  return extractStructure(tree, content);
}

/**
 * Extract file structure from parsed tree
 */
function extractStructure(tree: Tree, content: string): FileStructure {
  const lines = content.split("\n");
  const structure = createEmptyStructure("swift", lines.length);
  const rootNode = tree.rootNode;

  walkNode(rootNode, structure, lines, undefined);

  return structure;
}

/**
 * Determine the actual declaration type from a class_declaration node
 * Swift tree-sitter uses class_declaration for class, struct, enum, extension
 */
function getDeclarationType(node: Node): "class" | "struct" | "enum" | "extension" | "protocol" | "actor" | null {
  for (const child of node.children) {
    switch (child.type) {
      case "class":
        return "class";
      case "struct":
        return "struct";
      case "enum":
        return "enum";
      case "extension":
        return "extension";
      case "protocol":
        return "protocol";
      case "actor":
        return "actor";
    }
  }
  return null;
}

/**
 * Get the type name from a class_declaration node
 */
function getTypeName(node: Node): string {
  for (const child of node.children) {
    if (child.type === "type_identifier") {
      return child.text;
    }
  }
  return "unknown";
}

/**
 * Get the extended type name for extensions
 */
function getExtendedTypeName(node: Node): string {
  for (const child of node.children) {
    if (child.type === "user_type" || child.type === "type_identifier") {
      return child.text;
    }
  }
  return "unknown";
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
    case "import_declaration": {
      const importPath = getImportPath(node);
      const name = importPath.split(".").pop() ?? importPath;

      structure.imports.push(
        createCodeElement("import", name, node, {
          signature: `import ${importPath}`,
        })
      );
      return;
    }

    case "function_declaration": {
      // Get function name - look for simple_identifier child
      let name = "unknown";
      for (const child of node.children) {
        if (child.type === "simple_identifier") {
          name = child.text;
          break;
        }
      }
      const isAsyncFunc = isAsync(node);

      if (currentClassName) {
        // Method inside a class/struct/protocol/extension
        structure.functions.push(
          createCodeElement("method", name, node, {
            signature: getMethodSignature(node),
            documentation: extractSwiftDoc(node, lines),
            isExported: isPublic(node),
            isAsync: isAsyncFunc,
            parent: currentClassName,
          })
        );
      } else {
        // Top-level function
        structure.functions.push(
          createCodeElement("function", name, node, {
            signature: getFunctionSignature(node),
            documentation: extractSwiftDoc(node, lines),
            isExported: isPublic(node),
            isAsync: isAsyncFunc,
          })
        );
      }
      return;
    }

    case "init_declaration": {
      const isAsyncFunc = isAsync(node);
      const name = "init";

      structure.functions.push(
        createCodeElement("method", name, node, {
          signature: `init${node.text.match(/\([^)]*\)/)?.[0] ?? "()"}`,
          documentation: extractSwiftDoc(node, lines),
          isExported: isPublic(node),
          isAsync: isAsyncFunc,
          parent: currentClassName,
        })
      );
      return;
    }

    case "deinit_declaration": {
      structure.functions.push(
        createCodeElement("method", "deinit", node, {
          signature: "deinit",
          documentation: extractSwiftDoc(node, lines),
          isExported: false,
          parent: currentClassName,
        })
      );
      return;
    }

    case "class_declaration": {
      // Swift tree-sitter uses class_declaration for class, struct, enum, extension, protocol
      const declType = getDeclarationType(node);

      if (declType === "class" || declType === "actor") {
        const name = getTypeName(node);
        structure.classes.push(
          createCodeElement("class", name, node, {
            signature: getClassSignature(node),
            documentation: extractSwiftDoc(node, lines),
            isExported: isPublic(node),
          })
        );

        // Walk into class body for methods
        for (const child of node.children) {
          if (child.type === "class_body" || child.type === "enum_class_body") {
            for (const bodyChild of child.children) {
              walkNode(bodyChild, structure, lines, name);
            }
          }
        }
      } else if (declType === "struct") {
        const name = getTypeName(node);
        structure.classes.push(
          createCodeElement("class", name, node, {
            signature: getStructSignature(node),
            documentation: extractSwiftDoc(node, lines),
            isExported: isPublic(node),
          })
        );

        // Walk into struct body for methods
        for (const child of node.children) {
          if (child.type === "class_body" || child.type === "enum_class_body") {
            for (const bodyChild of child.children) {
              walkNode(bodyChild, structure, lines, name);
            }
          }
        }
      } else if (declType === "enum") {
        const name = getTypeName(node);
        structure.types.push(
          createCodeElement("type", name, node, {
            signature: getEnumSignature(node),
            documentation: extractSwiftDoc(node, lines),
            isExported: isPublic(node),
          })
        );

        // Walk into enum body for methods
        for (const child of node.children) {
          if (child.type === "class_body" || child.type === "enum_class_body") {
            for (const bodyChild of child.children) {
              walkNode(bodyChild, structure, lines, name);
            }
          }
        }
      } else if (declType === "extension") {
        const extendedTypeName = getExtendedTypeName(node);
        structure.types.push(
          createCodeElement("type", `extension ${extendedTypeName}`, node, {
            signature: getExtensionSignature(node),
            documentation: extractSwiftDoc(node, lines),
            isExported: isPublic(node),
          })
        );

        // Walk into extension body for methods
        for (const child of node.children) {
          if (child.type === "class_body" || child.type === "enum_class_body") {
            for (const bodyChild of child.children) {
              walkNode(bodyChild, structure, lines, extendedTypeName);
            }
          }
        }
      } else if (declType === "protocol") {
        const name = getTypeName(node);
        structure.interfaces.push(
          createCodeElement("interface", name, node, {
            signature: getProtocolSignature(node),
            documentation: extractSwiftDoc(node, lines),
            isExported: isPublic(node),
          })
        );

        // Walk into protocol body for method signatures
        for (const child of node.children) {
          if (child.type === "class_body" || child.type === "protocol_body" || child.type === "enum_class_body") {
            for (const bodyChild of child.children) {
              walkNode(bodyChild, structure, lines, name);
            }
          }
        }
      }
      return;
    }

    case "protocol_declaration": {
      // Standalone protocol_declaration node
      let name = "unknown";
      for (const child of node.children) {
        if (child.type === "type_identifier") {
          name = child.text;
          break;
        }
      }

      structure.interfaces.push(
        createCodeElement("interface", name, node, {
          signature: getProtocolSignature(node),
          documentation: extractSwiftDoc(node, lines),
          isExported: isPublic(node),
        })
      );

      // Walk into protocol body for method signatures
      for (const child of node.children) {
        if (child.type === "protocol_body") {
          for (const bodyChild of child.children) {
            walkNode(bodyChild, structure, lines, name);
          }
        }
      }
      return;
    }

    case "protocol_function_declaration": {
      // Protocol method requirement
      let name = "unknown";
      for (const child of node.children) {
        if (child.type === "simple_identifier") {
          name = child.text;
          break;
        }
      }

      structure.functions.push(
        createCodeElement("method", name, node, {
          signature: getMethodSignature(node),
          documentation: extractSwiftDoc(node, lines),
          isExported: true,
          parent: currentClassName,
        })
      );
      return;
    }

    case "typealias_declaration": {
      const nameNode = node.childForFieldName("name");
      const name = nameNode?.text ?? getTypeName(node);

      structure.types.push(
        createCodeElement("type", name, node, {
          signature: getTypealiasSignature(node),
          documentation: extractSwiftDoc(node, lines),
          isExported: isPublic(node),
        })
      );
      return;
    }

    case "property_declaration": {
      // Get variable name
      let varName = "unknown";
      for (const child of node.children) {
        if (child.type === "pattern") {
          varName = child.text;
          break;
        }
      }

      structure.variables.push(
        createCodeElement("variable", varName, node, {
          signature: getVariableSignature(node),
          documentation: extractSwiftDoc(node, lines),
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
 * Extract a specific element from Swift code
 */
export async function extractSwiftElement(
  content: string,
  target: ExtractionTarget,
  options: ExtractionOptions
): Promise<ExtractedContent | null> {
  const structure = await parseSwiftAsync(content);

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
      if (line.startsWith("///") || line.startsWith("/**") || line.startsWith("*") || line.endsWith("*/")) {
        startLine = i + 1;
      } else if (line === "" || line.startsWith("@")) {
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
export async function searchSwiftElements(content: string, query: string): Promise<CodeElement[]> {
  const structure = await parseSwiftAsync(content);
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
 * LanguageParser implementation for Swift
 */
export const swiftTreeSitterParser: LanguageParser = {
  languages: ["swift"],

  parse(content: string, _options?: ParseOptions): FileStructure {
    if (!parserInstance || !swiftLanguage) {
      initParser().catch(() => {});
      return parseSwift(content);
    }
    return parseSwift(content);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    if (!parserInstance || !swiftLanguage) {
      initParser().catch(() => {});
      return null;
    }

    const structure = parseSwift(content);
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
        if (line.startsWith("///") || line.startsWith("/**") || line.startsWith("*") || line.endsWith("*/")) {
          startLine = i + 1;
        } else if (line === "" || line.startsWith("@")) {
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
    if (!parserInstance || !swiftLanguage) {
      initParser().catch(() => {});
      return [];
    }

    const structure = parseSwift(content);
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
 * Initialize the Swift parser
 */
export async function initSwiftParser(): Promise<void> {
  await initParser();
}
