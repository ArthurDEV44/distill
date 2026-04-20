/**
 * Stack Trace Compressor
 *
 * Specialized compressor for error stack traces.
 * Keeps relevant frames (project code) and summarizes internal frames.
 */

import type { Compressor, CompressOptions, CompressedResult } from "./types.js";
import { countTokens } from "../utils/token-counter.js";

interface StackFrame {
  raw: string;
  isInternal: boolean;
  isProjectCode: boolean;
  location?: string;
}

// Patterns for internal frames (node_modules, runtime, etc.)
const INTERNAL_PATTERNS = [
  /node_modules/,
  /internal\//,
  /<anonymous>/,
  /native code/,
  /\[native code\]/,
  /webpack:/,
  /turbopack:/,
  /at Module\./,
  /at require \(/,
  /at Object\.<anonymous>/,
  /at processTicksAndRejections/,
  /at async /,
  /__webpack_require__/,
];

// Patterns for project code (should be kept)
const PROJECT_PATTERNS = [
  /\/(src|app|lib|pages|components|utils|services|hooks|store)\//,
  /\.(ts|tsx|js|jsx):\d+/,
];

/**
 * Check if a frame is internal (should be summarized)
 */
function isInternalFrame(line: string): boolean {
  return INTERNAL_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Check if a frame is project code (should be kept)
 */
function isProjectFrame(line: string): boolean {
  if (isInternalFrame(line)) return false;
  return PROJECT_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Parse a stack trace line into a frame
 */
function parseFrame(line: string): StackFrame {
  const isInternal = isInternalFrame(line);
  const isProject = isProjectFrame(line);

  // Extract location if present
  const locationMatch = line.match(/\(([^)]+)\)$/) || line.match(/at\s+([^\s]+)$/);
  const location = locationMatch?.[1];

  return {
    raw: line,
    isInternal,
    isProjectCode: isProject,
    location,
  };
}

/**
 * Detect the type of stack trace
 */
function detectStackType(
  content: string
): "javascript" | "python" | "rust" | "go" | "java" | "unknown" {
  if (/^\s+at\s+/m.test(content)) return "javascript";
  if (/^Traceback \(most recent call last\)/m.test(content)) return "python";
  if (/^thread '.*' panicked at/m.test(content)) return "rust";
  if (/^goroutine \d+ \[/m.test(content)) return "go";
  if (/^\s+at [a-zA-Z0-9$.]+\([^)]*\)$/m.test(content)) return "java";
  return "unknown";
}

/**
 * Compress JavaScript/Node.js stack trace
 */
function compressJSStack(
  lines: string[],
  detail: "minimal" | "normal" | "detailed"
): { compressed: string[]; internalCount: number } {
  const output: string[] = [];
  let internalCount = 0;
  let consecutiveInternal = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // Keep error message lines (not starting with "at")
    if (!line.trim().startsWith("at ") && !line.match(/^\s+at\s+/)) {
      // If we have pending internal frames, summarize them
      if (consecutiveInternal > 0) {
        output.push(`    ... (${consecutiveInternal} internal frames omitted)`);
        consecutiveInternal = 0;
      }
      output.push(line);
      continue;
    }

    const frame = parseFrame(line);

    if (frame.isInternal) {
      consecutiveInternal++;
      internalCount++;

      // In detailed mode, keep more frames
      if (detail === "detailed" && consecutiveInternal <= 3) {
        output.push(line);
        consecutiveInternal = 0;
      }
    } else {
      // If we have pending internal frames, summarize them
      if (consecutiveInternal > 0) {
        output.push(`    ... (${consecutiveInternal} internal frames omitted)`);
        consecutiveInternal = 0;
      }
      output.push(line);
    }
  }

  // Handle trailing internal frames
  if (consecutiveInternal > 0) {
    output.push(`    ... (${consecutiveInternal} internal frames omitted)`);
  }

  return { compressed: output, internalCount };
}

/**
 * Compress Python traceback
 */
function compressPythonStack(
  lines: string[],
  detail: "minimal" | "normal" | "detailed"
): { compressed: string[]; internalCount: number } {
  const output: string[] = [];
  let internalCount = 0;
  let consecutiveInternal = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Keep traceback header and error message
    if (line.startsWith("Traceback") || !line.startsWith("  ")) {
      if (consecutiveInternal > 0) {
        output.push(`  ... (${consecutiveInternal} internal frames omitted)`);
        consecutiveInternal = 0;
      }
      output.push(line);
      i++;
      continue;
    }

    // File line followed by code line
    if (line.trim().startsWith('File "')) {
      const isInternal =
        line.includes("site-packages") ||
        line.includes("/usr/lib/") ||
        line.includes("\\lib\\");

      if (isInternal) {
        consecutiveInternal++;
        internalCount++;
        // Skip the next line (code line) too
        i += 2;

        if (detail === "detailed" && consecutiveInternal <= 2) {
          output.push(line);
          if (lines[i - 1]) output.push(lines[i - 1] ?? "");
          consecutiveInternal = 0;
        }
      } else {
        if (consecutiveInternal > 0) {
          output.push(`  ... (${consecutiveInternal} internal frames omitted)`);
          consecutiveInternal = 0;
        }
        output.push(line);
        i++;
        // Include the code line
        if (i < lines.length) {
          output.push(lines[i] ?? "");
          i++;
        }
      }
    } else {
      output.push(line);
      i++;
    }
  }

  if (consecutiveInternal > 0) {
    output.push(`  ... (${consecutiveInternal} internal frames omitted)`);
  }

  return { compressed: output, internalCount };
}

