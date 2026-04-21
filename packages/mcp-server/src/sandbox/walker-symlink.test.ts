/**
 * Walker Symlink Tests (US-004)
 *
 * Verifies that the two sandbox directory walkers —
 *   - `host-bridge.ts` glob walker (used by ctx.files.glob)
 *   - `search.ts` walkDirectory (used by ctx.search.files)
 * — refuse symlinks whose realpath falls outside the sandbox workingDir,
 *   follow safe in-tree symlinks, and terminate on symlink loops.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHostBridge } from "./quickjs/host-bridge.js";
import { createSearchAPILegacy } from "./sdk/search.js";
import type { HostCallbacks } from "./types.js";

/** Make a fresh temp workingDir for each test so symlinks don't leak. */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "distill-walker-"));
}

function rmrf(p: string): void {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function mockCallbacks(workingDir: string): HostCallbacks {
  return {
    readFile: (p) => fs.readFileSync(path.join(workingDir, p), "utf-8"),
    fileExists: (p) => fs.existsSync(path.join(workingDir, p)),
    glob: () => [],
  };
}

describe("host-bridge glob walker — symlink safety (US-004)", () => {
  let workingDir: string;

  beforeEach(() => {
    workingDir = makeTempDir();
  });

  afterEach(() => rmrf(workingDir));

  it("skips symlinks that resolve outside workingDir", () => {
    fs.writeFileSync(path.join(workingDir, "safe.txt"), "hello");
    // `escape` symlinks to /etc, which is definitely outside the temp dir.
    fs.symlinkSync("/etc", path.join(workingDir, "escape"));

    const bridge = createHostBridge(workingDir);
    const results = bridge.__hostGlob("**/*.txt") as string[];

    expect(results).toContain("safe.txt");
    // Nothing from /etc should leak through the escape symlink.
    for (const r of results) {
      expect(r.startsWith("escape" + path.sep)).toBe(false);
    }
  });

  it("follows in-tree symlinks whose realpath stays under workingDir", () => {
    const realDir = path.join(workingDir, "real");
    fs.mkdirSync(realDir);
    fs.writeFileSync(path.join(realDir, "inner.txt"), "hi");
    fs.symlinkSync(realDir, path.join(workingDir, "linked"));

    const bridge = createHostBridge(workingDir);
    const results = bridge.__hostGlob("**/*.txt") as string[];

    // Both the direct path and the symlinked path should surface the file.
    expect(results).toContain(path.join("real", "inner.txt"));
    expect(results).toContain(path.join("linked", "inner.txt"));
  });

  it("terminates on a symlink loop inside workingDir", () => {
    const a = path.join(workingDir, "a");
    const b = path.join(workingDir, "b");
    fs.mkdirSync(a);
    fs.mkdirSync(b);
    fs.writeFileSync(path.join(a, "file.txt"), "A");
    // Create a cycle: a/loop -> ../b, b/loop -> ../a
    fs.symlinkSync(path.join("..", "b"), path.join(a, "loop"));
    fs.symlinkSync(path.join("..", "a"), path.join(b, "loop"));

    const bridge = createHostBridge(workingDir);
    // If the visited-set guard is missing, this throws or hangs.
    const results = bridge.__hostGlob("**/*.txt") as string[];
    expect(results).toContain(path.join("a", "file.txt"));
  });
});

describe("search.ts walkDirectory — symlink safety (US-004)", () => {
  let workingDir: string;

  beforeEach(() => {
    workingDir = makeTempDir();
  });

  afterEach(() => rmrf(workingDir));

  it("skips symlinks that escape workingDir via ctx.search.files", () => {
    // The search.ts glob matcher requires at least one path segment, so place
    // the in-tree file under a subdirectory instead of at the root.
    const srcDir = path.join(workingDir, "src");
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, "in-tree.ts"), "export {};");
    fs.symlinkSync("/etc", path.join(workingDir, "escape"));

    const api = createSearchAPILegacy(workingDir, mockCallbacks(workingDir));
    const result = api.files("**/*.ts");

    const files = result.files.map((f) => f.path);
    expect(files).toContain(path.join("src", "in-tree.ts"));
    for (const f of files) {
      expect(f.startsWith("escape" + path.sep)).toBe(false);
    }
  });

  it("follows safe in-tree symlinks via ctx.search.files", () => {
    const realDir = path.join(workingDir, "src");
    fs.mkdirSync(realDir);
    fs.writeFileSync(path.join(realDir, "mod.ts"), "export {};");
    fs.symlinkSync(realDir, path.join(workingDir, "alias"));

    const api = createSearchAPILegacy(workingDir, mockCallbacks(workingDir));
    const result = api.files("**/*.ts");

    const files = result.files.map((f) => f.path);
    expect(files).toContain(path.join("src", "mod.ts"));
    expect(files).toContain(path.join("alias", "mod.ts"));
  });

  it("terminates on a symlink loop (no infinite recursion)", () => {
    const a = path.join(workingDir, "a");
    const b = path.join(workingDir, "b");
    fs.mkdirSync(a);
    fs.mkdirSync(b);
    fs.writeFileSync(path.join(a, "x.ts"), "export {};");
    fs.symlinkSync(path.join("..", "b"), path.join(a, "loop"));
    fs.symlinkSync(path.join("..", "a"), path.join(b, "loop"));

    const api = createSearchAPILegacy(workingDir, mockCallbacks(workingDir));
    const result = api.files("**/*.ts");

    const files = result.files.map((f) => f.path);
    expect(files).toContain(path.join("a", "x.ts"));
  });
});
