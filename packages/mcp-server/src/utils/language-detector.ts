/**
 * Language Detector
 *
 * Detects programming language from file path extension.
 */

import * as path from "path";
import type { SupportedLanguage } from "../ast/types.js";

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  // TypeScript
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",

  // JavaScript
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",

  // Python
  ".py": "python",
  ".pyw": "python",
  ".pyi": "python",

  // Go
  ".go": "go",

  // Rust
  ".rs": "rust",

  // PHP
  ".php": "php",
  ".phtml": "php",
  ".php3": "php",
  ".php4": "php",
  ".php5": "php",
  ".php7": "php",
  ".phps": "php",

  // Swift
  ".swift": "swift",

  // Config files
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
};

/**
 * Detect language from file path
 */
export function detectLanguageFromPath(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? "unknown";
}

/**
 * Get file extension for a language
 */
export function getExtensionsForLanguage(language: SupportedLanguage): string[] {
  return Object.entries(EXTENSION_MAP)
    .filter(([, lang]) => lang === language)
    .map(([ext]) => ext);
}

/**
 * Check if language is supported for AST parsing
 */
export function isASTSupported(language: SupportedLanguage): boolean {
  return language === "typescript" || language === "javascript";
}

/**
 * Check if language is supported for regex parsing
 */
export function isRegexSupported(language: SupportedLanguage): boolean {
  return language === "python" || language === "go" || language === "rust";
}

/**
 * Get language display name
 */
export function getLanguageDisplayName(language: SupportedLanguage): string {
  switch (language) {
    case "typescript":
      return "TypeScript";
    case "javascript":
      return "JavaScript";
    case "python":
      return "Python";
    case "go":
      return "Go";
    case "rust":
      return "Rust";
    case "php":
      return "PHP";
    case "swift":
      return "Swift";
    case "json":
      return "JSON";
    case "yaml":
      return "YAML";
    case "unknown":
      return "Unknown";
  }
}
