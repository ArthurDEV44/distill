/**
 * Build Output Parsers
 *
 * Auto-detection and routing for various build tool outputs.
 */

import type { BuildParser, ParsedError, ErrorGroup, BuildAnalysisResult, BuildTool } from "./types.js";
import { typescriptParser } from "./typescript.js";
import { eslintParser } from "./eslint.js";
import { genericParser } from "./generic.js";
// US-006: route through the single canonical tiktoken encoder instead of
// opening a second gpt-4 encoder instance here.
import { countTokens } from "../utils/token-counter.js";

export * from "./types.js";

// All available parsers (order matters for detection priority)
const parsers: BuildParser[] = [typescriptParser, eslintParser, genericParser];

/**
 * Detect the build tool from output
 */
export function detectBuildTool(output: string): BuildTool {
  // TypeScript
  if (output.includes("error TS") || output.includes("warning TS")) {
    return "tsc";
  }

  // ESLint
  if (
    (output.includes("error") && output.includes("warning") && /\d+:\d+/.test(output)) ||
    output.includes("eslint")
  ) {
    return "eslint";
  }

  // Webpack
  if (output.includes("ERROR in") || output.includes("webpack")) {
    return "webpack";
  }

  // Vite
  if (output.includes("[vite]")) {
    return "vite";
  }

  // esbuild
  if (output.includes("✘ [ERROR]")) {
    return "esbuild";
  }

  // Rust
  if (output.includes("error[E") || output.includes("rustc")) {
    return "rust";
  }

  // Go
  if (/\.go:\d+:\d+:/.test(output)) {
    return "go";
  }

  return "generic";
}

/**
 * Parse build output using the appropriate parser
 */
export function parseOutput(output: string): { tool: BuildTool; errors: ParsedError[] } {
  const tool = detectBuildTool(output);

  // Find the best parser
  for (const parser of parsers) {
    if (parser.canParse(output)) {
      return { tool, errors: parser.parse(output) };
    }
  }

  // Fallback to generic
  return { tool, errors: genericParser.parse(output) };
}

/**
 * Group errors by signature
 */
