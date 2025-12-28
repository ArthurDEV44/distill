/**
 * CLI Analyze Command
 *
 * Analyzes files for token usage and optimization opportunities.
 * Used by both CLI and GitHub Action.
 */

import * as fs from "fs";
import * as path from "path";
import { countTokens } from "../utils/token-counter.js";

export interface AnalyzeOptions {
  patterns: string[];
  threshold: number;
  json: boolean;
  workingDir: string;
}

export interface FileAnalysis {
  file: string;
  tokens: number;
  lines: number;
  language: string;
  exceedsThreshold: boolean;
  suggestion?: string;
}

export interface AnalyzeReport {
  timestamp: string;
  workingDir: string;
  threshold: number;
  totalFiles: number;
  totalTokens: number;
  filesAboveThreshold: number;
  files: FileAnalysis[];
  recommendations: string[];
}

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".php": "php",
  ".swift": "swift",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".rb": "ruby",
  ".md": "markdown",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
};

/**
 * Match files against glob patterns (simple implementation)
 */
function matchGlob(filepath: string, pattern: string): boolean {
  // Handle brace expansion: {a,b,c} -> (a|b|c)
  let regexPattern = pattern.replace(/\{([^}]+)\}/g, (_match, group) => {
    const alternatives = group.split(",").map((s: string) => s.trim());
    return `(${alternatives.join("|")})`;
  });

  regexPattern = regexPattern
    .replace(/\*\*\//g, "(.*/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".")
    .replace(/\./g, "\\.");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filepath);
}

/**
 * Walk directory and find matching files
 */
function walkDirectory(
  dir: string,
  patterns: string[],
  maxFiles: number = 1000
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

        // Skip hidden dirs and node_modules
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        if (entry.isDirectory()) {
          walk(fullPath, relPath);
        } else if (entry.isFile()) {
          for (const pattern of patterns) {
            if (matchGlob(relPath, pattern)) {
              results.push(relPath);
              break;
            }
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
 * Get optimization suggestion based on file characteristics
 */
function getSuggestion(tokens: number, language: string): string | undefined {
  if (tokens > 5000) {
    if (["typescript", "javascript", "python", "go", "rust"].includes(language)) {
      return "Use smart_file_read to extract specific functions/classes";
    }
    return "Consider using code_skeleton to get signatures only";
  }
  if (tokens > 2000) {
    return "Consider using semantic_compress for this file";
  }
  return undefined;
}

/**
 * Detect language from file extension
 */
function detectLanguage(filepath: string): string {
  const ext = path.extname(filepath).toLowerCase();
  return LANGUAGE_MAP[ext] || "unknown";
}

/**
 * Analyze files and generate report
 */
export async function analyzeFiles(options: AnalyzeOptions): Promise<AnalyzeReport> {
  const { patterns, threshold, workingDir } = options;

  // Find matching files
  const files = walkDirectory(workingDir, patterns);

  // Analyze each file
  const analyses: FileAnalysis[] = [];
  let totalTokens = 0;
  let filesAboveThreshold = 0;

  for (const file of files) {
    try {
      const fullPath = path.join(workingDir, file);
      const content = fs.readFileSync(fullPath, "utf-8");
      const tokens = countTokens(content);
      const lines = content.split("\n").length;
      const language = detectLanguage(file);
      const exceedsThreshold = tokens > threshold;

      if (exceedsThreshold) {
        filesAboveThreshold++;
      }

      totalTokens += tokens;

      analyses.push({
        file,
        tokens,
        lines,
        language,
        exceedsThreshold,
        suggestion: exceedsThreshold ? getSuggestion(tokens, language) : undefined,
      });
    } catch {
      // Skip files we can't read
    }
  }

  // Sort by tokens descending
  analyses.sort((a, b) => b.tokens - a.tokens);

  // Generate recommendations
  const recommendations: string[] = [];

  if (filesAboveThreshold > 0) {
    recommendations.push(
      `${filesAboveThreshold} file(s) exceed the ${threshold} token threshold`
    );
  }

  const veryLargeFiles = analyses.filter((a) => a.tokens > 5000);
  if (veryLargeFiles.length > 0) {
    recommendations.push(
      `${veryLargeFiles.length} file(s) > 5000 tokens - use smart_file_read for targeted extraction`
    );
  }

  if (totalTokens > 50000) {
    recommendations.push(
      "Large codebase - consider using code_skeleton for overview before detailed reading"
    );
  }

  return {
    timestamp: new Date().toISOString(),
    workingDir,
    threshold,
    totalFiles: files.length,
    totalTokens,
    filesAboveThreshold,
    files: analyses,
    recommendations,
  };
}

/**
 * Format report as text table
 */
export function formatReportAsText(report: AnalyzeReport): string {
  const lines: string[] = [];

  lines.push("## Token Analysis Report\n");
  lines.push(`Analyzed: ${report.totalFiles} files`);
  lines.push(`Total tokens: ${report.totalTokens.toLocaleString()}`);
  lines.push(`Above threshold (${report.threshold}): ${report.filesAboveThreshold}\n`);

  if (report.files.length > 0) {
    lines.push("### Files by Token Count\n");
    lines.push("| File | Tokens | Lines | Language |");
    lines.push("|------|--------|-------|----------|");

    // Show top 20 files
    for (const file of report.files.slice(0, 20)) {
      const marker = file.exceedsThreshold ? " ⚠️" : "";
      lines.push(
        `| ${file.file}${marker} | ${file.tokens.toLocaleString()} | ${file.lines} | ${file.language} |`
      );
    }

    if (report.files.length > 20) {
      lines.push(`| ... and ${report.files.length - 20} more files | | | |`);
    }
  }

  if (report.recommendations.length > 0) {
    lines.push("\n### Recommendations\n");
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join("\n");
}

/**
 * Run analyze command
 */
export async function runAnalyze(args: string[]): Promise<void> {
  // Parse arguments
  let patterns = ["**/*.{ts,tsx,js,jsx,py,go,rs}"];
  let threshold = 2000;
  let json = false;
  let outputFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--patterns" || arg === "-p") {
      const patternArg = args[++i];
      if (patternArg) {
        patterns = patternArg.split(",");
      }
    } else if (arg === "--threshold" || arg === "-t") {
      const thresholdArg = args[++i];
      if (thresholdArg) {
        threshold = parseInt(thresholdArg, 10);
      }
    } else if (arg === "--json" || arg === "-j") {
      json = true;
    } else if (arg === "--output" || arg === "-o") {
      outputFile = args[++i] || null;
    }
  }

  const report = await analyzeFiles({
    patterns,
    threshold,
    json,
    workingDir: process.cwd(),
  });

  const output = json ? JSON.stringify(report, null, 2) : formatReportAsText(report);

  if (outputFile) {
    fs.writeFileSync(outputFile, output);
    console.log(`Report written to ${outputFile}`);
  } else {
    console.log(output);
  }

  // Exit with error code if files exceed threshold
  if (report.filesAboveThreshold > 0 && !json) {
    process.exit(1);
  }
}
