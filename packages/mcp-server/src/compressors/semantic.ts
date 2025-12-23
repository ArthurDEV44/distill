/**
 * Semantic Compressor
 *
 * Compresses content based on semantic importance using:
 * - TF-IDF scoring for unique/rare terms
 * - Position weighting (beginning/end prioritized)
 * - Keyword detection (errors, instructions, code)
 *
 * Phase 2: Rule-based implementation (no ML models)
 */

import type { Compressor, CompressOptions, CompressedResult } from "./types.js";
import { countTokens } from "../utils/token-counter.js";
import { calculateTFIDF, getSegmentTFIDFScore } from "../utils/tfidf.js";
import {
  createSegment,
  scoreSegment,
  hasErrorIndicators,
  type Segment,
  type ScoredSegment,
  type SegmentType,
} from "../utils/segment-scorer.js";

/**
 * Extended options for semantic compression
 */
export interface SemanticCompressOptions extends CompressOptions {
  /** Target compression ratio (0.5 = keep 50%). Default: 0.5 */
  targetRatio?: number;
  /** Compression model: 'fast' for rule-based. Default: 'fast' */
  model?: "fast";
}

/**
 * Extended result with preserved segments info
 */
export interface SemanticCompressedResult extends CompressedResult {
  /** Segments that were explicitly preserved */
  preservedSegments: string[];
}

/**
 * Segment content into meaningful chunks
 * Respects:
 * - Code blocks (keep as single unit)
 * - Paragraphs (separated by blank lines)
 * - Error lines (keep intact)
 */
function segmentContent(content: string): Segment[] {
  const segments: Segment[] = [];
  const lines = content.split("\n");
  const totalLines = lines.length;

  let currentSegment: string[] = [];
  let startLine = 0;
  let inCodeBlock = false;
  let codeBlockMarker = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmedLine = line.trim();

    // Track code blocks (``` or ~~~)
    if (trimmedLine.startsWith("```") || trimmedLine.startsWith("~~~")) {
      const marker = trimmedLine.slice(0, 3);

      if (!inCodeBlock) {
        // Start of code block - save previous segment first
        if (currentSegment.length > 0) {
          const text = currentSegment.join("\n").trim();
          if (text) {
            segments.push(
              createSegment(text, startLine, i - 1, "paragraph", totalLines)
            );
          }
        }
        currentSegment = [line];
        startLine = i;
        inCodeBlock = true;
        codeBlockMarker = marker;
      } else if (marker === codeBlockMarker) {
        // End of code block
        currentSegment.push(line);
        const text = currentSegment.join("\n");
        segments.push(
          createSegment(text, startLine, i, "code-block", totalLines)
        );
        currentSegment = [];
        startLine = i + 1;
        inCodeBlock = false;
        codeBlockMarker = "";
      } else {
        // Different marker inside code block, treat as content
        currentSegment.push(line);
      }
      continue;
    }

    if (inCodeBlock) {
      currentSegment.push(line);
      continue;
    }

    // Empty line ends a paragraph
    if (trimmedLine === "") {
      if (currentSegment.length > 0) {
        const text = currentSegment.join("\n").trim();
        if (text) {
          // Check if this segment contains errors - treat as separate lines if so
          if (hasErrorIndicators(text) && currentSegment.length > 1) {
            // Split error-containing segments into individual lines
            for (let j = 0; j < currentSegment.length; j++) {
              const lineText = currentSegment[j]!.trim();
              if (lineText) {
                segments.push(
                  createSegment(lineText, startLine + j, startLine + j, "line", totalLines)
                );
              }
            }
          } else {
            segments.push(
              createSegment(text, startLine, i - 1, "paragraph", totalLines)
            );
          }
        }
        currentSegment = [];
      }
      startLine = i + 1;
      continue;
    }

    currentSegment.push(line);
  }

  // Handle remaining content
  if (currentSegment.length > 0) {
    const text = currentSegment.join("\n").trim();
    if (text) {
      const type: SegmentType = inCodeBlock ? "code-block" : "paragraph";
      segments.push(createSegment(text, startLine, lines.length - 1, type, totalLines));
    }
  }

  return segments;
}

/**
 * Select segments to keep based on importance and target ratio
 */
