/**
 * Path Validator realpath-root tests (v0.9.2 US-001)
 *
 * Verifies that `validatePath` pre-realpaths its `workingDir` argument so that
 * a symlinked working directory (macOS `/tmp` → `/private/tmp`, bind mounts,
 * container overlays, etc.) does NOT cause false-positive "escape" rejections
 * for legitimate in-tree paths.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { validatePath } from "./path-validator.js";

function makeTempDir(): string {
  // `os.tmpdir()` itself may already be behind a symlink (macOS), but we also
  // realpath it explicitly so the "real" directory is deterministic across
  // platforms for these tests.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "distill-rp-")));
}

function makeSymlinkTo(realDir: string): string {
  const linkPath = path.join(
    os.tmpdir(),
    `distill-rp-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.symlinkSync(realDir, linkPath);
  return linkPath;
}

function rmrf(p: string): void {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function unlinkQuiet(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch {
    // ignore
  }
}

describe("validatePath — symlinked workingDir (US-001)", () => {
  let realDir: string;
  let symlinkDir: string;

  beforeEach(() => {
    realDir = makeTempDir();
    symlinkDir = makeSymlinkTo(realDir);
  });

  afterEach(() => {
    unlinkQuiet(symlinkDir);
    rmrf(realDir);
  });

  it("accepts a legitimate in-tree relative path when workingDir is symlinked", () => {
    const result = validatePath("src/index.ts", symlinkDir);

    expect(result.safe).toBe(true);
    expect(result.resolvedPath).toBeDefined();
    // The resolved candidate must sit under the realpath root, not the
    // symlinked root — otherwise downstream realpath checks would reject it.
    expect(result.resolvedPath!.startsWith(realDir)).toBe(true);
  });

  it("accepts a legitimate in-tree relative path that actually exists on disk (realpath layer also passes)", () => {
    // Create the file inside the real directory so the realpath branch at
    // line 84 of path-validator.ts has a target to resolve.
    fs.mkdirSync(path.join(realDir, "pkg"), { recursive: true });
    fs.writeFileSync(path.join(realDir, "pkg", "file.ts"), "// ok");

    const result = validatePath("pkg/file.ts", symlinkDir);

    expect(result.safe).toBe(true);
    expect(result.resolvedPath!.startsWith(realDir)).toBe(true);
    // File exists, so mustRecheckOnOpen should be false.
    expect(result.mustRecheckOnOpen).toBe(false);
  });

  it("rejects an escape path (../outside.ts) even when workingDir is symlinked", () => {
    const result = validatePath("../outside.ts", symlinkDir);

    expect(result.safe).toBe(false);
    expect(result.error).toContain("within working directory");
  });

  it("rejects an absolute path outside the tree even when workingDir is symlinked", () => {
    const result = validatePath("/etc/passwd", symlinkDir);

    expect(result.safe).toBe(false);
    // Either the containment check or the blocked-pattern check may fire; the
    // security contract is rejection with a non-empty error message.
    expect(result.error).toBeDefined();
  });
});

describe("validatePath — workingDir that does not exist (US-001)", () => {
  it("does not throw when workingDir is missing; falls back to literal-string comparison", () => {
    const missing = path.join(
      os.tmpdir(),
      `distill-rp-missing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    // Pre-condition: directory truly does not exist.
    expect(fs.existsSync(missing)).toBe(false);

    const result = validatePath("src/foo.ts", missing);

    // Fallback behaviour: treat the raw workingDir as the root.
    expect(result.safe).toBe(true);
    expect(result.resolvedPath).toBe(
      path.resolve(missing, "src/foo.ts")
    );
    // Target did not exist either, so the TOCTOU recheck flag must be set.
    expect(result.mustRecheckOnOpen).toBe(true);
  });

  it("rejects an escape path even when workingDir is missing (fallback still enforces containment)", () => {
    const missing = path.join(
      os.tmpdir(),
      `distill-rp-missing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    const result = validatePath("../../../etc/passwd", missing);

    expect(result.safe).toBe(false);
    expect(result.error).toBeDefined();
  });
});
