/**
 * SDK Pipeline Functions
 *
 * Composable pipelines for chaining operations on files and data.
 * Provides declarative data processing with built-in templates.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  PipelineStep,
  PipelineResult,
  CodebaseOverview,
  SymbolUsage,
  DependencyAnalysis,
  StructureEntry,
  HostCallbacks,
} from "../types.js";
import { compressAuto, compressSemantic, compressLogs } from "./compress.js";
import { parseFile } from "../../ast/index.js";
import { detectLanguageFromPath } from "../../utils/language-detector.js";
import { validateGlobPattern } from "../security/path-validator.js";

const MAX_ITEMS = 1000;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Simple glob pattern matcher with brace expansion support
 */
function matchGlob(filepath: string, pattern: string): boolean {
  // Handle brace expansion: {a,b,c} -> (a|b|c)
  let regexPattern = pattern
    .replace(/\{([^}]+)\}/g, (_match, group) => {
      const alternatives = group.split(",").map((s: string) => s.trim());
      return `(${alternatives.join("|")})`;
    });

  // Use placeholders to avoid order-dependent replacement issues
  regexPattern = regexPattern
    .replace(/\*\*\//g, "{{GLOBSTAR_SLASH}}") // **/ -> matches zero or more dirs
    .replace(/\*\*/g, "{{GLOBSTAR}}")          // ** -> matches anything
    .replace(/\*/g, "{{STAR}}")                // * -> matches within segment
    .replace(/\?/g, "{{QUESTION}}")            // ? -> matches single char
    .replace(/\./g, "\\.")                     // escape dots
    .replace(/{{GLOBSTAR_SLASH}}/g, "(.*/)?")  // **/ can match empty or paths
    .replace(/{{GLOBSTAR}}/g, ".*")            // ** matches anything
    .replace(/{{STAR}}/g, "[^/]*")             // * matches non-slash chars
    .replace(/{{QUESTION}}/g, ".");            // ? matches any single char

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filepath);
}

/**
 * Walk directory and find files matching pattern
 */