function selectSegments(
  scored: ScoredSegment[],
  targetTokens: number,
  preservePatterns?: RegExp[]
): ScoredSegment[] {
  // Separate preserved segments (must keep) from regular
  const preserved: ScoredSegment[] = [];
  const regular: ScoredSegment[] = [];

  for (const segment of scored) {
    const isPreservedByPattern = preservePatterns?.some((p) =>
      p.test(segment.text)
    );
    if (segment.isPreserved || isPreservedByPattern) {
      segment.isPreserved = true;
      preserved.push(segment);
    } else {
      regular.push(segment);
    }
  }

  // Sort regular segments by importance (descending)
  regular.sort((a, b) => b.importance - a.importance);

  // Calculate tokens used by preserved segments
  let tokensUsed = preserved.reduce((sum, s) => sum + s.tokens, 0);
  const selected: ScoredSegment[] = [...preserved];

  // Add regular segments until we hit target
  for (const segment of regular) {
    if (tokensUsed + segment.tokens <= targetTokens) {
      selected.push(segment);
      tokensUsed += segment.tokens;
    } else if (tokensUsed >= targetTokens) {
      // Already at target
      break;
    }
  }

  // Sort by original position to maintain reading order
  selected.sort((a, b) => a.startLine - b.startLine);

  return selected;
}

/**
 * Semantic compressor implementation
 */
export const semanticCompressor: Compressor = {
  name: "semantic",
  supportedTypes: ["generic", "code", "logs"],

  canCompress(content: string): boolean {
    // Can compress any content, but most effective on longer content
    // Short content (<500 chars) has little room for meaningful compression
    return content.length > 200;
  },

  compress(
    content: string,
    options: SemanticCompressOptions
  ): SemanticCompressedResult {
    const originalTokens = countTokens(content);
    const targetRatio = options.targetRatio ?? 0.5;

    // If content is already small, return as-is
    if (originalTokens < 100) {
      return {
        compressed: content,
        stats: {
          originalLines: content.split("\n").length,
          compressedLines: content.split("\n").length,
          originalTokens,
          compressedTokens: originalTokens,
          reductionPercent: 0,
          technique: "semantic-compression (no-op: content too small)",
        },
        preservedSegments: [],
      };
    }

    const targetTokens = Math.floor(originalTokens * targetRatio);

    // Step 1: Segment content
    const segments = segmentContent(content);

    // If we only have one segment, can't compress further
    if (segments.length <= 1) {
      return {
        compressed: content,
        stats: {
          originalLines: content.split("\n").length,
          compressedLines: content.split("\n").length,
          originalTokens,
          compressedTokens: originalTokens,
          reductionPercent: 0,
          technique: "semantic-compression (no-op: single segment)",
        },
        preservedSegments: [],
      };
    }

    // Step 2: Calculate TF-IDF scores
    const segmentTexts = segments.map((s) => s.text);
    const tfidfMap = calculateTFIDF(segmentTexts);

    // Step 3: Score each segment
    const scored: ScoredSegment[] = segments.map((segment, i) => {
      const tfidfScore = getSegmentTFIDFScore(i, tfidfMap);
      return scoreSegment(segment, tfidfScore);
    });

    // Step 4: Mark segments that match preserve patterns
    if (options.preservePatterns) {
      for (const segment of scored) {
        if (options.preservePatterns.some((p) => p.test(segment.text))) {
          segment.isPreserved = true;
        }
      }
    }

    // Step 5: Select segments to keep
    const selected = selectSegments(
      scored,
      targetTokens,
      options.preservePatterns
    );

    // Step 6: Reconstruct compressed text
    const compressed = selected.map((s) => s.text).join("\n\n");
    const compressedTokens = countTokens(compressed);

    // Calculate stats
    const reductionPercent =
      originalTokens > 0
        ? Math.round((1 - compressedTokens / originalTokens) * 100)
        : 0;

    // Build preserved segments list (truncated for display)
    const preservedSegments = selected
      .filter((s) => s.isPreserved)
      .map((s) => (s.text.length > 50 ? s.text.slice(0, 47) + "..." : s.text));

    return {
      compressed,
      stats: {
        originalLines: content.split("\n").length,
        compressedLines: compressed.split("\n").length,
        originalTokens,
        compressedTokens,
        reductionPercent,
        technique: "semantic-compression",
      },
      omittedInfo: `${segments.length - selected.length} of ${segments.length} segments removed based on importance scoring`,
      preservedSegments,
    };
  },
};

export default semanticCompressor;