/**
 * Generic stack compression (for Rust, Go, Java, etc.)
 */
function compressGenericStack(
  lines: string[],
  _detail: "minimal" | "normal" | "detailed"
): { compressed: string[]; internalCount: number } {
  const output: string[] = [];
  let internalCount = 0;
  let consecutiveInternal = 0;

  for (const line of lines) {
    const isInternal = isInternalFrame(line);

    if (isInternal) {
      consecutiveInternal++;
      internalCount++;
    } else {
      if (consecutiveInternal > 0) {
        output.push(`  ... (${consecutiveInternal} internal frames omitted)`);
        consecutiveInternal = 0;
      }
      output.push(line);
    }
  }

  if (consecutiveInternal > 0) {
    output.push(`  ... (${consecutiveInternal} internal frames omitted)`);
  }

  return { compressed: output, internalCount };
}

export const stacktraceCompressor: Compressor = {
  name: "stacktrace",
  supportedTypes: ["stacktrace"],

  canCompress(content: string): boolean {
    // Check for stack trace patterns
    const patterns = [
      /^(Error|TypeError|ReferenceError|SyntaxError|RangeError):/m,
      /^\s+at\s+/m,
      /^Traceback \(most recent call last\):/m,
      /^thread '.*' panicked at/m,
      /^goroutine \d+ \[/m,
    ];

    return patterns.some((pattern) => pattern.test(content));
  },

  compress(content: string, options: CompressOptions): CompressedResult {
    const lines = content.split("\n");
    const originalTokens = countTokens(content);

    // Detect stack type
    const stackType = detectStackType(content);

    // Compress based on type
    let result: { compressed: string[]; internalCount: number };

    switch (stackType) {
      case "javascript":
        result = compressJSStack(lines, options.detail);
        break;
      case "python":
        result = compressPythonStack(lines, options.detail);
        break;
      default:
        result = compressGenericStack(lines, options.detail);
    }

    const compressed = result.compressed.join("\n");
    const compressedTokens = countTokens(compressed);

    const reductionPercent =
      originalTokens > 0 ? Math.round((1 - compressedTokens / originalTokens) * 100) : 0;

    return {
      compressed,
      stats: {
        originalLines: lines.length,
        compressedLines: result.compressed.length,
        originalTokens,
        compressedTokens,
        reductionPercent,
        technique: `stacktrace-${stackType}`,
      },
      omittedInfo:
        result.internalCount > 0
          ? `${result.internalCount} internal/library frames summarized`
          : undefined,
    };
  },
};
