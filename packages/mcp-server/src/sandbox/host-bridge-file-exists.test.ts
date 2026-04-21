/**
 * host-bridge fileExists TOCTOU tests (v0.9.2 US-002)
 *
 * Verifies that the QuickJS host bridge's `fileExists` callback honors the
 * `mustRecheckOnOpen` flag from `validatePath` by re-resolving through
 * `realpath` before `fs.existsSync`. Without this, an attacker racing the
 * sandbox could plant a symlink between validate and the existsSync call to
 * enumerate host files one bit at a time (CWE-362 TOCTOU → host-filesystem
 * oracle).
 *
 * The tests exercise the bridge via `createHostBridge().__hostFileExists`
 * rather than the lower-level `createHostCallbacks`, because that is the
 * actual guest-facing entry point.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHostBridge } from "./quickjs/host-bridge.js";

function makeTempDir(): string {
  return fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "distill-fe-"))
  );
}

function rmrf(p: string): void {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("host-bridge fileExists — TOCTOU recheck (US-002)", () => {
  let workingDir: string;

  beforeEach(() => {
    workingDir = makeTempDir();
  });

  afterEach(() => rmrf(workingDir));

  it("returns false when a symlink to an out-of-tree host file is planted between validate and call", () => {
    const target = path.join(workingDir, "race");
    // Pre-condition: path does not exist, so validatePath will set
    // mustRecheckOnOpen=true.
    expect(fs.existsSync(target)).toBe(false);

    const bridge = createHostBridge(workingDir);

    // Attacker plants a symlink pointing OUTSIDE the sandbox before the
    // guest's fileExists call lands.
    fs.symlinkSync("/etc/passwd", target);

    const result = bridge.__hostFileExists("race") as boolean;

    // The recheck must refuse the out-of-tree realpath. Pre-US-002 this
    // returned `true` (leaking the existence of /etc/passwd).
    expect(result).toBe(false);
  });

  it("returns true for a legitimate in-tree file that existed at validate time (fast path preserved)", () => {
    const fileName = "hello.txt";
    fs.writeFileSync(path.join(workingDir, fileName), "hi");

    const bridge = createHostBridge(workingDir);
    const result = bridge.__hostFileExists(fileName) as boolean;

    expect(result).toBe(true);
  });

  it("returns true for an in-tree file that was created between validate and call (mustRecheckOnOpen path)", () => {
    const fileName = "late-write.txt";
    // File does not exist yet → validatePath will flag mustRecheckOnOpen.
    expect(fs.existsSync(path.join(workingDir, fileName))).toBe(false);

    const bridge = createHostBridge(workingDir);

    // Legitimate late write (not an attack): the file is created inside the
    // sandbox before fileExists is called.
    fs.writeFileSync(path.join(workingDir, fileName), "hello");

    const result = bridge.__hostFileExists(fileName) as boolean;

    expect(result).toBe(true);
  });

  it("returns false for a never-created in-tree path with no symlink planted (no crash)", () => {
    const bridge = createHostBridge(workingDir);

    const result = bridge.__hostFileExists("nothing-here.txt") as boolean;

    expect(result).toBe(false);
  });

  it("returns false when the path is an in-tree symlink whose realpath escapes workingDir (never created, planted immediately)", () => {
    // Simulate an attacker who plants the symlink BEFORE any prior validate —
    // validatePath's own symlink check (line 85 of path-validator.ts) will
    // reject, and fileExists returns false via the !validation.safe branch.
    fs.symlinkSync("/etc/passwd", path.join(workingDir, "direct-escape"));

    const bridge = createHostBridge(workingDir);
    const result = bridge.__hostFileExists("direct-escape") as boolean;

    expect(result).toBe(false);
  });

  it("returns false and does not throw when validatePath rejects the input outright (e.g. traversal path)", () => {
    const bridge = createHostBridge(workingDir);

    // `../../../etc/passwd` is rejected by validatePath's containment check.
    // The early-return branch in fileExists should catch this before touching
    // the filesystem.
    expect(() => {
      const result = bridge.__hostFileExists("../../../etc/passwd") as boolean;
      expect(result).toBe(false);
    }).not.toThrow();
  });

  it("does not propagate exceptions to the guest when the recheck helper hits an error", () => {
    // `resolveWithinWorkingDir` wraps all realpath calls in try/catch and
    // returns null on failure, so fileExists cannot throw through that path.
    // Exercise the mustRecheckOnOpen branch with a truly non-existent target
    // to confirm the null-return path returns false cleanly.
    const bridge = createHostBridge(workingDir);

    expect(() => {
      const result = bridge.__hostFileExists(
        "deeply/nested/missing.txt"
      ) as boolean;
      expect(result).toBe(false);
    }).not.toThrow();
  });
});
