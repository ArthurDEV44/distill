import { describe, expect, it } from "vitest";
import {
  compressConversation,
  extractConstraints,
  type ConversationMessage,
} from "./conversation.js";

describe("extractConstraints (F4)", () => {
  it("captures negative imperatives and strong requirements", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "Build the parser.\nDo not use the legacy tokenizer.\nThe output must be valid JSON." },
      { role: "assistant", content: "Understood." },
      { role: "user", content: "Also: never call the network directly, and always validate inputs." },
    ];
    const constraints = extractConstraints(messages);
    expect(constraints).toEqual(
      expect.arrayContaining([
        "Do not use the legacy tokenizer.",
        "The output must be valid JSON.",
        "Also: never call the network directly, and always validate inputs.",
      ])
    );
  });

  it("strips list markers and dedupes", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "- must keep ids stable\n- must keep ids stable\n1. never delete records" },
    ];
    const constraints = extractConstraints(messages);
    expect(constraints).toContain("must keep ids stable");
    expect(constraints).toContain("never delete records");
    expect(constraints.filter((c) => c === "must keep ids stable")).toHaveLength(1);
  });

  it("ignores non-constraint prose", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "The weather is nice today and the build finished." },
    ];
    expect(extractConstraints(messages)).toHaveLength(0);
  });
});

describe("compressConversation constraint preservation (F4)", () => {
  function longHistory(): ConversationMessage[] {
    const msgs: ConversationMessage[] = [
      { role: "user", content: "Constraint: do not use any external API. The result must be deterministic." },
    ];
    // Bulk filler so the early constraint message lands in the compressed span.
    for (let i = 0; i < 12; i++) {
      msgs.push({ role: "assistant", content: `Step ${i}: did some unrelated work and reported progress on the task.` });
      msgs.push({ role: "user", content: `Continue with part ${i} please, looks good so far.` });
    }
    msgs.push({ role: "user", content: "What's the final status?" });
    return msgs;
  }

  it("keeps the early constraint verbatim in the compressed context", () => {
    const result = compressConversation(longHistory(), {
      strategy: "rolling-summary",
      maxTokens: 500,
      preserveLastN: 2,
    });
    const joined = result.compressedMessages.map((m) => m.content).join("\n");
    expect(joined).toContain("[Preserved constraints]");
    expect(joined).toContain("do not use any external API");
    expect(joined).toContain("The result must be deterministic");
    expect(result.constraintsPreserved).toEqual(
      expect.arrayContaining([
        "Constraint: do not use any external API. The result must be deterministic.",
      ])
    );
  });

  it("does not add a constraints block when there are none", () => {
    const msgs: ConversationMessage[] = [];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "user", content: `Just discussing topic ${i} casually here.` });
      msgs.push({ role: "assistant", content: `Sure, here is some info about topic ${i}.` });
    }
    const result = compressConversation(msgs, {
      strategy: "hybrid",
      maxTokens: 500,
      preserveLastN: 2,
    });
    const joined = result.compressedMessages.map((m) => m.content).join("\n");
    expect(joined).not.toContain("[Preserved constraints]");
    expect(result.constraintsPreserved).toBeUndefined();
  });
});
