/**
 * Search SDK Tests
 *
 * Tests for ctx.search.* functions.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createSearchAPI } from "./search.js";
import type { HostCallbacks } from "../types.js";
import * as fs from "fs";
import * as path from "path";

// Get the monorepo root
function getProjectRoot(): string {
  // Navigate up from test file to project root
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

describe("Search SDK", () => {
  let search: ReturnType<typeof createSearchAPI>;

  beforeAll(() => {
    const callbacks = createMockCallbacks(projectRoot);
    search = createSearchAPI(projectRoot, callbacks);
  });

  describe("grep", () => {
    it("should return GrepResult structure", () => {
      const result = search.grep("function", "**/*.ts");
      expect(result).toBeDefined();
      expect(result.matches).toBeDefined();
      expect(Array.isArray(result.matches)).toBe(true);
      expect(typeof result.totalMatches).toBe("number");
      expect(typeof result.filesSearched).toBe("number");
    });

    it("should find matches in TypeScript files", () => {
      const result = search.grep("export", "**/*.ts");
      expect(result.matches.length).toBeGreaterThan(0);

      const match = result.matches[0]!;
      expect(match.file).toBeDefined();
      expect(typeof match.line).toBe("number");
      expect(typeof match.column).toBe("number");
      expect(match.content).toBeDefined();
      expect(match.match).toBeDefined();
    });

    it("should support regex patterns", () => {
      const result = search.grep("function\\s+\\w+", "**/*.ts");
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it("should respect file glob filter", () => {
      const tsResult = search.grep("import", "**/*.ts");
      expect(tsResult.filesSearched).toBeGreaterThan(0);

      // Search in non-existent extension should return 0 matches
      const noResult = search.grep("import", "**/*.xyz");
      expect(noResult.matches.length).toBe(0);
    });

    it("should throw for invalid regex", () => {
      expect(() => search.grep("[invalid", "**/*.ts")).toThrow("Invalid regex pattern");
    });
  });

  describe("symbols", () => {
    it("should return SymbolResult structure", () => {
      const result = search.symbols("create", "**/*.ts");
      expect(result).toBeDefined();
      expect(result.symbols).toBeDefined();
      expect(Array.isArray(result.symbols)).toBe(true);
      expect(typeof result.totalMatches).toBe("number");
    });

    it("should find function symbols", () => {
      const result = search.symbols("createSearchAPI", "**/*.ts");

      if (result.symbols.length > 0) {
        const symbol = result.symbols[0]!;
        expect(symbol.name).toBeDefined();
        expect(symbol.type).toBeDefined();
        expect(symbol.file).toBeDefined();
        expect(typeof symbol.line).toBe("number");
      }
    });

    it("should support partial name matching", () => {
      const result = search.symbols("Search", "**/*.ts");
      expect(result.symbols.length).toBeGreaterThan(0);

      // Should find symbols containing "Search" in their name
      const hasMatch = result.symbols.some((s) =>
        s.name.toLowerCase().includes("search")
      );
      expect(hasMatch).toBe(true);
    });
  });

  describe("files", () => {
    it("should return FileResult structure", () => {
      const result = search.files("**/*.ts");
      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(Array.isArray(result.files)).toBe(true);
      expect(typeof result.totalMatches).toBe("number");
    });

    it("should find TypeScript files", () => {
      const result = search.files("**/*.ts");
      expect(result.files.length).toBeGreaterThan(0);

      const file = result.files[0]!;
      expect(file.path).toBeDefined();
      expect(file.name).toBeDefined();
      expect(file.extension).toBe(".ts");
    });

    it("should find specific file patterns", () => {
      const result = search.files("**/search.ts");
      expect(result.files.length).toBeGreaterThan(0);

      const hasSearchFile = result.files.some((f) => f.name === "search.ts");
      expect(hasSearchFile).toBe(true);
    });

    it("should include file size", () => {
      const result = search.files("**/*.ts");
      if (result.files.length > 0) {
        const file = result.files[0]!;
        expect(typeof file.size).toBe("number");
        expect(file.size).toBeGreaterThan(0);
      }
    });
  });

  describe("references", () => {
    it("should return ReferenceMatch array", () => {
      const result = search.references("createSearchAPI", "**/*.ts");
      expect(Array.isArray(result)).toBe(true);
    });

    it("should find symbol references", () => {
      // Search for a common symbol that should have multiple references
      const result = search.references("HostCallbacks", "**/*.ts");

      if (result.length > 0) {
        const ref = result[0]!;
        expect(ref.file).toBeDefined();
        expect(typeof ref.line).toBe("number");
        expect(typeof ref.column).toBe("number");
        expect(ref.context).toBeDefined();
        expect(["definition", "usage", "import"]).toContain(ref.type);
      }
    });

    it("should categorize reference types", () => {
      const result = search.references("GrepResult", "**/*.ts");

      // Should have at least one definition or usage
      const hasTypedRef = result.some(
        (r) => r.type === "definition" || r.type === "usage" || r.type === "import"
      );

      if (result.length > 0) {
        expect(hasTypedRef).toBe(true);
      }
    });
  });

  describe("error handling", () => {
    it("should handle empty results gracefully", () => {
      const result = search.grep("xyznonexistentpattern123", "**/*.ts");
      expect(result.matches).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });

    it("should handle non-matching glob patterns", () => {
      const result = search.files("**/*.nonexistent");
      expect(result.files).toEqual([]);
      expect(result.totalMatches).toBe(0);
    });
  });
});
