/**
 * TypeScript/JavaScript Parser
 *
 * Uses TypeScript Compiler API for accurate AST parsing.
 */

import ts from "typescript";
import type {
  CodeElement,
  FileStructure,
  ExtractedContent,
  ExtractionTarget,
  ExtractionOptions,
  LanguageParser,
  SupportedLanguage,
} from "./types.js";
import { createEmptyStructure } from "./types.js";

/**
 * Get line number from position in source file
 */
function getLineNumber(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

/**
 * Get JSDoc comment for a node
 */
function getJSDoc(node: ts.Node): string | undefined {
  // Use ts.getJSDocCommentsAndTags which works across all node types
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs && jsDocs.length > 0) {
    return jsDocs.map((doc: ts.Node) => doc.getText()).join("\n");
  }
  return undefined;
}

/**
 * Check if a node has an export modifier
 */
function isExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/**
 * Check if a function is async
 */
function isAsync(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
}

/**
 * Get function signature
 */
function getFunctionSignature(
  node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction,
  sourceFile: ts.SourceFile
): string {
  const params = node.parameters.map((p) => p.getText(sourceFile)).join(", ");
  const returnType = node.type ? `: ${node.type.getText(sourceFile)}` : "";
  const asyncMod = isAsync(node) ? "async " : "";

  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    const name = node.name?.getText(sourceFile) ?? "anonymous";
    return `${asyncMod}function ${name}(${params})${returnType}`;
  }

  return `${asyncMod}(${params})${returnType} =>`;
}

/**
 * Parse TypeScript/JavaScript content into FileStructure
 */
export function parseTypeScript(content: string, isTypeScript: boolean = true): FileStructure {
  const sourceFile = ts.createSourceFile(
    isTypeScript ? "temp.ts" : "temp.js",
    content,
    ts.ScriptTarget.Latest,
    true,
    isTypeScript ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );

  const language: SupportedLanguage = isTypeScript ? "typescript" : "javascript";
  const structure = createEmptyStructure(language, content.split("\n").length);

  function visit(node: ts.Node, parentClass?: string) {
    const startLine = getLineNumber(sourceFile, node.getStart(sourceFile));
    const endLine = getLineNumber(sourceFile, node.getEnd());

    // Import declarations
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, "");

      if (importClause) {
        // Default import
        if (importClause.name) {
          structure.imports.push({
            type: "import",
            name: importClause.name.getText(sourceFile),
            startLine,
            endLine,
            signature: `import ${importClause.name.getText(sourceFile)} from "${moduleSpecifier}"`,
          });
        }

        // Named imports
        if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
          for (const element of importClause.namedBindings.elements) {
            structure.imports.push({
              type: "import",
              name: element.name.getText(sourceFile),
              startLine,
              endLine,
              signature: `import { ${element.name.getText(sourceFile)} } from "${moduleSpecifier}"`,
            });
          }
        }
      }
    }

    // Function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      structure.functions.push({
        type: "function",
        name: node.name.getText(sourceFile),
        startLine,
        endLine,
        signature: getFunctionSignature(node, sourceFile),
        documentation: getJSDoc(node),
        isExported: isExported(node),
        isAsync: isAsync(node),
      });
    }

    // Variable declarations with arrow functions
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.name && ts.isIdentifier(decl.name)) {
          const name = decl.name.getText(sourceFile);

          if (decl.initializer && ts.isArrowFunction(decl.initializer)) {
            structure.functions.push({
              type: "function",
              name,
              startLine,
              endLine,
              signature: `const ${name} = ${getFunctionSignature(decl.initializer, sourceFile)}`,
              documentation: getJSDoc(node),
              isExported: isExported(node),
              isAsync: isAsync(decl.initializer),
            });
          } else {
            structure.variables.push({
              type: "variable",
              name,
              startLine,
              endLine,
              isExported: isExported(node),
            });
          }
        }
      }
    }

    // Class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.getText(sourceFile);
      structure.classes.push({
        type: "class",
        name: className,
        startLine,
        endLine,
        documentation: getJSDoc(node),
        isExported: isExported(node),
      });

      // Visit class members
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile);
          const methodStart = getLineNumber(sourceFile, member.getStart(sourceFile));
          const methodEnd = getLineNumber(sourceFile, member.getEnd());

          structure.functions.push({
            type: "method",
            name: methodName,
            startLine: methodStart,
            endLine: methodEnd,
            signature: getFunctionSignature(member, sourceFile),
            documentation: getJSDoc(member),
            isAsync: isAsync(member),
            parent: className,
          });
        }
      }
    }

    // Interface declarations
    if (ts.isInterfaceDeclaration(node) && node.name) {
      structure.interfaces.push({
        type: "interface",
        name: node.name.getText(sourceFile),
        startLine,
        endLine,
        documentation: getJSDoc(node),
        isExported: isExported(node),
      });
    }

    // Type alias declarations
    if (ts.isTypeAliasDeclaration(node) && node.name) {
      structure.types.push({
        type: "type",
        name: node.name.getText(sourceFile),
        startLine,
        endLine,
        documentation: getJSDoc(node),
        isExported: isExported(node),
      });
    }

    // Export declarations
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          structure.exports.push({
            type: "export",
            name: element.name.getText(sourceFile),
            startLine,
            endLine,
          });
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, parentClass));
  }

  visit(sourceFile);
  return structure;
}

/**
 * Find identifiers used in a code snippet
 */
function findUsedIdentifiers(code: string): Set<string> {
  const identifiers = new Set<string>();
  // Simple regex to find potential identifiers (not perfect but good enough)
  const matches = code.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g);
  if (matches) {
    matches.forEach((m) => identifiers.add(m));
  }
  return identifiers;
}

/**
 * Find related imports for extracted code
 */
function findRelatedImports(
  content: string,
  structure: FileStructure,
  extractedCode: string
): string[] {
  const usedIds = findUsedIdentifiers(extractedCode);
  const lines = content.split("\n");
  const imports: string[] = [];

  for (const imp of structure.imports) {
    if (usedIds.has(imp.name)) {
      const importLine = lines[imp.startLine - 1];
      if (importLine && !imports.includes(importLine)) {
        imports.push(importLine);
      }
    }
  }

  return imports;
}

/**
 * Extract a specific element from TypeScript content
 */
export function extractTypeScriptElement(
  content: string,
  target: ExtractionTarget,
  options: ExtractionOptions,
  isTypeScript: boolean = true
): ExtractedContent | null {
  const structure = parseTypeScript(content, isTypeScript);

  // Find the target element
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

  // Include documentation if present and requested
  let startLine = element.startLine;
  if (options.includeComments && element.documentation) {
    // Look for JSDoc above the element
    for (let i = element.startLine - 2; i >= 0; i--) {
      const line = lines[i]?.trim() ?? "";
      if (line.startsWith("/**") || line.startsWith("*") || line.startsWith("*/")) {
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
  const relatedImports = options.includeImports
    ? findRelatedImports(content, structure, extractedCode)
    : [];

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
export function searchTypeScriptElements(content: string, query: string): CodeElement[] {
  const structure = parseTypeScript(content);
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
 * TypeScript parser implementation
 */
export const typescriptParser: LanguageParser = {
  languages: ["typescript", "javascript"],

  parse(content: string): FileStructure {
    return parseTypeScript(content, true);
  },

  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null {
    return extractTypeScriptElement(content, target, options, true);
  },

  searchElements(content: string, query: string): CodeElement[] {
    return searchTypeScriptElements(content, query);
  },
};
