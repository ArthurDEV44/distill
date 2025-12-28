/**
 * Dynamic Tool Loader
 *
 * Manages lazy loading of MCP tools to reduce token consumption.
 * Only core tools are loaded at startup; others are loaded on-demand.
 */

import type { ToolDefinition } from "./registry.js";
import { createBM25Index, type BM25Index, type BM25Result } from "../utils/bm25.js";
import {
  createHybridSearchIndex,
  type HybridSearchIndex,
  type HybridSearchResult,
} from "../utils/hybrid-search.js";

export type ToolCategory = "compress" | "analyze" | "logs" | "code" | "pipeline" | "core";

export interface ToolMetadata {
  name: string;
  category: ToolCategory;
  keywords: string[];
  description: string; // Short description for discovery (not the full tool description)
  loader: () => Promise<ToolDefinition>;
}

/**
 * Tool catalog with metadata for discovery
 * Full tool definitions are loaded lazily via the loader function
 */
export const TOOL_CATALOG: ToolMetadata[] = [
  // Core tools (always loaded)
  {
    name: "auto_optimize",
    category: "core",
    keywords: ["optimize", "auto", "detect", "compress"],
    description: "Auto-detect content type and apply optimal compression",
    loader: async () => (await import("./auto-optimize.js")).autoOptimizeTool,
  },
  {
    name: "smart_file_read",
    category: "core",
    keywords: ["file", "read", "ast", "code", "extract"],
    description: "Read files with AST-based extraction",
    loader: async () => (await import("./smart-file-read.js")).smartFileReadTool,
  },
  {
    name: "code_execute",
    category: "core",
    keywords: ["execute", "code", "sdk", "typescript", "script", "sandbox"],
    description: "Execute TypeScript with ctxopt SDK (98% token savings)",
    loader: async () => (await import("./code-execute.js")).codeExecuteTool,
  },

  // Compress category
  {
    name: "compress_context",
    category: "compress",
    keywords: ["compress", "context", "reduce", "shrink", "generic"],
    description: "Compress generic text content (logs, configs)",
    loader: async () => (await import("./compress-context.js")).compressContextTool,
  },
  {
    name: "semantic_compress",
    category: "compress",
    keywords: ["semantic", "compress", "tfidf", "importance"],
    description: "TF-IDF based semantic compression",
    loader: async () => (await import("./semantic-compress.js")).semanticCompressTool,
  },
  {
    name: "diff_compress",
    category: "compress",
    keywords: ["diff", "git", "compress", "changes"],
    description: "Compress git diff output",
    loader: async () => (await import("./diff-compress.js")).diffCompressTool,
  },
  {
    name: "conversation_compress",
    category: "compress",
    keywords: ["conversation", "chat", "history", "compress", "messages"],
    description: "Compress conversation history",
    loader: async () => (await import("./conversation-compress.js")).conversationCompressTool,
  },

  // Analyze category
  {
    name: "analyze_context",
    category: "analyze",
    keywords: ["analyze", "context", "tokens", "cost", "estimate"],
    description: "Analyze prompt for token usage and cost",
    loader: async () => {
      const mod = await import("./analyze-context.js");
      return {
        name: "analyze_context",
        description:
          "Analyze a prompt or context for token usage and optimization opportunities.",
        inputSchema: mod.analyzeContextSchema,
        execute: async (args: unknown) => mod.analyzeContext(args, {}),
      };
    },
  },
  {
    name: "analyze_build_output",
    category: "analyze",
    keywords: ["build", "error", "typescript", "eslint", "webpack", "compile"],
    description: "Parse and compress build errors",
    loader: async () => (await import("./analyze-build-output.js")).analyzeBuildOutputTool,
  },
  {
    name: "context_budget",
    category: "analyze",
    keywords: ["budget", "tokens", "limit", "estimate", "cost"],
    description: "Pre-flight token budget estimation",
    loader: async () => (await import("./context-budget.js")).contextBudgetTool,
  },

  // Logs category
  {
    name: "summarize_logs",
    category: "logs",
    keywords: ["logs", "summarize", "server", "test", "output"],
    description: "Summarize verbose log output",
    loader: async () => (await import("./summarize-logs.js")).summarizeLogsTool,
  },
  {
    name: "deduplicate_errors",
    category: "logs",
    keywords: ["deduplicate", "errors", "group", "repeat"],
    description: "Group and deduplicate repeated errors",
    loader: async () => (await import("./deduplicate-errors.js")).deduplicateErrorsTool,
  },

  // Code category
  {
    name: "code_skeleton",
    category: "code",
    keywords: ["skeleton", "signatures", "code", "structure", "overview"],
    description: "Extract function/class signatures only",
    loader: async () => (await import("./code-skeleton.js")).codeSkeletonTool,
  },
  {
    name: "smart_cache",
    category: "code",
    keywords: ["cache", "store", "retrieve", "invalidate"],
    description: "Manage parsed file cache",
    loader: async () => (await import("./smart-cache-tool.js")).smartCacheTool,
  },

  // Pipeline category
  {
    name: "smart_pipeline",
    category: "pipeline",
    keywords: ["pipeline", "chain", "auto", "multi-step"],
    description: "Chain multiple compression tools automatically",
    loader: async () => (await import("./smart-pipeline.js")).smartPipelineTool,
  },
  {
    name: "optimization_tips",
    category: "pipeline",
    keywords: ["tips", "best-practices", "optimize", "help"],
    description: "Get context optimization best practices",
    loader: async () => {
      const mod = await import("./optimization-tips.js");
      return {
        name: "optimization_tips",
        description: "Get context engineering best practices and optimization tips.",
        inputSchema: mod.optimizationTipsSchema,
        execute: async (args: unknown) => mod.optimizationTips(args, {}),
      };
    },
  },
];

