/**
 * Path Validator TOCTOU Tests (US-005)
 *
 * Verifies that validation is re-run at file-open time so that a symlink
 * planted between the initial `validatePath` and the actual `readFileSync`
 * is rejected.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  validatePath,
  reValidateAtOpen,
  safeReadFileSyncLegacy,
} from "./path-validator.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "distill-toctou-"));
}

function rmrf(p: string): void {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("validatePath — non-existent path (US-005)", () => {
  let workingDir: string;

  beforeEach(() => {
    workingDir = makeTempDir();
  });

  afterEach(() => rmrf(workingDir));

  it("flags mustRecheckOnOpen when the path does not exist at validate time", () => {
    const target = path.join(workingDir, "will-be-created.txt");
    const result = validatePath(target, workingDir);
    expect(result.safe).toBe(true);
    expect(result.mustRecheckOnOpen).toBe(true);
  });

  it("does NOT flag mustRecheckOnOpen when the path already exists", () => {
    const target = path.join(workingDir, "exists.txt");
    fs.writeFileSync(target, "hi");
    const result = validatePath(target, workingDir);
    expect(result.safe).toBe(true);
    expect(result.mustRecheckOnOpen).toBe(false);
  });
});

describe("reValidateAtOpen (US-005)", () => {
  let workingDir: string;

  beforeEach(() => {
    workingDir = makeTempDir();
  });

  afterEach(() => rmrf(workingDir));

  it("returns the realpath for an in-tree file", () => {
    const target = path.join(workingDir, "ok.txt");
    fs.writeFileSync(target, "content");
    const result = reValidateAtOpen(target, workingDir);
    expect(result.isOk()).toBe(true);
  });

  it("rejects a symlink whose realpath escapes workingDir with PATH_VALIDATION_FAILED_AT_OPEN", () => {
    const escape = path.join(workingDir, "escape");
    // /etc is guaranteed outside any mkdtemp directory
    fs.symlinkSync("/etc/passwd", escape);
    const result = reValidateAtOpen(escape, workingDir);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("PATH_VALIDATION_FAILED_AT_OPEN");
    }
  });

  it("returns FILE_NOT_FOUND when the path disappears between validate and open", () => {
    const missing = path.join(workingDir, "gone.txt");
    const result = reValidateAtOpen(missing, workingDir);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
    }
  });
});

describe("safeReadFileSyncLegacy TOCTOU (US-005)", () => {
  let workingDir: string;

  beforeEach(() => {
    workingDir = makeTempDir();
  });

  afterEach(() => rmrf(workingDir));

  it("reads an in-tree file successfully", () => {
    fs.writeFileSync(path.join(workingDir, "x.txt"), "payload");
    const content = safeReadFileSyncLegacy(
      path.join(workingDir, "x.txt"),
      workingDir
    );
    expect(content).toBe("payload");
  });

  it("refuses a symlink created between validate and open (TOCTOU race simulation)", () => {
    const target = path.join(workingDir, "race");
    // Step 1: file doesn't exist → initial validatePath succeeds with
    // mustRecheckOnOpen=true.
    const validation = validatePath(target, workingDir);
    expect(validation.safe).toBe(true);
    expect(validation.mustRecheckOnOpen).toBe(true);

    // Step 2: attacker plants a symlink to /etc/passwd at the same path.
    fs.symlinkSync("/etc/passwd", target);

    // Step 3: the read must be refused — the safe helper re-validates.
    expect(() => safeReadFileSyncLegacy(target, workingDir)).toThrow(
      // The attack is blocked either by validatePath's own symlink check
      // (layered defense) or by reValidateAtOpen's PATH_VALIDATION_FAILED_AT_OPEN.
      // Both are acceptable — the security contract is rejection.
      /at open time|Symlink escapes working directory/
    );
  });

  it("refuses a symlink swap (file existed, replaced with escape symlink before read)", () => {
    const target = path.join(workingDir, "swap.txt");
    fs.writeFileSync(target, "safe content");

    // Initial validation: file exists, realpath inside workingDir — OK.
    const validation = validatePath(target, workingDir);
    expect(validation.safe).toBe(true);

    // Attacker removes the file and replaces it with a symlink to /etc.
    fs.unlinkSync(target);
    fs.symlinkSync("/etc/passwd", target);

    // Safe read must catch the change.
    expect(() => safeReadFileSyncLegacy(target, workingDir)).toThrow(
      // The attack is blocked either by validatePath's own symlink check
      // (layered defense) or by reValidateAtOpen's PATH_VALIDATION_FAILED_AT_OPEN.
      // Both are acceptable — the security contract is rejection.
      /at open time|Symlink escapes working directory/
    );
  });
});
