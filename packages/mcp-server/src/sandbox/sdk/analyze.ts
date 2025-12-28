/**
 * SDK Analyze Functions
 *
 * Static analysis operations for sandbox use.
 * Provides dependency analysis, call graphs, and structure overview.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  ImportInfo,
  ExportInfo,
  DependencyResult,
  CallNode,
  CallGraphResult,
  StructureEntry,
  HostCallbacks,
} from "../types.js";
import type { ElementType, FileStructure } from "../../ast/types.js";
import { parseFile } from "../../ast/index.js";
import { detectLanguageFromPath } from "../../utils/language-detector.js";
import { validatePath } from "../security/path-validator.js";

const MAX_DEPTH = 5;
const MAX_STRUCTURE_FILES = 200;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Parse imports from file content
 */
function parseImports(content: string, language: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  if (language === "typescript" || language === "javascript") {
    // ES6 imports: import { x, y } from 'module'
    const esImportRegex = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:from\s+)?['"]([^'"]+)['"]/g;
    let match;

    while ((match = esImportRegex.exec(content)) !== null) {
      const defaultImport = match[1];
      const namedImports = match[2];
      const source = match[3] ?? "";

      const names: string[] = [];
      let isDefault = false;
      let isNamespace = false;

      if (defaultImport) {
        names.push(defaultImport);
        isDefault = true;
      }

      if (namedImports) {
        const namedList = namedImports.split(",").map((n) => n.trim().split(/\s+as\s+/)[0]?.trim() ?? "");
        names.push(...namedList.filter(Boolean));
      }

      imports.push({ source, names, isDefault, isNamespace });
    }

    // Namespace imports: import * as x from 'module'
    const namespaceRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = namespaceRegex.exec(content)) !== null) {
      const name = match[1] ?? "";
      const source = match[2] ?? "";
      imports.push({ source, names: [name], isDefault: false, isNamespace: true });
    }

    // Side-effect imports: import 'module'
    const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
    while ((match = sideEffectRegex.exec(content)) !== null) {
      const source = match[1] ?? "";
      if (!imports.some((i) => i.source === source)) {
        imports.push({ source, names: [], isDefault: false, isNamespace: false });
      }
    }
  } else if (language === "python") {
    // Python imports: from x import y, z
    const fromImportRegex = /from\s+([\w.]+)\s+import\s+([^#\n]+)/g;
    let match;

    while ((match = fromImportRegex.exec(content)) !== null) {
      const source = match[1] ?? "";
      const names = (match[2] ?? "").split(",").map((n) => n.trim().split(/\s+as\s+/)[0]?.trim() ?? "").filter(Boolean);
      imports.push({ source, names, isDefault: false, isNamespace: false });
    }

    // Python imports: import x, y
    const importRegex = /^import\s+([^#\n]+)/gm;
    while ((match = importRegex.exec(content)) !== null) {
      const modules = (match[1] ?? "").split(",").map((m) => m.trim().split(/\s+as\s+/)[0]?.trim() ?? "").filter(Boolean);
      for (const mod of modules) {
        imports.push({ source: mod, names: [mod], isDefault: true, isNamespace: false });
      }
    }
  } else if (language === "go") {
    // Go imports
    const importRegex = /import\s+(?:\(\s*([^)]+)\s*\)|"([^"]+)")/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        // Multi-line import block
        const lines = match[1].split("\n");
        for (const line of lines) {
          const pkgMatch = line.match(/(?:(\w+)\s+)?"([^"]+)"/);
          if (pkgMatch) {
            const alias = pkgMatch[1];
            const source = pkgMatch[2] ?? "";
            const name = alias ?? path.basename(source);
            imports.push({ source, names: [name], isDefault: false, isNamespace: false });
          }
        }
      } else if (match[2]) {
        // Single import
        const source = match[2];
        imports.push({ source, names: [path.basename(source)], isDefault: false, isNamespace: false });
      }
    }
  }

  return imports;
}

/**
 * Resolve import path to actual file path
 */
function resolveImportPath(importSource: string, currentFile: string, workingDir: string): string | undefined {
  // Skip external packages
  if (!importSource.startsWith(".") && !importSource.startsWith("/")) {
    return undefined;
  }

  const currentDir = path.dirname(path.join(workingDir, currentFile));
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];

  // Try direct path
  let resolved = path.resolve(currentDir, importSource);

  // Try with extensions
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt)) {
      return path.relative(workingDir, withExt);
    }
  }

  // Try index file
  for (const ext of extensions) {
    const indexPath = path.join(resolved, `index${ext}`);
    if (fs.existsSync(indexPath)) {
      return path.relative(workingDir, indexPath);
    }
  }

  return undefined;
}