/**
 * Dynamic Tool Loader
 *
 * Manages tool loading and provides discovery capabilities.
 */
export class DynamicToolLoader {
  private loadedTools: Map<string, ToolDefinition> = new Map();
  private onChangeCallbacks: Array<() => void> = [];
  private bm25Index: BM25Index<ToolMetadata> | null = null;
  private hybridIndex: HybridSearchIndex<ToolMetadata> | null = null;

  /**
   * Get searchable text from tool metadata
   */
  private static getSearchableText(tool: ToolMetadata): string {
    return `${tool.name} ${tool.keywords.join(" ")} ${tool.description}`;
  }

  /**
   * Get or create BM25 search index (lazy initialization)
   */
  private getBM25Index(): BM25Index<ToolMetadata> {
    if (!this.bm25Index) {
      this.bm25Index = createBM25Index(
        TOOL_CATALOG,
        DynamicToolLoader.getSearchableText,
        { k1: 1.2, b: 0.75 }
      );
    }
    return this.bm25Index;
  }

  /**
   * Get or create hybrid search index (lazy initialization)
   */
  private getHybridIndex(): HybridSearchIndex<ToolMetadata> {
    if (!this.hybridIndex) {
      this.hybridIndex = createHybridSearchIndex(
        TOOL_CATALOG,
        DynamicToolLoader.getSearchableText,
        { bm25Weight: 0.4, semanticWeight: 0.6 }
      );
    }
    return this.hybridIndex;
  }

  /**
   * Get metadata for all available tools (without loading them)
   */
  getAvailableTools(): Array<{ name: string; category: ToolCategory; description: string }> {
    return TOOL_CATALOG.map((t) => ({
      name: t.name,
      category: t.category,
      description: t.description,
    }));
  }

  /**
   * Search tools by query string using BM25 ranking
   * Returns results sorted by relevance score (most relevant first)
   */
  searchTools(query: string): ToolMetadata[] {
    const index = this.getBM25Index();
    const results = index.search(query);
    return results.map((r) => r.item);
  }

  /**
   * Search tools with BM25 scores and matched terms
   * Useful for debugging or displaying search relevance
   */
  searchToolsWithScores(query: string): BM25Result<ToolMetadata>[] {
    const index = this.getBM25Index();
    return index.search(query);
  }

