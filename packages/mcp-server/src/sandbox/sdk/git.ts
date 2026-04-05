/**
 * SDK Git Functions
 *
 * Git operations for sandbox use.
 * Uses child_process.execSync for git commands.
 * Returns Result types for type-safe error handling.
 */

import { Result, ok, err } from "neverthrow";
import { execFileSync } from "child_process";
import type {
  GitDiff,
  GitFileChange,
  GitCommit,
  GitBlame,
  GitBlameLine,
  GitStatus,
  GitBranch,
} from "../types.js";
import { GitError, gitError } from "../errors.js";
import { validatePath } from "../security/path-validator.js";
import {
  type SanitizedGitArg,
  brandAsSanitizedGitArg,
} from "../branded-types.js";

const GIT_TIMEOUT = 5000 as const satisfies number; // 5 seconds

/**
 * Blocked git commands that could access network or modify remote state
 * Uses satisfies to ensure type safety while preserving literal types
 */
const BLOCKED_GIT_COMMANDS = [
  "push",
  "fetch",
  "pull",
  "clone",
  "remote",
  "submodule",
  "ls-remote",
  "archive",
] as const satisfies readonly string[];

type BlockedGitCommand = (typeof BLOCKED_GIT_COMMANDS)[number];

/**
 * Sanitize git argument to prevent shell injection.
 * Returns a branded SanitizedGitArg on success.
 */