/**
 * Extract function calls from function body
 */
function extractFunctionCalls(content: string, functionName: string): string[] {
  const calls: string[] = [];

  // Simple regex to find function calls
  // This is a heuristic - full AST parsing would be more accurate
  const callRegex = /\b([a-zA-Z_]\w*)\s*\(/g;
  let match;

  while ((match = callRegex.exec(content)) !== null) {
    const calledFn = match[1] ?? "";
    // Skip common built-ins and the function itself
    if (
      calledFn !== functionName &&
      !["if", "for", "while", "switch", "catch", "function", "return", "throw", "new", "typeof", "instanceof"].includes(calledFn)
    ) {
      if (!calls.includes(calledFn)) {
        calls.push(calledFn);
      }
    }
  }

  return calls;
}

/**
 * Create Analyze API for sandbox
 */
export function createAnalyzeAPI(workingDir: string, callbacks: HostCallbacks) {
  return {
    /**
     * Analyze file dependencies (imports and exports)
     * @param file - File path to analyze
     */
    dependencies(file: string): DependencyResult {
      // Validate file path
      const validation = validatePath(file, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error ?? "Invalid file path");
      }

      const fullPath = path.join(workingDir, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const language = detectLanguageFromPath(file);

      if (language === "unknown") {
        throw new Error(`Unsupported language for file: ${file}`);
      }

      // Parse the file structure
      const structure = parseFile(content, language);

      // Parse imports
      const imports = parseImports(content, language);

      // Resolve import paths and categorize
      const externalDeps: string[] = [];
      const internalDeps: string[] = [];

      for (const imp of imports) {
        const resolved = resolveImportPath(imp.source, file, workingDir);
        if (resolved) {
          imp.resolvedPath = resolved;
          if (!internalDeps.includes(resolved)) {
            internalDeps.push(resolved);
          }
        } else if (!imp.source.startsWith(".")) {
          if (!externalDeps.includes(imp.source)) {
            externalDeps.push(imp.source);
          }
        }
      }

      // Extract exports
      const exports: ExportInfo[] = [];

      // From AST exports
      for (const exp of structure.exports) {
        exports.push({
          name: exp.name,
          type: exp.type as ElementType,
          isDefault: exp.name === "default",
          line: exp.startLine,
          signature: exp.signature,
        });
      }

      // Also check functions/classes for exported ones
      for (const fn of structure.functions) {
        if (!exports.some((e) => e.name === fn.name)) {
          // Check if exported in content
          const exportCheck = new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?function\\s+${fn.name}\\b`);
          if (exportCheck.test(content)) {
            exports.push({
              name: fn.name,
              type: "function",
              isDefault: content.includes(`export default function ${fn.name}`),
              line: fn.startLine,
              signature: fn.signature,
            });
          }
        }
      }

      for (const cls of structure.classes) {
        if (!exports.some((e) => e.name === cls.name)) {
          const exportCheck = new RegExp(`export\\s+(?:default\\s+)?class\\s+${cls.name}\\b`);
          if (exportCheck.test(content)) {
            exports.push({
              name: cls.name,
              type: "class",
              isDefault: content.includes(`export default class ${cls.name}`),
              line: cls.startLine,
              signature: cls.signature,
            });
          }
        }
      }

      return {
        file,
        imports,
        exports,
        externalDeps,
        internalDeps,
      };
    },

    /**
     * Build a call graph for a function
     * @param functionName - Function name to analyze
     * @param file - File containing the function
     * @param depth - Maximum depth to traverse (default: 3)
     */
    callGraph(functionName: string, file: string, depth?: number): CallGraphResult {
      const maxDepth = Math.min(depth ?? 3, MAX_DEPTH);

      // Validate file path
      const validation = validatePath(file, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error ?? "Invalid file path");
      }

      const fullPath = path.join(workingDir, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const language = detectLanguageFromPath(file);

      if (language === "unknown") {
        throw new Error(`Unsupported language for file: ${file}`);
      }

      const structure = parseFile(content, language);
      const nodes: CallNode[] = [];
      const visited = new Set<string>();

      // Find the root function
      const rootFn = structure.functions.find((f) => f.name === functionName);
      if (!rootFn) {
        throw new Error(`Function '${functionName}' not found in ${file}`);
      }

      // Extract function body (heuristic)
      const lines = content.split("\n");
      const startLine = rootFn.startLine - 1;
      const endLine = rootFn.endLine ?? startLine + 50;
      const fnBody = lines.slice(startLine, endLine).join("\n");

      // Get calls from the function
      const calls = extractFunctionCalls(fnBody, functionName);

      nodes.push({
        name: functionName,
        file,
        line: rootFn.startLine,
        calls,
        calledBy: [],
      });

      visited.add(`${file}:${functionName}`);

      // Build call graph recursively (simplified - same file only)
      function addCalls(fnName: string, currentDepth: number): void {
        if (currentDepth >= maxDepth) return;

        const fn = structure.functions.find((f) => f.name === fnName);
        if (!fn) return;

        const key = `${file}:${fnName}`;
        if (visited.has(key)) return;
        visited.add(key);

        const fnStartLine = fn.startLine - 1;
        const fnEndLine = fn.endLine ?? fnStartLine + 50;
        const body = lines.slice(fnStartLine, fnEndLine).join("\n");
        const fnCalls = extractFunctionCalls(body, fnName);

        nodes.push({
          name: fnName,
          file,
          line: fn.startLine,
          calls: fnCalls,
          calledBy: [],
        });

        for (const call of fnCalls) {
          addCalls(call, currentDepth + 1);
        }
      }

      // Add called functions
      for (const call of calls) {
        addCalls(call, 1);
      }

      // Build calledBy relationships
      for (const node of nodes) {
        for (const call of node.calls) {
          const calledNode = nodes.find((n) => n.name === call);
          if (calledNode && !calledNode.calledBy.includes(node.name)) {
            calledNode.calledBy.push(node.name);
          }
        }
      }

      return {
        root: functionName,
        nodes,
        depth: maxDepth,
      };
    },

    /**
     * Get exports from a file
     * @param file - File path to analyze
     */
    exports(file: string): ExportInfo[] {
      const result = this.dependencies(file);
      return result.exports;
    },

    /**
     * Get directory structure with code analysis
     * @param dir - Directory to analyze (default: working directory root)
     * @param depth - Maximum depth (default: 3)
     */
    structure(dir?: string, depth?: number): StructureEntry {
      const targetDir = dir ?? ".";
      const maxDepth = Math.min(depth ?? 3, MAX_DEPTH);

      // Validate directory
      const validation = validatePath(targetDir, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error ?? "Invalid directory path");
      }

      const fullPath = path.join(workingDir, targetDir);
      let filesAnalyzed = 0;

      function buildStructure(currentPath: string, currentDepth: number, relativePath: string): StructureEntry {
        const stats = fs.statSync(currentPath);
        const name = path.basename(currentPath);

        if (stats.isFile()) {
          const entry: StructureEntry = {
            path: relativePath,
            type: "file",
            name,
            size: stats.size,
          };

          // Analyze code files
          if (filesAnalyzed < MAX_STRUCTURE_FILES && stats.size < MAX_FILE_SIZE) {
            const language = detectLanguageFromPath(currentPath);
            if (language !== "unknown") {
              try {
                const content = fs.readFileSync(currentPath, "utf-8");
                const structure = parseFile(content, language);

                entry.language = language;
                entry.functions = structure.functions.length;
                entry.classes = structure.classes.length;
                entry.exports = structure.exports.length;
                filesAnalyzed++;
              } catch {
                // Skip files we can't parse
              }
            }
          }

          return entry;
        }

        // Directory
        const entry: StructureEntry = {
          path: relativePath,
          type: "directory",
          name,
        };

        if (currentDepth < maxDepth) {
          try {
            const entries = fs.readdirSync(currentPath, { withFileTypes: true });
            const children: StructureEntry[] = [];

            for (const e of entries) {
              // Skip hidden and node_modules
              if (e.name.startsWith(".") || e.name === "node_modules") {
                continue;
              }

              const childPath = path.join(currentPath, e.name);
              const childRelative = path.join(relativePath, e.name);

              children.push(buildStructure(childPath, currentDepth + 1, childRelative));
            }

            entry.children = children;
          } catch {
            // Skip directories we can't read
          }
        }

        return entry;
      }

      return buildStructure(fullPath, 0, targetDir);
    },
  };
}
