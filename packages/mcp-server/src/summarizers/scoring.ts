/**
 * Log Scoring Module
 *
 * Provides sophisticated scoring for log entries using BM25/TF-IDF
 * and multi-factor importance ranking based on 2025-2026 best practices.
 *
 * References:
 * - BM25: https://www.myscale.com/blog/bm25-vs-tf-idf-deep-dive-comparison/
 * - LayerLog: Hierarchical semantics for log analysis
 * - ClusterLog: Semantic similarity for log grouping
 */

import type { LogEntry, LogLevel } from "./types.js";
import { calculateTFIDF, getSegmentTFIDFScore, type TFIDFMap } from "../utils/tfidf.js";

/**
 * Weight configuration for multi-factor scoring
 */
export interface ScoringWeights {
  /** Weight for log level importance (error > warning > info) */
  level: number;
  /** Weight for TF-IDF content uniqueness */
  tfidf: number;
  /** Weight for positional importance (beginning/end) */
  position: number;
  /** Weight for pattern rarity (inverse frequency) */
  rarity: number;
}

/**
 * Default weights based on log analysis best practices
 */
export const DEFAULT_WEIGHTS: ScoringWeights = {
  level: 0.3,
  tfidf: 0.3,
  position: 0.2,
  rarity: 0.2,
} as const;

/**
 * Log level importance scores
 */
const LEVEL_SCORES: Record<LogLevel, number> = {
  error: 1.0,
  warning: 0.7,
  info: 0.3,
  debug: 0.1,
} as const;

/**
 * Scored log entry with computed importance
 */
export interface ScoredLogEntry extends LogEntry {
  /** Overall importance score (0-1) */
  score: number;
  /** Individual component scores for debugging */
  scoreBreakdown: {
    level: number;
    tfidf: number;
    position: number;
    rarity: number;
  };
}

/**
 * Log scorer configuration
 */
export interface LogScorerOptions {
  /** Custom weights (defaults to DEFAULT_WEIGHTS) */
  weights?: Partial<ScoringWeights>;
  /** Minimum score threshold for inclusion */
  minScore?: number;
  /** Apply position boost to first/last N entries */
  positionBoostCount?: number;
}

/**
 * Create a log scorer for ranking entries by importance
 */
export function createLogScorer(
  entries: LogEntry[],
  options: LogScorerOptions = {}
): LogScorer {
  const weights: ScoringWeights = {
    ...DEFAULT_WEIGHTS,
    ...options.weights,
  };

  const minScore = options.minScore ?? 0;
  const positionBoostCount = options.positionBoostCount ?? 5;

  // Prepare messages for TF-IDF
  const messages = entries.map((e) => e.message);
  const tfidfMap = calculateTFIDF(messages);

  // Calculate pattern frequencies for rarity scoring
  const patternFrequency = calculatePatternFrequency(entries);
  const maxFrequency = Math.max(...patternFrequency.values(), 1);

  // Memoize scoreAll(): scoring is pure over the captured `entries` (which never
  // change for a given scorer), yet rankEntries/getByLevel/getTopEntries/getStats
  // each call scoreAll() — so a single summary triggered 3+ full TF-IDF passes.
  let scoredCache: ScoredLogEntry[] | null = null;

  return {
    /**
     * Score a single entry
     */
    scoreEntry(entry: LogEntry, index: number): ScoredLogEntry {
      // Level score
      const levelScore = LEVEL_SCORES[entry.level] ?? 0.3;

      // TF-IDF score (content uniqueness)
      const tfidfScore = getSegmentTFIDFScore(index, tfidfMap);

      // Position score (U-shaped curve: high at beginning and end)
      const positionScore = calculatePositionScore(
        index,
        entries.length,
        positionBoostCount
      );

      // Rarity score (inverse frequency of pattern)
      const pattern = normalizeForPattern(entry.message);
      const frequency = patternFrequency.get(pattern) ?? 1;
      const rarityScore = 1 - frequency / maxFrequency;

      // Combine scores
      const score = normalizeScore(
        levelScore * weights.level +
          tfidfScore * weights.tfidf +
          positionScore * weights.position +
          rarityScore * weights.rarity
      );

      return {
        ...entry,
        score,
        scoreBreakdown: {
          level: levelScore,
          tfidf: tfidfScore,
          position: positionScore,
          rarity: rarityScore,
        },
      };
    },

    /**
     * Score all entries
     */
    scoreAll(): ScoredLogEntry[] {
      if (scoredCache === null) {
        scoredCache = entries.map((entry, index) => this.scoreEntry(entry, index));
      }
      return scoredCache;
    },

    /**
     * Rank entries by score (descending)
     */
    rankEntries(): ScoredLogEntry[] {
      return this.scoreAll()
        .filter((e) => e.score >= minScore)
        .sort((a, b) => b.score - a.score);
    },

    /**
     * Get top N entries by score
     */
    getTopEntries(n: number): ScoredLogEntry[] {
      return this.rankEntries().slice(0, n);
    },

    /**
     * Get entries by level, ranked by score within level
     */
    getByLevel(level: LogLevel, maxCount?: number): ScoredLogEntry[] {
      const filtered = this.scoreAll()
        .filter((e) => e.level === level)
        .sort((a, b) => b.score - a.score);

      return maxCount ? filtered.slice(0, maxCount) : filtered;
    },

    /**
     * Get statistics about scored entries
     */
    getStats(): ScoringStats {
      const scored = this.scoreAll();
      const scores = scored.map((e) => e.score);

      return {
        totalEntries: entries.length,
        avgScore: scores.reduce((a, b) => a + b, 0) / scores.length || 0,
        minScore: Math.min(...scores),
        maxScore: Math.max(...scores),
        scoreDistribution: {
          high: scored.filter((e) => e.score >= 0.7).length,
          medium: scored.filter((e) => e.score >= 0.4 && e.score < 0.7).length,
          low: scored.filter((e) => e.score < 0.4).length,
        },
        byLevel: {
          error: scored.filter((e) => e.level === "error").length,
          warning: scored.filter((e) => e.level === "warning").length,
          info: scored.filter((e) => e.level === "info").length,
          debug: scored.filter((e) => e.level === "debug").length,
        },
      };
    },
  };
}

