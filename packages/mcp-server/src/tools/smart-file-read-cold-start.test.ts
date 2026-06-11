/**
 * Cold-start regression for smart_file_read (US-004).
 *
 * This file deliberately performs NO Tree-sitter warm-up. Under vitest's
 * default per-file isolation the parser singletons it imports start cold, so
 * the first skeleton/full call exercises the exact path that previously
 * returned a silently-empty structure (the sync fast-path before WASM init).
 * With the async fix the very first call awaits init and returns real data.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { smartFileReadTool } from "./smart-file-read.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

async function read(args: Record<string, unknown>) {
  const result = await smartFileReadTool.execute(args);
  const text = result.content[0]?.text ?? "";
  const sc = (result as { structuredContent?: Record<string, unknown> }).structuredContent;
  return { text, sc, isError: result.isError };
}

let tmpDir: string;
let origCwd: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sfr-cold-"));
  await fs.writeFile(
    path.join(tmpDir, "cold.py"),
    "def cold_start_fn(x):\n    return x + 1\n\nclass ColdClass:\n    def method(self):\n        return 2\n",
    "utf-8"
  );
  await fs.writeFile(
    path.join(tmpDir, "cold.rs"),
    "pub fn cold_start_fn(a: i32) -> i32 { a + 1 }\n\nstruct ColdStruct { x: i32 }\n",
    "utf-8"
  );
  await fs.writeFile(path.join(tmpDir, "blank.py"), "", "utf-8");
  await fs.writeFile(path.join(tmpDir, "whitespace.py"), "   \n  \n", "utf-8");
  origCwd = process.cwd();
  process.chdir(tmpDir);
});

afterAll(async () => {
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("smart_file_read — cold Tree-sitter WASM start (US-004)", () => {
  it("skeleton on a Python file returns real structure on the very first call", async () => {
    // First Python parser touch in this isolated file → genuinely cold.
    const { text, sc, isError } = await read({ filePath: "cold.py", mode: "skeleton", cache: false });
    expect(isError).toBeUndefined();
    expect(text).toContain("cold_start_fn");
    expect(text).not.toContain("Structure partial");
    expect((sc?.elementCount as number) ?? 0).toBeGreaterThan(0);
  }, 30000);

  it("skeleton on a Rust file returns real structure on the very first call", async () => {
    // First Rust parser touch in this isolated file → genuinely cold.
    const { text, sc, isError } = await read({ filePath: "cold.rs", mode: "skeleton", cache: false });
    expect(isError).toBeUndefined();
    expect(text).toContain("cold_start_fn");
    expect(text).not.toContain("Structure partial");
    expect((sc?.elementCount as number) ?? 0).toBeGreaterThan(0);
  }, 30000);

  it("full mode also returns real structure cold (no silent-empty)", async () => {
    const { text } = await read({ filePath: "cold.rs", mode: "full", cache: false });
    expect(text).toContain("cold_start_fn");
    expect(text).not.toContain("Structure partial");
  }, 30000);

  it("distinguishes a genuinely empty file ('File is empty.') from a partial parse", async () => {
    const { text } = await read({ filePath: "blank.py", mode: "skeleton", cache: false });
    expect(text).toContain("File is empty.");
    expect(text).not.toContain("parser may be unavailable");
  }, 30000);

  it("treats a whitespace-only file as empty too", async () => {
    const { text } = await read({ filePath: "whitespace.py", mode: "skeleton", cache: false });
    expect(text).toContain("File is empty.");
  }, 30000);
});
