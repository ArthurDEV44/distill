/**
 * SDK Multi-File Functions
 *
 * Multi-file compression and analysis for sandbox use.
 * Provides cross-file deduplication, skeleton extraction, and chunking.
 */

import type { HostCallbacks } from "../types.js";
import { detectLanguageFromPath } from "../../utils/language-detector.js";
import {
  compressMultiFile,
  extractSharedElements,
  createChunks,
  type FileContext,
  type MultiFileCompressOptions,
  type MultiFileCompressResult,
  type SharedElements,
  type ChunkInfo,
} from "../../compressors/multifile.js";

/**
 * SDK Multi-file compress options (simplified)
 */
export interface SdkMultiFileOptions {
  /** Maximum tokens for output */
  maxTokens?: number;
  /** Compression strategy */
  strategy?: "deduplicate" | "skeleton" | "smart-chunk";
  /** File patterns to preserve fully */
  preservePatterns?: string[];
}

/**
 * Create multi-file API with host callbacks
 */
export function createMultifileAPI(
  workingDir: string,
  callbacks: HostCallbacks
) {
  /**
   * Load files from patterns into FileContext array
   */
  function loadFiles(patterns: string[]): FileContext[] {
    const files: FileContext[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
      const paths = callbacks.glob(pattern);

      for (const filePath of paths) {
        if (seen.has(filePath)) continue;
        seen.add(filePath);

        try {
          const content = callbacks.readFile(filePath);
          const language = detectLanguageFromPath(filePath);

          files.push({
            path: filePath,
            content,
            language,
          });
        } catch {
          // Skip files that can't be read
        }
      }
    }

    return files;
  }

  return {
    /**
     * Compress multiple files with cross-file deduplication
     *
     * @param patterns - Glob patterns for files to include
     * @param options - Compression options
     * @returns Compressed result with shared elements and stats
     */
    compress(
      patterns: string[],
      options?: SdkMultiFileOptions
    ): MultiFileCompressResult {
      const files = loadFiles(patterns);

      if (files.length === 0) {
        return {
          compressed: "// No files found matching patterns",
          filesIncluded: [],
          sharedElements: { imports: [], types: [], constants: [] },
          stats: {
            originalTokens: 0,
            compressedTokens: 0,
            filesProcessed: 0,
            deduplicatedItems: 0,
            reductionPercent: 0,
          },
        };
      }

      return compressMultiFile(files, {
        maxTokens: options?.maxTokens || 50000,
        strategy: options?.strategy || "deduplicate",
        preservePatterns: options?.preservePatterns,
      });
    },

    /**
     * Extract shared elements (imports, types) across files
     *
     * @param patterns - Glob patterns for files to analyze
     * @returns Shared imports, types, and constants
     */
    extractShared(patterns: string[]): SharedElements {
      const files = loadFiles(patterns);
      return extractSharedElements(files);
    },

    /**
     * Create chunks from files for incremental processing
     *
     * @param patterns - Glob patterns for files to chunk
     * @param maxTokensPerChunk - Maximum tokens per chunk
     * @returns Array of chunk information
     */
    chunk(patterns: string[], maxTokensPerChunk: number): ChunkInfo[] {
      const files = loadFiles(patterns);
      return createChunks(files, maxTokensPerChunk);
    },

    /**
     * Get dependency-aware skeletons for files
     *
     * @param patterns - Glob patterns for entry point files
     * @param depth - Optional depth limit for dependency traversal
     * @returns Compressed skeleton output
     */
    skeletons(patterns: string[], depth?: number): string {
      const files = loadFiles(patterns);

      if (files.length === 0) {
        return "// No files found matching patterns";
      }

      const result = compressMultiFile(files, {
        strategy: "skeleton",
        dependencyDepth: depth || 2,
      });

      return result.compressed;
    },

    /**
     * Read multiple files into a combined context
     *
     * @param patterns - Glob patterns for files to read
     * @returns Combined file contents with headers
     */
    readAll(patterns: string[]): string {
      const files = loadFiles(patterns);

      if (files.length === 0) {
        return "// No files found matching patterns";
      }

      const parts: string[] = [];
      for (const file of files) {
        parts.push(`// === ${file.path} ===`);
        parts.push(file.content);
        parts.push("");
      }

      return parts.join("\n");
    },
  };
}