/**
 * Log scorer interface
 */
export interface LogScorer {
  scoreEntry(entry: LogEntry, index: number): ScoredLogEntry;
  scoreAll(): ScoredLogEntry[];
  rankEntries(): ScoredLogEntry[];
  getTopEntries(n: number): ScoredLogEntry[];
  getByLevel(level: LogLevel, maxCount?: number): ScoredLogEntry[];
  getStats(): ScoringStats;
}

/**
 * Scoring statistics
 */
export interface ScoringStats {
  totalEntries: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  scoreDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  byLevel: Record<LogLevel, number>;
}

/**
 * Calculate position score with U-shaped curve
 * Beginning and end of logs are more important
 */
function calculatePositionScore(
  index: number,
  total: number,
  boostCount: number
): number {
  if (total <= 1) return 1.0;

  // Boost for first N entries
  if (index < boostCount) {
    return 1.0 - (index / boostCount) * 0.3;
  }

  // Boost for last N entries
  const fromEnd = total - 1 - index;
  if (fromEnd < boostCount) {
    return 0.7 + (1 - fromEnd / boostCount) * 0.3;
  }

  // Middle entries get lower position score
  const midPosition = (index - boostCount) / (total - 2 * boostCount);
  // U-shaped: higher at edges, lower in middle
  return 0.3 + 0.4 * Math.abs(midPosition - 0.5) * 2;
}

/**
 * Calculate pattern frequency for rarity scoring
 */
function calculatePatternFrequency(entries: LogEntry[]): Map<string, number> {
  const frequency = new Map<string, number>();

  for (const entry of entries) {
    const pattern = normalizeForPattern(entry.message);
    frequency.set(pattern, (frequency.get(pattern) ?? 0) + 1);
  }

  return frequency;
}

/**
 * Normalize message for pattern matching
 * Removes variable parts (numbers, IDs, paths)
 */
function normalizeForPattern(message: string): string {
  return message
    .toLowerCase()
    .replace(/\d+(\.\d+)?/g, "<N>") // Numbers
    .replace(/[a-f0-9]{8,}/gi, "<HASH>") // Hex hashes
    .replace(/[a-f0-9-]{36}/gi, "<UUID>") // UUIDs
    .replace(/\/[\w\-./]+/g, "<PATH>") // File paths
    .replace(/'[^']*'/g, "'<STR>'") // Single quoted
    .replace(/"[^"]*"/g, '"<STR>"') // Double quoted
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize score to 0-1 range
 */
function normalizeScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

/**
 * Quick scoring function for single entries without full context
 * Useful for real-time processing
 */
export function quickScore(entry: LogEntry): number {
  const levelScore = LEVEL_SCORES[entry.level] ?? 0.3;

  // Check for important keywords
  const keywordScore = calculateKeywordScore(entry.message);

  // Combine with simpler weighting
  return normalizeScore(levelScore * 0.5 + keywordScore * 0.5);
}

/**
 * Calculate keyword-based importance score
 */
function calculateKeywordScore(message: string): number {
  const lowerMessage = message.toLowerCase();

  // High importance keywords
  const highKeywords = [
    "error",
    "exception",
    "failed",
    "failure",
    "crash",
    "fatal",
    "critical",
    "panic",
    "abort",
  ];

  // Medium importance keywords
  const mediumKeywords = [
    "warning",
    "timeout",
    "retry",
    "deprecated",
    "slow",
    "memory",
    "leak",
  ];

  // Check for high importance keywords
  if (highKeywords.some((kw) => lowerMessage.includes(kw))) {
    return 1.0;
  }

  // Check for medium importance keywords
  if (mediumKeywords.some((kw) => lowerMessage.includes(kw))) {
    return 0.7;
  }

  // Check for stack trace indicators
  if (/at\s+\w+|file\s*:|line\s*\d+|traceback/i.test(message)) {
    return 0.8;
  }

  return 0.3;
}

/**
 * Batch score entries efficiently
 * Pre-computes TF-IDF for all entries at once
 */
export function batchScoreEntries(
  entries: LogEntry[],
  options: LogScorerOptions = {}
): ScoredLogEntry[] {
  const scorer = createLogScorer(entries, options);
  return scorer.rankEntries();
}

/**
 * Get top entries by importance across multiple log levels
 * Ensures representation from different severity levels
 */
export function getBalancedTopEntries(
  entries: LogEntry[],
  counts: { errors: number; warnings: number; info: number }
): ScoredLogEntry[] {
  const scorer = createLogScorer(entries);

  const errors = scorer.getByLevel("error", counts.errors);
  const warnings = scorer.getByLevel("warning", counts.warnings);
  const info = scorer.getByLevel("info", counts.info);

  // Combine and sort by score
  return [...errors, ...warnings, ...info].sort((a, b) => b.score - a.score);
}
