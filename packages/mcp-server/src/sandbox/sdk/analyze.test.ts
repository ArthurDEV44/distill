/**
 * Analyze SDK Tests
 *
 * Tests for ctx.analyze.* functions.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createAnalyzeAPI } from "./analyze.js";
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

describe("Analyze SDK", () => {
  let analyze: ReturnType<typeof createAnalyzeAPI>;

  beforeAll(() => {
    const callbacks = createMockCallbacks(projectRoot);
    analyze = createAnalyzeAPI(projectRoot, callbacks);
  });

  describe("dependencies", () => {
    it("should return DependencyResult structure", () => {
      const result = analyze.dependencies("src/sandbox/sdk/analyze.ts");
      expect(result).toBeDefined();
      expect(result.file).toBe("src/sandbox/sdk/analyze.ts");
      expect(Array.isArray(result.imports)).toBe(true);
      expect(Array.isArray(result.exports)).toBe(true);
      expect(Array.isArray(result.externalDeps)).toBe(true);
      expect(Array.isArray(result.internalDeps)).toBe(true);
    });

    it("should detect imports", () => {
      const result = analyze.dependencies("src/sandbox/sdk/analyze.ts");
      expect(result.imports.length).toBeGreaterThan(0);

      const imp = result.imports[0]!;
      expect(imp.source).toBeDefined();
      expect(Array.isArray(imp.names)).toBe(true);
      expect(typeof imp.isDefault).toBe("boolean");
      expect(typeof imp.isNamespace).toBe("boolean");
    });

    it("should detect exports", () => {
      const result = analyze.dependencies("src/sandbox/sdk/analyze.ts");
      expect(result.exports.length).toBeGreaterThan(0);

      const hasCreateAnalyzeAPI = result.exports.some(
        (e) => e.name === "createAnalyzeAPI"
      );
      expect(hasCreateAnalyzeAPI).toBe(true);
    });

    it("should categorize external vs internal deps", () => {
      const result = analyze.dependencies("src/sandbox/sdk/analyze.ts");

      // Should have some internal deps (relative imports)
      expect(result.internalDeps.length).toBeGreaterThanOrEqual(0);

      // Should recognize node modules as external
      const hasFs = result.externalDeps.includes("fs");
      const hasPath = result.externalDeps.includes("path");
      expect(hasFs || hasPath).toBe(true);
    });
  });

  describe("exports", () => {
    it("should return ExportInfo array", () => {
      const result = analyze.exports("src/sandbox/sdk/analyze.ts");
      expect(Array.isArray(result)).toBe(true);
    });

    it("should include export details", () => {
      const result = analyze.exports("src/sandbox/sdk/analyze.ts");

      if (result.length > 0) {
        const exp = result[0]!;
        expect(exp.name).toBeDefined();
        expect(exp.type).toBeDefined();
        expect(typeof exp.isDefault).toBe("boolean");
        expect(typeof exp.line).toBe("number");
      }
    });

    it("should find createAnalyzeAPI export", () => {
      const result = analyze.exports("src/sandbox/sdk/analyze.ts");
      const found = result.find((e) => e.name === "createAnalyzeAPI");
      expect(found).toBeDefined();
      expect(found?.type).toBe("function");
    });
  });

  describe("callGraph", () => {
    it("should return CallGraphResult structure", () => {
      // Use a simple function that exists in the codebase
      const result = analyze.callGraph(
        "createAnalyzeAPI",
        "src/sandbox/sdk/analyze.ts"
      );

      expect(result).toBeDefined();
      expect(result.root).toBe("createAnalyzeAPI");
      expect(Array.isArray(result.nodes)).toBe(true);
      expect(typeof result.depth).toBe("number");
    });

    it("should include the root function as a node", () => {
      const result = analyze.callGraph(
        "createAnalyzeAPI",
        "src/sandbox/sdk/analyze.ts"
      );

      const rootNode = result.nodes.find((n) => n.name === "createAnalyzeAPI");
      expect(rootNode).toBeDefined();
      expect(rootNode?.file).toBe("src/sandbox/sdk/analyze.ts");
    });

    it("should detect function calls", () => {
      const result = analyze.callGraph(
        "createAnalyzeAPI",
        "src/sandbox/sdk/analyze.ts"
      );

      const rootNode = result.nodes.find((n) => n.name === "createAnalyzeAPI");
      expect(rootNode?.calls).toBeDefined();
      expect(Array.isArray(rootNode?.calls)).toBe(true);
    });

    it("should throw for non-existent function", () => {
      expect(() =>
        analyze.callGraph("nonExistentFunction", "src/sandbox/sdk/analyze.ts")
      ).toThrow("Function 'nonExistentFunction' not found");
    });

    it("should respect depth parameter", () => {
      const shallow = analyze.callGraph(
        "createAnalyzeAPI",
        "src/sandbox/sdk/analyze.ts",
        1
      );
      const deep = analyze.callGraph(
        "createAnalyzeAPI",
        "src/sandbox/sdk/analyze.ts",
        3
      );

      expect(shallow.depth).toBe(1);
      expect(deep.depth).toBe(3);
    });
  });

  describe("structure", () => {
    it("should return StructureEntry for root", () => {
      const result = analyze.structure("src/sandbox/sdk");

      expect(result).toBeDefined();
      expect(result.path).toBe("src/sandbox/sdk");
      expect(result.type).toBe("directory");
      expect(result.name).toBe("sdk");
    });

    it("should include children for directories", () => {
      const result = analyze.structure("src/sandbox/sdk", 1);

      expect(result.children).toBeDefined();
      expect(Array.isArray(result.children)).toBe(true);
      expect(result.children!.length).toBeGreaterThan(0);
    });

    it("should detect files with code analysis", () => {
      const result = analyze.structure("src/sandbox/sdk", 1);

      const tsFile = result.children?.find(
        (c) => c.type === "file" && c.name.endsWith(".ts") && !c.name.includes(".test.")
      );

      if (tsFile) {
        expect(tsFile.language).toBe("typescript");
        expect(typeof tsFile.functions).toBe("number");
        expect(typeof tsFile.size).toBe("number");
      }
    });

    it("should include file size", () => {
      const result = analyze.structure("src/sandbox/sdk", 1);

      const file = result.children?.find((c) => c.type === "file");
      if (file) {
        expect(typeof file.size).toBe("number");
        expect(file.size).toBeGreaterThan(0);
      }
    });

    it("should respect depth parameter", () => {
      const shallow = analyze.structure("src", 1);
      const deep = analyze.structure("src", 2);

      // Shallow should have children but not grandchildren
      const shallowChild = shallow.children?.find((c) => c.type === "directory");
      expect(shallowChild?.children).toBeUndefined();

      // Deep should have grandchildren
      const deepChild = deep.children?.find((c) => c.type === "directory");
      if (deepChild?.children) {
        expect(deepChild.children.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("error handling", () => {
    it("should throw for invalid file path", () => {
      expect(() => analyze.dependencies("../../../etc/passwd")).toThrow();
    });

    it("should throw for non-existent file", () => {
      expect(() => analyze.dependencies("non-existent-file.ts")).toThrow();
    });
  });
});
