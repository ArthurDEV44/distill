/**
 * Swift Parser Utilities
 *
 * Helper functions for converting Tree-sitter nodes to CodeElements
 * and extracting Swift-specific constructs.
 */

import type Parser from "web-tree-sitter";
type Node = Parser.SyntaxNode;
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
 * Extract Swift documentation comment from above a declaration
 * Swift uses /// for single-line doc comments and block comments
 */
export function extractSwiftDoc(node: Node, lines: string[]): string | undefined {
  const startLine = node.startPosition.row;
  const comments: string[] = [];

  // Look for doc comments above the node
  for (let i = startLine - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) {
      // Empty line - continue looking
      continue;
    } else if (line.startsWith("///")) {
      // Single-line doc comment
      const content = line.slice(3).trim();
      if (content) comments.unshift(content);
    } else if (line.endsWith("*/")) {
      // End of block comment - look for the start
      for (let j = i; j >= 0; j--) {
        const commentLine = lines[j]?.trim();
        if (commentLine?.startsWith("/**")) {
          // Found start of doc block
          for (let k = j; k <= i; k++) {
            let cl = lines[k]?.trim() ?? "";
            // Clean up comment markers
            if (cl.startsWith("/**")) cl = cl.slice(3).trim();
            if (cl.endsWith("*/")) cl = cl.slice(0, -2).trim();
            if (cl.startsWith("*")) cl = cl.slice(1).trim();
            if (cl) comments.push(cl);
          }
          break;
        }
      }
      break;
    } else if (line.startsWith("*")) {
      // Middle of block comment
      continue;
    } else if (line.startsWith("//") && !line.startsWith("///")) {
      // Regular comment - skip
      continue;
    } else if (line.startsWith("@")) {
      // Attribute like @available, @discardableResult - continue
      continue;
    } else {
      // Something else (code) - stop
      break;
    }
  }

  return comments.length > 0 ? comments.join("\n") : undefined;
}

/**
 * Swift access levels
 */
export type SwiftAccessLevel = "private" | "fileprivate" | "internal" | "public" | "open";

/**
 * Get access level from a node
 */
export function getAccessLevel(node: Node): SwiftAccessLevel | undefined {
  for (const child of node.children) {
    if (child.type === "modifiers") {
      for (const modifier of child.children) {
        const text = modifier.text;
        if (text === "private" || text === "fileprivate" || text === "internal" || text === "public" || text === "open") {
          return text as SwiftAccessLevel;
        }
      }
    }
    // Also check for direct visibility_modifier nodes
    if (child.type === "visibility_modifier") {
      const text = child.text;
      if (text === "private" || text === "fileprivate" || text === "internal" || text === "public" || text === "open") {
        return text as SwiftAccessLevel;
      }
    }
  }
  return undefined;
}

/**
 * Check if a node has public or open visibility (external API)
 */
export function isPublic(node: Node): boolean {
  const accessLevel = getAccessLevel(node);
  return accessLevel === "public" || accessLevel === "open" || accessLevel === undefined;
}

/**
 * Check if a function/method is async
 */
export function isAsync(node: Node): boolean {
  for (const child of node.children) {
    if (child.type === "modifiers") {
      for (const modifier of child.children) {
        if (modifier.text === "async") {
          return true;
        }
      }
    }
    if (child.text === "async") {
      return true;
    }
  }
  return false;
}

/**
 * Check if a node has static modifier
 */
