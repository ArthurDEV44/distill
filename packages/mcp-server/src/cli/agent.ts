/**
 * Custom agent installer for Distill (US-016).
 *
 * Extends `distill-mcp setup` with `--install-agent` and `--uninstall-agent`,
 * copying the shipped `distill-compressor.md` template (US-015) from the
 * package `assets/agents/` directory into `<userDir>/.claude/agents/`.
 *
 * Design invariants mirror the PreCompact hook installer:
 *   - Idempotent: installing when the target file already matches the template
 *     is a no-op; re-running produces no filesystem churn.
 *   - Atomic: overwrites go through `writeAtomic` (tempfile + rename) so a
 *     SIGTERM mid-install leaves either the pre-state or the post-state,
 *     never a half-written file.
 *   - Non-destructive by default: when the target exists and differs from the
 *     template, we abort with a line-level diff unless the caller passes
 *     `force: true`.
 *   - Dry-run surfaces intended actions without touching disk.
 *
 * Per project convention (CLAUDE.md: "Manual process.argv parsing in
 * bin/cli.js"), this module pulls in no new runtime dependencies.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { fileURLToLocalPath } from "./utils.js";
import { writeAtomic } from "./precompact.js";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

export const DISTILL_AGENT_FILENAME = "distill-compressor.md";

export interface AgentOptions {
  /** Root dir containing `.claude/` (defaults to OS HOME). Used by tests. */
  userDir?: string;
  /** Print intended actions without mutating the filesystem. */
  dryRun?: boolean;
  /** Overwrite a differing existing file (install only). */
  force?: boolean;
}

export interface AgentResult {
  action: "installed" | "uninstalled" | "noop" | "dry-run" | "aborted";
  /** Absolute path to the agent file that was (or would be) touched. */
  targetPath: string;
  /** Human-readable message for CLI output. */
  message: string;
  /** Non-empty when `action === "aborted"`. */
  errorCode?: "differs-without-force" | "asset-missing" | "permission-denied" | "unknown";
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Absolute path to the shipped agent template. Resolves from the compiled
 * `dist/cli/agent.js` (or `src/cli/agent.ts` under vitest) up to the package
 * root — both layouts are `<pkg>/<dist|src>/cli/` so two `..` hops land at
 * the root where `assets/agents/` lives.
 */
export function getAgentAssetPath(): string {
  const here = path.dirname(fileURLToLocalPath(import.meta.url));
  return path.resolve(here, "..", "..", "assets", "agents", DISTILL_AGENT_FILENAME);
}

export function getTargetAgentPath(userDir?: string): string {
  const root = userDir ?? os.homedir();
  return path.join(root, ".claude", "agents", DISTILL_AGENT_FILENAME);
}

// ---------------------------------------------------------------------------
// Diff helper (line-level, zero deps)
// ---------------------------------------------------------------------------

/**
 * Minimal unified-style diff of two strings, used only to describe the
 * discrepancy when the caller refuses `--force`. Intentionally naive: a line
 * in `current` that is missing from `template` shows as `-`, and vice versa.
 * Output is capped so a massive template drift cannot flood the terminal.
 */
export function summarizeDiff(current: string, template: string, maxLines = 40): string {
  const a = current.split("\n");
  const b = template.split("\n");
  const setA = new Set(a);
  const setB = new Set(b);
  const lines: string[] = [];
  for (const l of a) {
    if (!setB.has(l)) lines.push(`- ${l}`);
  }
  for (const l of b) {
    if (!setA.has(l)) lines.push(`+ ${l}`);
  }
  if (lines.length === 0) return "(no line-level differences — only ordering or whitespace changes)";
  if (lines.length <= maxLines) return lines.join("\n");
  const head = lines.slice(0, maxLines);
  return head.join("\n") + `\n… (${lines.length - maxLines} more diff lines omitted)`;
}

// ---------------------------------------------------------------------------
// Public install / uninstall
// ---------------------------------------------------------------------------

export function installAgent(opts: AgentOptions = {}): AgentResult {
  const targetPath = getTargetAgentPath(opts.userDir);
  const assetPath = getAgentAssetPath();

  if (!fs.existsSync(assetPath)) {
    return {
      action: "aborted",
      targetPath,
      message: `Aborted: agent template not found at ${assetPath}. The distill-mcp package may be corrupted — reinstall it.`,
      errorCode: "asset-missing",
    };
  }

  const templateContent = fs.readFileSync(assetPath, "utf-8");
  const targetExists = fs.existsSync(targetPath);

  if (targetExists) {
    const existingContent = fs.readFileSync(targetPath, "utf-8");
    if (existingContent === templateContent) {
      return {
        action: "noop",
        targetPath,
        message: `Agent already installed at ${targetPath} (content matches; no change).`,
      };
    }
    if (!opts.force) {
      const diff = summarizeDiff(existingContent, templateContent);
      return {
        action: "aborted",
        targetPath,
        message:
          `Aborted: ${targetPath} exists and differs from the shipped template.\n` +
          `Pass --force to overwrite, or --uninstall-agent first.\n` +
          `Diff (existing → template):\n${diff}`,
        errorCode: "differs-without-force",
      };
    }
  }

  if (opts.dryRun) {
    const verb = targetExists ? "overwrite (differs, --force set)" : "create";
    return {
      action: "dry-run",
      targetPath,
      message: `[dry-run] Would ${verb} ${targetPath} (${templateContent.length} bytes from ${assetPath}).`,
    };
  }

  try {
    writeAtomic(targetPath, templateContent, 0o644);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: "aborted",
      targetPath,
      message: `Failed to write ${targetPath}: ${message}`,
      errorCode: isPermissionError(err) ? "permission-denied" : "unknown",
    };
  }

  const verb = targetExists ? "Overwrote" : "Installed";
  return {
    action: "installed",
    targetPath,
    message: `${verb} distill-compressor agent → ${targetPath}.`,
  };
}

export function uninstallAgent(opts: AgentOptions = {}): AgentResult {
  const targetPath = getTargetAgentPath(opts.userDir);

  if (!fs.existsSync(targetPath)) {
    return {
      action: "noop",
      targetPath,
      message: `No distill-compressor agent at ${targetPath} — nothing to uninstall.`,
    };
  }

  if (opts.dryRun) {
    return {
      action: "dry-run",
      targetPath,
      message: `[dry-run] Would delete ${targetPath}.`,
    };
  }

  try {
    fs.unlinkSync(targetPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: "aborted",
      targetPath,
      message: `Failed to delete ${targetPath}: ${message}`,
      errorCode: isPermissionError(err) ? "permission-denied" : "unknown",
    };
  }

  return {
    action: "uninstalled",
    targetPath,
    message: `Uninstalled distill-compressor agent from ${targetPath}.`,
  };
}

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "EACCES" || code === "EPERM";
}
