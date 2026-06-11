/**
 * Pipeline Presets
 *
 * Common preset pipeline operations for typical use cases.
 */

import { Result, ok, err } from "neverthrow";
import * as path from "node:path";
import type {
  PipelineContext,
  PipelineError,
  PipelinePresets,
  DeadCodeResult,
  SignatureResult,
  FileContent,
} from "./pipeline-builder.types.js";
import { pipelineError } from "./pipeline-builder.types.js";
import type {
  CodebaseOverview,
  SymbolUsage,
  DependencyAnalysis,
  StructureEntry,
} from "../types.js";
import type { SupportedLanguage } from "../../ast/types.js";
import { Pipeline } from "./pipeline-builder.js";
import { codeParse } from "./code.js";

/**
 * Detect language from file path extension.
 */
function detectLanguageFromPath(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, SupportedLanguage> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "typescript",
    ".jsx": "typescript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".php": "php",
    ".swift": "swift",
  };
  return langMap[ext] ?? "typescript";
}

/**
 * Escape regex special characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Create preset pipeline operations.
 */
export function createPipelinePresets(ctx: PipelineContext): PipelinePresets {
  return {
    /**
     * Get codebase overview with file statistics.
     */
    codebaseOverview(dir?: string): Result<CodebaseOverview, PipelineError> {
      const targetDir = dir ?? ".";

      const pipeline = Pipeline.create(ctx)
        .glob("**/*.{ts,tsx,js,jsx,py,go,rs,php,swift}")
        .filter((f: string) => !f.includes("node_modules") && !f.includes(".git"))
        .read();

      const result = pipeline.build();
      if (result.isErr()) return err(result.error);

      const files = result.value.data;
      const languages: Record<string, number> = {};
      const fileSizes: Array<{ path: string; lines: number }> = [];
      let totalLines = 0;

      for (const file of files) {
        const lines = file.content.split("\n").length;
        const lang = detectLanguageFromPath(file.path);

        totalLines += lines;
        if (lang !== "typescript") {
          // typescript is the fallback
          languages[lang] = (languages[lang] ?? 0) + 1;
        } else {
          // Distinguish TS from JS
          const ext = path.extname(file.path).toLowerCase();
          const actualLang = ext === ".ts" || ext === ".tsx" ? "typescript" : "javascript";
          languages[actualLang] = (languages[actualLang] ?? 0) + 1;
        }
        fileSizes.push({ path: file.path, lines });
      }

      fileSizes.sort((a, b) => b.lines - a.lines);

      const structure: StructureEntry = {
        path: targetDir,
        type: "directory",
        name: path.basename(targetDir) || "root",
        children: files.slice(0, 20).map((f) => ({
          path: f.path,
          type: "file" as const,
          name: path.basename(f.path),
        })),
      };

      return ok({
        totalFiles: files.length,
        totalLines,
        languages,
        largestFiles: fileSizes.slice(0, 10),
        structure,
      });
    },

    /**
     * Find all usages of a symbol across codebase.
     */
    findUsages(symbol: string, glob?: string): Result<SymbolUsage, PipelineError> {
      const pattern = glob ?? "**/*.{ts,tsx,js,jsx,py,go,rs}";

      const pipeline = Pipeline.create(ctx)
        .glob(pattern)
        .filter((f: string) => !f.includes("node_modules") && !f.includes(".git"))
        .read();

      const result = pipeline.build();
      if (result.isErr()) return err(result.error);

      const definitions: Array<{ file: string; line: number }> = [];
      const usages: Array<{ file: string; line: number; context: string }> = [];

      const defPatterns = [
        new RegExp(
          `(?:function|class|const|let|var|interface|type)\\s+${escapeRegex(symbol)}\\b`
        ),
        new RegExp(`${escapeRegex(symbol)}\\s*[=:]\\s*(?:function|\\(|async)`),
        new RegExp(`def\\s+${escapeRegex(symbol)}\\s*\\(`), // Python
        new RegExp(`func\\s+${escapeRegex(symbol)}\\s*\\(`), // Go
      ];
      const usagePattern = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "g");

      for (const file of result.value.data) {
        const lines = file.content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          const lineNum = i + 1;

          let isDef = false;
          for (const defPattern of defPatterns) {
            if (defPattern.test(line)) {
              definitions.push({ file: file.path, line: lineNum });
              isDef = true;
              break;
            }
          }

          if (!isDef && usagePattern.test(line)) {
            usages.push({
              file: file.path,
              line: lineNum,
              context: line.trim().slice(0, 100),
            });
          }
          usagePattern.lastIndex = 0;
        }
      }

      return ok({
        symbol,
        definitions,
        usages,
        totalReferences: definitions.length + usages.length,
      });
    },

    /**
     * Analyze import dependencies for a file.
     */
    analyzeDeps(file: string, depth?: number): Result<DependencyAnalysis, PipelineError> {
      const maxDepth = Math.min(depth ?? 3, 5);
      const directDeps: string[] = [];
      const transitiveDeps: string[] = [];
      const externalPackages: string[] = [];
      const circularDeps: string[] = [];
      const visited = new Set<string>();

      function analyze(filePath: string, currentDepth: number): void {
        if (currentDepth > maxDepth || visited.has(filePath)) {
          if (visited.has(filePath) && currentDepth > 0) {
            circularDeps.push(filePath);
          }
          return;
        }

        visited.add(filePath);

        try {
          const content = ctx.callbacks.readFile(filePath);

          // Match various import patterns
          const importPatterns = [
            /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g, // ES imports
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // CommonJS
            /from\s+['"]([^'"]+)['"]/g, // Python-style (simplified)
          ];

          for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
              const importSource = match[1] ?? "";

              if (importSource.startsWith(".")) {
                // Relative import
                const currentDir = path.dirname(filePath);
                let resolved = path.resolve(currentDir, importSource);

                // Try with extensions
                for (const ext of [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js", ""]) {
                  const tryPath = resolved + ext;
                  if (ctx.callbacks.fileExists(tryPath)) {
                    resolved = tryPath;
                    break;
                  }
                }

                if (currentDepth === 0 && !directDeps.includes(resolved)) {
                  directDeps.push(resolved);
                } else if (!transitiveDeps.includes(resolved) && !directDeps.includes(resolved)) {
                  transitiveDeps.push(resolved);
                }

                analyze(resolved, currentDepth + 1);
              } else {
                // External package
                const pkgName = importSource.startsWith("@")
                  ? importSource.split("/").slice(0, 2).join("/")
                  : importSource.split("/")[0] ?? importSource;

                if (!externalPackages.includes(pkgName)) {
                  externalPackages.push(pkgName);
                }
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      try {
        analyze(file, 0);
      } catch (e) {
        return err(pipelineError.read(0, file, e));
      }

      return ok({
        file,
        directDeps,
        transitiveDeps,
        externalPackages,
        circularDeps: [...new Set(circularDeps)],
      });
    },

    /**
     * Find potentially dead code.
     */
    findDeadCode(glob?: string): Result<DeadCodeResult, PipelineError> {
      const pattern = glob ?? "**/*.{ts,tsx,js,jsx}";

      const pipeline = Pipeline.create(ctx)
        .glob(pattern)
        .filter(
          (f: string) =>
            !f.includes("node_modules") && !f.includes(".test.") && !f.includes(".spec.")
        )
        .read();

      const result = pipeline.build();
      if (result.isErr()) return err(result.error);

      const files: DeadCodeResult["files"] = [];
      let totalUnused = 0;

      // Collect all exported symbols with their files
      const allExports = new Map<string, string>();
      const parsedFiles: Array<{ path: string; content: string; exports: string[] }> = [];

      for (const file of result.value.data) {
        try {
          const lang = detectLanguageFromPath(file.path);
          const structure = codeParse(file.content, lang);
          const fileExports = structure.exports.map((e) => e.name);

          parsedFiles.push({
            path: file.path,
            content: file.content,
            exports: fileExports,
          });

          for (const exp of fileExports) {
            allExports.set(exp, file.path);
          }
        } catch {
          // Skip files that fail to parse
        }
      }

      // Find usages across all files
      const usedSymbols = new Set<string>();
      for (const file of parsedFiles) {
        for (const [symbol] of allExports) {
          // Check if symbol is used in this file (but not just as an export)
          const usagePattern = new RegExp(`\\b${escapeRegex(symbol)}\\b`);
          if (usagePattern.test(file.content)) {
            usedSymbols.add(symbol);
          }
        }
      }

      // Report unused exports
      for (const file of parsedFiles) {
        const unusedExports = file.exports.filter((exp) => !usedSymbols.has(exp));

        if (unusedExports.length > 0) {
          files.push({
            path: file.path,
            unusedExports,
            privateUnused: [],
          });
          totalUnused += unusedExports.length;
        }
      }

      return ok({ files, totalUnused });
    },

    /**
     * Get all function signatures.
     */
    getAllSignatures(glob?: string): Result<SignatureResult, PipelineError> {
      const pattern = glob ?? "**/*.{ts,tsx,js,jsx}";

      const pipeline = Pipeline.create(ctx)
        .glob(pattern)
        .filter((f: string) => !f.includes("node_modules") && !f.includes(".git"))
        .read();

      const result = pipeline.build();
      if (result.isErr()) return err(result.error);

      const functions: SignatureResult["functions"] = [];

      for (const file of result.value.data) {
        try {
          const lang = detectLanguageFromPath(file.path);
          const structure = codeParse(file.content, lang);

          // Get exported function names
          const exportedNames = new Set(structure.exports.map((e) => e.name));

          for (const fn of structure.functions) {
            functions.push({
              file: file.path,
              name: fn.name,
              signature: fn.signature ?? `function ${fn.name}()`,
              isExported: exportedNames.has(fn.name),
            });
          }
        } catch {
          // Skip files that fail to parse
        }
      }

      return ok({ functions, totalCount: functions.length });
    },
  };
}
