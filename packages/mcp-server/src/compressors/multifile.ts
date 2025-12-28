/**
 * Multi-File Compressor
 *
 * Compresses multiple files with cross-file deduplication,
 * dependency-aware skeleton extraction, and smart chunking.
 */

import { countTokens } from "../utils/token-counter.js";
import type { CompressionStats } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * File context for multi-file compression
 */
export interface FileContext {
  path: string;
  content: string;
  language?: string;
}

/**
 * Import information extracted from files
 */
export interface ExtractedImport {
  source: string;
  names: string[];
  isDefault: boolean;
  isNamespace: boolean;
  raw: string;
}

/**
 * Type/interface information extracted from files
 */
export interface ExtractedType {
  name: string;
  kind: "type" | "interface" | "class" | "enum";
  definition: string;
  usedIn: string[];
}

/**
 * Shared elements across files
 */
export interface SharedElements {
  imports: Array<{ source: string; names: string[]; usedIn: string[] }>;
  types: ExtractedType[];
  constants: Array<{ name: string; value: string; usedIn: string[] }>;
}

/**
 * Multi-file compression options
 */
export interface MultiFileCompressOptions {
  /** Maximum total tokens for output */
  maxTokens?: number;
  /** Compression strategy */
  strategy: "deduplicate" | "skeleton" | "smart-chunk";
  /** Patterns to preserve fully (glob patterns) */
  preservePatterns?: string[];
  /** Entry points for dependency analysis */
  entryPoints?: string[];
  /** Depth for dependency traversal */
  dependencyDepth?: number;
}

/**
 * Multi-file compression result
 */
export interface MultiFileCompressResult {
  /** Compressed context */
  compressed: string;
  /** Files included in output */
  filesIncluded: string[];
  /** Shared elements extracted */
  sharedElements: SharedElements;
  /** Compression statistics */
  stats: {
    originalTokens: number;
    compressedTokens: number;
    filesProcessed: number;
    deduplicatedItems: number;
    reductionPercent: number;
  };
}

/**
 * Chunk information for smart chunking
 */
export interface ChunkInfo {
  id: string;
  files: string[];
  tokens: number;
  dependencies: string[];
  content?: string;
}

// ============================================
// Import Extraction
// ============================================

/**
 * Extract imports from TypeScript/JavaScript content
 */
function extractTsImports(content: string): ExtractedImport[] {
  const imports: ExtractedImport[] = [];

  // ES6 imports: import { x, y } from 'module'
  const esImportRegex =
    /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:from\s+)?['"]([^'"]+)['"]/g;

  // Namespace imports: import * as x from 'module'
  const namespaceRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;

  // Default imports: import x from 'module'
  const defaultRegex = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;

  let match;

  // ES6 named imports
  while ((match = esImportRegex.exec(content)) !== null) {
    const defaultName = match[1];
    const namedImports = match[2];
    const source = match[3];

    const names: string[] = [];
    if (defaultName) names.push(defaultName);
    if (namedImports) {
      names.push(
        ...namedImports
          .split(",")
          .map((n) => n.trim().split(/\s+as\s+/)[0]?.trim() || "")
          .filter((n) => n)
      );
    }

    imports.push({
      source: source || "",
      names,
      isDefault: !!defaultName && !namedImports,
      isNamespace: false,
      raw: match[0] || "",
    });
  }

  // Namespace imports
  while ((match = namespaceRegex.exec(content)) !== null) {
    imports.push({
      source: match[2] || "",
      names: [match[1] || ""],
      isDefault: false,
      isNamespace: true,
      raw: match[0] || "",
    });
  }

  return imports;
}

/**
 * Extract imports from Python content
 */
