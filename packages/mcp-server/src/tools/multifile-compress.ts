/**
 * Multi-File Compress Tool
 *
 * Compresses multiple files with cross-file deduplication,
 * extracting shared imports and types.
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import {
  compressMultiFile,
  extractSharedElements,
  createChunks,
  type FileContext,
} from "../compressors/multifile.js";
import { detectLanguageFromPath } from "../utils/language-detector.js";
import { getSessionTracker } from "../analytics/session-tracker.js";
import { getOutputConfig } from "../config/output-config.js";
import {
  serializeResultToToon,
  type ResultSchema,
} from "../utils/toon-serializer.js";

export const multifileCompressSchema = {
  type: "object" as const,
  properties: {
    patterns: {
      type: "array",
      items: { type: "string" },
      description: "Glob patterns for files to compress (e.g., [\"src/**/*.ts\"])",
    },
    strategy: {
      type: "string",
      enum: ["deduplicate", "skeleton", "smart-chunk"],
      description: "Compression strategy: deduplicate (default), skeleton, or smart-chunk",
    },
    maxTokens: {
      type: "number",
      description: "Maximum tokens for output (default: 50000)",
    },
    action: {
      type: "string",
      enum: ["compress", "extract-shared", "chunk"],
      description: "Action: compress (default), extract-shared, or chunk",
    },
  },
  required: ["patterns"],
};

const inputSchema = z.object({
  patterns: z.array(z.string()).min(1),
  strategy: z
    .enum(["deduplicate", "skeleton", "smart-chunk"])
    .optional()
    .default("deduplicate"),
  maxTokens: z.number().optional().default(50000),
  action: z
    .enum(["compress", "extract-shared", "chunk"])
    .optional()
    .default("compress"),
});

/**
 * Find files matching glob patterns (simple implementation)
 */
function findFiles(patterns: string[], workingDir: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  function walkDir(dir: string, pattern: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(workingDir, fullPath);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            walkDir(fullPath, pattern);
          }
        } else if (entry.isFile()) {
          if (matchesPattern(relativePath, pattern) && !seen.has(relativePath)) {
            seen.add(relativePath);
            files.push(relativePath);
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  for (const pattern of patterns) {
    walkDir(workingDir, pattern);
  }

  return files.slice(0, 100); // Limit results
}

/**
 * Simple glob pattern matching
 */
function matchesPattern(filePath: string, pattern: string): boolean {
  // Handle **/*.ext patterns
  if (pattern.includes("**")) {
    const ext = pattern.split(".").pop();
    if (ext) {
      return filePath.endsWith(`.${ext}`);
    }
  }

  // Handle *.ext patterns
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1);
    return filePath.endsWith(ext);
  }

  // Direct path match
  return filePath.includes(pattern.replace(/\*/g, ""));
}

/**
 * Load file contents
 */
function loadFiles(
  filePaths: string[],
  workingDir: string
): FileContext[] {
  const files: FileContext[] = [];

  for (const filePath of filePaths) {
    try {
      const fullPath = path.join(workingDir, filePath);
      const content = fs.readFileSync(fullPath, "utf-8");
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

  return files;
}

/**
 * Format output for display
 */
function formatOutput(
  result: {
    compressed?: string;
    filesIncluded?: string[];
    sharedElements?: unknown;
    stats?: {
      originalTokens: number;
      compressedTokens: number;
      filesProcessed: number;
      deduplicatedItems: number;
      reductionPercent: number;
    };
    chunks?: unknown[];
  },
  action: string
): string {
  const config = getOutputConfig();

  if (config.mode === "toon" || config.useToon) {
    const schema: ResultSchema = {
      name: action === "chunk" ? "Chunks" : "MultiFileCompress",
      fields: ["compressed", "filesIncluded", "sharedElements", "stats"],
    };
    return serializeResultToToon(result, schema, {
      verbosity: config.verbosity,
      includeStats: config.includeStats,
    });
  }

  // Standard format
  const parts: string[] = [];

  if (result.stats) {
    parts.push(
      `[MultiFile] ${result.stats.originalTokens}→${result.stats.compressedTokens} tokens (-${result.stats.reductionPercent}%)`
    );
    parts.push(
      `Files: ${result.stats.filesProcessed}, Deduplicated: ${result.stats.deduplicatedItems}`
    );
    parts.push("");
  }

  if (result.compressed) {
    parts.push(result.compressed);
  }

  if (result.chunks) {
    parts.push(`Chunks: ${(result.chunks as unknown[]).length}`);
    for (const chunk of result.chunks as Array<{
      id: string;
      files: string[];
      tokens: number;
    }>) {
      parts.push(`  ${chunk.id}: ${chunk.files.length} files, ${chunk.tokens} tokens`);
    }
  }

  return parts.join("\n");
}

/**
 * Execute multi-file compress tool
 */
async function executeMultifileCompress(
  args: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const input = inputSchema.parse(args);
  const workingDir = process.cwd();

  // Find files matching patterns
  const filePaths = findFiles(input.patterns, workingDir);

  if (filePaths.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No files found matching patterns: ${input.patterns.join(", ")}`,
        },
      ],
    };
  }

  // Load file contents
  const files = loadFiles(filePaths, workingDir);

  let output: string;

  switch (input.action) {
    case "extract-shared": {
      const shared = extractSharedElements(files);
      output = formatOutput(
        {
          sharedElements: shared,
          stats: {
            originalTokens: 0,
            compressedTokens: 0,
            filesProcessed: files.length,
            deduplicatedItems:
              shared.imports.length + shared.types.length,
            reductionPercent: 0,
          },
        },
        "extract-shared"
      );
      break;
    }

    case "chunk": {
      const chunks = createChunks(files, input.maxTokens / 3);
      output = formatOutput({ chunks }, "chunk");
      break;
    }

    case "compress":
    default: {
      const result = compressMultiFile(files, {
        strategy: input.strategy,
        maxTokens: input.maxTokens,
      });

      // Track usage
      const tokensSaved = result.stats.originalTokens - result.stats.compressedTokens;
      getSessionTracker().recordInvocation(
        "multifile_compress",
        result.stats.originalTokens,
        result.stats.compressedTokens,
        tokensSaved,
        0
      );

      output = formatOutput(result, "compress");
      break;
    }
  }

  return {
    content: [{ type: "text", text: output }],
  };
}

export const multifileCompressTool: ToolDefinition = {
  name: "multifile_compress",
  description:
    "Compress multiple files with cross-file deduplication. Extracts shared imports/types. Strategies: deduplicate, skeleton, smart-chunk.",
  inputSchema: multifileCompressSchema,
  execute: executeMultifileCompress,
};
