/**
 * Log Summarizers
 *
 * The summarizer subsystem has four implementations:
 *   - `serverLogsSummarizer`  — HTTP/server log shape
 *   - `testLogsSummarizer`    — test-runner output shape
 *   - `buildLogsSummarizer`   — build/compile log shape
 *   - `genericSummarizer`     — fallback, consumed by `auto_optimize` and
 *                               `sandbox/sdk/compress` when the content type
 *                               doesn't match a specialized summarizer
 *
 * `genericSummarizer` depends on three internal scoring/clustering modules
 * (`scoring.ts`, `clustering.ts`, `pattern-extraction.ts`) — first-class
 * production code, NOT optional plug-ins. They were mis-labeled as "advanced
 * 2026 extras" in v0.9.1 docs; v0.9.2 US-010 formally accepted them as
 * load-bearing (Path B from the v0.9.1 US-008 deviation note).
 */

export * from "./types.js";
export { serverLogsSummarizer } from "./server-logs.js";
export { testLogsSummarizer } from "./test-logs.js";
export { buildLogsSummarizer } from "./build-logs.js";
export { genericSummarizer } from "./generic.js";

// Internal modules consumed by genericSummarizer (re-exported for test access
// and downstream composition by sandbox/sdk/compress). Not optional.
export * from "./scoring.js";
export * from "./pattern-extraction.js";
export * from "./clustering.js";

import type { Summarizer, LogType } from "./types.js";
import { serverLogsSummarizer } from "./server-logs.js";
import { testLogsSummarizer } from "./test-logs.js";
import { buildLogsSummarizer } from "./build-logs.js";
import { genericSummarizer } from "./generic.js";

/**
 * All available summarizers in priority order
 */
export const summarizers: Summarizer[] = [
  serverLogsSummarizer,
  testLogsSummarizer,
  buildLogsSummarizer,
  genericSummarizer, // Fallback
];

/**
 * Get the appropriate summarizer for the given logs
 */
export function getSummarizer(logs: string, preferredType?: LogType): Summarizer {
  // If a type is specified, find that summarizer
  if (preferredType) {
    const preferred = summarizers.find((s) => s.logType === preferredType);
    if (preferred) {
      return preferred;
    }
  }

  // Auto-detect based on content
  for (const summarizer of summarizers) {
    if (summarizer.logType !== "generic" && summarizer.canSummarize(logs)) {
      return summarizer;
    }
  }

  // Fallback to generic
  return genericSummarizer;
}