function extractPyImports(content: string): ExtractedImport[] {
  const imports: ExtractedImport[] = [];

  // from module import x, y
  const fromImportRegex = /from\s+([\w.]+)\s+import\s+([^#\n]+)/g;

  // import module
  const importRegex = /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;

  let match;

  while ((match = fromImportRegex.exec(content)) !== null) {
    const importPart = match[2] || "";
    const names = importPart
      .split(",")
      .map((n) => n.trim().split(/\s+as\s+/)[0]?.trim() || "")
      .filter((n) => n && n !== "*");

    imports.push({
      source: match[1] || "",
      names,
      isDefault: false,
      isNamespace: importPart.trim() === "*",
      raw: match[0] || "",
    });
  }

  while ((match = importRegex.exec(content)) !== null) {
    const modulePart = match[1] || "";
    const modules = modulePart.split(",").map((m) => m.trim());
    for (const mod of modules) {
      imports.push({
        source: mod,
        names: [mod.split(".").pop() || mod],
        isDefault: true,
        isNamespace: false,
        raw: match[0] || "",
      });
    }
  }

  return imports;
}

/**
 * Extract imports based on file language
 */
function extractImports(
  content: string,
  language?: string
): ExtractedImport[] {
  const lang = language?.toLowerCase() || "";

  if (
    lang.includes("typescript") ||
    lang.includes("javascript") ||
    lang === "ts" ||
    lang === "js" ||
    lang === "tsx" ||
    lang === "jsx"
  ) {
    return extractTsImports(content);
  }

  if (lang.includes("python") || lang === "py") {
    return extractPyImports(content);
  }

  // Default to TS-style extraction for unknown languages
  return extractTsImports(content);
}

// ============================================
// Type/Interface Extraction
// ============================================

/**
 * Extract type definitions from TypeScript content
 */
function extractTypeDefinitions(content: string): ExtractedType[] {
  const types: ExtractedType[] = [];

  // Type aliases: type Foo = ...
  const typeRegex = /export\s+type\s+(\w+)(?:<[^>]+>)?\s*=\s*([^;]+);/g;

  // Interfaces: interface Foo { ... }
  const interfaceRegex =
    /export\s+interface\s+(\w+)(?:<[^>]+>)?\s*(?:extends\s+[^{]+)?\s*\{([^}]+)\}/g;

  // Classes: class Foo { ... }
  const classRegex =
    /export\s+(?:abstract\s+)?class\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?\s*\{/g;

  // Enums: enum Foo { ... }
  const enumRegex = /export\s+(?:const\s+)?enum\s+(\w+)\s*\{([^}]+)\}/g;

  let match;

  while ((match = typeRegex.exec(content)) !== null) {
    types.push({
      name: match[1] || "",
      kind: "type",
      definition: match[0] || "",
      usedIn: [],
    });
  }

  while ((match = interfaceRegex.exec(content)) !== null) {
    types.push({
      name: match[1] || "",
      kind: "interface",
      definition: match[0] || "",
      usedIn: [],
    });
  }

  while ((match = classRegex.exec(content)) !== null) {
    types.push({
      name: match[1] || "",
      kind: "class",
      definition: (match[0] || "").replace(/\{$/, "{ ... }"),
      usedIn: [],
    });
  }

  while ((match = enumRegex.exec(content)) !== null) {
    types.push({
      name: match[1] || "",
      kind: "enum",
      definition: match[0] || "",
      usedIn: [],
    });
  }

  return types;
}

// ============================================
// Cross-File Deduplication
// ============================================

/**
 * Find shared imports across multiple files
 */
function findSharedImports(
  files: FileContext[]
): Map<string, { names: Set<string>; usedIn: string[] }> {
  const importMap = new Map<string, { names: Set<string>; usedIn: string[] }>();

  for (const file of files) {
    const imports = extractImports(file.content, file.language);

    for (const imp of imports) {
      const key = imp.source;
      if (!importMap.has(key)) {
        importMap.set(key, { names: new Set(), usedIn: [] });
      }

      const entry = importMap.get(key)!;
      imp.names.forEach((n) => entry.names.add(n));
      if (!entry.usedIn.includes(file.path)) {
        entry.usedIn.push(file.path);
      }
    }
  }

  return importMap;
}

/**
 * Find shared types across multiple files
 */
function findSharedTypes(files: FileContext[]): ExtractedType[] {
  const typeMap = new Map<string, ExtractedType>();

  for (const file of files) {
    const types = extractTypeDefinitions(file.content);

    for (const type of types) {
      if (!typeMap.has(type.name)) {
        typeMap.set(type.name, { ...type, usedIn: [file.path] });
      } else {
        const existing = typeMap.get(type.name)!;
        if (!existing.usedIn.includes(file.path)) {
          existing.usedIn.push(file.path);
        }
      }
    }
  }

  // Only return types used in multiple files
  return Array.from(typeMap.values()).filter((t) => t.usedIn.length > 1);
}

/**
 * Extract shared elements from files
 */
export function extractSharedElements(files: FileContext[]): SharedElements {
  const sharedImports = findSharedImports(files);
  const sharedTypes = findSharedTypes(files);

  // Filter to imports used in 2+ files
  const imports = Array.from(sharedImports.entries())
    .filter(([_, info]) => info.usedIn.length >= 2)
    .map(([source, info]) => ({
      source,
      names: Array.from(info.names),
      usedIn: info.usedIn,
    }));

  return {
    imports,
    types: sharedTypes,
    constants: [], // TODO: Extract shared constants
  };
}

// ============================================
// Content Deduplication
// ============================================

/**
 * Remove shared imports from file content
 */
function removeSharedImports(
  content: string,
  sharedSources: Set<string>,
  language?: string
): string {
  const imports = extractImports(content, language);
  let result = content;

  // Remove imports that are in shared set
  for (const imp of imports) {
    if (sharedSources.has(imp.source)) {
      result = result.replace(imp.raw, "");
    }
  }

  // Clean up empty lines
  result = result.replace(/\n\s*\n\s*\n/g, "\n\n");

  return result.trim();
}

// ============================================
// Skeleton Extraction
// ============================================

/**
 * Extract skeleton (signatures only) from file content
 */
function extractSkeleton(content: string, language?: string): string {
  const lines: string[] = [];
  const contentLines = content.split("\n");

  // Track brace depth for function body extraction
  let braceDepth = 0;
  let inFunctionBody = false;
  let currentSignature = "";

  for (const line of contentLines) {
    const trimmed = line.trim();

    // Skip empty lines and comments in function bodies
    if (inFunctionBody) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      if (braceDepth === 0) {
        inFunctionBody = false;
        lines.push(currentSignature + " { ... }");
      }
      continue;
    }

    // Keep imports (they're already deduplicated)
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("export {")
    ) {
      lines.push(line);
      continue;
    }

    // Keep type definitions
    if (
      trimmed.startsWith("export type ") ||
      trimmed.startsWith("export interface ") ||
      trimmed.startsWith("type ") ||
      trimmed.startsWith("interface ")
    ) {
      lines.push(line);
      continue;
    }

    // Function/method signatures
    if (
      /^(export\s+)?(async\s+)?function\s+\w+/.test(trimmed) ||
      /^(export\s+)?const\s+\w+\s*=\s*(async\s+)?\([^)]*\)\s*(=>|:)/.test(
        trimmed
      )
    ) {
      if (trimmed.includes("{") && !trimmed.includes("}")) {
        // Multi-line function
        currentSignature = line.replace(/\{[^}]*$/, "").trim();
        braceDepth = 1;
        inFunctionBody = true;
      } else if (trimmed.includes("=>") && !trimmed.includes("{")) {
        // Arrow function with expression body
        lines.push(line.split("=>")[0] + "=> ...");
      } else {
        // Single-line function or declaration
        lines.push(line);
      }
      continue;
    }

    // Class declarations
    if (/^(export\s+)?(abstract\s+)?class\s+\w+/.test(trimmed)) {
      if (trimmed.includes("{")) {
        currentSignature = line.replace(/\{[^}]*$/, "").trim();
        braceDepth = 1;
        inFunctionBody = true;
      } else {
        lines.push(line);
      }
      continue;
    }

    // Keep exports
    if (trimmed.startsWith("export ")) {
      lines.push(line);
    }
  }

  return lines.join("\n");
}

