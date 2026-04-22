/**
 * Unit tests for packages/mcp-server/scripts/precompact-hook.sh (US-009).
 *
 * The script is a POSIX shell hook that Claude Code dispatches via
 * executePreCompactHooks (claude-code/utils/hooks.ts:3961-4025). Its stdout
 * becomes `newCustomInstructions` merged into the compact-summary prompt.
 *
 * US-011 ships a broader integration test that spawns the hook with a
 * synthesised PreCompact payload and asserts on the Claude Code contract
 * edges. This file covers the narrower US-009 unit-level concerns: the
 * script exists, is executable, handles every documented input shape, and
 * always emits the required phrases on stdout while exiting 0.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(__dirname, "..", "..", "scripts", "precompact-hook.sh");

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

async function runScript(stdinInput: string | null, args: string[] = []): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SCRIPT_PATH, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });
    if (stdinInput !== null) {
      proc.stdin.write(stdinInput);
    }
    proc.stdin.end();
  });
}

describe("precompact-hook.sh — script presence & permissions", () => {
  it("exists at the expected path", () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });

  it("is owner-executable (mode bit 0o100)", () => {
    const stat = fs.statSync(SCRIPT_PATH);
    expect((stat.mode & 0o100) !== 0).toBe(true);
  });

  it("uses the POSIX shebang `#!/bin/sh` (not bash-specific)", () => {
    const firstLine = fs.readFileSync(SCRIPT_PATH, "utf-8").split("\n")[0];
    expect(firstLine).toBe("#!/bin/sh");
  });
});

describe("precompact-hook.sh — --help", () => {
  it("exits 0 with --help", async () => {
    const res = await runScript(null, ["--help"]);
    expect(res.exitCode).toBe(0);
  });

  it("exits 0 with -h", async () => {
    const res = await runScript(null, ["-h"]);
    expect(res.exitCode).toBe(0);
  });

  it("--help includes the marker contract and CLAUDE.md pointer", async () => {
    const res = await runScript(null, ["--help"]);
    expect(res.stdout).toContain("[DISTILL:COMPRESSED");
    expect(res.stdout).toContain("[/DISTILL:COMPRESSED]");
    expect(res.stdout).toContain("CLAUDE.md");
    expect(res.stdout).toContain("PreCompact");
  });
});

describe("precompact-hook.sh — PreCompact hook invocations", () => {
  const PRECOMPACT_SAMPLE = JSON.stringify({
    hook_event_name: "PreCompact",
    trigger: "auto",
    custom_instructions: null,
  });

  it("accepts a well-formed PreCompact hook-input payload and exits 0", async () => {
    const res = await runScript(PRECOMPACT_SAMPLE);
    expect(res.exitCode).toBe(0);
  });

  it("emits the marker-preservation instruction on stdout", async () => {
    const res = await runScript(PRECOMPACT_SAMPLE);
    expect(res.stdout).toContain("[DISTILL:COMPRESSED");
    expect(res.stdout).toContain("[/DISTILL:COMPRESSED]");
    // US-011 asserts these phrases as well — document the contract here.
    expect(res.stdout.toLowerCase()).toContain("preserve verbatim");
    expect(res.stdout.toLowerCase()).toContain("do not re-summarize");
  });

  it("emits plain text (output does NOT start with '{' — PreCompact has no JSON schema branch)", async () => {
    const res = await runScript(PRECOMPACT_SAMPLE);
    expect(res.stdout.trimStart().startsWith("{")).toBe(false);
  });

  it("stdout is bounded (< 4 KB) to avoid ballooning the compact prompt", async () => {
    const res = await runScript(PRECOMPACT_SAMPLE);
    expect(Buffer.byteLength(res.stdout, "utf-8")).toBeLessThan(4 * 1024);
  });

  it("does not write to stderr on success", async () => {
    const res = await runScript(PRECOMPACT_SAMPLE);
    expect(res.stderr).toBe("");
  });
});

describe("precompact-hook.sh — unhappy-path robustness", () => {
  it("empty stdin → exit 0 with the instruction still emitted", async () => {
    const res = await runScript("");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("[DISTILL:COMPRESSED");
  });

  it("non-JSON stdin → exit 0 (never blocks compaction)", async () => {
    const res = await runScript("not json at all\njust\trandom\nbytes");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("[DISTILL:COMPRESSED");
  });

  it("malformed / partial JSON stdin → exit 0", async () => {
    const res = await runScript("{{{\nnot closed");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("[DISTILL:COMPRESSED");
  });

  it("payload with a different hook_event_name → exit 0 (tolerates unexpected events)", async () => {
    const res = await runScript(JSON.stringify({ hook_event_name: "PostCompact", trigger: "manual" }));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("[DISTILL:COMPRESSED");
  });

  it("unknown CLI argument → exit 0 (silent tolerance for future Claude Code flags)", async () => {
    const res = await runScript("", ["--some-future-flag"]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("[DISTILL:COMPRESSED");
  });
});
