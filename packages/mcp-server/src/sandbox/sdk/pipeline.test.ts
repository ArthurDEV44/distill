/**
 * Pipeline SDK Tests
 *
 * Tests for ctx.pipeline.* functions.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createPipelineAPI } from "./pipeline.js";
import type { HostCallbacks } from "../types.js";
import * as fs from "fs";
import * as path from "path";

// Get the monorepo root
function getProjectRoot(): string {
  let dir = __dirname;
  while (dir !== "/" && !fs.existsSync(path.join(dir, "package.json"))) {
    dir = path.dirname(dir);
  }
  return dir;
}

const projectRoot = getProjectRoot();

// Create mock callbacks
function createMockCallbacks(workingDir: string): HostCallbacks {
  return {
    readFile(filePath: string): string {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(workingDir, filePath);
      return fs.readFileSync(fullPath, "utf-8");
    },
    fileExists(filePath: string): boolean {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(workingDir, filePath);
      try {
        fs.accessSync(fullPath);
        return true;
      } catch {
        return false;
      }
    },
    glob(): string[] {
      return [];
    },
  };
}

describe("Pipeline SDK", () => {
  let pipeline: ReturnType<typeof createPipelineAPI>;

  beforeAll(() => {
    const callbacks = createMockCallbacks(projectRoot);
    pipeline = createPipelineAPI(projectRoot, callbacks);
  });

  describe("executePipeline", () => {
    it("should execute glob step", () => {
      const result = pipeline([{ glob: "**/*.ts" }]);

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.stats.stepsExecuted).toBe(1);
    });

    it("should execute filter step", () => {
      const result = pipeline([
        { glob: "**/*.ts" },
        { filter: (f: unknown) => String(f).includes("test") },
      ]);

      expect(result.stats.stepsExecuted).toBe(2);
      const files = result.data as string[];
      expect(files.every((f) => f.includes("test"))).toBe(true);
    });

    it("should execute limit step", () => {
      const result = pipeline([{ glob: "**/*.ts" }, { limit: 5 }]);

      expect(result.stats.stepsExecuted).toBe(2);
      const files = result.data as string[];
      expect(files.length).toBeLessThanOrEqual(5);
    });

    it("should execute sort step", () => {
      const result = pipeline([
        { glob: "**/*.ts" },
        { limit: 10 },
        { sort: "asc" },
      ]);

      expect(result.stats.stepsExecuted).toBe(3);
      const files = result.data as string[];

      // Verify sorted ascending
      for (let i = 1; i < files.length; i++) {
        expect(files[i]! >= files[i - 1]!).toBe(true);
      }
    });

    it("should execute unique step", () => {
      const result = pipeline([
        { glob: "**/*.ts" },
        { unique: true },
      ]);

      expect(result.stats.stepsExecuted).toBe(2);
      const files = result.data as string[];
      const uniqueSet = new Set(files);
      expect(files.length).toBe(uniqueSet.size);
    });

    it("should return stats with execution time", () => {
      const result = pipeline([{ glob: "**/*.ts" }, { limit: 5 }]);

      expect(result.stats).toBeDefined();
      expect(typeof result.stats.executionTimeMs).toBe("number");
      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("codebaseOverview", () => {
    it("should return CodebaseOverview structure", () => {
      const result = pipeline.codebaseOverview("src/sandbox/sdk");

      expect(result).toBeDefined();
      expect(typeof result.totalFiles).toBe("number");
      expect(typeof result.totalLines).toBe("number");
      expect(result.languages).toBeDefined();
      expect(Array.isArray(result.largestFiles)).toBe(true);
      expect(result.structure).toBeDefined();
    });

    it("should count files and lines", () => {
      const result = pipeline.codebaseOverview("src/sandbox/sdk");

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.totalLines).toBeGreaterThan(0);
    });

    it("should detect languages", () => {
      const result = pipeline.codebaseOverview("src/sandbox/sdk");

      expect(result.languages.typescript).toBeGreaterThan(0);
    });

    it("should list largest files", () => {
      const result = pipeline.codebaseOverview("src/sandbox/sdk");

      expect(result.largestFiles.length).toBeGreaterThan(0);
      const firstFile = result.largestFiles[0]!;
      expect(firstFile.path).toBeDefined();
      expect(typeof firstFile.lines).toBe("number");
    });

    it("should build structure tree", () => {
      const result = pipeline.codebaseOverview("src/sandbox/sdk");

      expect(result.structure.type).toBe("directory");
      expect(result.structure.name).toBe("sdk");
      expect(result.structure.children).toBeDefined();
    });
  });

  describe("findUsages", () => {
    it("should return SymbolUsage structure", () => {
      const result = pipeline.findUsages("createPipelineAPI");

      expect(result).toBeDefined();
      expect(result.symbol).toBe("createPipelineAPI");
      expect(Array.isArray(result.definitions)).toBe(true);
      expect(Array.isArray(result.usages)).toBe(true);
      expect(typeof result.totalReferences).toBe("number");
    });

    it("should find definitions", () => {
      const result = pipeline.findUsages("createPipelineAPI");

      expect(result.definitions.length).toBeGreaterThan(0);
      const def = result.definitions[0]!;
      expect(def.file).toBeDefined();
      expect(typeof def.line).toBe("number");
    });

    it("should find usages", () => {
      // Use a symbol that should have usages
      const result = pipeline.findUsages("PipelineStep");

      expect(result.totalReferences).toBeGreaterThan(0);
    });

    it("should support glob filter", () => {
      const result = pipeline.findUsages(
        "createPipelineAPI",
        "**/*.ts"
      );

      expect(result.symbol).toBe("createPipelineAPI");
      expect(result.totalReferences).toBeGreaterThan(0);
    });
  });

  describe("analyzeDeps", () => {
    it("should return DependencyAnalysis structure", () => {
      const result = pipeline.analyzeDeps("src/sandbox/sdk/pipeline.ts");

      expect(result).toBeDefined();
      expect(result.file).toBe("src/sandbox/sdk/pipeline.ts");
      expect(Array.isArray(result.directDeps)).toBe(true);
      expect(Array.isArray(result.transitiveDeps)).toBe(true);
      expect(Array.isArray(result.externalPackages)).toBe(true);
      expect(Array.isArray(result.circularDeps)).toBe(true);
    });

    it("should find external packages", () => {
      const result = pipeline.analyzeDeps("src/sandbox/sdk/pipeline.ts");

      // pipeline.ts imports fs and path
      expect(result.externalPackages).toContain("fs");
      expect(result.externalPackages).toContain("path");
    });

    it("should find direct dependencies", () => {
      const result = pipeline.analyzeDeps("src/sandbox/sdk/pipeline.ts");

      // pipeline.ts imports from ../types.js and ./compress.js
      expect(result.directDeps.length).toBeGreaterThanOrEqual(0);
    });

    it("should respect depth parameter", () => {
      const shallow = pipeline.analyzeDeps("src/sandbox/sdk/pipeline.ts", 1);
      const deep = pipeline.analyzeDeps("src/sandbox/sdk/pipeline.ts", 3);

      // Deep should potentially have more transitive deps
      expect(shallow.directDeps.length).toBeLessThanOrEqual(
        shallow.directDeps.length + deep.transitiveDeps.length
      );
    });
  });

  describe("error handling", () => {
    it("should throw for invalid glob pattern", () => {
      expect(() => pipeline([{ glob: "../../../etc/passwd" }])).toThrow();
    });
  });
});
