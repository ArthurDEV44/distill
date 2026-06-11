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
 * Get the appropriate compressor for a content type.
 *
 * Routes ONLY among the dispatch array (logs, stacktrace, config, generic);
 * `genericCompressor` is the fallback. It never returns `semanticCompressor` or
 * `diffCompressor` — those are direct-only (see `./direct.js`).
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
 * Compress content with auto-detection.
 *
 * Detects the content type and runs the matching dispatch-array compressor
 * (logs / stacktrace / config / generic-dedup fallback). It does NOT perform
 * TF-IDF/semantic or diff compression — those are reached only via the explicit
 * `./direct.js` surface (used by `auto_optimize`'s `semantic`/`diff`
 * strategies). So `compressContent(codeText)` runs generic dedup, never an
 * implied semantic pass.
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
 * Analyze content and suggest a compression approach.
 *
 * `estimatedReductionRange` is an INDICATIVE per-content-type heuristic, not a
 * measured guarantee — actual savings depend on the input. The authoritative,
 * measured figure is `CompressedResult.stats` (`reductionPercent`) computed
 * post-hoc by the compressor on the real payload (US-007).
 */
export function analyzeContent(content: string): {
  detectedType: ContentType;
  suggestedCompressor: string;
  /** Indicative range (e.g. "70-90%"), NOT a measured result — see doc above. */
  estimatedReductionRange: string;
} {
  const detectedType = detectContentType(content);
  const compressor = getCompressor(detectedType);

  // Indicative-only estimate keyed on content type. Never asserted as achieved.
  let estimatedReductionRange: string;
  switch (detectedType) {
    case "logs":
      estimatedReductionRange = "70-90%";
      break;
    case "stacktrace":
      estimatedReductionRange = "50-80%";
      break;
    case "config":
      estimatedReductionRange = "30-60%";
      break;
    default:
      estimatedReductionRange = "20-50%";
  }

  return {
    detectedType,
    suggestedCompressor: compressor.name,
    estimatedReductionRange,
  };
}

// Re-export the dispatch-array compressors for direct use. These are exactly
// the compressors `getCompressor()` / `compressContent()` can route to, so this
// barrel's reachable set matches the dispatch table — no illusion of routing.
export { logsCompressor } from "./logs.js";
export { stacktraceCompressor } from "./stacktrace.js";
export { configCompressor } from "./config.js";
export { genericCompressor } from "./generic.js";

// NOTE (US-005): `semanticCompressor` / `diffCompressor` are intentionally NOT
// re-exported here — they are NOT in the dispatch array and are unreachable via
// compressContent(). Import them from `./direct.js`, the explicit direct-only
// surface, instead.
