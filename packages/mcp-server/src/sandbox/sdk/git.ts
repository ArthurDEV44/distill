/**
 * SDK Git Functions
 *
 * Git operations for sandbox use.
 * Uses child_process.execSync for git commands.
 */

import { execSync } from "child_process";
import type {
  GitDiff,
  GitFileChange,
  GitCommit,
  GitBlame,
  GitBlameLine,
  GitStatus,
  GitBranch,
} from "../types.js";
import { validatePath } from "../security/path-validator.js";

const GIT_TIMEOUT = 5000; // 5 seconds

/**
 * Execute git command safely
 */
function execGit(args: string[], workingDir: string): string {
  try {
    const result = execSync(`git ${args.join(" ")}`, {
      cwd: workingDir,
      timeout: GIT_TIMEOUT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    const stderr = err.stderr?.toString().trim() || "";
    if (stderr.includes("not a git repository")) {
      throw new Error("Not a git repository");
    }
    throw new Error(stderr || err.message || "Git command failed");
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
 */
export function createGitAPI(workingDir: string) {
  return {
    /**
     * Get git diff
     * @param ref - Optional ref to diff against (default: HEAD)
     */
    diff(ref?: string): GitDiff {
      const refArg = ref || "HEAD";

      // Get the raw diff
      const raw = execGit(["diff", refArg], workingDir);

      // Get stats
      const numstat = execGit(["diff", "--numstat", refArg], workingDir);
      const { files, additions, deletions } = parseDiffStats(numstat);

      // Get file statuses
      const nameStatus = execGit(["diff", "--name-status", refArg], workingDir);
      const refinedFiles = refineFileStatuses(files, nameStatus);

      return {
        raw,
        files: refinedFiles,
        stats: { additions, deletions },
      };
    },

    /**
     * Get git log
     * @param limit - Number of commits to return (default: 10)
     */
    log(limit?: number): GitCommit[] {
      const count = Math.min(limit || 10, 100); // Cap at 100
      const format = "%H%n%h%n%an%n%aI%n%s%n---COMMIT---";

      const output = execGit(
        ["log", `-${count}`, `--format=${format}`],
        workingDir
      );

      return parseLogOutput(output);
    },

    /**
     * Get git blame for a file
     * @param file - File path to blame
     * @param line - Optional specific line number
     */
    blame(file: string, line?: number): GitBlame {
      // Validate file path
      const validation = validatePath(file, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error || "Invalid file path");
      }

      const args = ["blame", "--porcelain"];

      if (line !== undefined) {
        args.push(`-L${line},${line}`);
      }

      args.push("--", file);

      const output = execGit(args, workingDir);
      return { lines: parseBlameOutput(output) };
    },

    /**
     * Get git status
     */
    status(): GitStatus {
      const porcelain = execGit(["status", "--porcelain"], workingDir);
      const branchInfo = execGit(["status", "--porcelain", "-b"], workingDir);

      // First line of -b output is branch info
      const firstLine = branchInfo.split("\n")[0] || "";

      return parseStatusOutput(porcelain, firstLine);
    },

    /**
     * Get git branch info
     */
    branch(): GitBranch {
      // Get current branch
      let current = "";
      try {
        current = execGit(["rev-parse", "--abbrev-ref", "HEAD"], workingDir);
      } catch {
        current = "HEAD";
      }

      // Get all branches
      const branchOutput = execGit(["branch", "--format=%(refname:short)"], workingDir);
      const branches = branchOutput
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean);

      return { current, branches };
    },
  };
}