function walkDirectory(
  dir: string,
  pattern: string,
  maxFiles: number = MAX_ITEMS
): string[] {
  const results: string[] = [];

  function walk(currentDir: string, relativePath: string = ""): void {
    if (results.length >= maxFiles) return;

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxFiles) break;

        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.join(relativePath, entry.name);

        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        if (entry.isDirectory()) {
          walk(fullPath, relPath);
        } else if (entry.isFile()) {
          if (matchGlob(relPath, pattern)) {
            results.push(relPath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  walk(dir);
  return results;
}

/**
 * Count lines in content
 */
function countLines(content: string): number {
  return content.split("\n").length;
}

/**
 * Create Pipeline API for sandbox
 */
export function createPipelineAPI(workingDir: string, callbacks: HostCallbacks) {
  /**
   * Execute a pipeline of steps
   */
  function executePipeline(steps: PipelineStep[]): PipelineResult {
    const startTime = Date.now();
    let data: unknown[] = [];
    let stepsExecuted = 0;
    let itemsProcessed = 0;

    for (const step of steps) {
      stepsExecuted++;

      if ("glob" in step) {
        // Glob step - find files
        const validation = validateGlobPattern(step.glob, workingDir);
        if (!validation.safe) {
          throw new Error(validation.error ?? "Invalid glob pattern");
        }
        data = walkDirectory(workingDir, step.glob);
        itemsProcessed = data.length;
      } else if ("filter" in step) {
        // Filter step
        data = data.filter(step.filter);
        itemsProcessed = data.length;
      } else if ("read" in step && step.read) {
        // Read step - read file contents
        data = data.map((file) => {
          if (typeof file !== "string") return file;
          try {
            const fullPath = path.join(workingDir, file);
            const stats = fs.statSync(fullPath);
            if (stats.size > MAX_FILE_SIZE) {
              return { file, content: null, error: "File too large" };
            }
            const content = fs.readFileSync(fullPath, "utf-8");
            return { file, content };
          } catch (err) {
            return { file, content: null, error: String(err) };
          }
        });
      } else if ("map" in step) {
        // Map step
        data = data.map(step.map);
      } else if ("reduce" in step) {
        // Reduce step
        const result = data.reduce(step.reduce, step.initial);
        data = [result];
      } else if ("compress" in step) {
        // Compress step
        const content = JSON.stringify(data, null, 2);
        let compressed: string;

        if (step.compress === "semantic") {
          const result = compressSemantic(content, step.ratio);
          compressed = result.compressed;
        } else if (step.compress === "logs") {
          const result = compressLogs(content);
          compressed = result.summary;
        } else {
          const result = compressAuto(content);
          compressed = result.compressed;
        }

        data = [compressed];
      } else if ("limit" in step) {
        // Limit step
        data = data.slice(0, step.limit);
        itemsProcessed = data.length;
      } else if ("sort" in step) {
        // Sort step
        const direction = step.sort === "desc" ? -1 : 1;
        const key = step.by;

        data = [...data].sort((a, b) => {
          let valA = key ? (a as Record<string, unknown>)[key] : a;
          let valB = key ? (b as Record<string, unknown>)[key] : b;

          if (typeof valA === "string" && typeof valB === "string") {
            return valA.localeCompare(valB) * direction;
          }
          if (typeof valA === "number" && typeof valB === "number") {
            return (valA - valB) * direction;
          }
          return 0;
        });
      } else if ("unique" in step) {
        // Unique step
        if (typeof step.unique === "string") {
          const key = step.unique;
          const seen = new Set<unknown>();
          data = data.filter((item) => {
            const val = (item as Record<string, unknown>)[key];
            if (seen.has(val)) return false;
            seen.add(val);
            return true;
          });
        } else if (step.unique) {
          data = [...new Set(data.map((d) => JSON.stringify(d)))].map((s) =>
            JSON.parse(s)
          );
        }
      }
    }

    return {
      data,
      stats: {
        stepsExecuted,
        itemsProcessed,
        executionTimeMs: Date.now() - startTime,
      },
    };
  }

  // Add template methods to the pipeline function
  const pipeline = executePipeline as typeof executePipeline & {
    codebaseOverview: (dir?: string) => CodebaseOverview;
    findUsages: (symbol: string, glob?: string) => SymbolUsage;
    analyzeDeps: (file: string, depth?: number) => DependencyAnalysis;
  };

  /**
   * Get codebase overview with statistics
   */
  pipeline.codebaseOverview = (dir?: string): CodebaseOverview => {
    const targetDir = dir ?? ".";
    const fullPath = path.join(workingDir, targetDir);

    const files = walkDirectory(fullPath, "**/*.{ts,tsx,js,jsx,py,go,rs,php,swift}");
    const languages: Record<string, number> = {};
    const fileSizes: Array<{ path: string; lines: number }> = [];
    let totalLines = 0;

    for (const file of files) {
      try {
        const filePath = path.join(fullPath, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = countLines(content);
        const lang = detectLanguageFromPath(file);

        totalLines += lines;

        if (lang !== "unknown") {
          languages[lang] = (languages[lang] ?? 0) + 1;
        }

        fileSizes.push({ path: file, lines });
      } catch {
        // Skip files we can't read
      }
    }

    // Sort by lines descending
    fileSizes.sort((a, b) => b.lines - a.lines);

    // Build structure (simplified)
    const structure: StructureEntry = {
      path: targetDir,
      type: "directory",
      name: path.basename(targetDir) || "root",
      children: files.slice(0, 20).map((f) => ({
        path: f,
        type: "file" as const,
        name: path.basename(f),
      })),
    };

    return {
      totalFiles: files.length,
      totalLines,
      languages,
      largestFiles: fileSizes.slice(0, 10),
      structure,
    };
  };

  /**
   * Find all usages of a symbol
   */
  pipeline.findUsages = (symbol: string, glob?: string): SymbolUsage => {
    const pattern = glob ?? "**/*.{ts,tsx,js,jsx,py,go,rs}";
    const files = walkDirectory(workingDir, pattern);

    const definitions: Array<{ file: string; line: number }> = [];
    const usages: Array<{ file: string; line: number; context: string }> = [];

    // Definition patterns
    const defPatterns = [
      new RegExp(`(?:function|class|const|let|var|interface|type)\\s+${escapeRegex(symbol)}\\b`),
      new RegExp(`${escapeRegex(symbol)}\\s*[=:]\\s*(?:function|\\(|async)`),
    ];

    // Usage pattern
    const usagePattern = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "g");

    for (const file of files) {
      try {
        const filePath = path.join(workingDir, file);
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          const lineNum = i + 1;

          // Check for definitions
          let isDef = false;
          for (const defPattern of defPatterns) {
            if (defPattern.test(line)) {
              definitions.push({ file, line: lineNum });
              isDef = true;
              break;
            }
          }

          // Check for usages (excluding definitions)
          if (!isDef && usagePattern.test(line)) {
            usages.push({
              file,
              line: lineNum,
              context: line.trim().slice(0, 100),
            });
          }

          // Reset regex lastIndex
          usagePattern.lastIndex = 0;
        }
      } catch {
        // Skip files we can't read
      }
    }

    return {
      symbol,
      definitions,
      usages,
      totalReferences: definitions.length + usages.length,
    };
  };

  /**
   * Analyze dependencies transitively
   */
  pipeline.analyzeDeps = (file: string, depth?: number): DependencyAnalysis => {
    const maxDepth = Math.min(depth ?? 3, 5);
    const directDeps: string[] = [];
    const transitiveDeps: string[] = [];
    const externalPackages: string[] = [];
    const circularDeps: string[] = [];
    const visited = new Set<string>();

    function analyzeFile(filePath: string, currentDepth: number): void {
      if (currentDepth > maxDepth || visited.has(filePath)) {
        if (visited.has(filePath) && currentDepth > 0) {
          circularDeps.push(filePath);
        }
        return;
      }

      visited.add(filePath);

      try {
        const fullPath = path.join(workingDir, filePath);
        const content = fs.readFileSync(fullPath, "utf-8");

        // Parse imports
        const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
          const importSource = match[1] ?? "";

          if (importSource.startsWith(".")) {
            // Relative import - resolve path
            const currentDir = path.dirname(fullPath);
            let resolved = path.resolve(currentDir, importSource);

            // Try with extensions
            const extensions = [".ts", ".tsx", ".js", ".jsx", ""];
            for (const ext of extensions) {
              const withExt = resolved + ext;
              if (fs.existsSync(withExt)) {
                resolved = withExt;
                break;
              }
              // Try index file
              const indexPath = path.join(resolved, `index${ext || ".ts"}`);
              if (fs.existsSync(indexPath)) {
                resolved = indexPath;
                break;
              }
            }

            const relativePath = path.relative(workingDir, resolved);

            if (currentDepth === 0) {
              if (!directDeps.includes(relativePath)) {
                directDeps.push(relativePath);
              }
            } else {
              if (!transitiveDeps.includes(relativePath) && !directDeps.includes(relativePath)) {
                transitiveDeps.push(relativePath);
              }
            }

            // Recurse
            analyzeFile(relativePath, currentDepth + 1);
          } else {
            // External package
            const pkgName = importSource.split("/")[0] ?? importSource;
            if (!externalPackages.includes(pkgName)) {
              externalPackages.push(pkgName);
            }
          }
        }
      } catch {
        // Skip files we can't read
      }
    }

    analyzeFile(file, 0);

    return {
      file,
      directDeps,
      transitiveDeps,
      externalPackages,
      circularDeps: [...new Set(circularDeps)],
    };
  };

  return pipeline;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
