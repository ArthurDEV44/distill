/**
 * Conversation Compressor — regression suite (US-019).
 *
 * Covers all three strategies (rolling-summary, key-extraction, hybrid),
 * preserveSystem / preserveLastN behaviour, and unhappy paths on empty
 * or pathological message arrays.
 */

import { describe, expect, it } from "vitest";
import {
  compressConversation,
  extractDecisions,
  extractCodeReferences,
  type ConversationMessage,
} from "./conversation.js";

// Built to be compressible: ~20 back-and-forth turns with substantial
// assistant bodies. Short inputs can't demonstrate rolling-summary
// compression because the summary stub + context header costs ~20 tokens
// of its own.
const LONG_HISTORY: ConversationMessage[] = [
  { role: "system", content: "You are a coding assistant." },
  { role: "user", content: "Help me refactor the UserService class in src/services/users.ts" },
  {
    role: "assistant",
    content:
      "I'll add null-checking to getUserName. Let me look at the current implementation first. I'll read the file, check the call sites, and propose a non-breaking change. The method currently returns user.name unconditionally, which crashes when user is null. We have two options: throw on null, or return an empty string. I'll wait for your preference before touching the code.",
  },
  { role: "user", content: "We decided to throw on null instead of returning a default." },
  {
    role: "assistant",
    content:
      "Created the new version with a null guard. Also updated the test in src/tests/users.test.ts. The new implementation throws a typed UserNotFoundError — I thought that was better than a generic Error for downstream catch blocks. Let me know if you want plain Error instead.",
  },
  { role: "user", content: "Plain Error is fine for now. Move on." },
  { role: "user", content: "Now also add a countUsers method." },
  {
    role: "assistant",
    content:
      "Implemented countUsers. The method calls repo.findAll() and returns users.length. We should also add an index on the users table for performance, but that's an infra change — I'll open a follow-up issue. The naive implementation is fine for the current scale but will need revisiting when we hit 1M users.",
  },
  { role: "user", content: "What about caching?" },
  {
    role: "assistant",
    content:
      "I'll leave caching as a follow-up. For now the focus is correctness. Adding a cache now would require picking an invalidation strategy and hooking into the mutation path — too much to bundle into this PR. I've added a TODO comment pointing at the eventual cache hook.",
  },
  { role: "user", content: "How are we handling concurrent writes?" },
  {
    role: "assistant",
    content:
      "Concurrent writes are serialized at the database level via row-level locks. The ORM handles that transparently. I've added a regression test for the race window between validate and insert — it fails before the fix and passes after.",
  },
  { role: "user", content: "Good. What about the audit log?" },
  {
    role: "assistant",
    content:
      "Audit log entries are written in the same transaction as the mutation, so they are atomic. I've cross-checked this with the audit service team and confirmed there are no double-writes.",
  },
  { role: "user", content: "Let's ship it." },
  { role: "assistant", content: "Running tests. All 28 tests pass. PR opened." },
];

describe("conversation compressor — regressions (US-019)", () => {
  it("rolling-summary collapses history to a single system context message", () => {
    const result = compressConversation(LONG_HISTORY, {
      strategy: "rolling-summary",
      maxTokens: 500,
      preserveSystem: true,
      preserveLastN: 2,
    });
    // Preserved: 1 system + 1 summary context + 2 last = 4 messages.
    expect(result.compressedMessages).toHaveLength(4);
    // The summary context message is role=system and mentions the topic.
    const summaryMsg = result.compressedMessages.find((m) =>
      m.content.startsWith("[Previous conversation summary]"),
    );
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg?.role).toBe("system");
    expect(summaryMsg?.content).toMatch(/refactor|UserService|users\.ts/i);
    // Savings recorded.
    expect(result.savings).toBeGreaterThan(0);
  });

  it("key-extraction surfaces decision-sounding lines and meets ratio floor (≤ 70% of input tokens)", () => {
    const result = compressConversation(LONG_HISTORY, {
      strategy: "key-extraction",
      maxTokens: 500,
      preserveLastN: 1,
    });
    expect(result.keyPoints).toBeDefined();
    expect(result.keyPoints!.length).toBeGreaterThan(0);
    // Matches at least one of the decision patterns (`decided`, `Created`, etc.).
    expect(result.keyPoints!.some((p) => /decided|Created|Implemented|updated/i.test(p))).toBe(
      true,
    );

    const ratio = result.compressedTokens / result.originalTokens;
    expect(ratio).toBeLessThanOrEqual(0.55);
  });

  it("hybrid strategy combines summary + key points in a single context message", () => {
    const result = compressConversation(LONG_HISTORY, {
      strategy: "hybrid",
      maxTokens: 500,
      preserveLastN: 2,
    });
    const contextMsg = result.compressedMessages.find((m) =>
      m.content.startsWith("[Conversation context]"),
    );
    expect(contextMsg).toBeDefined();
    // Hybrid carries both the summary prose and bullet-pointed key points.
    expect(contextMsg?.content).toMatch(/Key points:/);
    expect(result.summary).toBeDefined();
    expect(result.keyPoints).toBeDefined();
  });

  it("extractDecisions surfaces explicit decision markers", () => {
    const decisions = extractDecisions(LONG_HISTORY);
    expect(decisions.length).toBeGreaterThan(0);
    // The "we decided to throw on null" line should produce a decision entry.
    expect(decisions.some((d) => /throw on null/i.test(d.decision))).toBe(true);
  });

  it("extractCodeReferences identifies the file paths mentioned in messages", () => {
    const refs = extractCodeReferences(LONG_HISTORY);
    const files = refs.map((r) => r.file);
    expect(files).toContain("src/services/users.ts");
    expect(files).toContain("src/tests/users.test.ts");
  });

  it("unhappy path: empty / all-system / preserveLastN > length returns safely", () => {
    const empty = compressConversation([], {
      strategy: "rolling-summary",
      maxTokens: 100,
    });
    expect(empty.compressedMessages).toEqual([]);
    expect(empty.originalTokens).toBe(0);
    expect(empty.savings).toBe(0);

    // Only system messages → preserveSystem + nothing to compress → passthrough.
    const onlySystem = compressConversation(
      [{ role: "system", content: "You are an assistant." }],
      { strategy: "rolling-summary", maxTokens: 100 },
    );
    expect(onlySystem.compressedMessages).toHaveLength(1);
    expect(onlySystem.savings).toBe(0);

    // preserveLastN larger than the conversation → nothing to compress.
    const tinyHistory: ConversationMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const allPreserved = compressConversation(tinyHistory, {
      strategy: "rolling-summary",
      maxTokens: 100,
      preserveLastN: 10,
    });
    expect(allPreserved.compressedMessages).toHaveLength(2);
    expect(allPreserved.savings).toBe(0);
  });
});
