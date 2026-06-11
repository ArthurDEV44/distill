/**
 * Auto-Optimize content detection + strategy resolution (US-012 decomposition).
 * Routing is preserved exactly from the pre-decomposition single file.
 */

import { detectContentType } from "../../utils/content-detector.js";
import type { ContentType } from "../../compressors/types.js";
import type { Strategy } from "./types.js";

function isBuildOutput(content: string): boolean {
  return (
    content.includes("error TS") ||
    content.includes("warning TS") ||
    content.includes("error[E") ||
    content.includes("error:") ||
    /\d+:\d+.*error/i.test(content) ||
    content.includes("npm ERR") ||
    content.includes("ERROR in")
  );
}

function isDiffOutput(content: string): boolean {
  return (
    content.includes("diff --git ") ||
    (content.includes("--- a/") && content.includes("+++ b/")) ||
    /^@@\s+-\d+/m.test(content)
  );
}

/**
 * Resolve the effective strategy from explicit strategy, legacy hint, and auto-detection.
 */
export function resolveStrategy(content: string, strategy: Strategy, hint?: string): Strategy {
  // Explicit strategy always wins (unless "auto")
  if (strategy !== "auto") return strategy;

  // Legacy hint support
  if (hint && hint !== "auto") {
    switch (hint) {
      case "build":
        return "build";
      case "logs":
        return "logs";
      case "errors":
        return "errors";
      case "code":
        return "semantic";
    }
  }

  // Auto-detection
  if (isBuildOutput(content)) return "build";
  if (isDiffOutput(content)) return "diff";

  const detectedType: ContentType = detectContentType(content);
  switch (detectedType) {
    case "logs":
      return "logs";
    case "stacktrace":
      return "stacktrace";
    case "config":
      return "config";
    case "code":
      return "semantic";
    default:
      return "auto"; // will fall through to generic
  }
}
