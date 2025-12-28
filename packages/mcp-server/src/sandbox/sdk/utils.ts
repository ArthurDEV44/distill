/**
 * SDK Utility Functions
 */

import { countTokens as count } from "../../utils/token-counter.js";
import { detectContentType } from "../../utils/content-detector.js";
import { detectLanguageFromPath } from "../../utils/language-detector.js";
import type { ContentType } from "../../compressors/types.js";
import type { SupportedLanguage } from "../../ast/types.js";

/**
 * Count tokens in text
 */
export function countTokens(text: string): number {
  return count(text);
}

/**
 * Detect content type (logs, stacktrace, code, etc.)
 */
export function detectType(content: string): ContentType {
  return detectContentType(content);
}

/**
 * Detect programming language from file path
 */
export function detectLanguage(filePath: string): SupportedLanguage {
  return detectLanguageFromPath(filePath);
}
