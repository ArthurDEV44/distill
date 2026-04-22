/**
 * MCP Server Integration Tests
 *
 * End-to-end tests that wire a Client to the real createServer() via an
 * in-memory transport pair, then exercise the MCP wire protocol:
 * tools/list, tools/call, _meta fields, annotations, and error paths.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, type ServerInstance } from "./server.js";

const EXPECTED_TOOL_NAMES = ["auto_optimize", "smart_file_read", "code_execute"] as const;

let instance: ServerInstance;
let client: Client;
let tmpDir: string;
let fixturePath: string;
let originalCwd: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "distill-server-test-"));
  fixturePath = path.join(tmpDir, "sample.ts");
  await fs.writeFile(
    fixturePath,
    `export function hello(name: string): string { return "hi " + name; }\n` +
      `export class Greeter { greet(): string { return "hi"; } }\n`,
    "utf-8"
  );
  originalCwd = process.cwd();
  process.chdir(tmpDir);

  instance = await createServer({ verbose: false });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await Promise.all([
    instance.server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterAll(async () => {
  await client.close();
  await instance.server.close();
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createServer", () => {
  it("returns a ServerInstance with server and tools", () => {
    expect(instance.server).toBeDefined();
    expect(instance.tools).toBeDefined();
  });

  it("registers exactly 3 tools in the internal registry", () => {
    expect(instance.tools.list()).toHaveLength(3);
  });

  it("registers the 3 canonical tools by name", () => {
    const names = instance.tools.list().map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });
});

describe("tools/list — shape", () => {
  it("returns exactly 3 tools", async () => {
    const res = await client.listTools();
    expect(res.tools).toHaveLength(3);
  });

  it("returns the 3 canonical tool names", async () => {
    const res = await client.listTools();
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it("every tool has a non-empty description", async () => {
    const res = await client.listTools();
    for (const tool of res.tools) {
      expect(tool.description).toBeDefined();
      expect((tool.description ?? "").length).toBeGreaterThan(0);
    }
  });

  it("every tool has an inputSchema of type object", async () => {
    const res = await client.listTools();
    for (const tool of res.tools) {
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});

describe("tools/list — _meta fields", () => {
  it("_meta['anthropic/alwaysLoad'] is true on all 3 tools", async () => {
    const res = await client.listTools();
    for (const tool of res.tools) {
      expect(tool._meta?.["anthropic/alwaysLoad"]).toBe(true);
    }
  });

  it("_meta does not declare anthropic/searchHint (unreachable for alwaysLoad tools)", async () => {
    // Per claude-code/tools/ToolSearchTool/prompt.ts:112-116, searchHint is a scoring-only
    // signal inside ToolSearch; deferred-tools prompts render the name alone. For alwaysLoad
    // tools the hint never influences discovery, so we don't emit it (see CLAUDE.md appendix
    // row 2 for the full chain).
    const res = await client.listTools();
    for (const tool of res.tools) {
      expect(tool._meta?.["anthropic/searchHint"]).toBeUndefined();
      expect("anthropic/searchHint" in (tool._meta ?? {})).toBe(false);
    }
  });

  it("_meta does not declare maxResultSizeChars (no-op per Claude Code behavior)", async () => {
    const res = await client.listTools();
    for (const tool of res.tools) {
      expect(tool._meta?.maxResultSizeChars).toBeUndefined();
    }
  });
});

describe("tools/list — outputSchema workaround (Issue #25081)", () => {
  it("no tool exposes outputSchema at the top level", async () => {
    const res = await client.listTools();
    for (const tool of res.tools) {
      expect(tool.outputSchema).toBeUndefined();
    }
  });
});

describe("tools/list — annotations", () => {
  it("every tool has an annotations object", async () => {
    const res = await client.listTools();
    for (const tool of res.tools) {
      expect(tool.annotations).toBeDefined();
    }
  });

  it("auto_optimize annotations mark it read-only, non-destructive, idempotent, closed-world", async () => {
    const res = await client.listTools();
    const tool = res.tools.find((t) => t.name === "auto_optimize");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.annotations?.destructiveHint).toBe(false);
    expect(tool?.annotations?.idempotentHint).toBe(true);
    expect(tool?.annotations?.openWorldHint).toBe(false);
  });

  it("smart_file_read annotations mark it read-only, non-destructive, idempotent, closed-world", async () => {
    const res = await client.listTools();
    const tool = res.tools.find((t) => t.name === "smart_file_read");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.annotations?.destructiveHint).toBe(false);
    expect(tool?.annotations?.idempotentHint).toBe(true);
    expect(tool?.annotations?.openWorldHint).toBe(false);
  });

  it("code_execute annotations mark it non-read-only, destructive, non-idempotent, closed-world", async () => {
    const res = await client.listTools();
    const tool = res.tools.find((t) => t.name === "code_execute");
    expect(tool?.annotations?.readOnlyHint).toBe(false);
    expect(tool?.annotations?.destructiveHint).toBe(true);
    expect(tool?.annotations?.idempotentHint).toBe(false);
    expect(tool?.annotations?.openWorldHint).toBe(false);
    // longRunningHint is intentionally asserted at the registry level below —
    // the MCP SDK's ToolAnnotationsSchema (2025-06-18) does not include
    // longRunningHint, so the field is stripped from the wire response.
  });

  it("code_execute registry annotation sets longRunningHint: true (US-010)", () => {
    const tool = instance.tools.get("code_execute");
    expect(tool?.annotations?.longRunningHint).toBe(true);
  });

  it("every tool has a human-readable title annotation", async () => {
    const res = await client.listTools();
    for (const tool of res.tools) {
      expect(typeof tool.annotations?.title).toBe("string");
      expect((tool.annotations?.title ?? "").length).toBeGreaterThan(0);
    }
  });
});

describe("tools/call — valid invocations", () => {
  it("auto_optimize returns a content array on the wire", async () => {
    const res = await client.callTool({
      name: "auto_optimize",
      arguments: {
        content: "hello world ".repeat(200),
      },
    });
    expect(res.isError).toBeFalsy();
    expect(Array.isArray(res.content)).toBe(true);
    expect((res.content as unknown[]).length).toBeGreaterThan(0);
    expect(res.structuredContent).toBeUndefined();
  });

  it("smart_file_read returns a content array on the wire", async () => {
    const res = await client.callTool({
      name: "smart_file_read",
      arguments: {
        filePath: "sample.ts",
        mode: "full",
      },
    });
    expect(res.isError).toBeFalsy();
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.structuredContent).toBeUndefined();
  });

  it("code_execute returns a content array on the wire", async () => {
    const res = await client.callTool({
      name: "code_execute",
      arguments: {
        code: "return 2 + 2;",
      },
    });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.structuredContent).toBeUndefined();
  });

  it("content array entries are typed text blocks", async () => {
    const res = await client.callTool({
      name: "auto_optimize",
      arguments: { content: "hello world ".repeat(100) },
    });
    const blocks = res.content as Array<{ type: string; text?: string }>;
    for (const block of blocks) {
      expect(block.type).toBe("text");
      expect(typeof block.text).toBe("string");
    }
  });
});

describe("tools/call — error paths", () => {
  it("unknown tool returns isError: true with a diagnostic message", async () => {
    const res = await client.callTool({
      name: "this_tool_does_not_exist",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text.toLowerCase()).toContain("unknown tool");
  });

  it("unknown tool surfaces the requested name in the error text", async () => {
    const res = await client.callTool({
      name: "definitely_not_registered",
      arguments: {},
    });
    const text = (res.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text).toContain("definitely_not_registered");
  });
});

// ---------------------------------------------------------------------------
// US-012: MCP prompts → slash commands (mcp__distill-mcp__<name>)
// ---------------------------------------------------------------------------

describe("prompts/list — shape", () => {
  it("advertises exactly three zero-argument prompts", async () => {
    const res = await client.listPrompts();
    const names = res.prompts.map((p) => p.name).sort();
    expect(names).toEqual(["analyze-tokens", "compress-session", "forget-large-results"]);
  });

  it("each prompt has a non-empty description and zero arguments", async () => {
    const res = await client.listPrompts();
    for (const prompt of res.prompts) {
      expect(typeof prompt.description).toBe("string");
      expect((prompt.description ?? "").length).toBeGreaterThan(0);
      expect(Array.isArray(prompt.arguments)).toBe(true);
      expect(prompt.arguments).toHaveLength(0);
    }
  });
});

describe("prompts/get — single user-role message per prompt", () => {
  it("compress-session returns guidance referencing auto_optimize + autocompact", async () => {
    const res = await client.getPrompt({ name: "compress-session" });
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0]?.role).toBe("user");
    const text = (res.messages[0]?.content as { type: string; text: string }).text;
    expect(text).toContain("auto_optimize");
    expect(text).toContain("autocompact");
  });

  it("analyze-tokens returns guidance referencing roughTokenCountEstimation", async () => {
    const res = await client.getPrompt({ name: "analyze-tokens" });
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0]?.role).toBe("user");
    const text = (res.messages[0]?.content as { type: string; text: string }).text;
    expect(text).toContain("roughTokenCountEstimation");
    expect(text).toContain("length/4");
  });

  it("forget-large-results returns guidance referencing the 25K MCP persistence threshold", async () => {
    const res = await client.getPrompt({ name: "forget-large-results" });
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0]?.role).toBe("user");
    const text = (res.messages[0]?.content as { type: string; text: string }).text;
    expect(text).toContain("25K tokens");
    expect(text).toContain("mcpValidation.ts:16");
  });
});

describe("prompts/get — unknown prompt surfaces MCP error", () => {
  it("throws an MCP error with code -32602 and includes the requested name", async () => {
    let caught: unknown = null;
    try {
      await client.getPrompt({ name: "not-a-real-prompt" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const err = caught as { code?: number; message?: string };
    expect(err.code).toBe(-32602);
    expect(err.message).toContain("not-a-real-prompt");
  });
});