export function groupErrors(errors: ParsedError[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();

  for (const error of errors) {
    const existing = groups.get(error.signature);

    if (existing) {
      existing.count++;
      if (!existing.affectedFiles.includes(error.file)) {
        existing.affectedFiles.push(error.file);
      }
      if (existing.samples.length < 3) {
        existing.samples.push(error.raw);
      }
    } else {
      groups.set(error.signature, {
        signature: error.signature,
        code: error.code,
        message: error.message,
        severity: error.severity,
        count: 1,
        firstOccurrence: {
          file: error.file,
          line: error.line,
          column: error.column,
        },
        affectedFiles: [error.file],
        samples: [error.raw],
        suggestion: error.context,
      });
    }
  }

  // Sort by count (most frequent first)
  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

/**
 * Generate a compressed summary from error groups
 */
export function generateSummary(
  groups: ErrorGroup[],
  buildTool: BuildTool,
  verbosity: "minimal" | "normal" | "detailed" = "normal"
): string {
  const errorGroups = groups.filter((g) => g.severity === "error");
  const warningGroups = groups.filter((g) => g.severity === "warning");

  const totalErrors = errorGroups.reduce((sum, g) => sum + g.count, 0);
  const totalWarnings = warningGroups.reduce((sum, g) => sum + g.count, 0);

  const parts: string[] = [];

  // Header
  if (totalErrors > 0) {
    parts.push(
      `**Build failed** with ${totalErrors} error${totalErrors > 1 ? "s" : ""} (${errorGroups.length} unique type${errorGroups.length > 1 ? "s" : ""})${totalWarnings > 0 ? ` and ${totalWarnings} warning${totalWarnings > 1 ? "s" : ""}` : ""}`
    );
  } else if (totalWarnings > 0) {
    parts.push(
      `**Build succeeded** with ${totalWarnings} warning${totalWarnings > 1 ? "s" : ""} (${warningGroups.length} unique type${warningGroups.length > 1 ? "s" : ""})`
    );
  } else {
    parts.push("**Build succeeded** with no errors or warnings.");
    return parts.join("\n");
  }

  parts.push("");

  // Error groups
  if (errorGroups.length > 0) {
    parts.push("### Errors\n");

    const maxGroups = verbosity === "minimal" ? 3 : verbosity === "normal" ? 5 : 10;
    const displayGroups = errorGroups.slice(0, maxGroups);

    for (let i = 0; i < displayGroups.length; i++) {
      const group = displayGroups[i];
      if (!group) continue;

      parts.push(`**${i + 1}. ${group.code}**: ${group.message}`);
      parts.push(`   - Occurrences: ${group.count}`);
      parts.push(`   - First: \`${group.firstOccurrence.file}:${group.firstOccurrence.line}\``);

      if (group.affectedFiles.length > 1) {
        const fileList =
          group.affectedFiles.length <= 3
            ? group.affectedFiles.join(", ")
            : `${group.affectedFiles.slice(0, 3).join(", ")}, +${group.affectedFiles.length - 3} more`;
        parts.push(`   - Files: ${fileList}`);
      }

      if (group.suggestion && verbosity !== "minimal") {
        parts.push(`   - 💡 ${group.suggestion}`);
      }

      parts.push("");
    }

    if (errorGroups.length > maxGroups) {
      parts.push(`*...and ${errorGroups.length - maxGroups} more error types*\n`);
    }
  }

  // Warning groups (only in normal/detailed)
  if (warningGroups.length > 0 && verbosity !== "minimal") {
    parts.push("### Warnings\n");

    const maxWarnings = verbosity === "normal" ? 3 : 5;
    const displayWarnings = warningGroups.slice(0, maxWarnings);

    for (const group of displayWarnings) {
      parts.push(`- **${group.code}**: ${group.message} (${group.count}x)`);
    }

    if (warningGroups.length > maxWarnings) {
      parts.push(`- *...and ${warningGroups.length - maxWarnings} more warning types*`);
    }

    parts.push("");
  }

  // Quick fix suggestion
  if (errorGroups.length > 0 && errorGroups.length <= 3) {
    const suggestions = errorGroups
      .filter((g) => g.suggestion)
      .map((g) => g.suggestion)
      .slice(0, 2);

    if (suggestions.length > 0) {
      parts.push("### Quick Fix");
      parts.push(suggestions.join(" "));
      parts.push("");
    }
  }

  parts.push(`*Analyzed by CtxOpt (${buildTool})*`);

  return parts.join("\n");
}

/**
 * Analyze build output and return compressed result
 */
export function analyzeBuildOutput(
  output: string,
  options: {
    buildTool?: BuildTool;
    verbosity?: "minimal" | "normal" | "detailed";
  } = {}
): BuildAnalysisResult {
  const tokensOriginal = countTokens(output);

  // Parse output
  const { tool, errors } = parseOutput(output);
  const buildTool = options.buildTool || tool;

  // Group errors
  const allGroups = groupErrors(errors);
  const errorGroups = allGroups.filter((g) => g.severity === "error");
  const warningGroups = allGroups.filter((g) => g.severity === "warning");

  // Generate summary
  const summary = generateSummary(allGroups, buildTool, options.verbosity || "normal");
  const tokensCompressed = countTokens(summary);

  const totalErrors = errorGroups.reduce((sum, g) => sum + g.count, 0);
  const totalWarnings = warningGroups.reduce((sum, g) => sum + g.count, 0);

  return {
    buildTool,
    success: totalErrors === 0,
    summary,
    stats: {
      totalErrors,
      totalWarnings,
      uniqueErrorTypes: errorGroups.length,
      uniqueWarningTypes: warningGroups.length,
      tokensOriginal,
      tokensCompressed,
      reductionPercent:
        tokensOriginal > 0 ? Math.round((1 - tokensCompressed / tokensOriginal) * 100) : 0,
    },
    errorGroups,
    warningGroups,
  };
}
