/**
 * Conversation Compressor
 *
 * Compresses conversation history using different strategies
 * to reduce tokens while preserving key information.
 */

import { countTokens } from "../utils/token-counter.js";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ConversationCompressOptions {
  strategy: "rolling-summary" | "key-extraction" | "hybrid";
  maxTokens: number;
  preserveSystem?: boolean;
  preserveLastN?: number;
}

export interface ConversationCompressResult {
  compressedMessages: ConversationMessage[];
  summary?: string;
  keyPoints?: string[];
  originalTokens: number;
  compressedTokens: number;
  savings: number;
}

/**
 * Extract key points from messages using heuristics
 *
 * Looks for:
 * - Decisions and conclusions
 * - Code references (backticks)
 * - Numbered and bullet lists
 * - File paths and URLs
 * - Important keywords
 */
function extractKeyPoints(messages: ConversationMessage[]): string[] {
  const keyPoints: string[] = [];

  // Keywords that indicate important information
  const importantPatterns = [
    /\bdecided\b/i,
    /\bwill use\b/i,
    /\bshould\b/i,
    /\bmust\b/i,
    /\bimportant\b/i,
    /\bcritical\b/i,
    /\brequired\b/i,
    /\bimplemented\b/i,
    /\bcreated\b/i,
    /\bfixed\b/i,
    /\bupdated\b/i,
  ];

  for (const msg of messages) {
    const lines = msg.content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty or very short lines
      if (trimmed.length < 10) continue;

      // Skip very long lines (likely code blocks)
      if (trimmed.length > 300) continue;

      // Check for important patterns
      const isImportant =
        importantPatterns.some((p) => p.test(trimmed)) ||
        /`[^`]+`/.test(trimmed) || // Code references
        /^\d+\./.test(trimmed) || // Numbered lists
        /^[-*]\s/.test(trimmed) || // Bullet points
        /\.(ts|js|py|go|rs|tsx|jsx)\b/.test(trimmed) || // File extensions
        /https?:\/\//.test(trimmed); // URLs

      if (isImportant) {
        // Clean up the line
        let cleaned = trimmed;

        // Remove markdown formatting
        cleaned = cleaned.replace(/^\s*[-*]\s*/, "");
        cleaned = cleaned.replace(/^\d+\.\s*/, "");
        cleaned = cleaned.replace(/\*\*/g, "");

        if (cleaned.length > 10 && cleaned.length < 200) {
          keyPoints.push(cleaned);
        }
      }
    }
  }

  // Deduplicate and limit to 15 most relevant
  const unique = [...new Set(keyPoints)];
  return unique.slice(0, 15);
}

/**
 * Create a rolling summary of messages
 *
 * Groups messages by role and creates a concise summary
 * of what was discussed and what actions were taken.
 */
function createRollingSummary(messages: ConversationMessage[]): string {
  const userTopics: string[] = [];
  const assistantActions: string[] = [];
  const codeFiles: Set<string> = new Set();

  for (const msg of messages) {
    // Extract first meaningful line as topic
    const lines = msg.content.split("\n").filter((l) => l.trim().length > 0);
    const firstLine = lines[0]?.slice(0, 150) || "";

    if (msg.role === "user") {
      // User messages are typically questions or requests
      if (firstLine.length > 10) {
        userTopics.push(firstLine);
      }
    } else if (msg.role === "assistant") {
      // Look for action patterns in assistant messages
      const actionPatterns = [
        /^(I |I'll |I've |Let me |I'm going to |I will )/i,
        /^(Created|Updated|Fixed|Implemented|Added|Removed)/i,
      ];

      if (actionPatterns.some((p) => p.test(firstLine))) {
        assistantActions.push(firstLine);
      }
    }

    // Extract file references from all messages
    const fileMatches = msg.content.match(
      /[a-zA-Z0-9_\-./]+\.(ts|js|tsx|jsx|py|go|rs|json|yaml|md)\b/g
    );
    if (fileMatches) {
      fileMatches.slice(0, 5).forEach((f) => codeFiles.add(f));
    }
  }

  // Build summary
  const parts: string[] = [];

  if (userTopics.length > 0) {
    const topics = userTopics.slice(0, 3).join("; ");
    parts.push(`User discussed: ${topics}`);
  }

  if (assistantActions.length > 0) {
    const actions = assistantActions.slice(0, 3).join("; ");
    parts.push(`Assistant: ${actions}`);
  }

  if (codeFiles.size > 0) {
    const files = [...codeFiles].slice(0, 5).join(", ");
    parts.push(`Files mentioned: ${files}`);
  }

  return parts.join(". ") || "Previous conversation context.";
}

/**
 * Compress conversation messages
 */
export function compressConversation(
  messages: ConversationMessage[],
  options: ConversationCompressOptions
): ConversationCompressResult {
  const preserveSystem = options.preserveSystem ?? true;
  const preserveLastN = options.preserveLastN ?? 2;

  // Handle edge cases
  if (messages.length === 0) {
    return {
      compressedMessages: [],
      originalTokens: 0,
      compressedTokens: 0,
      savings: 0,
    };
  }

  // Calculate original tokens
  const originalTokens = messages.reduce(
    (sum, m) => sum + countTokens(m.content),
    0
  );

  // Separate messages into categories
  const systemMessages = preserveSystem
    ? messages.filter((m) => m.role === "system")
    : [];

  // Handle case where preserveLastN >= message count
  const effectivePreserveN = Math.min(preserveLastN, messages.length);
  const lastNMessages =
    effectivePreserveN > 0 ? messages.slice(-effectivePreserveN) : [];

  // Messages to compress (excluding system and last N)
  const toCompress = messages
    .slice(0, messages.length - effectivePreserveN)
    .filter((m) => !preserveSystem || m.role !== "system");

  // If nothing to compress, return original
  if (toCompress.length === 0) {
    return {
      compressedMessages: messages,
      originalTokens,
      compressedTokens: originalTokens,
      savings: 0,
    };
  }

  // Apply compression strategy
  let summary: string | undefined;
  let keyPoints: string[] | undefined;
  let contextMessage: ConversationMessage;

  switch (options.strategy) {
    case "rolling-summary":
      summary = createRollingSummary(toCompress);
      contextMessage = {
        role: "system",
        content: `[Previous conversation summary]\n${summary}`,
      };
      break;

    case "key-extraction":
      keyPoints = extractKeyPoints(toCompress);
      if (keyPoints.length === 0) {
        // Fallback to summary if no key points found
        summary = createRollingSummary(toCompress);
        contextMessage = {
          role: "system",
          content: `[Previous conversation context]\n${summary}`,
        };
      } else {
        contextMessage = {
          role: "system",
          content: `[Key points from conversation]\n${keyPoints.map((p) => `- ${p}`).join("\n")}`,
        };
      }
      break;

    case "hybrid":
      summary = createRollingSummary(toCompress);
      keyPoints = extractKeyPoints(toCompress);
      const keyPointsSection =
        keyPoints.length > 0
          ? `\n\nKey points:\n${keyPoints
              .slice(0, 7)
              .map((p) => `- ${p}`)
              .join("\n")}`
          : "";
      contextMessage = {
        role: "system",
        content: `[Conversation context]\n${summary}${keyPointsSection}`,
      };
      break;
  }

  // Build compressed messages array
  // Order: system messages, context message, last N messages
  const compressedMessages: ConversationMessage[] = [
    ...systemMessages,
    contextMessage,
    ...lastNMessages,
  ];

  // Calculate compressed tokens
  const compressedTokens = compressedMessages.reduce(
    (sum, m) => sum + countTokens(m.content),
    0
  );

  // Calculate savings percentage
  const savings =
    originalTokens > 0
      ? Math.round((1 - compressedTokens / originalTokens) * 100)
      : 0;

  return {
    compressedMessages,
    summary,
    keyPoints,
    originalTokens,
    compressedTokens,
    savings: Math.max(0, savings), // Ensure non-negative
  };
}

// ============================================
// Memory Management (Phase 6.2)
// ============================================

/**
 * Decision extracted from conversation
 */
export interface Decision {
  decision: string;
  context: string;
  timestamp: number;
}

/**
 * Code reference from conversation
 */
export interface CodeReference {
  file: string;
  element?: string;
  action: "created" | "modified" | "discussed" | "deleted";
}

/**
 * Conversation memory state
 */
export interface ConversationMemory {
  /** Rolling summary of conversation */
  summary: string;
  /** Key decisions made */
  decisions: Decision[];
  /** Code references mentioned */
  codeReferences: CodeReference[];
  /** Compressed message history */
  compressedHistory: ConversationMessage[];
  /** Timestamp of last update */
  lastUpdated: number;
}

/**
 * Options for memory restoration
 */
export interface MemoryRestoreOptions {
  /** Include full summary */
  includeSummary?: boolean;
  /** Number of recent messages to include */
  recentMessages?: number;
  /** Include code references */
  includeCodeRefs?: boolean;
  /** Include decisions */
  includeDecisions?: boolean;
}

/**
 * Result of conversation memory operation
 */
export interface ConversationMemoryResult {
  /** Restored context string */
  context: string;
  /** Memory state */
  memory: ConversationMemory;
  /** Statistics */
  stats: {
    originalTokens: number;
    compressedTokens: number;
    decisionsExtracted: number;
    codeRefsFound: number;
  };
}

/**
 * Extract decisions from messages with enhanced patterns
 */
export function extractDecisions(messages: ConversationMessage[]): Decision[] {
  const decisions: Decision[] = [];
  const now = Date.now();

  // Decision patterns
  const decisionPatterns = [
    // Direct decisions
    /(?:decided|will|going to|let's|I'll|we'll|we should)\s+(.{10,150})/gi,
    // Plans and approaches
    /(?:the approach|the solution|the plan|strategy)\s+(?:is|will be)\s+(.{10,150})/gi,
    // Requirements
    /(?:we need to|must|should|have to)\s+(.{10,150})/gi,
    // Completed actions
    /(?:done|completed|finished|implemented|created|fixed|updated):\s*(.{10,150})/gi,
  ];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    const lines = msg.content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 15 || trimmed.length > 300) continue;

      for (const pattern of decisionPatterns) {
        pattern.lastIndex = 0; // Reset regex state
        const match = pattern.exec(trimmed);
        if (match && match[1]) {
          const decision = match[1].trim();
          // Avoid duplicates
          if (!decisions.some((d) => d.decision === decision)) {
            decisions.push({
              decision,
              context: trimmed.slice(0, 200),
              timestamp: now,
            });
          }
        }
      }

      // Also check for numbered list items that look like decisions
      if (/^\d+\.\s+/.test(trimmed)) {
        const item = trimmed.replace(/^\d+\.\s+/, "").trim();
        if (
          item.length > 15 &&
          item.length < 200 &&
          !decisions.some((d) => d.decision === item)
        ) {
          decisions.push({
            decision: item,
            context: trimmed,
            timestamp: now,
          });
        }
      }
    }
  }

  // Limit to 20 most recent decisions
  return decisions.slice(-20);
}

/**
 * Extract code references from messages
 */
export function extractCodeReferences(
  messages: ConversationMessage[]
): CodeReference[] {
  const refs: CodeReference[] = [];
  const seenFiles = new Set<string>();

  // File path pattern
  const filePattern =
    /[a-zA-Z0-9_\-./]+\.(ts|js|tsx|jsx|py|go|rs|json|yaml|yml|md|css|scss|html)\b/g;

  // Action patterns
  const actionPatterns: Array<{ pattern: RegExp; action: CodeReference["action"] }> = [
    { pattern: /\b(created?|add(?:ed|ing)?|writ(?:e|ing|ten))\b/i, action: "created" },
    { pattern: /\b(modif(?:y|ied|ying)|updat(?:e|ed|ing)|chang(?:e|ed|ing)|edit(?:ed|ing)?)\b/i, action: "modified" },
    { pattern: /\b(delet(?:e|ed|ing)|remov(?:e|ed|ing))\b/i, action: "deleted" },
  ];

  for (const msg of messages) {
    const content = msg.content;
    let match;

    while ((match = filePattern.exec(content)) !== null) {
      const file = match[0];
      if (seenFiles.has(file)) continue;
      seenFiles.add(file);

      // Find surrounding context to determine action
      const start = Math.max(0, match.index - 50);
      const end = Math.min(content.length, match.index + file.length + 50);
      const context = content.slice(start, end).toLowerCase();

      let action: CodeReference["action"] = "discussed";
      for (const { pattern, action: act } of actionPatterns) {
        if (pattern.test(context)) {
          action = act;
          break;
        }
      }

      refs.push({ file, action });
    }
  }

  // Limit to 30 most relevant
  return refs.slice(0, 30);
}

/**
 * Create conversation memory from messages
 */
export function createMemory(
  messages: ConversationMessage[],
  options: ConversationCompressOptions
): ConversationMemory {
  const summary = createRollingSummary(messages);
  const decisions = extractDecisions(messages);
  const codeReferences = extractCodeReferences(messages);

  // Compress messages using hybrid strategy
  const result = compressConversation(messages, {
    ...options,
    strategy: "hybrid",
  });

  return {
    summary,
    decisions,
    codeReferences,
    compressedHistory: result.compressedMessages,
    lastUpdated: Date.now(),
  };
}

/**
 * Restore context from memory state
 */
export function restoreContext(
  memory: ConversationMemory,
  options: MemoryRestoreOptions = {}
): string {
  const {
    includeSummary = true,
    recentMessages = 3,
    includeCodeRefs = true,
    includeDecisions = true,
  } = options;

  const parts: string[] = [];

  // Add summary
  if (includeSummary && memory.summary) {
    parts.push("[Previous Context]");
    parts.push(memory.summary);
    parts.push("");
  }

  // Add decisions
  if (includeDecisions && memory.decisions.length > 0) {
    parts.push("[Key Decisions]");
    for (const decision of memory.decisions.slice(-10)) {
      parts.push(`- ${decision.decision}`);
    }
    parts.push("");
  }

  // Add code references
  if (includeCodeRefs && memory.codeReferences.length > 0) {
    parts.push("[Code References]");
    const byAction = new Map<string, string[]>();

    for (const ref of memory.codeReferences) {
      if (!byAction.has(ref.action)) {
        byAction.set(ref.action, []);
      }
      byAction.get(ref.action)!.push(ref.file);
    }

    for (const [action, files] of byAction) {
      parts.push(`${action}: ${files.slice(0, 10).join(", ")}`);
    }
    parts.push("");
  }

  // Add recent messages
  if (recentMessages > 0 && memory.compressedHistory.length > 0) {
    parts.push("[Recent Messages]");
    const recent = memory.compressedHistory.slice(-recentMessages);
    for (const msg of recent) {
      const preview = msg.content.slice(0, 200);
      parts.push(`${msg.role}: ${preview}${msg.content.length > 200 ? "..." : ""}`);
    }
  }

  return parts.join("\n");
}

/**
 * Compress conversation and create memory result
 */
export function compressConversationWithMemory(
  messages: ConversationMessage[],
  options: ConversationCompressOptions
): ConversationMemoryResult {
  const originalTokens = messages.reduce(
    (sum, m) => sum + countTokens(m.content),
    0
  );

  const memory = createMemory(messages, options);
  const context = restoreContext(memory);
  const compressedTokens = countTokens(context);

  return {
    context,
    memory,
    stats: {
      originalTokens,
      compressedTokens,
      decisionsExtracted: memory.decisions.length,
      codeRefsFound: memory.codeReferences.length,
    },
  };
}
