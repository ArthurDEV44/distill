/**
 * Segment Scorer
 *
 * Combines multiple scoring signals to determine segment importance:
 * - TF-IDF: Unique/rare terms are more important
 * - Position: Beginning and end of content are more important
 * - Keywords: Errors, instructions, code blocks get priority
 */

import { countTokens } from "./token-counter.js";

/**
 * Segment types based on content structure
 */
export type SegmentType = "sentence" | "line" | "paragraph" | "code-block";

/**
 * A segment of content with metadata
 */
export interface Segment {
  text: string;
  startLine: number;
  endLine: number;
  type: SegmentType;
  /** Normalized position in document (0-1) */
  position: number;
  /** Token count for this segment */
  tokens: number;
  /** Whether this segment matches a preserve pattern */
  isPreserved: boolean;
}

/**
 * Segment with calculated importance scores
 */
export interface ScoredSegment extends Segment {
  /** Combined importance score (0-1) */
  importance: number;
  /** Individual score components */
  scores: {
    tfidf: number;
    position: number;
    keyword: number;
    combined: number;
  };
}

/**
 * Weights for combining different scoring signals
 */
export interface ScoringWeights {
  tfidf: number;
  position: number;
  keyword: number;
}

/**
 * Default scoring weights (must sum to 1.0)
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  tfidf: 0.4, // Unique content
  position: 0.3, // Location in document
  keyword: 0.3, // Important terms
};

/**
 * Calculate position weight using a U-shaped curve
 * Beginning (0-10%) and end (90-100%) get highest weight
 * Middle content gets lower weight
 *
 * @param position - Normalized position (0-1)
 * @returns Position weight (0.6-1.0)
 */
export function calculatePositionWeight(position: number): number {
  // U-shaped curve: high at edges, low in middle
  if (position <= 0.1 || position >= 0.9) {
    return 1.0; // First/last 10% are most important
  }
  if (position <= 0.2 || position >= 0.8) {
    return 0.85; // Next 10% still important
  }
  if (position <= 0.3 || position >= 0.7) {
    return 0.7; // Transitional zones
  }
  return 0.6; // Middle content baseline
}

/**
 * Keyword patterns for importance detection
 */
const KEYWORD_PATTERNS = {
  // Errors and failures (highest priority)
  errors:
    /\b(error|Error|ERROR|fail|Fail|FAIL|failed|exception|Exception|EXCEPTION|panic|crash|fatal|critical)\b/,

  // Instructions and requirements
  instructions:
    /\b(must|MUST|should|SHOULD|required|Required|REQUIRED|important|Important|IMPORTANT|note|Note|NOTE|warning|Warning|WARNING|todo|TODO|fixme|FIXME)\b/,

  // Code blocks (markdown)
  codeBlocks: /```[\s\S]*?```|`[^`]+`/,

  // Technical terms (programming)
  technical:
    /\b(function|class|interface|type|const|let|var|async|await|return|import|export|def|fn|struct|impl|pub|private|public|protected)\b/,

  // Structural markers (headers, lists)
  structural: /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/m,

  // Questions (often need answers preserved)
  questions: /\?[\s]*$/m,

  // URLs and references
  references: /https?:\/\/[^\s]+|@\w+|#\w+/,
};

/**
 * Calculate keyword boost based on content patterns
 * Multiple matches compound additively up to 1.0
 *
 * @param text - Segment text to analyze
 * @returns Keyword boost (0-1)
 */
export function calculateKeywordBoost(text: string): number {
  let boost = 0;

  if (KEYWORD_PATTERNS.errors.test(text)) {
    boost += 0.4; // Errors are critical
  }
  if (KEYWORD_PATTERNS.instructions.test(text)) {
    boost += 0.3; // Instructions are important
  }
  if (KEYWORD_PATTERNS.codeBlocks.test(text)) {
    boost += 0.2; // Code should be preserved
  }
  if (KEYWORD_PATTERNS.structural.test(text)) {
    boost += 0.15; // Structure helps comprehension
  }
  if (KEYWORD_PATTERNS.technical.test(text)) {
    boost += 0.1; // Technical content is usually relevant
  }
  if (KEYWORD_PATTERNS.questions.test(text)) {
    boost += 0.15; // Questions need context
  }
  if (KEYWORD_PATTERNS.references.test(text)) {
    boost += 0.1; // References are informational
  }

  return Math.min(boost, 1.0); // Cap at 1.0
}

/**
 * Create a segment from text
 *
 * @param text - Segment text
 * @param startLine - Starting line number
 * @param endLine - Ending line number
 * @param type - Segment type
 * @param totalLines - Total lines in document (for position calculation)
 * @returns Segment object
 */
export function createSegment(
  text: string,
  startLine: number,
  endLine: number,
  type: SegmentType,
  totalLines: number
): Segment {
  return {
    text,
    startLine,
    endLine,
    type,
    position: totalLines > 0 ? startLine / totalLines : 0,
    tokens: countTokens(text),
    isPreserved: false,
  };
}

/**
 * Score a segment combining all signals
 *
 * @param segment - Segment to score
 * @param tfidfScore - Pre-calculated TF-IDF score (0-1)
 * @param weights - Scoring weights
 * @returns Scored segment with importance
 */
export function scoreSegment(
  segment: Segment,
  tfidfScore: number,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredSegment {
  const positionScore = calculatePositionWeight(segment.position);
  const keywordScore = calculateKeywordBoost(segment.text);

  // Weighted combination
  const combined =
    weights.tfidf * tfidfScore +
    weights.position * positionScore +
    weights.keyword * keywordScore;

  return {
    ...segment,
    importance: combined,
    scores: {
      tfidf: tfidfScore,
      position: positionScore,
      keyword: keywordScore,
      combined,
    },
  };
}

/**
 * Check if text contains error indicators
 */
export function hasErrorIndicators(text: string): boolean {
  return KEYWORD_PATTERNS.errors.test(text);
}

/**
 * Check if text contains instruction indicators
 */
export function hasInstructionIndicators(text: string): boolean {
  return KEYWORD_PATTERNS.instructions.test(text);
}
