/**
 * Diff Compressor
 *
 * Compresses git diff output to reduce tokens while preserving essential changes.
 * Supports three strategies: hunks-only, summary, and semantic.
 */

import type {
  DiffHunk,
  FileDiff,
  ParsedDiff,
  DiffCompressOptions,
  DiffCompressedResult,
  CompressionStats,
} from "./types.js";
import { countTokens } from "../utils/token-counter.js";
import { calculateTFIDF, getSegmentTFIDFScore } from "../utils/tfidf.js";

// =============================================================================
// Diff Parser
// =============================================================================

/**
 * Parse unified diff format into structured data
 *
 * Handles:
 * - Standard unified diff (git diff, diff -u)
 * - File headers: diff --git a/path b/path
 * - Index lines: index abc123..def456 100644
 * - --- / +++ file markers
 * - @@ hunk headers
 * - Context lines (space prefix)
 * - Addition lines (+ prefix)
 * - Deletion lines (- prefix)
 * - Binary file indicators
 * - Renamed files (similarity index)
 */
export function parseDiff(diff: string): ParsedDiff {
  const files: FileDiff[] = [];
  const lines = diff.split("\n");

  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let hunkLines: string[] = [];

  for (const line of lines) {
    // Detect file header: diff --git a/path b/path
    if (line.startsWith("diff --git ")) {
      // Save previous file
      if (currentFile) {
        if (currentHunk) {
          currentHunk.content = hunkLines.join("\n");
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }

      // Parse paths from header
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      currentFile = {
        oldPath: match?.[1] ?? null,
        newPath: match?.[2] ?? null,
        status: "modified",
        isBinary: false,
        hunks: [],
        additions: 0,
        deletions: 0,
      };
      currentHunk = null;
      hunkLines = [];
      continue;
    }

    // Detect new file mode
    if (line.startsWith("new file mode")) {
      if (currentFile) currentFile.status = "added";
      continue;
    }

    // Detect deleted file mode
    if (line.startsWith("deleted file mode")) {
      if (currentFile) currentFile.status = "deleted";
      continue;
    }

    // Detect rename
    if (line.startsWith("similarity index") || line.startsWith("rename from")) {
      if (currentFile) currentFile.status = "renamed";
      continue;
    }

    // Detect binary file
    if (line.startsWith("Binary files")) {
      if (currentFile) currentFile.isBinary = true;
      continue;
    }

    // Detect hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith("@@")) {
      // Save previous hunk
      if (currentHunk && currentFile) {
        currentHunk.content = hunkLines.join("\n");
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      currentHunk = {
        oldStart: parseInt(match?.[1] ?? "0"),
        oldCount: parseInt(match?.[2] ?? "1"),
        newStart: parseInt(match?.[3] ?? "0"),
        newCount: parseInt(match?.[4] ?? "1"),
        content: "",
        additions: 0,
        deletions: 0,
      };
      hunkLines = [line]; // Include @@ header
      continue;
    }

    // Hunk content lines
    if (currentHunk) {
      hunkLines.push(line);
      if (line.startsWith("+") && !line.startsWith("+++")) {
        currentHunk.additions++;
        if (currentFile) currentFile.additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        currentHunk.deletions++;
        if (currentFile) currentFile.deletions++;
      }
    }
  }

  // Save final file/hunk
  if (currentFile) {
    if (currentHunk) {
      currentHunk.content = hunkLines.join("\n");
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return {
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
  };
}

// =============================================================================
// Compression Strategies
// =============================================================================

/**
 * Strategy 1: hunks-only
 * Keep only changed lines with minimal context
 */
function compressHunksOnly(
  parsed: ParsedDiff,
  contextLines: number = 1
): string {
  const output: string[] = [];

  for (const file of parsed.files) {
    // File header
    const path = file.newPath ?? file.oldPath ?? "unknown";
    const statusIcon = {
      modified: "M",
      added: "A",
      deleted: "D",
      renamed: "R",
    }[file.status];

    output.push(`${statusIcon} ${path}`);

    if (file.isBinary) {
      output.push("  (binary file)");
      continue;
    }

    // Process hunks
    for (const hunk of file.hunks) {
      // Simplified hunk header
      output.push(
        `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`
      );

      // Filter to only changed lines + minimal context
      const hunkContentLines = hunk.content.split("\n").slice(1); // Skip @@ header
      const relevantLines: string[] = [];
      const changeIndices: number[] = [];

      // Find all change indices
      hunkContentLines.forEach((line, idx) => {
        if (line.startsWith("+") || line.startsWith("-")) {
          changeIndices.push(idx);
        }
      });

      // Include lines near changes
      hunkContentLines.forEach((line, i) => {
        if (line.startsWith("+") || line.startsWith("-")) {
          relevantLines.push(line);
        } else if (line.startsWith(" ")) {
          // Context line - check if near a change
          const nearChange = changeIndices.some(
            (idx) => Math.abs(idx - i) <= contextLines
          );
          if (nearChange) {
            relevantLines.push(line);
          }
        }
      });

      output.push(...relevantLines);
    }
    output.push(""); // Blank line between files
  }

  return output.join("\n").trim();
}

/**
 * Strategy 2: summary
 * Generate human-readable summary without diff content
 */
function compressSummary(parsed: ParsedDiff): string {
  const output: string[] = [];

  // Overall summary
  output.push("## Diff Summary");
  output.push(`- Files changed: ${parsed.files.length}`);
  output.push(`- Additions: +${parsed.totalAdditions}`);
  output.push(`- Deletions: -${parsed.totalDeletions}`);
  output.push("");

  // Group by status
  const byStatus = {
    added: parsed.files.filter((f) => f.status === "added"),
    modified: parsed.files.filter((f) => f.status === "modified"),
    deleted: parsed.files.filter((f) => f.status === "deleted"),
    renamed: parsed.files.filter((f) => f.status === "renamed"),
  };

  // List new files
  if (byStatus.added.length > 0) {
    output.push(`### Added (${byStatus.added.length})`);
    for (const file of byStatus.added) {
      output.push(`- ${file.newPath} (+${file.additions})`);
    }
    output.push("");
  }

  // List modified files with change description
  if (byStatus.modified.length > 0) {
    output.push(`### Modified (${byStatus.modified.length})`);
    for (const file of byStatus.modified) {
      const changeDesc = `+${file.additions}/-${file.deletions}, ${file.hunks.length} hunk${file.hunks.length !== 1 ? "s" : ""}`;
      output.push(`- ${file.newPath}: ${changeDesc}`);
    }
    output.push("");
  }

  // List deleted files
  if (byStatus.deleted.length > 0) {
    output.push(`### Deleted (${byStatus.deleted.length})`);
    for (const file of byStatus.deleted) {
      output.push(`- ${file.oldPath} (-${file.deletions})`);
    }
    output.push("");
  }

  // List renamed files
  if (byStatus.renamed.length > 0) {
    output.push(`### Renamed (${byStatus.renamed.length})`);
    for (const file of byStatus.renamed) {
      output.push(`- ${file.oldPath} -> ${file.newPath}`);
    }
    output.push("");
  }

  return output.join("\n").trim();
}

/**
 * Strategy 3: semantic
 * Use TF-IDF to rank hunks by importance, keep most significant
 */
function compressSemantic(parsed: ParsedDiff, maxTokens: number): string {
  interface ScoredHunk {
    file: FileDiff;
    hunk: DiffHunk;
    score: number;
    tokens: number;
  }

  const allHunks: ScoredHunk[] = [];

  // Flatten hunks with file context
  for (const file of parsed.files) {
    for (const hunk of file.hunks) {
      allHunks.push({
        file,
        hunk,
        score: 0,
        tokens: countTokens(hunk.content),
      });
    }
  }

  if (allHunks.length === 0) {
    return compressSummary(parsed);
  }

  // Calculate TF-IDF scores for hunk content
  const hunkTexts = allHunks.map((h) => h.hunk.content);
  const tfidfMap = calculateTFIDF(hunkTexts);

  // Score each hunk
  allHunks.forEach((item, i) => {
    let score = getSegmentTFIDFScore(i, tfidfMap);
    const content = item.hunk.content;

    // Boost for certain patterns
    // Errors/exceptions are critical
    if (/error|exception|fail|throw|panic/i.test(content)) {
      score += 0.3;
    }

    // Function/class definitions are important
    if (
      /^[+-]\s*(export\s+)?(function|class|interface|type|const|let|var|def |fn |pub fn|func )/m.test(
        content
      )
    ) {
      score += 0.2;
    }

    // Test files have lower priority (usually verbose)
    if (/\.(test|spec)\.[jt]sx?$/.test(item.file.newPath ?? "")) {
      score -= 0.1;
    }

    // More changes = more important
    score += Math.min((item.hunk.additions + item.hunk.deletions) / 50, 0.2);

    item.score = Math.min(Math.max(score, 0), 1);
  });

  // Sort by score descending
  allHunks.sort((a, b) => b.score - a.score);

  // Select hunks until maxTokens
  const selected: ScoredHunk[] = [];
  let tokensUsed = 0;

  for (const item of allHunks) {
    if (tokensUsed + item.tokens <= maxTokens) {
      selected.push(item);
      tokensUsed += item.tokens;
    }
  }

  // If nothing selected, at least include summary
  if (selected.length === 0) {
    return compressSummary(parsed);
  }

  // Group by file and output
  const fileMap = new Map<string, ScoredHunk[]>();
  for (const item of selected) {
    const path = item.file.newPath ?? item.file.oldPath ?? "unknown";
    if (!fileMap.has(path)) {
      fileMap.set(path, []);
    }
    fileMap.get(path)!.push(item);
  }

  const output: string[] = [];
  output.push("## Semantic Diff Compression");
  output.push(
    `Showing ${selected.length} of ${allHunks.length} hunks (most important)`
  );
  output.push("");

  for (const [path, items] of fileMap) {
    output.push(`### ${path}`);
    output.push("```diff");
    for (const item of items) {
      output.push(item.hunk.content);
    }
    output.push("```");
    output.push("");
  }

  return output.join("\n").trim();
}

// =============================================================================
// Main Compressor
// =============================================================================

/**
 * Compress a git diff using the specified strategy
 */
export function compressDiff(
  diff: string,
  options: DiffCompressOptions
): DiffCompressedResult {
  const parsed = parseDiff(diff);

  // Extract file paths
  const filesChanged = parsed.files
    .map((f) => f.newPath ?? f.oldPath ?? "unknown")
    .filter((p) => p !== "unknown");

  // Calculate original tokens
  const originalTokens = countTokens(diff);

  // Apply compression strategy
  let compressed: string;
  let technique: string;

  switch (options.strategy) {
    case "hunks-only":
      compressed = compressHunksOnly(parsed, options.contextLines ?? 1);
      technique = "diff:hunks-only";
      break;
    case "summary":
      compressed = compressSummary(parsed);
      technique = "diff:summary";
      break;
    case "semantic": {
      const maxTokens = options.maxTokens ?? Math.ceil(originalTokens * 0.5);
      compressed = compressSemantic(parsed, maxTokens);
      technique = "diff:semantic";
      break;
    }
    default:
      compressed = compressHunksOnly(parsed);
      technique = "diff:hunks-only";
  }

  const compressedTokens = countTokens(compressed);

  // Generate summary
  const summary = `${parsed.files.length} file${parsed.files.length !== 1 ? "s" : ""} changed, +${parsed.totalAdditions}/-${parsed.totalDeletions}`;

  // Calculate stats
  const stats: CompressionStats = {
    originalLines: diff.split("\n").length,
    compressedLines: compressed.split("\n").length,
    originalTokens,
    compressedTokens,
    reductionPercent:
      originalTokens > 0
        ? Math.round((1 - compressedTokens / originalTokens) * 100)
        : 0,
    technique,
  };

  return {
    compressed,
    filesChanged,
    summary,
    additions: parsed.totalAdditions,
    deletions: parsed.totalDeletions,
    stats,
  };
}

/**
 * Diff compressor instance for use with tool system
 */
export const diffCompressor = {
  name: "diff",
  compress: compressDiff,
};
