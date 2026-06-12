/**
 * Log Clustering Module
 *
 * Semantic clustering of log entries using similarity-based grouping.
 * Inspired by ClusterLog and LayerLog hierarchical approaches.
 *
 * References:
 * - ClusterLog: https://arxiv.org/abs/2301.07846
 * - LayerLog: https://www.sciencedirect.com/science/article/abs/pii/S1568494622009097
 */

import type { LogEntry, LogLevel } from "./types.js";
import { createLogScorer, type ScoredLogEntry } from "./scoring.js";

/**
 * A cluster of semantically similar log entries
 */
export interface LogCluster {
  /** Unique cluster ID */
  id: string;
  /** Normalized pattern representing the cluster */
  pattern: string;
  /** All entries in this cluster */
  entries: LogEntry[];
  /** Best representative entry (highest score) */
  representative: ScoredLogEntry;
  /** Aggregate importance score */
  importance: number;
  /** Dominant log level in cluster */
  dominantLevel: LogLevel;
  /** Cluster statistics */
  stats: ClusterStats;
}

/**
 * Cluster statistics
 */
export interface ClusterStats {
  /** Total entries in cluster */
  count: number;
  /** Count by log level */
  byLevel: Record<LogLevel, number>;
  /** First entry timestamp */
  firstSeen?: string;
  /** Last entry timestamp */
  lastSeen?: string;
  /** Average message length */
  avgLength: number;
}

/**
 * Clustering configuration
 */
export interface ClusteringOptions {
  /** Similarity threshold (0-1, default: 0.7) */
  similarityThreshold?: number;
  /** Maximum clusters to return (default: 100) */
  maxClusters?: number;
  /** Minimum entries per cluster (default: 1) */
  minClusterSize?: number;
  /** Use Levenshtein distance for similarity (default: true) */
  useLevenshtein?: boolean;
}

/**
 * Cluster log entries by semantic similarity
 */
export function clusterLogs(
  entries: LogEntry[],
  options: ClusteringOptions = {}
): LogCluster[] {
  const similarityThreshold = options.similarityThreshold ?? 0.7;
  const maxClusters = options.maxClusters ?? 100;
  const minClusterSize = options.minClusterSize ?? 1;
  const useLevenshtein = options.useLevenshtein ?? true;

  if (entries.length === 0) return [];

  // Levenshtein similarity is O(n² · l²) and explodes on large corpora. Above
  // this many entries, fall back to Jaccard (O(n · vocab)) unless the caller
  // explicitly requested Levenshtein. Small corpora keep the default behavior.
  const LEVENSHTEIN_MAX_ENTRIES = 500;
  const effectiveUseLevenshtein =
    useLevenshtein &&
    (options.useLevenshtein === true || entries.length <= LEVENSHTEIN_MAX_ENTRIES);

  // Normalize entries for comparison
  const normalizedEntries = entries.map((entry) => ({
    entry,
    normalized: normalizeMessage(entry.message),
  }));

  // Build clusters using single-linkage clustering
  const clusters: Map<string, LogEntry[]> = new Map();
  const assigned = new Set<number>();

  for (let i = 0; i < normalizedEntries.length; i++) {
    if (assigned.has(i)) continue;

    const current = normalizedEntries[i]!;
    const cluster: LogEntry[] = [current.entry];
    assigned.add(i);

    // Find similar entries
    for (let j = i + 1; j < normalizedEntries.length; j++) {
      if (assigned.has(j)) continue;

      const other = normalizedEntries[j]!;
      const similarity = effectiveUseLevenshtein
        ? calculateLevenshteinSimilarity(current.normalized, other.normalized)
        : calculateJaccardSimilarity(current.normalized, other.normalized);

      if (similarity >= similarityThreshold) {
        cluster.push(other.entry);
        assigned.add(j);
      }
    }

    clusters.set(current.normalized, cluster);
  }

  // Convert to LogCluster objects
  const logClusters = Array.from(clusters.entries())
    .map(([pattern, clusterEntries]) => createLogCluster(pattern, clusterEntries))
    .filter((c) => c.entries.length >= minClusterSize)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, maxClusters);

  return logClusters;
}

