/**
 * Signature Grouper
 *
 * Groups error lines by their normalized signature for deduplication.
 */

import {
  normalizeErrorLine,
  extractErrorParts,
  createSignature,
  formatLocation,
  isLikelyError,
  type ErrorParts,
} from "./error-normalizer.js";

export interface GroupOptions {
  /** Minimum occurrences to consider as duplicate (default: 2) */
  threshold: number;
  /** Number of first occurrences to keep in full (default: 1) */
  keepFirst: number;
  /** Custom regex pattern to identify errors */
  customPattern?: RegExp;
  /** Maximum samples to keep per group */
  maxSamples?: number;
}

export interface DeduplicatedErrorGroup {
  /** Normalized signature for this error type */
  signature: string;
  /** Number of occurrences */
  count: number;
  /** First full occurrence (raw line) */
  firstOccurrence: string;
  /** Locations where this error occurred */
  locations: string[];
  /** Sample raw lines (up to maxSamples) */
  samples: string[];
  /** Error code if available */
  code?: string;
  /** Cleaned message without location info */
  message: string;
}

export interface GroupingResult {
  /** Grouped errors by signature */
  groups: Map<string, DeduplicatedErrorGroup>;
  /** Lines that don't match error patterns */
  nonErrorLines: string[];
  /** Total error lines processed */
  totalErrorLines: number;
}

const DEFAULT_OPTIONS: GroupOptions = {
  threshold: 2,
  keepFirst: 1,
  maxSamples: 3,
};

/**
 * Group error lines by their normalized signature
 */
export function groupBySignature(
  lines: string[],
  options: Partial<GroupOptions> = {}
): GroupingResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const groups = new Map<string, DeduplicatedErrorGroup>();
  const nonErrorLines: string[] = [];
  let totalErrorLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check custom pattern first
    if (opts.customPattern) {
      if (opts.customPattern.test(trimmed)) {
        processErrorLine(trimmed, groups, opts);
        totalErrorLines++;
        continue;
      }
    }

    // Try to extract error parts
    const parts = extractErrorParts(trimmed);
    if (parts) {
      processErrorLineWithParts(trimmed, parts, groups, opts);
      totalErrorLines++;
    } else if (isLikelyError(trimmed)) {
      // Line looks like an error but doesn't match patterns
      processErrorLine(trimmed, groups, opts);
      totalErrorLines++;
    } else {
      nonErrorLines.push(trimmed);
    }
  }

  return {
    groups,
    nonErrorLines,
    totalErrorLines,
  };
}

/**
 * Process an error line with extracted parts
 */
function processErrorLineWithParts(
  rawLine: string,
  parts: ErrorParts,
  groups: Map<string, DeduplicatedErrorGroup>,
  options: GroupOptions
): void {
  const signature = createSignature(parts);
  const location = formatLocation(parts);

  if (groups.has(signature)) {
    const group = groups.get(signature)!;
    group.count++;
    if (location && !group.locations.includes(location)) {
      group.locations.push(location);
    }
    if (group.samples.length < (options.maxSamples ?? 3)) {
      group.samples.push(rawLine);
    }
  } else {
    groups.set(signature, {
      signature,
      count: 1,
      firstOccurrence: rawLine,
      locations: location ? [location] : [],
      samples: [rawLine],
      code: parts.code,
      message: parts.message,
    });
  }
}

/**
 * Process an error line without structured parts
 */
function processErrorLine(
  rawLine: string,
  groups: Map<string, DeduplicatedErrorGroup>,
  options: GroupOptions
): void {
  const signature = normalizeErrorLine(rawLine);

  if (groups.has(signature)) {
    const group = groups.get(signature)!;
    group.count++;
    if (group.samples.length < (options.maxSamples ?? 3)) {
      group.samples.push(rawLine);
    }
  } else {
    groups.set(signature, {
      signature,
      count: 1,
      firstOccurrence: rawLine,
      locations: [],
      samples: [rawLine],
      message: rawLine,
    });
  }
}

/**
 * Format grouped errors as a readable string
 */
export function formatGroups(
  result: GroupingResult,
  options: Partial<GroupOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const parts: string[] = [];

  // Sort groups by count (most frequent first)
  const sortedGroups = Array.from(result.groups.values()).sort((a, b) => b.count - a.count);

  // Separate duplicates from unique errors
  const duplicates = sortedGroups.filter((g) => g.count >= opts.threshold);
  const unique = sortedGroups.filter((g) => g.count < opts.threshold);

  // Format duplicated errors
  if (duplicates.length > 0) {
    parts.push("## Deduplicated Errors\n");

    for (const [i, group] of duplicates.entries()) {
      parts.push(`### ${i + 1}. ${group.code ? `${group.code}: ` : ""}${truncateMessage(group.message, 80)}`);
      parts.push(`**Occurrences:** ${group.count}`);

      // Show first occurrence
      parts.push(`**First:** \`${truncateMessage(group.firstOccurrence, 100)}\``);

      // Show locations if available
      if (group.locations.length > 1) {
        const otherLocations = group.locations.slice(1, 6);
        const remaining = group.locations.length - 6;
        parts.push(
          `**Also in:** ${otherLocations.join(", ")}${remaining > 0 ? ` (+${remaining} more)` : ""}`
        );
      }

      parts.push("");
    }
  }

  // Show unique errors if any (below threshold)
  if (unique.length > 0 && opts.keepFirst > 0) {
    parts.push("## Unique Errors\n");
    for (const group of unique.slice(0, opts.keepFirst * 5)) {
      parts.push(`- ${group.firstOccurrence}`);
    }
    if (unique.length > opts.keepFirst * 5) {
      parts.push(`\n*...and ${unique.length - opts.keepFirst * 5} more unique errors*`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Truncate a message to a maximum length
 */
function truncateMessage(message: string, maxLength: number): string {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength - 3) + "...";
}

/**
 * Calculate deduplication statistics
 */
export function calculateStats(result: GroupingResult): {
  originalLines: number;
  deduplicatedLines: number;
  uniqueErrors: number;
  totalDuplicates: number;
  reductionPercent: number;
} {
  const originalLines = result.totalErrorLines + result.nonErrorLines.length;
  const uniqueErrors = result.groups.size;
  const totalDuplicates = result.totalErrorLines - uniqueErrors;
  const deduplicatedLines = uniqueErrors + result.nonErrorLines.length;
  const reductionPercent =
    originalLines > 0 ? Math.round(((originalLines - deduplicatedLines) / originalLines) * 100) : 0;

  return {
    originalLines,
    deduplicatedLines,
    uniqueErrors,
    totalDuplicates,
    reductionPercent,
  };
}
