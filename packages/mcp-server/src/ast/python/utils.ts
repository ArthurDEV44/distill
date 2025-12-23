/**
 * Python Parser Utilities
 *
 * Helper functions for converting Tree-sitter nodes to CodeElements
 * and extracting Python-specific constructs.
 */

import type { Node } from "web-tree-sitter";
import type { CodeElement, ElementType } from "../types.js";

/**
 * Get line number from a Tree-sitter node (1-indexed)
 */
export function getLineNumber(node: Node): number {
  return node.startPosition.row + 1;
}

/**
 * Get end line number from a Tree-sitter node (1-indexed)
 */
export function getEndLineNumber(node: Node): number {
  return node.endPosition.row + 1;
}

/**
 * Extract docstring from a function or class body
 * Returns the docstring content without the quotes
 */
export function extractDocstring(bodyNode: Node | null): string | undefined {
  if (!bodyNode) return undefined;

  // Look for the first expression_statement containing a string
  for (const child of bodyNode.children) {
    if (child.type === "expression_statement") {
      const stringNode = child.firstChild;
      if (stringNode && (stringNode.type === "string" || stringNode.type === "concatenated_string")) {
        const text = stringNode.text;
        // Remove triple quotes and clean up
        if (text.startsWith('"""') || text.startsWith("'''")) {
          return text.slice(3, -3).trim();
        }
        // Single quoted strings (less common for docstrings)
        if (text.startsWith('"') || text.startsWith("'")) {
          return text.slice(1, -1).trim();
        }
      }
    }
    // Only check the first statement
    break;
  }

  return undefined;
}

/**
 * Get function signature from a function_definition node
 */
export function getFunctionSignature(node: Node, isAsync: boolean): string {
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  const returnType = node.childForFieldName("return_type");

  const name = nameNode?.text ?? "unknown";
  const params = paramsNode?.text ?? "()";
  const asyncPrefix = isAsync ? "async " : "";
  const returnAnnotation = returnType ? ` -> ${returnType.text}` : "";

  return `${asyncPrefix}def ${name}${params}${returnAnnotation}`;
}

/**
 * Get class signature from a class_definition node
 */
export function getClassSignature(node: Node): string {
  const nameNode = node.childForFieldName("name");
  const superclassNode = node.childForFieldName("superclasses");

  const name = nameNode?.text ?? "unknown";
  const superclasses = superclassNode ? `(${superclassNode.text})` : "";

  return `class ${name}${superclasses}`;
}

/**
 * Check if a function is async
 */
export function isAsyncFunction(node: Node): boolean {
  // In tree-sitter-python, async functions have type "function_definition"
  // with an "async" modifier in their parent or the first child is "async" keyword
  const firstChild = node.firstChild;
  if (firstChild && firstChild.type === "async") {
    return true;
  }

  // Check if there's an "async" keyword before "def"
  const prevSibling = node.previousSibling;
  return prevSibling?.type === "async" || false;
}

/**
 * Check if a definition has decorators that indicate it's exported
 * (e.g., @property, @staticmethod, @classmethod)
 */
export function getDecorators(node: Node): string[] {
  const decorators: string[] = [];
  let current = node.previousSibling;

  while (current && current.type === "decorator") {
    const nameNode = current.firstNamedChild;
    if (nameNode) {
      decorators.unshift(nameNode.text);
    }
    current = current.previousSibling;
  }

  return decorators;
}

/**
 * Create a CodeElement from a Tree-sitter node
 */
export function createCodeElement(
  type: ElementType,
  name: string,
  node: Node,
  options?: {
    signature?: string;
    documentation?: string;
    isAsync?: boolean;
    isExported?: boolean;
    parent?: string;
  }
): CodeElement {
  return {
    type,
    name,
    startLine: getLineNumber(node),
    endLine: getEndLineNumber(node),
    signature: options?.signature,
    documentation: options?.documentation,
    isAsync: options?.isAsync,
    isExported: options?.isExported,
    parent: options?.parent,
  };
}

/**
 * Get the body node of a function or class
 */
export function getBodyNode(node: Node): Node | null {
  return node.childForFieldName("body");
}

/**
 * Extract import name from an import statement
 */
export function getImportName(node: Node): string {
  // For "import x" -> return "x"
  // For "from x import y" -> return "y"
  // For "import x as y" -> return "y"

  if (node.type === "import_statement") {
    const nameNode = node.firstNamedChild;
    if (nameNode?.type === "dotted_name") {
      return nameNode.text.split(".").pop() ?? nameNode.text;
    }
    if (nameNode?.type === "aliased_import") {
      const alias = nameNode.childForFieldName("alias");
      return alias?.text ?? nameNode.firstNamedChild?.text ?? "";
    }
    return nameNode?.text ?? "";
  }

  if (node.type === "import_from_statement") {
    // Get the imported names
    for (const child of node.namedChildren) {
      if (child.type === "dotted_name" && child.previousSibling?.type !== "from") {
        return child.text.split(".").pop() ?? child.text;
      }
      if (child.type === "aliased_import") {
        const alias = child.childForFieldName("alias");
        return alias?.text ?? child.firstNamedChild?.text ?? "";
      }
    }
  }

  return node.text.split(/\s+/).pop() ?? "";
}

/**
 * Get the full import statement text
 */
export function getImportSignature(node: Node): string {
  return node.text.split("\n")[0] ?? node.text;
}
