/**
 * SDK Search Functions
 *
 * Code search operations for sandbox use.
 * Provides grep, symbol search, file search, and reference finding.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  GrepMatch,
  GrepResult,
  SymbolMatch,
  SymbolResult,
  FileMatch,
  FileResult,
  ReferenceMatch,
  HostCallbacks,
} from "../types.js";
import type { ElementType } from "../../ast/types.js";
import { parseFile, searchElements } from "../../ast/index.js";
import { detectLanguageFromPath } from "../../utils/language-detector.js";
import { validatePath, validateGlobPattern } from "../security/path-validator.js";

const MAX_RESULTS = 100;
const MAX_FILES_TO_SEARCH = 500;
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Simple glob pattern matcher
 */
function matchGlob(filepath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{DOUBLESTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{DOUBLESTAR}}/g, ".*")
    .replace(/\?/g, ".");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filepath);
}

/**
 * Walk directory and find matching files
 */
function walkDirectory(
  dir: string,
  pattern: string,
  workingDir: string,
  maxFiles: number = MAX_FILES_TO_SEARCH
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

        // Skip hidden directories and node_modules
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
 * Search for pattern in file content
 */
function searchInFile(
  filePath: string,
  content: string,
  pattern: RegExp
): GrepMatch[] {
  const matches: GrepMatch[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    let match: RegExpExecArray | null;

    // Reset lastIndex for global regex
    pattern.lastIndex = 0;

    while ((match = pattern.exec(line)) !== null) {
      matches.push({
        file: filePath,
        line: i + 1,
        column: match.index + 1,
        content: line.trim(),
        match: match[0],
      });

      // Prevent infinite loop for zero-length matches
      if (match[0].length === 0) break;
    }
  }

  return matches;
}

/**
 * Create Search API for sandbox
 */
export function createSearchAPI(workingDir: string, callbacks: HostCallbacks) {
  return {
    /**
     * Search for pattern in files (grep-style)
     * @param pattern - Regex pattern to search for
     * @param glob - Optional glob pattern to filter files (default: all supported code files)
     */
    grep(pattern: string, glob?: string): GrepResult {
      const filePattern = glob ?? "**/*.{ts,tsx,js,jsx,py,go,rs,php,swift}";

      // Validate glob pattern
      const validation = validateGlobPattern(filePattern, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error ?? "Invalid glob pattern");
      }

      // Find matching files
      const files = walkDirectory(workingDir, filePattern, workingDir);
      const allMatches: GrepMatch[] = [];

      // Create regex from pattern
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "g");
      } catch {
        throw new Error(`Invalid regex pattern: ${pattern}`);
      }

      // Search each file
      for (const file of files) {
        if (allMatches.length >= MAX_RESULTS) break;

        try {
          const fullPath = path.join(workingDir, file);
          const stats = fs.statSync(fullPath);

          // Skip large files
          if (stats.size > MAX_FILE_SIZE) continue;

          const content = fs.readFileSync(fullPath, "utf-8");
          const matches = searchInFile(file, content, regex);

          for (const match of matches) {
            if (allMatches.length >= MAX_RESULTS) break;
            allMatches.push(match);
          }
        } catch {
          // Skip files we can't read
        }
      }

      return {
        matches: allMatches,
        totalMatches: allMatches.length,
        filesSearched: files.length,
      };
    },

    /**
     * Search for symbols (functions, classes, etc.) across files
     * @param query - Symbol name to search for (supports partial match)
     * @param glob - Optional glob pattern to filter files
     */
    symbols(query: string, glob?: string): SymbolResult {
      const filePattern = glob ?? "**/*.{ts,tsx,js,jsx,py,go,rs,php,swift}";

      // Validate glob pattern
      const validation = validateGlobPattern(filePattern, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error ?? "Invalid glob pattern");
      }

      // Find matching files
      const files = walkDirectory(workingDir, filePattern, workingDir);
      const allSymbols: SymbolMatch[] = [];

      const queryLower = query.toLowerCase();

      // Parse each file and search for symbols
      for (const file of files) {
        if (allSymbols.length >= MAX_RESULTS) break;

        try {
          const fullPath = path.join(workingDir, file);
          const stats = fs.statSync(fullPath);

          // Skip large files
          if (stats.size > MAX_FILE_SIZE) continue;

          const content = fs.readFileSync(fullPath, "utf-8");
          const language = detectLanguageFromPath(file);

          if (language === "unknown") continue;

          const structure = parseFile(content, language);

          // Search in all symbol types
          const symbolTypes: Array<{
            type: ElementType;
            elements: Array<{ name: string; startLine: number; signature?: string }>;
          }> = [
            { type: "function", elements: structure.functions },
            { type: "class", elements: structure.classes },
            { type: "interface", elements: structure.interfaces },
            { type: "type", elements: structure.types },
            { type: "variable", elements: structure.variables },
          ];

          for (const { type, elements } of symbolTypes) {
            for (const element of elements) {
              if (allSymbols.length >= MAX_RESULTS) break;

              if (element.name.toLowerCase().includes(queryLower)) {
                allSymbols.push({
                  name: element.name,
                  type,
                  file,
                  line: element.startLine,
                  signature: element.signature,
                });
              }
            }
          }
        } catch {
          // Skip files we can't parse
        }
      }

      return {
        symbols: allSymbols,
        totalMatches: allSymbols.length,
      };
    },

    /**
     * Search for files by pattern
     * @param pattern - Glob pattern to match files
     */
    files(pattern: string): FileResult {
      // Validate glob pattern
      const validation = validateGlobPattern(pattern, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error ?? "Invalid glob pattern");
      }

      // Find matching files
      const files = walkDirectory(workingDir, pattern, workingDir);
      const fileMatches: FileMatch[] = [];

      for (const file of files) {
        if (fileMatches.length >= MAX_RESULTS) break;

        try {
          const fullPath = path.join(workingDir, file);
          const stats = fs.statSync(fullPath);
          const parsed = path.parse(file);

          fileMatches.push({
            path: file,
            name: parsed.base,
            extension: parsed.ext,
            size: stats.size,
          });
        } catch {
          // Skip files we can't stat
        }
      }

      return {
        files: fileMatches,
        totalMatches: fileMatches.length,
      };
    },

    /**
     * Find references to a symbol
     * @param symbol - Symbol name to find references for
     * @param glob - Optional glob pattern to filter files
     */
    references(symbol: string, glob?: string): ReferenceMatch[] {
      const filePattern = glob ?? "**/*.{ts,tsx,js,jsx,py,go,rs,php,swift}";

      // Validate glob pattern
      const validation = validateGlobPattern(filePattern, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error ?? "Invalid glob pattern");
      }

      // Find matching files
      const files = walkDirectory(workingDir, filePattern, workingDir);
      const references: ReferenceMatch[] = [];

      // Create patterns for different reference types
      // Definition: function/class/const/let/var name
      const defPattern = new RegExp(
        `(?:function|class|const|let|var|interface|type)\\s+${escapeRegex(symbol)}\\b`,
        "g"
      );
      // Import: import { name } or import name
      const importPattern = new RegExp(
        `import\\s+(?:{[^}]*\\b${escapeRegex(symbol)}\\b[^}]*}|${escapeRegex(symbol)})`,
        "g"
      );
      // Usage: general word boundary match (excluding definitions)
      const usagePattern = new RegExp(`\\b${escapeRegex(symbol)}\\b`, "g");

      for (const file of files) {
        if (references.length >= MAX_RESULTS) break;

        try {
          const fullPath = path.join(workingDir, file);
          const stats = fs.statSync(fullPath);

          // Skip large files
          if (stats.size > MAX_FILE_SIZE) continue;

          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            if (references.length >= MAX_RESULTS) break;

            const line = lines[i] ?? "";

            // Check for definition
            defPattern.lastIndex = 0;
            let match = defPattern.exec(line);
            if (match) {
              references.push({
                file,
                line: i + 1,
                column: match.index + 1,
                context: line.trim(),
                type: "definition",
              });
              continue; // Don't double-count as usage
            }

            // Check for import
            importPattern.lastIndex = 0;
            match = importPattern.exec(line);
            if (match) {
              references.push({
                file,
                line: i + 1,
                column: match.index + 1,
                context: line.trim(),
                type: "import",
              });
              continue;
            }

            // Check for usage
            usagePattern.lastIndex = 0;
            while ((match = usagePattern.exec(line)) !== null) {
              if (references.length >= MAX_RESULTS) break;

              references.push({
                file,
                line: i + 1,
                column: match.index + 1,
                context: line.trim(),
                type: "usage",
              });
            }
          }
        } catch {
          // Skip files we can't read
        }
      }

      return references;
    },
  };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