function sanitizeGitArg(arg: string): Result<SanitizedGitArg, GitError> {
  // Strip git format specifiers %(…) before checking — these are legitimate
  // (e.g., --format=%(refname:short)). Shell injection via $() is still caught
  // because $ is blocked independently.
  const withoutFormatSpecs = arg.replace(/%\([^)]*\)/g, "");

  // Block shell metacharacters that could enable command injection
  if (/[;&|`$(){}[\]<>\\!'"]/.test(withoutFormatSpecs)) {
    return err(gitError.invalidArg(`contains shell metacharacters: ${arg}`));
  }
  // Block newlines which could inject additional commands
  if (/[\r\n]/.test(arg)) {
    return err(gitError.invalidArg(`contains newlines: ${arg}`));
  }
  return ok(brandAsSanitizedGitArg(arg));
}

/**
 * Validate git command is not blocked
 */
function validateGitCommand(command: string): Result<void, GitError> {
  const cmd = command.toLowerCase();
  if (BLOCKED_GIT_COMMANDS.includes(cmd as BlockedGitCommand)) {
    return err(gitError.blockedCommand(command));
  }
  return ok(undefined);
}

/**
 * Execute git command safely.
 * All arguments are sanitized to SanitizedGitArg before execution.
 */
function execGit(args: string[], workingDir: string): Result<string, GitError> {
  // Validate the git subcommand
  if (args.length > 0 && args[0]) {
    const cmdResult = validateGitCommand(args[0]);
    if (cmdResult.isErr()) return err(cmdResult.error);
  }

  // Sanitize all arguments - collect as branded types
  const sanitizedArgs: SanitizedGitArg[] = [];
  for (const arg of args) {
    const result = sanitizeGitArg(arg);
    if (result.isErr()) return err(result.error);
    sanitizedArgs.push(result.value);
  }

  try {
    // Use execFileSync to bypass shell interpretation — args are passed
    // directly to git without /bin/sh processing (no shell injection risk).
    // LC_ALL=C forces English error messages for reliable parsing.
    const result = execFileSync("git", sanitizedArgs.map(String), {
      cwd: workingDir,
      timeout: GIT_TIMEOUT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LC_ALL: "C" },
    });
    return ok(result.trim());
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    const stderr = e.stderr?.toString().trim() || "";
    const errMsg = e.message || "";
    if (stderr.includes("not a git repository") || errMsg.includes("not a git repository")) {
      return err(gitError.notRepo(workingDir));
    }
    return err(gitError.commandFailed(`git ${args[0] || ""}`, stderr || errMsg || "Git command failed"));
  }
}

/**
 * Parse git diff --numstat output
 */
function parseDiffStats(
  numstat: string
): { files: GitFileChange[]; additions: number; deletions: number } {
  const files: GitFileChange[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;

    const parts = line.split("\t");
    if (parts.length < 3) continue;

    const addStr = parts[0] ?? "";
    const delStr = parts[1] ?? "";
    const file = parts[2] ?? "";

    const additions = addStr === "-" ? 0 : parseInt(addStr, 10);
    const deletions = delStr === "-" ? 0 : parseInt(delStr, 10);

    totalAdditions += additions;
    totalDeletions += deletions;

    files.push({
      file,
      status: "modified", // Will be refined below
      additions,
      deletions,
    });
  }

  return { files, additions: totalAdditions, deletions: totalDeletions };
}

/**
 * Refine file status from diff --name-status
 */
function refineFileStatuses(
  files: GitFileChange[],
  nameStatus: string
): GitFileChange[] {
  const statusMap = new Map<string, "added" | "modified" | "deleted" | "renamed">();

  for (const line of nameStatus.split("\n")) {
    if (!line.trim()) continue;

    const parts = line.split("\t");
    const status = parts[0];
    const file = parts[parts.length - 1]; // Handle renames (R100 old new)

    if (!status || !file) continue;

    switch (status[0]) {
      case "A":
        statusMap.set(file, "added");
        break;
      case "D":
        statusMap.set(file, "deleted");
        break;
      case "R":
        statusMap.set(file, "renamed");
        break;
      default:
        statusMap.set(file, "modified");
    }
  }

  return files.map((f) => ({
    ...f,
    status: statusMap.get(f.file) || f.status,
  }));
}

/**
 * Parse git log output (custom format)
 */
function parseLogOutput(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const entries = output.split("\n---COMMIT---\n").filter(Boolean);

  for (const entry of entries) {
    const lines = entry.split("\n");
    if (lines.length < 4) continue;

    commits.push({
      hash: lines[0] || "",
      shortHash: lines[1] || "",
      author: lines[2] || "",
      date: lines[3] || "",
      message: lines.slice(4).join("\n").trim(),
    });
  }

  return commits;
}

/**
 * Parse git blame output (porcelain format)
 */
function parseBlameOutput(output: string): GitBlameLine[] {
  const lines: GitBlameLine[] = [];
  const chunks = output.split(/^([a-f0-9]{40})/m).filter(Boolean);

  for (let i = 0; i < chunks.length; i += 2) {
    const hash = chunks[i];
    const data = chunks[i + 1] || "";

    const authorMatch = data.match(/^author (.+)$/m);
    const dateMatch = data.match(/^author-time (\d+)$/m);
    const lineMatch = data.match(/^(\d+) \d+ \d+$/m);
    const contentMatch = data.match(/\t(.*)$/m);

    const lineNum = lineMatch?.[1];
    if (hash && lineNum) {
      const authorTime = dateMatch?.[1];
      lines.push({
        hash: hash.slice(0, 7),
        author: authorMatch?.[1] ?? "Unknown",
        date: authorTime
          ? new Date(parseInt(authorTime, 10) * 1000).toISOString()
          : "",
        line: parseInt(lineNum, 10),
        content: contentMatch?.[1] ?? "",
      });
    }
  }

  return lines;
}

/**
 * Parse git status --porcelain output
 */
function parseStatusOutput(
  porcelain: string,
  branchInfo: string
): GitStatus {
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;

    const index = line[0];
    const worktree = line[1];
    const file = line.slice(3);

    if (index === "?") {
      untracked.push(file);
    } else if (index !== " ") {
      staged.push(file);
    } else if (worktree !== " ") {
      modified.push(file);
    }
  }

  // Parse branch info: "## main...origin/main [ahead 1, behind 2]"
  let branch = "HEAD";
  let ahead = 0;
  let behind = 0;

  const branchMatch = branchInfo.match(/^## ([^.]+)/);
  const branchName = branchMatch?.[1];
  if (branchName) {
    branch = branchName;
  }

  const aheadMatch = branchInfo.match(/ahead (\d+)/);
  const aheadNum = aheadMatch?.[1];
  if (aheadNum) {
    ahead = parseInt(aheadNum, 10);
  }

  const behindMatch = branchInfo.match(/behind (\d+)/);
  const behindNum = behindMatch?.[1];
  if (behindNum) {
    behind = parseInt(behindNum, 10);
  }

  return { branch, ahead, behind, staged, modified, untracked };
}

/**
 * Create Git API for sandbox
 * All methods return Result<T, GitError> for type-safe error handling
 */
export function createGitAPI(workingDir: string) {
  return {
    /**
     * Get git diff
     * @param ref - Optional ref to diff against (default: HEAD)
     */
    diff(ref?: string): Result<GitDiff, GitError> {
      const refArg = ref || "HEAD";

      // Get the raw diff
      const rawResult = execGit(["diff", refArg], workingDir);
      if (rawResult.isErr()) return err(rawResult.error);

      // Get stats
      const numstatResult = execGit(["diff", "--numstat", refArg], workingDir);
      if (numstatResult.isErr()) return err(numstatResult.error);

      const { files, additions, deletions } = parseDiffStats(numstatResult.value);

      // Get file statuses
      const nameStatusResult = execGit(["diff", "--name-status", refArg], workingDir);
      if (nameStatusResult.isErr()) return err(nameStatusResult.error);

      const refinedFiles = refineFileStatuses(files, nameStatusResult.value);

      return ok({
        raw: rawResult.value,
        files: refinedFiles,
        stats: { additions, deletions },
      });
    },

    /**
     * Get git log
     * @param limit - Number of commits to return (default: 10)
     */
    log(limit?: number): Result<GitCommit[], GitError> {
      const count = Math.min(limit || 10, 100); // Cap at 100
      const format = "%H%n%h%n%an%n%aI%n%s%n---COMMIT---";

      const result = execGit(
        ["log", `-${count}`, `--format=${format}`],
        workingDir
      );

      if (result.isErr()) return err(result.error);
      return ok(parseLogOutput(result.value));
    },

    /**
     * Get git blame for a file
     * @param file - File path to blame
     * @param line - Optional specific line number
     */
    blame(file: string, line?: number): Result<GitBlame, GitError> {
      // Validate file path
      const validation = validatePath(file, workingDir);
      if (!validation.safe) {
        return err(gitError.invalidArg(validation.error || "Invalid file path"));
      }

      const args = ["blame", "--porcelain"];

      if (line !== undefined) {
        args.push(`-L${line},${line}`);
      }

      args.push("--", file);

      const result = execGit(args, workingDir);
      if (result.isErr()) return err(result.error);

      return ok({ lines: parseBlameOutput(result.value) });
    },

    /**
     * Get git status
     */
    status(): Result<GitStatus, GitError> {
      const porcelainResult = execGit(["status", "--porcelain"], workingDir);
      if (porcelainResult.isErr()) return err(porcelainResult.error);

      const branchInfoResult = execGit(["status", "--porcelain", "-b"], workingDir);
      if (branchInfoResult.isErr()) return err(branchInfoResult.error);

      // First line of -b output is branch info
      const firstLine = branchInfoResult.value.split("\n")[0] || "";

      return ok(parseStatusOutput(porcelainResult.value, firstLine));
    },

    /**
     * Get git branch info
     */
    branch(): Result<GitBranch, GitError> {
      // Get current branch
      const currentResult = execGit(["rev-parse", "--abbrev-ref", "HEAD"], workingDir);
      const current = currentResult.isOk() ? currentResult.value : "HEAD";

      // Get all branches
      const branchResult = execGit(["branch", "--format=%(refname:short)"], workingDir);
      if (branchResult.isErr()) return err(branchResult.error);

      const branches = branchResult.value
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean);

      return ok({ current, branches });
    },
  };
}

/**
 * Legacy API that throws on error (for backward compatibility)
 * Use createGitAPI() for new code with Result types
 */
export function createGitAPILegacy(workingDir: string) {
  const api = createGitAPI(workingDir);

  return {
    diff(ref?: string): GitDiff {
      const result = api.diff(ref);
      if (result.isErr()) throw new Error(result.error.message);
      return result.value;
    },

    log(limit?: number): GitCommit[] {
      const result = api.log(limit);
      if (result.isErr()) throw new Error(result.error.message);
      return result.value;
    },

    blame(file: string, line?: number): GitBlame {
      const result = api.blame(file, line);
      if (result.isErr()) throw new Error(result.error.message);
      return result.value;
    },

    status(): GitStatus {
      const result = api.status();
      if (result.isErr()) throw new Error(result.error.message);
      return result.value;
    },

    branch(): GitBranch {
      const result = api.branch();
      if (result.isErr()) throw new Error(result.error.message);
      return result.value;
    },
  };
}
