/**
 * Log Summarizers
 *
 * Exports all summarizers and utility functions.
 */

export * from "./types.js";
export { serverLogsSummarizer } from "./server-logs.js";
export { testLogsSummarizer } from "./test-logs.js";
export { buildLogsSummarizer } from "./build-logs.js";
export { genericSummarizer } from "./generic.js";

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
