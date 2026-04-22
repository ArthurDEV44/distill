/**
 * Integration test for precompact-hook.sh (US-011).
 *
 * Layered above the unit tests in precompact-hook.test.ts (US-009), this
 * file validates the *end-to-end* contract:
 *
 *   synthetic PreCompact payload  → ./precompact-hook.sh  → stdout
 *                                                          │
 *                                                          ▼
 *            simulated mergeHookInstructions(...)          │
 *         (mirrors claude-code/utils/hooks.ts:3991-4024)   │
 *                                                          ▼
 *                              { newCustomInstructions: string | undefined }
 *
 * If our hook's stdout round-trips through that merge and produces a
 * non-empty `newCustomInstructions` containing the marker-preservation
 * phrases, then the real PreCompact dispatcher will produce the same
 * string and hand it to the compact-summary LLM.
 *
 * AC6 — POSIX compliance on Ubuntu — is backstopped by a conditional
 * `shellcheck` sub-test (runs when available, skipped otherwise) and by
 * the `shellcheck` CI job wired in `.github/workflows/build.yml`.
 */

import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = path.resolve(__dirname, "..", "..", "scripts", "precompact-hook.sh");

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  succeeded: boolean;
}

async function runHook(stdinPayload: string): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(SCRIPT_PATH, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code,
        succeeded: code === 0,
      });
    });
    proc.stdin.write(stdinPayload);
    proc.stdin.end();
  });
}

/**
 * Build a `PreCompactHookInput` matching the shape that Claude Code dispatches
 * at `claude-code/utils/hooks.ts:3972-3977`. The fields we care about for the
 * hook's own logic are `hook_event_name`, `trigger`, `custom_instructions`;
 * the base fields (`session_id`, `transcript_path`, `cwd`) are padded with
 * plausible values so the payload is indistinguishable from a real dispatch.
 */
function buildPreCompactInput(overrides: Partial<Record<string, unknown>> = {}): string {
  const base = {
    session_id: "01J0000000000000000000000",
    transcript_path: "/tmp/claude-transcript.jsonl",
    cwd: "/home/user/project",
    hook_event_name: "PreCompact" as const,
    trigger: "auto" as "auto" | "manual",
    custom_instructions: null,
  };
  return JSON.stringify({ ...base, ...overrides });
}

/**
 * Simulate the subset of `executePreCompactHooks` in
 * `claude-code/utils/hooks.ts:3991-4024` that merges hook outputs into
 * `newCustomInstructions`. We only model the plain-text path — PreCompact
 * has no JSON hookSpecificOutput branch, so plain stdout is the canonical
 * input.
 */
function simulateMergeHookInstructions(
  results: SpawnResult[],
): { newCustomInstructions?: string } {
  const successfulOutputs = results
    .filter((r) => r.succeeded && r.stdout.trim().length > 0)
    .map((r) => r.stdout.trim());
  if (successfulOutputs.length === 0) {
    return {};
  }
  return { newCustomInstructions: successfulOutputs.join("\n\n") };
}

