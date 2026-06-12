/**
 * Smart Cache Implementation
 *
 * LRU cache with TTL and file hash validation.
 * Designed for caching parsed file content but works for any data.
 */

import type {
  CacheEntry,
  CacheStats,
  CacheConfig,
  CacheKey,
  CacheGetResult,
  SmartCacheOptions,
} from "./types.js";
import { computeFastFileHash, validateFileHash } from "./file-hash.js";

/** Default cache configuration */
const DEFAULT_CONFIG: CacheConfig = {
  maxEntries: 100,
  defaultTtlMs: 30 * 60 * 1000, // 30 minutes
  maxMemoryBytes: 50 * 1024 * 1024, // 50MB
  enableFileHashValidation: true,
  cleanupInterval: 50,
};

/**
 * Smart Cache class with LRU eviction, TTL expiration, and file hash validation
 */
export class SmartCache {
  private cache: Map<CacheKey, CacheEntry>;
  private config: CacheConfig;
  private stats: CacheStats;
  private operationCount: number;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.operationCount = 0;
    this.stats = {
      entries: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      tokensSaved: 0,
      memorySizeBytes: 0,
      evictions: 0,
      invalidations: 0,
    };
  }

  /**
   * Get a value from cache with automatic validation
   */
  async get<T>(key: CacheKey): Promise<CacheGetResult<T>> {
    this.operationCount++;
    this.maybeCleanup();

    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return { hit: false, missReason: "not_found" };
    }

    // Check TTL expiration
    const ttl = entry.ttl ?? this.config.defaultTtlMs;
    const age = Date.now() - entry.createdAt;
    if (age > ttl) {
      this.cache.delete(key);
      this.stats.entries--;
      this.stats.memorySizeBytes -= entry.sizeBytes;
      this.stats.misses++;
      this.updateHitRate();
      return { hit: false, missReason: "expired" };
    }

    // Check file hash validation (if applicable)
    if (
      this.config.enableFileHashValidation &&
      entry.filePath &&
      entry.fileHash
    ) {
      const isValid = await validateFileHash(entry.filePath, entry.fileHash);
      if (!isValid) {
        this.cache.delete(key);
        this.stats.entries--;
        this.stats.memorySizeBytes -= entry.sizeBytes;
        this.stats.invalidations++;
        this.stats.misses++;
        this.updateHitRate();
        return { hit: false, missReason: "file_changed" };
      }
    }

    // Update last accessed time (for LRU)
    entry.lastAccessedAt = Date.now();

    // Update stats
    this.stats.hits++;
    if (entry.tokenCount) {
      this.stats.tokensSaved += entry.tokenCount;
    }
    this.updateHitRate();

    return { hit: true, value: entry.value };
  }

  /**
   * Set a value in cache
   */
  async set<T>(
    key: CacheKey,
    value: T,
    options: SmartCacheOptions = {}
  ): Promise<void> {
    this.operationCount++;

    // Compute size estimate
    const sizeBytes = this.estimateSize(value);

    // Compute file hash if path provided
    let fileHash = options.fileHash;
    if (
      !fileHash &&
      options.filePath &&
      this.config.enableFileHashValidation
    ) {
      const hashInfo = await computeFastFileHash(options.filePath);
      fileHash = hashInfo?.hash;
    }

    // Check if we need to evict entries
    await this.ensureCapacity(sizeBytes);

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      ttl: options.ttl,
      fileHash,
      filePath: options.filePath,
      sizeBytes,
      tokenCount: options.tokenCount,
    };

    // Remove old entry stats if exists. Clamp at 0: concurrent set()s on the
    // same key can otherwise double-subtract and drive the counter negative,
    // which disables memory-based eviction (cache then grows unbounded).
    const existing = this.cache.get(key);
    if (existing) {
      this.stats.memorySizeBytes = Math.max(
        0,
        this.stats.memorySizeBytes - existing.sizeBytes
      );
    } else {
      this.stats.entries++;
    }

    this.cache.set(key, entry as CacheEntry);
    this.stats.memorySizeBytes += sizeBytes;

    this.maybeCleanup();
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key: CacheKey): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.stats.entries--;
      this.stats.memorySizeBytes -= entry.sizeBytes;
      this.stats.invalidations++;
      return true;
    }
    return false;
  }

  /**
   * Invalidate all entries for a specific file path
   */
  invalidateByPath(filePath: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.filePath === filePath) {
        this.cache.delete(key);
        this.stats.entries--;
        this.stats.memorySizeBytes -= entry.sizeBytes;
        this.stats.invalidations++;
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.entries = 0;
    this.stats.memorySizeBytes = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get list of cached keys (for debugging/inspection)
   */
  getKeys(): CacheKey[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if a key exists (without updating access time)
   */
  has(key: CacheKey): boolean {
    return this.cache.has(key);
  }

  /**
   * Get the number of entries in cache
   */
  get size(): number {
    return this.cache.size;
  }

  // Private methods

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate =
      total > 0 ? Math.round((this.stats.hits / total) * 1000) / 10 : 0;
  }

  private estimateSize(value: unknown): number {
    // Estimate the in-memory footprint WITHOUT a full JSON.stringify: serializing
    // a large nested value (cached file content, a deep FileStructure) only to
    // measure it allocates throwaway JSON on every set(). A bounded structural
    // probe is accurate enough for eviction accounting.
    return this.estimateValueSize(value, 0);
  }

  private estimateValueSize(value: unknown, depth: number): number {
    if (value === null || value === undefined) return 8;
    switch (typeof value) {
      case "string":
        return value.length * 2; // UTF-16
      case "number":
        return 8;
      case "boolean":
        return 4;
      case "bigint":
        return 16;
      case "symbol":
      case "function":
        return 0;
    }
    // Bound deep nesting so a pathological structure can't make this expensive.
    if (depth >= 4) return 256;
    if (Array.isArray(value)) {
      let total = 16;
      const sample = Math.min(value.length, 50);
      for (let i = 0; i < sample; i++) {
        total += this.estimateValueSize(value[i], depth + 1);
      }
      // Extrapolate from the sample for very large arrays.
      return value.length > sample
        ? Math.round((total * value.length) / sample)
        : total;
    }
    let total = 16;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      total += k.length * 2 + this.estimateValueSize(v, depth + 1);
    }
    return total;
  }

  private async ensureCapacity(newEntrySize: number): Promise<void> {
    // Check entry count limit
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    // Check memory limit
    while (
      this.stats.memorySizeBytes + newEntrySize > this.config.maxMemoryBytes &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
    let oldestKey: CacheKey | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      const entry = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.stats.entries--;
      if (entry) {
        this.stats.memorySizeBytes = Math.max(
          0,
          this.stats.memorySizeBytes - entry.sizeBytes
        );
      }
      this.stats.evictions++;
    }
  }

  private maybeCleanup(): void {
    if (this.operationCount % this.config.cleanupInterval !== 0) {
      return;
    }
    this.cleanupExpired();
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      const ttl = entry.ttl ?? this.config.defaultTtlMs;
      if (now - entry.createdAt > ttl) {
        this.cache.delete(key);
        this.stats.entries--;
        this.stats.memorySizeBytes -= entry.sizeBytes;
      }
    }
  }
}

// Singleton instance for session-wide caching
let globalCache: SmartCache | null = null;

/**
 * Get the global cache instance (creates one if needed)
 */
export function getGlobalCache(): SmartCache {
  if (!globalCache) {
    globalCache = new SmartCache();
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing or explicit reset)
 */
export function resetGlobalCache(): void {
  globalCache = null;
}