// ============================================
// Smart Chunking
// ============================================

/**
 * Build dependency graph from files
 */
function buildDependencyGraph(
  files: FileContext[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const file of files) {
    graph.set(file.path, new Set());
    const imports = extractImports(file.content, file.language);

    for (const imp of imports) {
      // Check if import refers to another file in our set
      for (const otherFile of files) {
        if (
          otherFile.path !== file.path &&
          (otherFile.path.includes(imp.source) ||
            imp.source.includes(
              otherFile.path.replace(/\.(ts|js|tsx|jsx)$/, "")
            ))
        ) {
          graph.get(file.path)!.add(otherFile.path);
        }
      }
    }
  }

  return graph;
}

/**
 * Create chunks based on dependencies
 */
export function createChunks(
  files: FileContext[],
  maxTokensPerChunk: number
): ChunkInfo[] {
  const graph = buildDependencyGraph(files);
  const chunks: ChunkInfo[] = [];
  const assigned = new Set<string>();

  // Calculate tokens for each file
  const fileTokens = new Map<string, number>();
  for (const file of files) {
    fileTokens.set(file.path, countTokens(file.content));
  }

  // Group files by connected components
  let chunkId = 0;
  for (const file of files) {
    if (assigned.has(file.path)) continue;

    const chunk: ChunkInfo = {
      id: `chunk-${chunkId++}`,
      files: [],
      tokens: 0,
      dependencies: [],
    };

    // BFS to find related files
    const queue = [file.path];
    while (queue.length > 0 && chunk.tokens < maxTokensPerChunk) {
      const current = queue.shift()!;
      if (assigned.has(current)) continue;

      const tokens = fileTokens.get(current) || 0;
      if (chunk.tokens + tokens > maxTokensPerChunk && chunk.files.length > 0) {
        continue;
      }

      assigned.add(current);
      chunk.files.push(current);
      chunk.tokens += tokens;

      // Add dependencies to queue
      const deps = graph.get(current);
      if (deps) {
        for (const dep of deps) {
          if (!assigned.has(dep)) {
            queue.push(dep);
            if (!chunk.dependencies.includes(dep)) {
              chunk.dependencies.push(dep);
            }
          }
        }
      }
    }

    if (chunk.files.length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

// ============================================
// Main Compression Function
// ============================================

/**
 * Compress multiple files with cross-file deduplication
 */
export function compressMultiFile(
  files: FileContext[],
  options: MultiFileCompressOptions
): MultiFileCompressResult {
  const maxTokens = options.maxTokens || 50000;
  const strategy = options.strategy || "deduplicate";

  // Calculate original tokens
  const originalTokens = files.reduce(
    (sum, f) => sum + countTokens(f.content),
    0
  );

  // Extract shared elements
  const sharedElements = extractSharedElements(files);
  const sharedSources = new Set(sharedElements.imports.map((i) => i.source));

  const parts: string[] = [];
  let deduplicatedItems = 0;

  // Add shared imports header
  if (sharedElements.imports.length > 0) {
    parts.push("// === Shared Imports ===");
    for (const imp of sharedElements.imports) {
      parts.push(`// ${imp.source}: ${imp.names.join(", ")}`);
      deduplicatedItems += imp.names.length;
    }
    parts.push("");
  }

  // Add shared types header
  if (sharedElements.types.length > 0) {
    parts.push("// === Shared Types ===");
    for (const type of sharedElements.types) {
      parts.push(`// ${type.kind} ${type.name} (used in ${type.usedIn.length} files)`);
      deduplicatedItems++;
    }
    parts.push("");
  }

  // Process files based on strategy
  const filesIncluded: string[] = [];

  switch (strategy) {
    case "deduplicate": {
      for (const file of files) {
        const cleaned = removeSharedImports(
          file.content,
          sharedSources,
          file.language
        );
        parts.push(`// === ${file.path} ===`);
        parts.push(cleaned);
        parts.push("");
        filesIncluded.push(file.path);
      }
      break;
    }

    case "skeleton": {
      for (const file of files) {
        const skeleton = extractSkeleton(file.content, file.language);
        parts.push(`// === ${file.path} (skeleton) ===`);
        parts.push(skeleton);
        parts.push("");
        filesIncluded.push(file.path);
      }
      break;
    }

    case "smart-chunk": {
      const chunks = createChunks(files, maxTokens / 3);

      for (const chunk of chunks.slice(0, 3)) {
        // Limit to 3 chunks
        parts.push(`// === ${chunk.id} (${chunk.files.length} files, ${chunk.tokens} tokens) ===`);

        for (const filePath of chunk.files) {
          const file = files.find((f) => f.path === filePath);
          if (file) {
            const skeleton = extractSkeleton(file.content, file.language);
            parts.push(`// ${file.path}`);
            parts.push(skeleton);
          }
          filesIncluded.push(filePath);
        }
        parts.push("");
      }
      break;
    }
  }

  const compressed = parts.join("\n");
  const compressedTokens = countTokens(compressed);

  return {
    compressed,
    filesIncluded,
    sharedElements,
    stats: {
      originalTokens,
      compressedTokens,
      filesProcessed: files.length,
      deduplicatedItems,
      reductionPercent: Math.round(
        (1 - compressedTokens / originalTokens) * 100
      ),
    },
  };
}
