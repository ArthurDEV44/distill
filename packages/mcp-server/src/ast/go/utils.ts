/**
 * Go Parser Utilities
 *
 * Helper functions for converting Tree-sitter nodes to CodeElements
 * and extracting Go-specific constructs.
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
 * Extract Go doc comment from above a declaration
 * Go uses // comments above declarations
 */
export function extractGoDoc(node: Node, lines: string[]): string | undefined {
  const startLine = node.startPosition.row;
  const comments: string[] = [];

  // Look for comments above the node
  for (let i = startLine - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line?.startsWith("//")) {
      comments.unshift(line.slice(2).trim());
    } else if (line === "") {
      // Allow empty lines between comments
      continue;
    } else {
      break;
    }
  }

  return comments.length > 0 ? comments.join("\n") : undefined;
}

/**
 * Get function signature from a function_declaration node
 */
export function getFunctionSignature(node: Node): string {
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  const resultNode = node.childForFieldName("result");

  const name = nameNode?.text ?? "unknown";
  const params = paramsNode?.text ?? "()";
  const result = resultNode ? ` ${resultNode.text}` : "";

  return `func ${name}${params}${result}`;
}

/**
 * Get method signature from a method_declaration node
 */
export function getMethodSignature(node: Node): string {
  const receiverNode = node.childForFieldName("receiver");
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  const resultNode = node.childForFieldName("result");

  const receiver = receiverNode?.text ?? "";
  const name = nameNode?.text ?? "unknown";
  const params = paramsNode?.text ?? "()";
  const result = resultNode ? ` ${resultNode.text}` : "";

  return `func ${receiver} ${name}${params}${result}`;
}

/**
 * Get type signature (struct, interface)
 */
export function getTypeSignature(node: Node, kind: string): string {
  const nameNode = node.childForFieldName("name");
  const name = nameNode?.text ?? "unknown";
  return `type ${name} ${kind}`;
}

/**
 * Check if a declaration is exported (starts with uppercase)
 */
export function isExported(name: string): boolean {
  if (!name || name.length === 0) return false;
  const firstChar = name.charAt(0);
  return firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();
}

/**
 * Get receiver type name from a method
 */
export function getReceiverType(node: Node): string | undefined {
  const receiverNode = node.childForFieldName("receiver");
  if (!receiverNode) return undefined;

  // Find the type identifier in the receiver
  const typeNode = receiverNode.descendantsOfType("type_identifier")[0];
  return typeNode?.text;
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
 * Extract import path from an import spec
 */
export function getImportPath(node: Node): string {
  // Find the interpreted_string_literal child
  const pathNode = node.descendantsOfType("interpreted_string_literal")[0];
  if (pathNode) {
    // Remove quotes
    return pathNode.text.slice(1, -1);
  }
  return node.text;
}

/**
 * Get the short name from an import path
 */
export function getImportName(importPath: string): string {
  const parts = importPath.split("/");
  return parts[parts.length - 1] ?? importPath;
}

/**
 * Get alias if import has one
 */
export function getImportAlias(node: Node): string | undefined {
  const nameNode = node.childForFieldName("name");
  if (nameNode && nameNode.type === "package_identifier") {
    return nameNode.text;
  }
  return undefined;
}
