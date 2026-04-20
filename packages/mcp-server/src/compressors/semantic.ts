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
 * Default chunk size for the line-based fallback segmentation (US-013).
 * Small enough to produce multiple scorable segments from dense content,
 * large enough to preserve local context within each segment.
 */
const LINE_FALLBACK_CHUNK_SIZE = 10;

/**
 * Default chunk count for the character-based fallback segmentation.
 * Used only when content has no line breaks at all (e.g., minified JSON).
 */
const CHAR_FALLBACK_CHUNK_COUNT = 10;

/**
 * Max input size for the character-chunk fallback path. Beyond this, the
 * synchronous slice+trim loop can stall the stdio event loop on adversarial
 * single-line input (e.g., a 100 MB minified blob). When exceeded, we skip
 * the fallback and let the compressor return the content as-is.
 */
const MAX_CHAR_FALLBACK_INPUT = 5_000_000;

/**
 * Fallback: split content into fixed-size line groups.
 * Used when blank-line segmentation yields ≤ 1 segment (US-013).
 */
function segmentByFixedLines(content: string, chunkSize: number): Segment[] {
  const lines = content.split("\n");
  const totalLines = lines.length;
  const segments: Segment[] = [];

  for (let i = 0; i < totalLines; i += chunkSize) {
    const end = Math.min(i + chunkSize, totalLines);
    const text = lines.slice(i, end).join("\n").trim();
    if (text) {
      segments.push(createSegment(text, i, end - 1, "line", totalLines));
    }
  }

  return segments;
}

/**
 * Deep fallback: split a single long line into roughly equal character chunks.
 * Used when content has no line breaks at all (e.g., minified JSON, long one-liners).
 *
 * Uses the chunk index as synthetic line coordinates so the position U-curve in
 * scoreSegment() still distributes scores across chunks. With constant
 * startLine=0/totalLines=1 the position signal would collapse and only TF-IDF
 * + keyword boosts would differentiate chunks.
 */
function segmentByCharChunks(content: string, chunkCount: number): Segment[] {
  const chunkSize = Math.max(1, Math.ceil(content.length / chunkCount));
  const totalChunks = Math.max(1, Math.ceil(content.length / chunkSize));
  const segments: Segment[] = [];
  let chunkIndex = 0;
  for (let i = 0; i < content.length; i += chunkSize) {
    const text = content.slice(i, i + chunkSize).trim();
    if (text) {
      segments.push(createSegment(text, chunkIndex, chunkIndex, "line", totalChunks));
    }
    chunkIndex++;
  }
  return segments;
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
    // Can compress any content with at least some substance
    // Very short content (<100 chars) has no room for meaningful compression
    return content.length >= 100;
  },

  compress(
    content: string,
    options: SemanticCompressOptions
  ): SemanticCompressedResult {
    const originalTokens = countTokens(content);
    const targetRatio = options.targetRatio ?? 0.5;

    // If content is already very small, return as-is
    // Below 50 tokens, compression would likely make content worse
    if (originalTokens < 50) {
      return {
        compressed: content,
        stats: {
          originalLines: content.split("\n").length,
          compressedLines: content.split("\n").length,
          originalTokens,
          compressedTokens: originalTokens,
          reductionPercent: 0,
          technique: "semantic-compression (no-op: content already optimized, <50 tokens)",
        },
        preservedSegments: [],
      };
    }

    const targetTokens = Math.floor(originalTokens * targetRatio);

    // Step 1: Segment content (blank-line-aware primary strategy)
    let segments = segmentContent(content);
    let usedFallback = false;

    // Fallback 1: blank-line segmentation yielded ≤ 1 segment → try fixed-size line chunks (US-013)
    if (segments.length <= 1) {
      const lineFallback = segmentByFixedLines(content, LINE_FALLBACK_CHUNK_SIZE);
      if (lineFallback.length > 1) {
        segments = lineFallback;
        usedFallback = true;
      }
    }

    // Fallback 2: content has no line breaks at all (single long line) → split by character chunks.
    // Skip on very large inputs — the synchronous slice+trim loop can stall the event loop.
    if (segments.length <= 1 && content.length <= MAX_CHAR_FALLBACK_INPUT) {
      const charFallback = segmentByCharChunks(content, CHAR_FALLBACK_CHUNK_COUNT);
      if (charFallback.length > 1) {
        segments = charFallback;
        usedFallback = true;
      }
    }

    // Still nothing to segment (content extremely short) — return as-is
    if (segments.length <= 1) {
      return {
        compressed: content,
        stats: {
          originalLines: content.split("\n").length,
          compressedLines: content.split("\n").length,
          originalTokens,
          compressedTokens: originalTokens,
          reductionPercent: 0,
          technique: "semantic-compression (no-op: atomic content, cannot segment)",
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
        technique: usedFallback ? "semantic-line-fallback" : "semantic-compression",
      },
      omittedInfo: `${segments.length - selected.length} of ${segments.length} segments removed based on importance scoring`,
      preservedSegments,
    };
  },
};

export default semanticCompressor;
