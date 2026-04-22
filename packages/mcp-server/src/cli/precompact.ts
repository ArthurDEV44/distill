/**
 * PreCompact hook installer for Distill (US-010).
 *
 * Extends `distill-mcp setup` with `--install-precompact-hook` and
 * `--uninstall-precompact-hook`, wiring the shipped POSIX hook
 * (`scripts/precompact-hook.sh` from US-009) into
 * `<userDir>/.claude/settings.json` under `hooks.PreCompact`.
 *
 * Design invariants:
 *   - Idempotent: re-running install does not create duplicate entries.
 *   - Atomic: every write goes through a tempfile + rename (POSIX atomic on
 *     same filesystem). A SIGTERM mid-install leaves the target in either
 *     pre-state or post-state — never half-written.
 *   - Fail-safe: malformed existing JSON aborts without mutating the file;
 *     the error surfaces with line/column pointer.
 *   - Targeted: a `__distill_version` sentinel field on our hook entry makes
 *     uninstall precise (we remove only what we wrote). Path-equality on the
 *     `command` field is a secondary fallback, in case an upstream Zod parse
 *     strips the sentinel when Claude Code rewrites settings.
 *
 * Per project convention (CLAUDE.md: "Manual process.argv parsing in
 * bin/cli.js"), this module pulls in no new runtime dependencies.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { fileURLToLocalPath, getPackageVersion } from "./utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrecompactOptions {
  /** Root dir containing `.claude/` (defaults to OS HOME). Used by tests. */
  userDir?: string;
  /** Print intended changes without mutating the filesystem. */
  dryRun?: boolean;
}

export interface PrecompactResult {
  action: "installed" | "uninstalled" | "noop" | "dry-run" | "aborted";
  /** Absolute path to the settings file that was (or would be) touched. */
  settingsPath: string;
  /** Human-readable message for CLI output. */
  message: string;
  /** Non-empty when `action === "aborted"`. */
  errorCode?: "malformed-json" | "permission-denied" | "unknown";
}

interface BashCommandHook {
  type: "command";
  command: string;
  [key: string]: unknown;
}

interface HookMatcher {
  matcher?: string;
  hooks: BashCommandHook[];
  [key: string]: unknown;
}

interface SettingsShape {
  hooks?: {
    PreCompact?: HookMatcher[];
    [event: string]: HookMatcher[] | undefined;
  };
  [key: string]: unknown;
}

type ReadResult =
  | { state: "missing" }
  | { state: "malformed"; error: { line: number; column: number; message: string } }
  | { state: "ok"; data: SettingsShape };

// ---------------------------------------------------------------------------
// Path resolution & constants
// ---------------------------------------------------------------------------

export const DISTILL_SENTINEL_KEY = "__distill_version";

/**
 * Absolute path to the shipped PreCompact hook script. Resolves from the
 * compiled `dist/cli/precompact.js` (or `src/cli/precompact.ts` under vitest)
 * up to the package root — both layouts are `<pkg>/<dist|src>/cli/` so two
 * `..` hops land at the root where `scripts/` lives.
 */
export function getHookScriptPath(): string {
  const here = path.dirname(fileURLToLocalPath(import.meta.url));
  return path.resolve(here, "..", "..", "scripts", "precompact-hook.sh");
}

/**
 * Returns the `major.minor.x` sentinel derived from the current
 * `package.json` version. Example: package 0.10.3 → "0.10.x".
 */
export function getHookSentinelVersion(): string {
  const version = getPackageVersion();
  const parts = version.split(".");
  const major = parts[0] ?? "0";
  const minor = parts[1] ?? "0";
  return `${major}.${minor}.x`;
}

export function getSettingsPath(userDir?: string): string {
  const root = userDir ?? os.homedir();
  return path.join(root, ".claude", "settings.json");
}

// ---------------------------------------------------------------------------
// I/O helpers — strict read, atomic write
// ---------------------------------------------------------------------------

/**
 * Read settings.json with discriminated result. Does NOT swallow JSON parse
 * errors (unlike `readJSONFile` in utils.ts) — malformed files report
 * line/column so the caller can surface a clear abort message.
 */
