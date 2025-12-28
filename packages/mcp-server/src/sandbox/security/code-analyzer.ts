/**
 * Code Analyzer
 *
 * Static analysis of code before execution to block dangerous patterns.
 */

import type { CodeAnalysis } from "../types.js";

/**
 * Dangerous patterns that are blocked in sandbox code
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Code execution
  { pattern: /\beval\s*\(/, reason: "eval() is not allowed" },
  { pattern: /\bFunction\s*\(/, reason: "Function constructor is not allowed" },
  { pattern: /new\s+Function\s*\(/, reason: "new Function() is not allowed" },

  // Module system
  { pattern: /\brequire\s*\(/, reason: "require() is not allowed" },
  { pattern: /\bimport\s*\(/, reason: "dynamic import() is not allowed" },
  { pattern: /import\.meta/, reason: "import.meta is not allowed" },

  // Node.js globals
  { pattern: /\bprocess\b/, reason: "process is not allowed" },
  { pattern: /\bglobal\b/, reason: "global is not allowed" },
  { pattern: /\bglobalThis\b/, reason: "globalThis is not allowed" },
  { pattern: /\b__dirname\b/, reason: "__dirname is not allowed" },
  { pattern: /\b__filename\b/, reason: "__filename is not allowed" },
  { pattern: /\bBuffer\b/, reason: "Buffer is not allowed" },

  // Prototype pollution
  { pattern: /__proto__/, reason: "__proto__ is not allowed" },
  { pattern: /\.constructor\s*\[/, reason: "constructor access is not allowed" },
  { pattern: /\.prototype\s*\[/, reason: "prototype access is not allowed" },

  // Reflection APIs
  { pattern: /\bReflect\b/, reason: "Reflect is not allowed" },
  { pattern: /\bProxy\b/, reason: "Proxy is not allowed" },

  // Unsafe operations
  { pattern: /\bsetTimeout\s*\(/, reason: "setTimeout is not allowed (use await)" },
  { pattern: /\bsetInterval\s*\(/, reason: "setInterval is not allowed" },
  { pattern: /\bsetImmediate\s*\(/, reason: "setImmediate is not allowed" },

  // File system escape attempts
  { pattern: /file:\/\//, reason: "file:// URLs are not allowed" },
  { pattern: /\.\.\/\.\.\//, reason: "path traversal is not allowed" },
];

/**
 * Warning patterns (not blocked, but flagged)
 */
const WARNING_PATTERNS: Array<{ pattern: RegExp; warning: string }> = [
  { pattern: /while\s*\(\s*true\s*\)/, warning: "infinite loop detected" },
  { pattern: /for\s*\(\s*;\s*;\s*\)/, warning: "infinite loop detected" },
  { pattern: /\.repeat\s*\(\s*\d{6,}\s*\)/, warning: "large string repeat" },
];

/**
 * Analyze code for security issues
 */
export function analyzeCode(code: string): CodeAnalysis {
  const blockedPatterns: string[] = [];
  const warnings: string[] = [];

  // Check blocked patterns
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      blockedPatterns.push(reason);
    }
  }

  // Check warning patterns
  for (const { pattern, warning } of WARNING_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(warning);
    }
  }

  return {
    safe: blockedPatterns.length === 0,
    warnings,
    blockedPatterns,
  };
}

/**
 * Sanitize error messages to remove host paths
 */
export function sanitizeError(error: Error, workingDir: string): string {
  let message = error.message || "Unknown error";

  // Remove absolute paths
  message = message.replace(new RegExp(workingDir, "g"), "<workdir>");
  message = message.replace(/\/home\/[^/]+/g, "<home>");
  message = message.replace(/C:\\Users\\[^\\]+/gi, "<home>");

  // Remove stack traces with host info
  if (error.stack) {
    const firstLine = message.split("\n")[0];
    return firstLine || message;
  }

  return message;
}