  /**
   * Hybrid search combining BM25 (lexical) and semantic similarity
   *
   * This method finds tools even when the query uses different words
   * than the tool description (e.g., "shrink output" → compress).
   *
   * @param query - Search query
   * @returns Ranked results with both BM25 and semantic scores
   */
  async searchToolsHybrid(query: string): Promise<HybridSearchResult<ToolMetadata>[]> {
    const index = this.getHybridIndex();
    return index.search(query);
  }

  /**
   * Preload semantic embeddings for faster hybrid search
   *
   * Call this during idle time to avoid latency on first hybrid search.
   * The embedding model (~23MB) is downloaded and cached on first use.
   */
  async preloadSemanticSearch(): Promise<void> {
    const index = this.getHybridIndex();
    await index.precomputeEmbeddings();
  }

  /**
   * Check if semantic search is ready (embeddings loaded)
   */
  isSemanticSearchReady(): boolean {
    return this.hybridIndex?.isSemanticReady() ?? false;
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): ToolMetadata[] {
    return TOOL_CATALOG.filter((t) => t.category === category);
  }

  /**
   * Load core tools (called at startup)
   */
  async loadCoreTools(): Promise<ToolDefinition[]> {
    const coreTools = TOOL_CATALOG.filter((t) => t.category === "core");
    return this.loadToolsFromMetadata(coreTools);
  }

  /**
   * Load tools by category
   */
  async loadByCategory(category: ToolCategory): Promise<ToolDefinition[]> {
    const tools = this.getToolsByCategory(category);
    return this.loadToolsFromMetadata(tools);
  }

  /**
   * Load tools matching a query
   */
  async loadByQuery(query: string): Promise<ToolDefinition[]> {
    const tools = this.searchTools(query);
    return this.loadToolsFromMetadata(tools);
  }

  /**
   * Load specific tools by name
   */
  async loadByNames(names: string[]): Promise<ToolDefinition[]> {
    const tools = TOOL_CATALOG.filter((t) => names.includes(t.name));
    return this.loadToolsFromMetadata(tools);
  }

  /**
   * Load all tools (fallback for clients that don't support dynamic loading)
   */
  async loadAllTools(): Promise<ToolDefinition[]> {
    return this.loadToolsFromMetadata(TOOL_CATALOG);
  }

  /**
   * Get already loaded tools
   */
  getLoadedTools(): ToolDefinition[] {
    return Array.from(this.loadedTools.values());
  }

  /**
   * Check if a tool is loaded
   */
  isLoaded(name: string): boolean {
    return this.loadedTools.has(name);
  }

  /**
   * Register callback for tool list changes
   */
  onToolsChanged(callback: () => void): void {
    this.onChangeCallbacks.push(callback);
  }

  /**
   * Internal: Load tools from metadata array
   */
  private async loadToolsFromMetadata(metadata: ToolMetadata[]): Promise<ToolDefinition[]> {
    const newlyLoaded: ToolDefinition[] = [];

    for (const meta of metadata) {
      if (!this.loadedTools.has(meta.name)) {
        const tool = await meta.loader();
        this.loadedTools.set(meta.name, tool);
        newlyLoaded.push(tool);
      }
    }

    // Notify if new tools were loaded
    if (newlyLoaded.length > 0) {
      this.emitChange();
    }

    return newlyLoaded;
  }

  /**
   * Emit change notification
   */
  private emitChange(): void {
    for (const cb of this.onChangeCallbacks) {
      try {
        cb();
      } catch {
        // Ignore callback errors
      }
    }
  }
}

/**
 * Singleton instance
 */
let loaderInstance: DynamicToolLoader | null = null;

export function getDynamicLoader(): DynamicToolLoader {
  if (!loaderInstance) {
    loaderInstance = new DynamicToolLoader();
  }
  return loaderInstance;
}

export function resetDynamicLoader(): void {
  loaderInstance = null;
}
