/**
 * Unit tests for src/prompts.ts (US-013).
 *
 * Integration coverage via the in-process MCP client lives in
 * server.test.ts (US-012). This file exercises the registry + helpers
 * directly so regressions (missing prompt, altered guidance, broken
 * lookup) are caught without spinning up the server + transport.
 */

import { describe, it, expect } from "vitest";

import {
  PROMPTS,
  buildPromptMessage,
  findPrompt,
  listPromptsMetadata,
  type PromptDefinition,
} from "./prompts.js";

// ---------------------------------------------------------------------------
// Registry shape (US-013 AC1)
// ---------------------------------------------------------------------------

describe("PROMPTS — registry shape", () => {
  it("exposes exactly three prompts", () => {
    expect(PROMPTS).toHaveLength(3);
  });

  it("carries the expected names in order", () => {
    expect(PROMPTS.map((p) => p.name)).toEqual([
      "compress-session",
      "analyze-tokens",
      "forget-large-results",
    ]);
  });

  it.each(PROMPTS)("prompt %o has non-empty description and guidance", (prompt) => {
    expect(typeof prompt.description).toBe("string");
    expect(prompt.description.length).toBeGreaterThan(0);
    expect(typeof prompt.guidance).toBe("string");
    expect(prompt.guidance.length).toBeGreaterThan(0);
  });

  it("compress-session guidance mentions auto_optimize and autocompact (verbatim from PRD)", () => {
    const prompt = findPrompt("compress-session") as PromptDefinition;
    expect(prompt.guidance).toContain("auto_optimize");
    expect(prompt.guidance).toContain("autocompact");
    expect(prompt.guidance).toContain(">500 chars");
  });

  it("analyze-tokens guidance mentions the roughTokenCountEstimation heuristic and length/4 divisor", () => {
    const prompt = findPrompt("analyze-tokens") as PromptDefinition;
    expect(prompt.guidance).toContain("roughTokenCountEstimation");
    expect(prompt.guidance).toContain("length/4");
    expect(prompt.guidance).toContain("top 3 largest");
  });

  it("forget-large-results guidance cites the 25K-token persistence threshold and mcpValidation.ts:16", () => {
    const prompt = findPrompt("forget-large-results") as PromptDefinition;
    expect(prompt.guidance).toContain("25K tokens");
    expect(prompt.guidance).toContain("claude-code/utils/mcpValidation.ts:16");
    expect(prompt.guidance).toContain("auto_optimize");
  });
});

describe("PROMPTS — immutability", () => {
  it("is a frozen array (prevents accidental in-process mutation)", () => {
    expect(Object.isFrozen(PROMPTS)).toBe(true);
  });

  it("each entry is individually frozen", () => {
    for (const prompt of PROMPTS) {
      expect(Object.isFrozen(prompt)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// findPrompt helper (supports US-013 AC3 — unknown-prompt error handling)
// ---------------------------------------------------------------------------

describe("findPrompt — exact-match lookup", () => {
  it.each(PROMPTS.map((p) => p.name))(
    "returns the registered entry for %s",
    (name) => {
      const result = findPrompt(name);
      expect(result).toBeDefined();
      expect(result?.name).toBe(name);
    },
  );

  it("returns undefined for an unknown name", () => {
    expect(findPrompt("definitely-not-a-prompt")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(findPrompt("")).toBeUndefined();
  });

  it("is case-sensitive (doesn't match wrong-case names)", () => {
    expect(findPrompt("Compress-Session")).toBeUndefined();
    expect(findPrompt("COMPRESS-SESSION")).toBeUndefined();
    expect(findPrompt("compress_session")).toBeUndefined();
  });

  it("returns the canonical frozen entry (reference equality with PROMPTS[i])", () => {
    const result = findPrompt("compress-session");
    expect(result).toBe(PROMPTS[0]);
  });
});

// ---------------------------------------------------------------------------
// listPromptsMetadata — shape for prompts/list response (US-013 AC1)
// ---------------------------------------------------------------------------

describe("listPromptsMetadata — prompts/list shape", () => {
  it("returns a fresh array of exactly three metadata entries", () => {
    const list = listPromptsMetadata();
    expect(list).toHaveLength(3);
  });

  it("each entry has name + description + arguments: []", () => {
    const list = listPromptsMetadata();
    for (const entry of list) {
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("description");
      expect(entry).toHaveProperty("arguments");
      expect(Array.isArray(entry.arguments)).toBe(true);
      expect(entry.arguments).toHaveLength(0);
    }
  });

  it("returns a new array each call (not a shared mutable reference)", () => {
    const a = listPromptsMetadata();
    const b = listPromptsMetadata();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("name/description reflect the registry verbatim", () => {
    const list = listPromptsMetadata();
    for (const [i, entry] of list.entries()) {
      expect(entry.name).toBe(PROMPTS[i]?.name);
      expect(entry.description).toBe(PROMPTS[i]?.description);
    }
  });

  it("does NOT leak the guidance body into the list metadata", () => {
    // list shape is {name, description, arguments} only — guidance is
    // returned separately by prompts/get to avoid bloating list responses.
    const list = listPromptsMetadata();
    for (const entry of list) {
      expect(entry).not.toHaveProperty("guidance");
    }
  });
});

// ---------------------------------------------------------------------------
// buildPromptMessage — shape for prompts/get response (US-013 AC2)
// ---------------------------------------------------------------------------

describe("buildPromptMessage — prompts/get message shape", () => {
  it.each(PROMPTS)(
    "builds a single user-role text message for %s",
    (prompt) => {
      const messages = buildPromptMessage(prompt);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.role).toBe("user");
      expect(messages[0]?.content.type).toBe("text");
      expect(messages[0]?.content.text).toBe(prompt.guidance);
    },
  );

  it("content.text equals the prompt's guidance verbatim (no mutation, no truncation)", () => {
    for (const prompt of PROMPTS) {
      const messages = buildPromptMessage(prompt);
      expect(messages[0]?.content.text).toBe(prompt.guidance);
      expect((messages[0]?.content.text ?? "").length).toBe(prompt.guidance.length);
    }
  });

  it("returns a new array on each call (idempotent, not a shared reference)", () => {
    const prompt = PROMPTS[0]!;
    const a = buildPromptMessage(prompt);
    const b = buildPromptMessage(prompt);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
