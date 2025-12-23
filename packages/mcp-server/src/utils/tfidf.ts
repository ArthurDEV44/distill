/**
 * TF-IDF (Term Frequency - Inverse Document Frequency) Utilities
 *
 * Provides local TF-IDF calculation for semantic importance scoring.
 * No external ML models required - pure algorithmic implementation.
 */

/**
 * TF-IDF result for a single term
 */
export interface TFIDFScore {
  term: string;
  tf: number; // Term frequency in segment
  idf: number; // Inverse document frequency
  tfidf: number; // Combined score
}

/**
 * TF-IDF scores for all terms in all segments
 */
export type TFIDFMap = Map<number, TFIDFScore[]>;

// Common stopwords to filter out (they don't carry semantic meaning)
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "been",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "dare",
  "ought",
  "used",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "what",
  "which",
  "who",
  "whom",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "also",
]);

/**
 * Tokenize text into words for TF-IDF analysis
 * - Lowercase
 * - Remove punctuation
 * - Filter stopwords
 * - Keep words with 2+ characters
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word));
}

/**
 * Calculate term frequency for a segment
 * TF = count of term / total terms in segment
 */
function calculateTF(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const tf = new Map<string, number>();
  const total = tokens.length || 1;
  for (const [term, count] of counts) {
    tf.set(term, count / total);
  }
  return tf;
}

/**
 * Calculate document frequency for all terms
 * DF = number of segments containing the term
 */
function calculateDF(segmentTokens: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of segmentTokens) {
    const uniqueTerms = new Set(tokens);
    for (const term of uniqueTerms) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  return df;
}

/**
 * Calculate TF-IDF scores for all segments
 *
 * @param segments - Array of text segments to analyze
 * @returns Map of segment index to TF-IDF scores for each term
 */
export function calculateTFIDF(segments: string[]): TFIDFMap {
  const result: TFIDFMap = new Map();

  if (segments.length === 0) {
    return result;
  }

  // Tokenize all segments
  const segmentTokens = segments.map(tokenize);

  // Calculate document frequency
  const df = calculateDF(segmentTokens);
  const numSegments = segments.length;

  // Calculate TF-IDF for each segment
  for (let i = 0; i < segments.length; i++) {
    const tokens = segmentTokens[i]!;
    const tf = calculateTF(tokens);
    const scores: TFIDFScore[] = [];

    for (const [term, tfScore] of tf) {
      const dfScore = df.get(term) ?? 1;
      // IDF = log(N / df) where N is total segments
      const idf = Math.log(numSegments / dfScore);
      const tfidf = tfScore * idf;

      scores.push({ term, tf: tfScore, idf, tfidf });
    }

    // Sort by TF-IDF score descending
    scores.sort((a, b) => b.tfidf - a.tfidf);
    result.set(i, scores);
  }

  return result;
}

/**
 * Get the average TF-IDF score for a segment
 * Higher score = more unique/important content
 *
 * @param segmentIndex - Index of the segment
 * @param tfidfMap - Pre-calculated TF-IDF scores
 * @returns Average TF-IDF score (0-1 normalized)
 */
export function getSegmentTFIDFScore(
  segmentIndex: number,
  tfidfMap: TFIDFMap
): number {
  const scores = tfidfMap.get(segmentIndex);
  if (!scores || scores.length === 0) {
    return 0;
  }

  // Calculate average TF-IDF
  const sum = scores.reduce((acc, s) => acc + s.tfidf, 0);
  const avg = sum / scores.length;

  // Normalize to 0-1 range (typical TF-IDF values are 0-2)
  return Math.min(avg / 2, 1);
}

/**
 * Get top terms for a segment (useful for debugging/display)
 *
 * @param segmentIndex - Index of the segment
 * @param tfidfMap - Pre-calculated TF-IDF scores
 * @param topN - Number of top terms to return
 * @returns Array of top terms with scores
 */
export function getTopTerms(
  segmentIndex: number,
  tfidfMap: TFIDFMap,
  topN: number = 5
): TFIDFScore[] {
  const scores = tfidfMap.get(segmentIndex);
  if (!scores) {
    return [];
  }
  return scores.slice(0, topN);
}