/**
 * Create a LogCluster from entries
 */
function createLogCluster(pattern: string, entries: LogEntry[]): LogCluster {
  // Score entries to find best representative
  const scorer = createLogScorer(entries);
  const scoredEntries = scorer.scoreAll();
  const representative = scoredEntries.reduce(
    (best, current) => (current.score > best.score ? current : best),
    scoredEntries[0]!
  );

  // Calculate statistics
  const byLevel: Record<LogLevel, number> = {
    error: 0,
    warning: 0,
    info: 0,
    debug: 0,
  };

  let totalLength = 0;
  let firstSeen: string | undefined;
  let lastSeen: string | undefined;

  for (const entry of entries) {
    byLevel[entry.level]++;
    totalLength += entry.message.length;

    if (entry.timestamp) {
      if (!firstSeen || entry.timestamp < firstSeen) {
        firstSeen = entry.timestamp;
      }
      if (!lastSeen || entry.timestamp > lastSeen) {
        lastSeen = entry.timestamp;
      }
    }
  }

  // Determine dominant level
  const dominantLevel = (Object.entries(byLevel) as [LogLevel, number][]).reduce(
    (max, [level, count]) => (count > max[1] ? [level, count] : max),
    ["info" as LogLevel, 0] as [LogLevel, number]
  )[0];

  // Calculate aggregate importance
  const avgScore = scoredEntries.reduce((sum, e) => sum + e.score, 0) / scoredEntries.length;
  const sizeBonus = Math.min(entries.length / 10, 0.3); // Larger clusters are more significant
  const levelBonus = dominantLevel === "error" ? 0.2 : dominantLevel === "warning" ? 0.1 : 0;

  const importance = Math.min(1, avgScore + sizeBonus + levelBonus);

  return {
    id: generateClusterId(pattern),
    pattern,
    entries,
    representative,
    importance,
    dominantLevel,
    stats: {
      count: entries.length,
      byLevel,
      firstSeen,
      lastSeen,
      avgLength: totalLength / entries.length,
    },
  };
}

/**
 * Normalize message for clustering comparison
 */
function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/\d+(\.\d+)?/g, "<N>") // Numbers
    .replace(/[a-f0-9]{8,}/gi, "<H>") // Hex hashes
    .replace(/[a-f0-9-]{36}/gi, "<U>") // UUIDs
    .replace(/\/[\w\-./]+/g, "<P>") // Paths
    .replace(/'[^']*'/g, "<S>") // Single quoted
    .replace(/"[^"]*"/g, "<S>") // Double quoted
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate Levenshtein distance similarity (0-1)
 */
function calculateLevenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0]![j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1, // Deletion
        matrix[i]![j - 1]! + 1, // Insertion
        matrix[i - 1]![j - 1]! + cost // Substitution
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

/**
 * Calculate Jaccard similarity using word tokens (0-1)
 */
function calculateJaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter((t) => t.length > 1));
  const tokensB = new Set(b.split(/\s+/).filter((t) => t.length > 1));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Generate unique cluster ID
 */
function generateClusterId(pattern: string): string {
  let hash = 0;
  for (let i = 0; i < pattern.length; i++) {
    hash = (hash << 5) - hash + pattern.charCodeAt(i);
    hash = hash & hash;
  }
  return `cl_${Math.abs(hash).toString(36)}`;
}

/**
 * Select best representatives from clusters
 */
export function selectRepresentatives(
  clusters: LogCluster[],
  maxPerCluster: number = 1
): ScoredLogEntry[] {
  const representatives: ScoredLogEntry[] = [];

  for (const cluster of clusters) {
    if (maxPerCluster === 1) {
      representatives.push(cluster.representative);
    } else {
      // Get top N from each cluster
      const scorer = createLogScorer(cluster.entries);
      representatives.push(...scorer.getTopEntries(maxPerCluster));
    }
  }

  return representatives.sort((a, b) => b.score - a.score);
}

/**
 * Merge similar clusters
 */
