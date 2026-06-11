/**
 * Auto-Optimize output formatting by response_format (US-012 decomposition).
 */

import type { OptimizationResult, ResponseFormat } from "./types.js";

export function formatOutput(result: OptimizationResult, responseFormat: ResponseFormat): string {
  const savings = Math.max(0, result.savingsPercent);
  switch (responseFormat) {
    case "minimal":
      return `(-${savings}%)\n${result.optimizedContent}`;
    case "detailed":
      return [
        `Strategy: ${result.detectedType}`,
        `Method: ${result.method}`,
        `Tokens: ${result.originalTokens} -> ${result.optimizedTokens} (-${savings}%)`,
        `---`,
        result.optimizedContent,
      ].join("\n");
    case "normal":
    default:
      return `[${result.detectedType}] ${result.originalTokens}->${result.optimizedTokens} tokens (-${savings}%)\n${result.optimizedContent}`;
  }
}
