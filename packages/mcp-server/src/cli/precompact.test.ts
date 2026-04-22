/**
 * Integration tests for US-010: `distill-mcp setup --install-precompact-hook`.
 *
 * Covers all 8 acceptance criteria:
 *   1. Fresh install creates parent dir + populates PreCompact entry
 *   2. Append-idempotent over existing PreCompact entries
 *   3. --dry-run prints intent, no mutation
 *   4. Missing ~/.claude/settings.json → created (0644) with 0755 parent
 *   5. Malformed JSON aborts with line/column pointer
 *   6. --uninstall removes only the Distill entry (atomic rename)
 *   7. Atomic write: pre-state or post-state only (rename semantics)
 *   8. Entry carries the __distill_version sentinel
 *
 * Every test uses a fresh tmpdir as `userDir`, so no test touches the real
 * ~/.claude/. Tests cleanup after themselves via afterEach.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DISTILL_SENTINEL_KEY,
  getHookScriptPath,
  getHookSentinelVersion,
  getSettingsPath,
  installPrecompactHook,
  readSettingsStrict,
  uninstallPrecompactHook,
  writeAtomic,
} from "./precompact.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let userDir: string;

beforeEach(() => {
  userDir = fs.mkdtempSync(path.join(os.tmpdir(), "distill-precompact-test-"));
});

afterEach(() => {
  fs.rmSync(userDir, { recursive: true, force: true });
});

function readSettings(): Record<string, unknown> {
  const file = getSettingsPath(userDir);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// ---------------------------------------------------------------------------
// AC1 / AC4: fresh install — no file, no dir
// ---------------------------------------------------------------------------

describe("installPrecompactHook — fresh filesystem (AC1, AC4)", () => {
  it("creates parent dir + settings.json when neither exists", () => {
    const settingsPath = getSettingsPath(userDir);
    expect(fs.existsSync(settingsPath)).toBe(false);
    expect(fs.existsSync(path.dirname(settingsPath))).toBe(false);

    const result = installPrecompactHook({ userDir });

    expect(result.action).toBe("installed");
    expect(fs.existsSync(settingsPath)).toBe(true);
    const parentStat = fs.statSync(path.dirname(settingsPath));
    expect(parentStat.mode & 0o777).toBe(0o755);
    const fileStat = fs.statSync(settingsPath);
    expect(fileStat.mode & 0o777).toBe(0o644);
  });

  it("populates hooks.PreCompact with a single entry pointing at the shipped script", () => {
    installPrecompactHook({ userDir });
    const data = readSettings() as { hooks?: { PreCompact?: unknown[] } };
    expect(Array.isArray(data.hooks?.PreCompact)).toBe(true);
    expect(data.hooks?.PreCompact).toHaveLength(1);
    const matcher = data.hooks?.PreCompact?.[0] as { hooks: Array<Record<string, unknown>> };
    expect(matcher.hooks).toHaveLength(1);
    expect(matcher.hooks[0]?.type).toBe("command");
    expect(matcher.hooks[0]?.command).toBe(getHookScriptPath());
  });
});

// ---------------------------------------------------------------------------
// AC2: append-idempotence
// ---------------------------------------------------------------------------

describe("installPrecompactHook — idempotence over existing entries (AC2)", () => {
  it("appends to a pre-existing PreCompact array without duplicating", () => {
    // Pre-seed with a user-authored hook.
    const settingsPath = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            PreCompact: [
              {
                matcher: "manual",
                hooks: [{ type: "command", command: "/usr/local/bin/user-script.sh" }],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const first = installPrecompactHook({ userDir });
    expect(first.action).toBe("installed");

    const after = readSettings() as { hooks: { PreCompact: Array<Record<string, unknown>> } };
    expect(after.hooks.PreCompact).toHaveLength(2);
    expect(after.hooks.PreCompact[0]).toEqual({
      matcher: "manual",
      hooks: [{ type: "command", command: "/usr/local/bin/user-script.sh" }],
    });
  });

  it("is a no-op on re-run", () => {
    const first = installPrecompactHook({ userDir });
    expect(first.action).toBe("installed");

    const snapshotBefore = fs.readFileSync(getSettingsPath(userDir), "utf-8");

    const second = installPrecompactHook({ userDir });
    expect(second.action).toBe("noop");

    const snapshotAfter = fs.readFileSync(getSettingsPath(userDir), "utf-8");
    expect(snapshotAfter).toBe(snapshotBefore);
  });
});

// ---------------------------------------------------------------------------
// AC3: --dry-run
// ---------------------------------------------------------------------------

describe("installPrecompactHook — --dry-run (AC3)", () => {
  it("prints intent without creating the file", () => {
    const settingsPath = getSettingsPath(userDir);
    const result = installPrecompactHook({ userDir, dryRun: true });

    expect(result.action).toBe("dry-run");
    expect(result.message).toContain("[dry-run]");
    expect(result.message).toContain("PreCompact");
    expect(fs.existsSync(settingsPath)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC5: malformed JSON
// ---------------------------------------------------------------------------

describe("installPrecompactHook — malformed JSON (AC5)", () => {
  it("aborts without mutating the file and reports line/column", () => {
    const settingsPath = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const malformed = '{\n  "hooks": {\n    "PreCompact": [\n      { broken }\n    ]\n  }\n}';
    fs.writeFileSync(settingsPath, malformed);

    const before = fs.readFileSync(settingsPath, "utf-8");
    const result = installPrecompactHook({ userDir });
    const after = fs.readFileSync(settingsPath, "utf-8");

    expect(result.action).toBe("aborted");
    expect(result.errorCode).toBe("malformed-json");
    expect(result.message).toMatch(/line \d+, column \d+/);
    expect(after).toBe(before); // never mutated on malformed input
  });

  it("uninstall also aborts on malformed JSON", () => {
    const settingsPath = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, "{this is not json");
    const result = uninstallPrecompactHook({ userDir });
    expect(result.action).toBe("aborted");
    expect(result.errorCode).toBe("malformed-json");
  });

  it("readSettingsStrict distinguishes missing vs malformed vs ok", () => {
    expect(readSettingsStrict(path.join(userDir, "absent.json"))).toEqual({ state: "missing" });

    const malformedPath = path.join(userDir, "bad.json");
    fs.writeFileSync(malformedPath, "not json");
    const r1 = readSettingsStrict(malformedPath);
    expect(r1.state).toBe("malformed");

    const okPath = path.join(userDir, "ok.json");
    fs.writeFileSync(okPath, JSON.stringify({ foo: 1 }));
    const r2 = readSettingsStrict(okPath);
    expect(r2.state).toBe("ok");
    if (r2.state === "ok") expect(r2.data).toEqual({ foo: 1 });
  });
});

// ---------------------------------------------------------------------------
// AC6: --uninstall — targeted removal, preserve others
// ---------------------------------------------------------------------------

describe("uninstallPrecompactHook — targeted removal (AC6)", () => {
  it("removes only the Distill entry and preserves user hooks", () => {
    const settingsPath = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const userHook = {
      matcher: "manual",
      hooks: [{ type: "command", command: "/usr/local/bin/user-script.sh" }],
    };
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ hooks: { PreCompact: [userHook] } }, null, 2),
    );

    installPrecompactHook({ userDir });

    const result = uninstallPrecompactHook({ userDir });
    expect(result.action).toBe("uninstalled");

    const after = readSettings() as { hooks: { PreCompact: unknown[] } };
    expect(after.hooks.PreCompact).toHaveLength(1);
    expect(after.hooks.PreCompact[0]).toEqual(userHook);
  });

  it("prunes empty PreCompact array and empty hooks object", () => {
    installPrecompactHook({ userDir });
    uninstallPrecompactHook({ userDir });
    const after = readSettings();
    expect((after as { hooks?: unknown }).hooks).toBeUndefined();
  });

  it("is a no-op when no Distill entry is present", () => {
    const settingsPath = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ otherKey: 1 }));
    const result = uninstallPrecompactHook({ userDir });
    expect(result.action).toBe("noop");
  });

  it("matches via sentinel AND via path fallback (Zod-stripped sentinels still get cleaned up)", () => {
    // Simulate Claude Code re-saving settings with our sentinel stripped.
    const settingsPath = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const strippedEntry = {
      hooks: [{ type: "command", command: getHookScriptPath() }],
    };
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ hooks: { PreCompact: [strippedEntry] } }, null, 2),
    );
    const result = uninstallPrecompactHook({ userDir });
    expect(result.action).toBe("uninstalled");
  });
});

// ---------------------------------------------------------------------------
// AC7: atomic write
// ---------------------------------------------------------------------------

describe("writeAtomic — atomicity (AC7)", () => {
  it("renames from a tempfile (leaves no .tmp-* residue on success)", () => {
    const target = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeAtomic(target, JSON.stringify({ ok: true }), 0o644);

    const leaks = fs
      .readdirSync(path.dirname(target))
      .filter((f) => f.startsWith(`.${path.basename(target)}.tmp-`));
    expect(leaks).toEqual([]);
  });

  it("final target has mode 0644 even though tempfile was 0600", () => {
    const target = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeAtomic(target, "contents", 0o644);
    const mode = fs.statSync(target).mode;
    expect(mode & 0o777).toBe(0o644);
  });

  it("leaves target unchanged when tempfile write fails (cleans up on throw)", () => {
    const target = getSettingsPath(userDir);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "pre-existing");

    // Simulate a write failure by passing a non-string content object.
    expect(() =>
      writeAtomic(target, undefined as unknown as string, 0o644),
    ).toThrow();

    expect(fs.readFileSync(target, "utf-8")).toBe("pre-existing");
    const residue = fs
      .readdirSync(path.dirname(target))
      .filter((f) => f.startsWith(`.${path.basename(target)}.tmp-`));
    expect(residue).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC8: sentinel
// ---------------------------------------------------------------------------

describe("installPrecompactHook — sentinel (AC8)", () => {
  it("includes __distill_version matching major.minor.x", () => {
    installPrecompactHook({ userDir });
    const data = readSettings() as { hooks: { PreCompact: Array<{ hooks: Array<Record<string, unknown>> }> } };
    const hook = data.hooks.PreCompact[0]?.hooks[0];
    expect(hook?.[DISTILL_SENTINEL_KEY]).toBe(getHookSentinelVersion());
    expect(getHookSentinelVersion()).toMatch(/^\d+\.\d+\.x$/);
  });
});