export function isStatic(node: Node): boolean {
  for (const child of node.children) {
    if (child.type === "modifiers") {
      for (const modifier of child.children) {
        if (modifier.text === "static" || modifier.text === "class") {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Get function signature from a function_declaration node
 */
export function getFunctionSignature(node: Node): string {
  const parts: string[] = [];

  // Access level
  const accessLevel = getAccessLevel(node);
  if (accessLevel && accessLevel !== "internal") {
    parts.push(accessLevel);
  }

  // Static/class modifier
  if (isStatic(node)) {
    parts.push("static");
  }

  // Async modifier
  if (isAsync(node)) {
    parts.push("async");
  }

  parts.push("func");

  // Function name
  const nameNode = node.childForFieldName("name");
  const name = nameNode?.text ?? "unknown";

  // Parameters
  let params = "()";
  for (const child of node.children) {
    if (child.type === "parameter_clause" || child.type === "function_signature") {
      const paramClause = child.type === "function_signature"
        ? child.children.find(c => c.type === "parameter_clause")
        : child;
      if (paramClause) {
        params = paramClause.text;
      }
      break;
    }
  }

  // Return type
  let returnType = "";
  for (const child of node.children) {
    if (child.type === "function_signature") {
      const returnClause = child.children.find(c => c.type === "function_result");
      if (returnClause) {
        returnType = ` ${returnClause.text}`;
      }
      break;
    }
  }

  parts.push(`${name}${params}${returnType}`);

  return parts.join(" ");
}

/**
 * Get method signature (same as function but with receiver context)
 */
export function getMethodSignature(node: Node): string {
  return getFunctionSignature(node);
}

/**
 * Get class signature
 */
export function getClassSignature(node: Node): string {
  const parts: string[] = [];

  const accessLevel = getAccessLevel(node);
  if (accessLevel && accessLevel !== "internal") {
    parts.push(accessLevel);
  }

  // Check for final modifier
  for (const child of node.children) {
    if (child.type === "modifiers") {
      for (const modifier of child.children) {
        if (modifier.text === "final") {
          parts.push("final");
          break;
        }
      }
    }
  }

  parts.push("class");

  // Class name - look for type_identifier
  let name = "unknown";
  for (const child of node.children) {
    if (child.type === "type_identifier") {
      name = child.text;
      break;
    }
  }
  parts.push(name);

  // Inheritance clause
  for (const child of node.children) {
    if (child.type === "type_inheritance_clause" || child.type === "inheritance_specifier") {
      parts.push(child.text);
      break;
    }
  }

  return parts.join(" ");
}

/**
 * Get struct signature
 */
export function getStructSignature(node: Node): string {
  const parts: string[] = [];

  const accessLevel = getAccessLevel(node);
  if (accessLevel && accessLevel !== "internal") {
    parts.push(accessLevel);
  }

  parts.push("struct");

  // Struct name - look for type_identifier
  let name = "unknown";
  for (const child of node.children) {
    if (child.type === "type_identifier") {
      name = child.text;
      break;
    }
  }
  parts.push(name);

  // Inheritance clause (protocols)
  for (const child of node.children) {
    if (child.type === "type_inheritance_clause" || child.type === "inheritance_specifier") {
      parts.push(child.text);
      break;
    }
  }

  return parts.join(" ");
}

/**
 * Get protocol signature
 */
export function getProtocolSignature(node: Node): string {
  const parts: string[] = [];

  const accessLevel = getAccessLevel(node);
  if (accessLevel && accessLevel !== "internal") {
    parts.push(accessLevel);
  }

  parts.push("protocol");

  // Protocol name - look for type_identifier
  let name = "unknown";
  for (const child of node.children) {
    if (child.type === "type_identifier") {
      name = child.text;
      break;
    }
  }
  parts.push(name);

  // Inheritance clause
  for (const child of node.children) {
    if (child.type === "type_inheritance_clause" || child.type === "inheritance_specifier") {
      parts.push(child.text);
      break;
    }
  }

  return parts.join(" ");
}

/**
 * Get enum signature
 */
export function getEnumSignature(node: Node): string {
  const parts: string[] = [];

  const accessLevel = getAccessLevel(node);
  if (accessLevel && accessLevel !== "internal") {
    parts.push(accessLevel);
  }

  parts.push("enum");

  // Enum name - look for type_identifier
  let name = "unknown";
  for (const child of node.children) {
    if (child.type === "type_identifier") {
      name = child.text;
      break;
    }
  }
  parts.push(name);

  // Raw type or protocol conformance
  for (const child of node.children) {
    if (child.type === "type_inheritance_clause" || child.type === "inheritance_specifier") {
      parts.push(child.text);
      break;
    }
  }

  return parts.join(" ");
}

/**
 * Get extension signature
 */
export function getExtensionSignature(node: Node): string {
  const parts: string[] = [];

  const accessLevel = getAccessLevel(node);
  if (accessLevel && accessLevel !== "internal") {
    parts.push(accessLevel);
  }

  parts.push("extension");

  // Extended type
  for (const child of node.children) {
    if (child.type === "type_identifier" || child.type === "user_type") {
      parts.push(child.text);
      break;
    }
  }

  // Protocol conformance
  for (const child of node.children) {
    if (child.type === "type_inheritance_clause") {
      parts.push(child.text);
      break;
    }
  }

  return parts.join(" ");
}

/**
 * Get typealias signature
 */
export function getTypealiasSignature(node: Node): string {
  const parts: string[] = [];

  const accessLevel = getAccessLevel(node);
  if (accessLevel && accessLevel !== "internal") {
    parts.push(accessLevel);
  }

  parts.push("typealias");

  // Typealias name
  const nameNode = node.childForFieldName("name");
  const name = nameNode?.text ?? "unknown";
  parts.push(name);

  // Type assignment
  for (const child of node.children) {
    if (child.type === "type_annotation" || child.text.startsWith("=")) {
      // Get the type after =
      const typeText = child.text.replace(/^=\s*/, "");
      if (typeText) {
        parts.push("=", typeText);
      }
      break;
    }
  }

  return parts.join(" ");
}

/**
 * Get import path from import declaration
 */
export function getImportPath(node: Node): string {
  // Remove "import " prefix
  const text = node.text.trim();
  if (text.startsWith("import ")) {
    return text.slice(7).trim();
  }
  return text;
}

/**
 * Get variable/constant signature
 */
export function getVariableSignature(node: Node): string {
  const text = node.text.trim();
  // Get just the declaration part (first line)
  const firstLine = text.split("\n")[0] ?? text;
  // Clean up and return
  return firstLine.replace(/\s*[={].*$/, "").trim();
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