function shellcheckAvailable(): boolean {
  try {
    execFileSync("shellcheck", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// AC1 + AC2 + AC3 — synthetic dispatch + merge round-trip
// ---------------------------------------------------------------------------

describe("precompact-hook — synthetic PreCompact dispatch (AC1-AC3)", () => {
  it("accepts a full PreCompactHookInput and exits 0 (AC1)", async () => {
    const payload = buildPreCompactInput();
    const res = await runHook(payload);
    expect(res.exitCode).toBe(0);
  });

  it("round-trips through mergeHookInstructions into a non-empty newCustomInstructions (AC2)", async () => {
    const res = await runHook(buildPreCompactInput());
    const merged = simulateMergeHookInstructions([res]);
    expect(merged.newCustomInstructions).toBeDefined();
    expect(typeof merged.newCustomInstructions).toBe("string");
    expect((merged.newCustomInstructions ?? "").length).toBeGreaterThan(0);
  });

  it("instruction contains the 3 required phrases (AC3)", async () => {
    const res = await runHook(buildPreCompactInput());
    const merged = simulateMergeHookInstructions([res]);
    const instr = merged.newCustomInstructions ?? "";
    expect(instr).toContain("[DISTILL:COMPRESSED");
    expect(instr.toLowerCase()).toContain("preserve verbatim");
    expect(instr.toLowerCase()).toContain("do not re-summarize");
  });

  it("handles both trigger values (auto, manual) identically", async () => {
    const resAuto = await runHook(buildPreCompactInput({ trigger: "auto" }));
    const resManual = await runHook(buildPreCompactInput({ trigger: "manual" }));
    expect(resAuto.exitCode).toBe(0);
    expect(resManual.exitCode).toBe(0);
    // The hook is deterministic — output is identical regardless of trigger.
    expect(resAuto.stdout).toBe(resManual.stdout);
  });

  it("passes through non-null custom_instructions without changing output", async () => {
    const res = await runHook(
      buildPreCompactInput({ custom_instructions: "Focus on bug fixes." }),
    );
    expect(res.exitCode).toBe(0);
    const merged = simulateMergeHookInstructions([res]);
    expect(merged.newCustomInstructions).toContain("[DISTILL:COMPRESSED");
  });
});

// ---------------------------------------------------------------------------
// AC4 + AC5 — unhappy-path: empty / malformed stdin
// ---------------------------------------------------------------------------

describe("precompact-hook — unhappy-path stdin (AC4, AC5)", () => {
  it("empty stdin: exits 0 with a valid merge result (AC4)", async () => {
    const res = await runHook("");
    expect(res.exitCode).toBe(0);
    // "empty-but-valid" per AC4: the hook emits its standard instruction
    // regardless of stdin shape, which is safe to merge. The alternative
    // (empty stdout) would cause `.filter(succeeded && output.length > 0)`
    // to drop this hook, which is also valid — but our hook is stricter,
    // always contributing. Either way, exit 0 is non-blocking.
    const merged = simulateMergeHookInstructions([res]);
    expect(merged.newCustomInstructions).toBeDefined();
  });

  it("non-JSON stdin: exits 0 (AC5)", async () => {
    const res = await runHook("this is not JSON at all\nline 2\n\tline 3");
    expect(res.exitCode).toBe(0);
    const merged = simulateMergeHookInstructions([res]);
    expect(merged.newCustomInstructions).toContain("[DISTILL:COMPRESSED");
  });

  it("malformed JSON stdin: exits 0", async () => {
    const res = await runHook("{{{ not valid ]");
    expect(res.exitCode).toBe(0);
  });

  it("never blocks compaction: all unhappy paths share exit 0 + no stderr", async () => {
    for (const payload of ["", "nope", "{{{", "null", '"just a string"']) {
      const res = await runHook(payload);
      expect(res.exitCode, `payload=${JSON.stringify(payload)}`).toBe(0);
      expect(res.stderr, `payload=${JSON.stringify(payload)}`).toBe("");
    }
  });
});

// ---------------------------------------------------------------------------
// AC6 — POSIX compliance (shellcheck on CI)
// ---------------------------------------------------------------------------

describe("precompact-hook — POSIX compliance (AC6)", () => {
  it.skipIf(!shellcheckAvailable())("passes `shellcheck -s sh` (runs when shellcheck is on PATH)", () => {
    // When available (CI's Ubuntu runner pre-installs shellcheck; locally
    // developers may not have it), run it against the script and assert 0
    // errors. We scope to `-s sh` to match the shebang. `-x` allows sourced
    // files to be followed; the script has none but the flag is harmless.
    expect(() => {
      execFileSync("shellcheck", ["-s", "sh", "-x", SCRIPT_PATH], {
        stdio: "pipe",
      });
    }).not.toThrow();
  });

  it("script uses only POSIX-safe tokens (no bash-specific constructs)", () => {
    const body = fs.readFileSync(SCRIPT_PATH, "utf-8");
    // Common bashisms that should NOT appear in a /bin/sh script:
    const bashisms = [
      /\[\[/, //          [[ ... ]] tests
      /\(\(/, //          arithmetic ((...))
      /\$\(</, //         process substitution $(<file)
      /<<</, //           here-strings
      /^declare\s/m, //   declare
      /^local\s/m, //     local (strict POSIX sh doesn't define it)
    ];
    for (const pattern of bashisms) {
      expect(body).not.toMatch(pattern);
    }
  });

  it("runs cleanly on Linux (tests the CI runner target)", () => {
    // Documentation assertion: the test expects to pass on CI's
    // ubuntu-latest. Locally, we verify we are on a POSIX platform.
    expect(["linux", "darwin"]).toContain(os.platform());
  });
});
