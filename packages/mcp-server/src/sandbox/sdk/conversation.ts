/**
 * SDK Conversation Functions
 *
 * Conversation memory management for sandbox use.
 * Provides compression, decision extraction, and context restoration.
 */

import type { HostCallbacks } from "../types.js";
import {
  compressConversation,
  compressConversationWithMemory,
  extractDecisions,
  extractCodeReferences,
  restoreContext,
  type ConversationMessage,
  type ConversationCompressOptions,
  type ConversationCompressResult,
  type ConversationMemory,
  type ConversationMemoryResult,
  type MemoryRestoreOptions,
  type Decision,
  type CodeReference,
} from "../../compressors/conversation.js";

/**
 * SDK conversation compress options (simplified)
 */
export interface SdkConversationOptions {
  /** Compression strategy */
  strategy?: "rolling-summary" | "key-extraction" | "hybrid";
  /** Maximum tokens for output */
  maxTokens?: number;
  /** Preserve system messages */
  preserveSystem?: boolean;
  /** Number of recent messages to preserve */
  preserveLastN?: number;
}

/**
 * Create conversation API with memory state
 */
export function createConversationAPI(
  workingDir: string,
  callbacks: HostCallbacks
) {
  // In-memory state for conversation tracking
  let currentMemory: ConversationMemory | null = null;

  return {
    /**
     * Compress conversation messages
     *
     * @param messages - Array of conversation messages
     * @param options - Compression options
     * @returns Compressed messages and statistics
     *
     * @example
     * ```typescript
     * ctx.conversation.compress(messages, { strategy: "hybrid" })
     * ```
     */
    compress(
      messages: ConversationMessage[],
      options?: SdkConversationOptions
    ): ConversationCompressResult {
      const opts: ConversationCompressOptions = {
        strategy: options?.strategy || "hybrid",
        maxTokens: options?.maxTokens || 10000,
        preserveSystem: options?.preserveSystem ?? true,
        preserveLastN: options?.preserveLastN ?? 2,
      };

      return compressConversation(messages, opts);
    },

    /**
     * Compress conversation and update memory state
     *
     * @param messages - Array of conversation messages
     * @param options - Compression options
     * @returns Memory result with context and statistics
     *
     * @example
     * ```typescript
     * ctx.conversation.createMemory(messages)
     * ```
     */
    createMemory(
      messages: ConversationMessage[],
      options?: SdkConversationOptions
    ): ConversationMemoryResult {
      const opts: ConversationCompressOptions = {
        strategy: options?.strategy || "hybrid",
        maxTokens: options?.maxTokens || 10000,
        preserveSystem: options?.preserveSystem ?? true,
        preserveLastN: options?.preserveLastN ?? 2,
      };

      const result = compressConversationWithMemory(messages, opts);

      // Store memory for later restoration
      currentMemory = result.memory;

      return result;
    },

    /**
     * Extract key decisions from messages
     *
     * @param messages - Array of conversation messages
     * @returns Array of extracted decisions
     *
     * @example
     * ```typescript
     * ctx.conversation.extractDecisions(messages)
     * ```
     */
    extractDecisions(messages: ConversationMessage[]): Decision[] {
      return extractDecisions(messages);
    },

    /**
     * Extract code references from messages
     *
     * @param messages - Array of conversation messages
     * @returns Array of code references with actions
     *
     * @example
     * ```typescript
     * ctx.conversation.extractCodeRefs(messages)
     * ```
     */
    extractCodeRefs(messages: ConversationMessage[]): CodeReference[] {
      return extractCodeReferences(messages);
    },

    /**
     * Restore context from stored memory
     *
     * @param options - Restoration options
     * @returns Restored context string
     *
     * @example
     * ```typescript
     * ctx.conversation.restore({ includeSummary: true, recentMessages: 3 })
     * ```
     */
    restore(options?: MemoryRestoreOptions): string {
      if (!currentMemory) {
        return "[No memory stored. Call createMemory() first.]";
      }

      return restoreContext(currentMemory, options);
    },

    /**
     * Get current memory state
     *
     * @returns Current memory or null if not set
     *
     * @example
     * ```typescript
     * const memory = ctx.conversation.getMemory()
     * ```
     */
    getMemory(): ConversationMemory | null {
      return currentMemory;
    },

    /**
     * Set memory state (for restoring from external source)
     *
     * @param memory - Memory state to set
     *
     * @example
     * ```typescript
     * ctx.conversation.setMemory(savedMemory)
     * ```
     */
    setMemory(memory: ConversationMemory): void {
      currentMemory = memory;
    },

    /**
     * Clear stored memory
     *
     * @example
     * ```typescript
     * ctx.conversation.clearMemory()
     * ```
     */
    clearMemory(): void {
      currentMemory = null;
    },

    /**
     * Check if memory is stored
     *
     * @returns True if memory exists
     *
     * @example
     * ```typescript
     * if (ctx.conversation.hasMemory()) { ... }
     * ```
     */
    hasMemory(): boolean {
      return currentMemory !== null;
    },

    /**
     * Get summary of current memory state
     *
     * @returns Summary object or null
     *
     * @example
     * ```typescript
     * const summary = ctx.conversation.getSummary()
     * ```
     */
    getSummary(): {
      summary: string;
      decisionsCount: number;
      codeRefsCount: number;
      messagesCount: number;
      lastUpdated: number;
    } | null {
      if (!currentMemory) return null;

      return {
        summary: currentMemory.summary,
        decisionsCount: currentMemory.decisions.length,
        codeRefsCount: currentMemory.codeReferences.length,
        messagesCount: currentMemory.compressedHistory.length,
        lastUpdated: currentMemory.lastUpdated,
      };
    },
  };
}