export function mergeSimilarClusters(
  clusters: LogCluster[],
  threshold: number = 0.8
): LogCluster[] {
  if (clusters.length <= 1) return clusters;

  const merged: LogCluster[] = [];
  const mergedIndices = new Set<number>();

  for (let i = 0; i < clusters.length; i++) {
    if (mergedIndices.has(i)) continue;

    const current = clusters[i]!;
    const toMerge: LogCluster[] = [current];
    mergedIndices.add(i);

    // Find similar clusters
    for (let j = i + 1; j < clusters.length; j++) {
      if (mergedIndices.has(j)) continue;

      const other = clusters[j]!;
      const similarity = calculateLevenshteinSimilarity(current.pattern, other.pattern);

      if (similarity >= threshold) {
        toMerge.push(other);
        mergedIndices.add(j);
      }
    }

    if (toMerge.length === 1) {
      merged.push(current);
    } else {
      // Merge clusters
      const allEntries = toMerge.flatMap((c) => c.entries);
      merged.push(createLogCluster(current.pattern, allEntries));
    }
  }

  return merged.sort((a, b) => b.importance - a.importance);
}

/**
 * Get cluster summary statistics
 */
export function getClusteringSummary(clusters: LogCluster[]): ClusteringSummary {
  if (clusters.length === 0) {
    return {
      totalClusters: 0,
      totalEntries: 0,
      avgClusterSize: 0,
      largestCluster: 0,
      smallestCluster: 0,
      singletons: 0,
      byLevel: { error: 0, warning: 0, info: 0, debug: 0 },
    };
  }

  const sizes = clusters.map((c) => c.entries.length);
  const totalEntries = sizes.reduce((a, b) => a + b, 0);

  const byLevel: Record<LogLevel, number> = {
    error: 0,
    warning: 0,
    info: 0,
    debug: 0,
  };

  for (const cluster of clusters) {
    byLevel[cluster.dominantLevel] += cluster.entries.length;
  }

  return {
    totalClusters: clusters.length,
    totalEntries,
    avgClusterSize: totalEntries / clusters.length,
    largestCluster: Math.max(...sizes),
    smallestCluster: Math.min(...sizes),
    singletons: clusters.filter((c) => c.entries.length === 1).length,
    byLevel,
  };
}

/**
 * Clustering summary statistics
 */
export interface ClusteringSummary {
  totalClusters: number;
  totalEntries: number;
  avgClusterSize: number;
  largestCluster: number;
  smallestCluster: number;
  singletons: number;
  byLevel: Record<LogLevel, number>;
}

/**
 * Find outlier entries that don't fit well in any cluster
 */
export function findOutliers(
  entries: LogEntry[],
  clusters: LogCluster[],
  threshold: number = 0.5
): LogEntry[] {
  const clusterPatterns = clusters.map((c) => c.pattern);
  const outliers: LogEntry[] = [];

  for (const entry of entries) {
    const normalized = normalizeMessage(entry.message);
    const maxSimilarity = Math.max(
      ...clusterPatterns.map((p) => calculateLevenshteinSimilarity(normalized, p)),
      0
    );

    if (maxSimilarity < threshold) {
      outliers.push(entry);
    }
  }

  return outliers;
}

/**
 * Hierarchical clustering using agglomerative approach
 */
export function hierarchicalCluster(
  entries: LogEntry[],
  levels: number = 3
): HierarchicalCluster {
  // Start with individual entries as leaf clusters
  let currentClusters = clusterLogs(entries, {
    similarityThreshold: 0.9,
    minClusterSize: 1,
  });

  const hierarchy: LogCluster[][] = [currentClusters];

  // Progressively merge at lower similarity thresholds
  for (let level = 1; level < levels; level++) {
    const threshold = 0.9 - level * 0.15; // 0.9 -> 0.75 -> 0.6
    currentClusters = mergeSimilarClusters(currentClusters, threshold);
    hierarchy.push(currentClusters);
  }

  return {
    levels: hierarchy,
    summary: getClusteringSummary(hierarchy[hierarchy.length - 1]!),
  };
}

/**
 * Hierarchical cluster result
 */
export interface HierarchicalCluster {
  /** Clusters at each hierarchy level (0 = finest, last = coarsest) */
  levels: LogCluster[][];
  /** Summary of top-level clustering */
  summary: ClusteringSummary;
}
