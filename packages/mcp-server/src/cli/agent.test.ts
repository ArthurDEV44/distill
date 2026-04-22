/**
 * Integration tests for US-016: `distill-mcp setup --install-agent`.
 *
 * Covers the 6 testable acceptance criteria (AC #7 — "agent appears in a real
 * Claude Code session" — is explicitly manual in the PRD and lives in the PR
 * review checklist):
 *   1. Fresh install: creates `~/.claude/agents/distill-compressor.md` with
 *      mode 0644 and parent dir 0755.
 *   2. Existing identical file: no-op (idempotent).
 *   3. Existing differing file without --force: abort with diff, no mutation.
 *   4. Existing differing file with --force: atomic overwrite to template.
 *   5. --uninstall-agent removes the file (and is a no-op when absent).
 *   6. --dry-run prints intent without touching the filesystem.
 *
 * Every test uses a fresh tmpdir as `userDir`, so no test touches the real
 * ~/.claude/. Tests clean up after themselves via afterEach.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DISTILL_AGENT_FILENAME,
  getAgentAssetPath,
  getTargetAgentPath,
  installAgent,
  summarizeDiff,
  uninstallAgent,
} from "./agent.js";

let userDir: string;

beforeEach(() => {
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), "distill-agent-test-"));
});

afterEach(() => {
  fs.rmSync(userDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Asset resolution sanity
// ---------------------------------------------------------------------------

describe("getAgentAssetPath", () => {
  it("resolves to an existing shipped template", () => {
    const p = getAgentAssetPath();
    expect(p.endsWith(path.join("assets", "agents", DISTILL_AGENT_FILENAME))).toBe(true);
    expect(fs.existsSync(p)).toBe(true);
  });

  it("template contains the required frontmatter fields", () => {
    const content = fs.readFileSync(getAgentAssetPath(), "utf-8");
    expect(content.startsWith("---\n")).toBe(true);
    expect(content).toContain("name: distill-compressor");
    expect(content).toContain("description:");
    expect(content).toContain("tools:");
    expect(content).toContain("disallowedTools:");
    expect(content).toContain("requiredMcpServers:");
    expect(content).toContain("mcp__distill-mcp__auto_optimize");
    expect(content).toContain("mcp__distill-mcp__smart_file_read");
    expect(content).toContain("mcp__distill-mcp__code_execute"); // in disallowedTools
  });
});

// ---------------------------------------------------------------------------
// AC1: fresh install — no dir, no file
// ---------------------------------------------------------------------------

describe("installAgent — fresh filesystem (AC1)", () => {
  it("creates parent dir (0755) + agent file (0644) when neither exists", () => {
    const targetPath = getTargetAgentPath(userDir);
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.existsSync(path.dirname(targetPath))).toBe(false);

    const result = installAgent({ userDir });

    expect(result.action).toBe("installed");
    expect(fs.existsSync(targetPath)).toBe(true);
    const parentStat = fs.statSync(path.dirname(targetPath));
    expect(parentStat.mode & 0o777).toBe(0o755);
    const fileStat = fs.statSync(targetPath);
    expect(fileStat.mode & 0o777).toBe(0o644);
  });

  it("installed content matches the shipped template byte-for-byte", () => {
    installAgent({ userDir });
    const installed = fs.readFileSync(getTargetAgentPath(userDir), "utf-8");
    const asset = fs.readFileSync(getAgentAssetPath(), "utf-8");
    expect(installed).toBe(asset);
  });
});

// ---------------------------------------------------------------------------
// AC2: idempotent — existing identical file
// ---------------------------------------------------------------------------

describe("installAgent — idempotence (AC2)", () => {
  it("is a no-op when the existing file matches the template", () => {
    installAgent({ userDir });

    // Backdate the file so a re-write would be detectable.
    const targetPath = getTargetAgentPath(userDir);
    const stampedAt = new Date(Date.now() - 5000);
    fs.utimesSync(targetPath, stampedAt, stampedAt);
    const mtimeBefore = fs.statSync(targetPath).mtimeMs;

    const result = installAgent({ userDir });
    expect(result.action).toBe("noop");
    // File wasn't touched — mtime stays at the backdated value (allow ≤ 1ms
    // slack for filesystems that round sub-ms precision).
    const mtimeAfter = fs.statSync(targetPath).mtimeMs;
    expect(Math.abs(mtimeAfter - mtimeBefore)).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// AC3: existing differing file WITHOUT --force
// ---------------------------------------------------------------------------

describe("installAgent — differing file without --force (AC3)", () => {
  it("aborts and preserves the existing file", () => {
    const targetPath = getTargetAgentPath(userDir);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const userContent =
      "---\nname: distill-compressor\ndescription: user-edited\n---\n\nCustom body.";
    fs.writeFileSync(targetPath, userContent);

    const result = installAgent({ userDir });

    expect(result.action).toBe("aborted");
    expect(result.errorCode).toBe("differs-without-force");
    expect(result.message).toContain("--force");
    expect(result.message).toContain("Diff");
    expect(fs.readFileSync(targetPath, "utf-8")).toBe(userContent);
  });
});

// ---------------------------------------------------------------------------
// AC4: existing differing file WITH --force
// ---------------------------------------------------------------------------

describe("installAgent — differing file with --force (AC4)", () => {
  it("overwrites atomically and preserves 0644 mode", () => {
    const targetPath = getTargetAgentPath(userDir);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "---\nname: distill-compressor\n---\nold\n", { mode: 0o644 });

    const result = installAgent({ userDir, force: true });

    expect(result.action).toBe("installed");
    const installed = fs.readFileSync(targetPath, "utf-8");
    const asset = fs.readFileSync(getAgentAssetPath(), "utf-8");
    expect(installed).toBe(asset);
    expect(fs.statSync(targetPath).mode & 0o777).toBe(0o644);

    // No stray tempfile from the atomic write.
    const residue = fs
      .readdirSync(path.dirname(targetPath))
      .filter((f) => f.startsWith(`.${DISTILL_AGENT_FILENAME}.tmp-`));
    expect(residue).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC5: uninstall
// ---------------------------------------------------------------------------

describe("uninstallAgent (AC5)", () => {
  it("deletes the file and returns 'uninstalled' when present", () => {
    installAgent({ userDir });
    const targetPath = getTargetAgentPath(userDir);
    expect(fs.existsSync(targetPath)).toBe(true);

    const result = uninstallAgent({ userDir });

    expect(result.action).toBe("uninstalled");
    expect(result.message).toContain(targetPath);
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("is a no-op when the file is absent", () => {
    const result = uninstallAgent({ userDir });
    expect(result.action).toBe("noop");
    expect(result.message).toContain("nothing to uninstall");
  });

  it("leaves the parent ~/.claude/agents/ directory intact (shared with user agents)", () => {
    // Pre-seed a user-authored agent alongside ours.
    const agentsDir = path.dirname(getTargetAgentPath(userDir));
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "user-agent.md"), "---\nname: user-agent\n---\n");

    installAgent({ userDir });
    uninstallAgent({ userDir });

    expect(fs.existsSync(agentsDir)).toBe(true);
    expect(fs.existsSync(path.join(agentsDir, "user-agent.md"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC6: --dry-run
// ---------------------------------------------------------------------------

describe("installAgent / uninstallAgent — --dry-run (AC6)", () => {
  it("install dry-run prints intent without creating the file", () => {
    const targetPath = getTargetAgentPath(userDir);
    const result = installAgent({ userDir, dryRun: true });

    expect(result.action).toBe("dry-run");
    expect(result.message).toContain("[dry-run]");
    expect(result.message).toContain("create");
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("install dry-run on a differing file (with --force) describes the overwrite", () => {
    const targetPath = getTargetAgentPath(userDir);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "different");

    const result = installAgent({ userDir, dryRun: true, force: true });
    expect(result.action).toBe("dry-run");
    expect(result.message).toContain("[dry-run]");
    expect(result.message).toContain("overwrite");
    // Untouched.
    expect(fs.readFileSync(targetPath, "utf-8")).toBe("different");
  });

  it("uninstall dry-run on an existing file describes the delete, no mutation", () => {
    installAgent({ userDir });
    const targetPath = getTargetAgentPath(userDir);

    const result = uninstallAgent({ userDir, dryRun: true });
    expect(result.action).toBe("dry-run");
    expect(result.message).toContain("[dry-run]");
    expect(result.message).toContain("delete");
    expect(fs.existsSync(targetPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// summarizeDiff — used in AC3 abort message
// ---------------------------------------------------------------------------

describe("summarizeDiff", () => {
  it("shows - for lines only in current and + for lines only in template", () => {
    const out = summarizeDiff("a\nb\nc\n", "a\nX\nc\n");
    expect(out).toContain("- b");
    expect(out).toContain("+ X");
  });

  it("returns a marker when there are no line-level differences", () => {
    const out = summarizeDiff("a\nb", "a\nb");
    expect(out).toContain("no line-level differences");
  });

  it("caps output at maxLines and notes how many were omitted", () => {
    const a = Array.from({ length: 100 }, (_, i) => `old-${i}`).join("\n");
    const b = Array.from({ length: 100 }, (_, i) => `new-${i}`).join("\n");
    const out = summarizeDiff(a, b, 5);
    expect(out).toContain("more diff lines omitted");
    // 5 shown; 200 total unique lines (100 only in a + 100 only in b).
    expect(out).toMatch(/195 more/);
  });
});
