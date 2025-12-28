/**
 * Git SDK Tests
 *
 * Tests for ctx.git.* functions.
 * These tests run against the actual git repository.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createGitAPI } from "./git.js";
import { execSync } from "child_process";

// Check if git is available in the test environment
function isGitAvailable(): boolean {
  try {
    execSync("git --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

// Get repository root from git
function getGitRoot(): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

const gitAvailable = isGitAvailable();
const repoRoot = gitAvailable ? getGitRoot() : null;

describe.skipIf(!gitAvailable || !repoRoot)("Git SDK", () => {
  let git: ReturnType<typeof createGitAPI>;

  beforeAll(() => {
    git = createGitAPI(repoRoot!);
  });

  describe("status", () => {
    it("should return branch name", () => {
      const status = git.status();
      expect(status.branch).toBeDefined();
      expect(typeof status.branch).toBe("string");
    });

    it("should return ahead/behind counts", () => {
      const status = git.status();
      expect(typeof status.ahead).toBe("number");
      expect(typeof status.behind).toBe("number");
    });

    it("should return file arrays", () => {
      const status = git.status();
      expect(Array.isArray(status.staged)).toBe(true);
      expect(Array.isArray(status.modified)).toBe(true);
      expect(Array.isArray(status.untracked)).toBe(true);
    });
  });

  describe("branch", () => {
    it("should return current branch", () => {
      const branch = git.branch();
      expect(branch.current).toBeDefined();
      expect(typeof branch.current).toBe("string");
    });

    it("should return branches array", () => {
      const branch = git.branch();
      expect(Array.isArray(branch.branches)).toBe(true);
      expect(branch.branches.length).toBeGreaterThan(0);
    });

    it("should include current branch in branches list", () => {
      const branch = git.branch();
      expect(branch.branches).toContain(branch.current);
    });
  });

  describe("log", () => {
    it("should return commit history", () => {
      const commits = git.log();
      expect(Array.isArray(commits)).toBe(true);
      expect(commits.length).toBeGreaterThan(0);
    });

    it("should return commits with required fields", () => {
      const commits = git.log(1);
      expect(commits.length).toBe(1);

      const commit = commits[0]!;
      expect(commit.hash).toBeDefined();
      expect(commit.hash.length).toBe(40);
      expect(commit.shortHash).toBeDefined();
      expect(commit.shortHash.length).toBe(7);
      expect(commit.author).toBeDefined();
      expect(commit.date).toBeDefined();
      expect(commit.message).toBeDefined();
    });

    it("should respect limit parameter", () => {
      const commits5 = git.log(5);
      expect(commits5.length).toBeLessThanOrEqual(5);

      const commits2 = git.log(2);
      expect(commits2.length).toBeLessThanOrEqual(2);
    });

    it("should default to 10 commits", () => {
      const commits = git.log();
      expect(commits.length).toBeLessThanOrEqual(10);
    });

    it("should cap at 100 commits", () => {
      const commits = git.log(200);
      expect(commits.length).toBeLessThanOrEqual(100);
    });
  });

  describe("diff", () => {
    it("should return diff structure", () => {
      const diff = git.diff();
      expect(diff).toBeDefined();
      expect(typeof diff.raw).toBe("string");
      expect(Array.isArray(diff.files)).toBe(true);
      expect(typeof diff.stats.additions).toBe("number");
      expect(typeof diff.stats.deletions).toBe("number");
    });

    it("should return file changes with proper fields", () => {
      // This test depends on there being changes
      const diff = git.diff();
      if (diff.files.length > 0) {
        const file = diff.files[0]!;
        expect(file.file).toBeDefined();
        expect(["added", "modified", "deleted", "renamed"]).toContain(file.status);
        expect(typeof file.additions).toBe("number");
        expect(typeof file.deletions).toBe("number");
      }
    });
  });

  describe("blame", () => {
    it("should return blame for existing file", () => {
      // Test on package.json which should always exist
      const blame = git.blame("package.json");
      expect(blame.lines).toBeDefined();
      expect(Array.isArray(blame.lines)).toBe(true);
    });

    it("should return blame lines with proper fields", () => {
      const blame = git.blame("package.json");
      if (blame.lines.length > 0) {
        const line = blame.lines[0]!;
        expect(line.hash).toBeDefined();
        expect(line.author).toBeDefined();
        expect(typeof line.line).toBe("number");
      }
    });

    it("should support line parameter", () => {
      const blame = git.blame("package.json", 1);
      expect(blame.lines.length).toBeLessThanOrEqual(1);
    });

    it("should throw for non-existent file", () => {
      expect(() => git.blame("non-existent-file-xyz.ts")).toThrow();
    });
  });

  describe("error handling", () => {
    it("should throw for non-git directory", () => {
      const nonGitApi = createGitAPI("/tmp");
      expect(() => nonGitApi.status()).toThrow("Not a git repository");
    });
  });
});
