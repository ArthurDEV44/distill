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

  it("_meta['anthropic/searchHint'] is a non-empty string on all 3 tools", async () => {
    const res = await client.listTools();
    for (const tool of res.tools) {
      const hint = tool._meta?.["anthropic/searchHint"];
      expect(typeof hint).toBe("string");
      expect((hint as string).length).toBeGreaterThan(0);
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
  it("auto_optimize returns content array and structuredContent", async () => {
    const res = await client.callTool({
      name: "auto_optimize",
      arguments: {
        content: "hello world ".repeat(200),
      },
    });
    expect(res.isError).toBeFalsy();
    expect(Array.isArray(res.content)).toBe(true);
    expect((res.content as unknown[]).length).toBeGreaterThan(0);
    expect(res.structuredContent).toBeDefined();
    expect(typeof res.structuredContent).toBe("object");
  });

  it("smart_file_read returns content array and structuredContent", async () => {
    const res = await client.callTool({
      name: "smart_file_read",
      arguments: {
        filePath: "sample.ts",
        mode: "full",
      },
    });
    expect(res.isError).toBeFalsy();
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.structuredContent).toBeDefined();
  });

  it("code_execute returns content array and structuredContent", async () => {
    const res = await client.callTool({
      name: "code_execute",
      arguments: {
        code: "return 2 + 2;",
      },
    });
    expect(Array.isArray(res.content)).toBe(true);
    expect(res.structuredContent).toBeDefined();
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