export function readSettingsStrict(filePath: string): ReadResult {
  if (!fs.existsSync(filePath)) {
    return { state: "missing" };
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    const data = JSON.parse(raw) as SettingsShape;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return {
        state: "malformed",
        error: { line: 1, column: 1, message: "Top-level value is not an object" },
      };
    }
    return { state: "ok", data };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Node's SyntaxError for JSON.parse includes "at position N" for JSON.parse
    // failures on newer Node. Convert to line/column for a friendlier message.
    const posMatch = /position (\d+)/.exec(message);
    let line = 1;
    let column = 1;
    if (posMatch) {
      const pos = Number(posMatch[1]);
      const prefix = raw.slice(0, pos);
      const lines = prefix.split("\n");
      line = lines.length;
      column = (lines[lines.length - 1]?.length ?? 0) + 1;
    }
    return { state: "malformed", error: { line, column, message } };
  }
}

/**
 * Atomic write: tempfile (mode 0600) in the target's directory → rename to
 * target → chmod to final mode. POSIX guarantees rename atomicity on the
 * same filesystem. A SIGTERM mid-call leaves either pre-state or post-state.
 *
 * Parent directory is created (0755) if missing. Exported for testability —
 * the install/uninstall paths call this internally.
 */
export function writeAtomic(filePath: string, content: string, finalMode = 0o644): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
  const suffix = crypto.randomBytes(4).toString("hex");
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${suffix}`);
  try {
    fs.writeFileSync(tmpPath, content, { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
    fs.chmodSync(filePath, finalMode);
  } catch (err) {
    // Clean up stray tempfile on failure — best-effort.
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Hook entry construction & detection
// ---------------------------------------------------------------------------

function buildHookEntry(scriptPath: string, version: string): HookMatcher {
  const hook: BashCommandHook = {
    type: "command",
    command: scriptPath,
  };
  hook[DISTILL_SENTINEL_KEY] = version;
  return { hooks: [hook] };
}

function isDistillHook(hook: BashCommandHook | unknown, scriptPath: string): boolean {
  if (!hook || typeof hook !== "object") return false;
  const h = hook as BashCommandHook;
  if (h[DISTILL_SENTINEL_KEY] !== undefined) return true;
  // Fallback: path equality (in case Zod strips the sentinel on upstream re-save).
  if (h.type === "command" && h.command === scriptPath) return true;
  return false;
}

function matcherContainsDistillHook(m: HookMatcher | unknown, scriptPath: string): boolean {
  if (!m || typeof m !== "object") return false;
  const mm = m as HookMatcher;
  if (!Array.isArray(mm.hooks)) return false;
  return mm.hooks.some((h) => isDistillHook(h, scriptPath));
}

// ---------------------------------------------------------------------------
// Public install / uninstall
// ---------------------------------------------------------------------------

export function installPrecompactHook(opts: PrecompactOptions = {}): PrecompactResult {
  const settingsPath = getSettingsPath(opts.userDir);
  const scriptPath = getHookScriptPath();
  const version = getHookSentinelVersion();

  const read = readSettingsStrict(settingsPath);
  if (read.state === "malformed") {
    return {
      action: "aborted",
      settingsPath,
      message: `Aborted: ${settingsPath} is malformed at line ${read.error.line}, column ${read.error.column} (${read.error.message}). Fix manually and re-run.`,
      errorCode: "malformed-json",
    };
  }

  const data: SettingsShape = read.state === "ok" ? read.data : {};
  const hooks = (data.hooks ?? {}) as NonNullable<SettingsShape["hooks"]>;
  const preCompact = Array.isArray(hooks.PreCompact) ? hooks.PreCompact : [];

  // Idempotence: bail if any existing matcher already wraps our hook.
  const alreadyInstalled = preCompact.some((m) => matcherContainsDistillHook(m, scriptPath));
  if (alreadyInstalled) {
    return {
      action: "noop",
      settingsPath,
      message: `PreCompact hook already installed in ${settingsPath} (no change).`,
    };
  }

  const nextPreCompact: HookMatcher[] = [...preCompact, buildHookEntry(scriptPath, version)];
  const nextHooks = { ...hooks, PreCompact: nextPreCompact };
  const nextData: SettingsShape = { ...data, hooks: nextHooks };

  const serialized = JSON.stringify(nextData, null, 2) + "\n";

  if (opts.dryRun) {
    return {
      action: "dry-run",
      settingsPath,
      message: `[dry-run] Would write ${settingsPath}:\n${serialized}`,
    };
  }

  try {
    writeAtomic(settingsPath, serialized, 0o644);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: "aborted",
      settingsPath,
      message: `Failed to write ${settingsPath}: ${message}`,
      errorCode: isPermissionError(err) ? "permission-denied" : "unknown",
    };
  }

  return {
    action: "installed",
    settingsPath,
    message: `Installed PreCompact hook → ${scriptPath} (sentinel: ${version}).`,
  };
}

export function uninstallPrecompactHook(opts: PrecompactOptions = {}): PrecompactResult {
  const settingsPath = getSettingsPath(opts.userDir);
  const scriptPath = getHookScriptPath();

  const read = readSettingsStrict(settingsPath);
  if (read.state === "missing") {
    return {
      action: "noop",
      settingsPath,
      message: `No settings file at ${settingsPath} — nothing to uninstall.`,
    };
  }
  if (read.state === "malformed") {
    return {
      action: "aborted",
      settingsPath,
      message: `Aborted: ${settingsPath} is malformed at line ${read.error.line}, column ${read.error.column} (${read.error.message}). Fix manually and re-run.`,
      errorCode: "malformed-json",
    };
  }

  const data = read.data;
  const hooks = (data.hooks ?? {}) as NonNullable<SettingsShape["hooks"]>;
  const preCompact = Array.isArray(hooks.PreCompact) ? hooks.PreCompact : [];

  // Filter each matcher's hooks[] to drop our entry. Keep the matcher if it
  // still has any hooks; drop the matcher entirely if its hooks[] becomes
  // empty. This preserves user matchers while tidying ours.
  let removedCount = 0;
  const filteredMatchers: HookMatcher[] = [];
  for (const m of preCompact) {
    if (!m || typeof m !== "object" || !Array.isArray(m.hooks)) {
      filteredMatchers.push(m);
      continue;
    }
    const keptHooks = m.hooks.filter((h) => !isDistillHook(h, scriptPath));
    removedCount += m.hooks.length - keptHooks.length;
    if (keptHooks.length > 0) {
      filteredMatchers.push({ ...m, hooks: keptHooks });
    }
  }

  if (removedCount === 0) {
    return {
      action: "noop",
      settingsPath,
      message: `No Distill PreCompact hook entry found in ${settingsPath} — nothing to uninstall.`,
    };
  }

  const nextHooks: NonNullable<SettingsShape["hooks"]> = { ...hooks };
  if (filteredMatchers.length > 0) {
    nextHooks.PreCompact = filteredMatchers;
  } else {
    delete nextHooks.PreCompact;
  }

  const nextData: SettingsShape = { ...data };
  if (Object.keys(nextHooks).length > 0) {
    nextData.hooks = nextHooks;
  } else {
    delete nextData.hooks;
  }

  const serialized = JSON.stringify(nextData, null, 2) + "\n";

  if (opts.dryRun) {
    return {
      action: "dry-run",
      settingsPath,
      message: `[dry-run] Would remove Distill PreCompact entry from ${settingsPath} (${removedCount} hook entr${removedCount === 1 ? "y" : "ies"}).`,
    };
  }

  try {
    writeAtomic(settingsPath, serialized, 0o644);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: "aborted",
      settingsPath,
      message: `Failed to write ${settingsPath}: ${message}`,
      errorCode: isPermissionError(err) ? "permission-denied" : "unknown",
    };
  }

  return {
    action: "uninstalled",
    settingsPath,
    message: `Uninstalled Distill PreCompact hook from ${settingsPath} (removed ${removedCount} entr${removedCount === 1 ? "y" : "ies"}).`,
  };
}

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "EACCES" || code === "EPERM";
}
