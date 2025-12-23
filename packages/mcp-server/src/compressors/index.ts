/**
 * Compressors Index
 *
 * Orchestrates content compression with auto-detection and routing.
 */

export * from "./types.js";

import type { Compressor, CompressOptions, CompressedResult, ContentType } from "./types.js";
import { detectContentType } from "../utils/content-detector.js";
import { logsCompressor } from "./logs.js";
import { stacktraceCompressor } from "./stacktrace.js";
import { configCompressor } from "./config.js";
import { genericCompressor } from "./generic.js";

// Registered compressors in priority order
const compressors: Compressor[] = [
  logsCompressor,
  stacktraceCompressor,
  configCompressor,
  genericCompressor, // Fallback - always last
];

/**
 * Get the appropriate compressor for a content type
 */
export function getCompressor(contentType: ContentType): Compressor {
  for (const compressor of compressors) {
    if (compressor.supportedTypes.includes(contentType)) {
      return compressor;
    }
  }
  return genericCompressor;
}

/**
 * Compress content with auto-detection
 */
export function compressContent(
  content: string,
  options: Partial<CompressOptions> & { contentType?: ContentType } = {}
): CompressedResult {
  // Merge with defaults
  const opts: CompressOptions = {
    detail: options.detail ?? "normal",
    targetRatio: options.targetRatio,
    preservePatterns: options.preservePatterns,
  };

  // Detect or use provided content type
  const contentType = options.contentType ?? detectContentType(content);

  // Get appropriate compressor
  const compressor = getCompressor(contentType);

  // Compress
  const result = compressor.compress(content, opts);

  // Add content type info to technique
  result.stats.technique = `${contentType}:${result.stats.technique}`;

  return result;
}

/**
 * Analyze content and suggest compression approach
 */
export function analyzeContent(content: string): {
  detectedType: ContentType;
  suggestedCompressor: string;
  estimatedReduction: string;
} {
  const detectedType = detectContentType(content);
  const compressor = getCompressor(detectedType);

  // Estimate reduction based on content type
  let estimatedReduction: string;
  switch (detectedType) {
    case "logs":
      estimatedReduction = "70-90%";
      break;
    case "stacktrace":
      estimatedReduction = "50-80%";
      break;
    case "config":
      estimatedReduction = "30-60%";
      break;
    default:
      estimatedReduction = "20-50%";
  }

  return {
    detectedType,
    suggestedCompressor: compressor.name,
    estimatedReduction,
  };
}

// Re-export individual compressors for direct use
export { logsCompressor } from "./logs.js";
export { stacktraceCompressor } from "./stacktrace.js";
export { configCompressor } from "./config.js";
export { genericCompressor } from "./generic.js";
export { semanticCompressor } from "./semantic.js";
