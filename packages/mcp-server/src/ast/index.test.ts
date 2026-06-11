import { describe, it, expect } from "vitest";
import {
  parseFileAsync,
  extractElementAsync,
  searchElementsAsync,
  isTreeSitterLanguage,
} from "./index.js";
import type { SupportedLanguage } from "./types.js";

/**
 * US-004: the async router awaits Tree-sitter WASM init, so a parse on a cold
 * session returns the real structure instead of the sync path's empty
 * placeholder. These tests prove the async surface regardless of warm/cold —
 * they await init explicitly.
 */
describe("AST async router (US-004)", () => {
  it("isTreeSitterLanguage flags WASM-backed languages, not TS/JS/data", () => {
    for (const l of ["python", "go", "rust", "php", "swift"] as const) {
      expect(isTreeSitterLanguage(l)).toBe(true);
    }
    for (const l of ["typescript", "javascript", "json", "yaml", "unknown"] as SupportedLanguage[]) {
      expect(isTreeSitterLanguage(l)).toBe(false);
    }
  });

  it("parseFileAsync returns a real Python structure (awaits WASM init)", async () => {
    const src =
      "def greet(name):\n    return f'Hello {name}'\n\nclass Greeter:\n    def hi(self):\n        return 1\n";
    const s = await parseFileAsync(src, "python");
    expect(s.functions.length + s.classes.length).toBeGreaterThan(0);
    expect(
      s.functions.some((f) => f.name === "greet") || s.classes.some((c) => c.name === "Greeter")
    ).toBe(true);
  }, 30000);

  it("parseFileAsync returns a real Rust structure (awaits WASM init)", async () => {
    const src = "pub fn add(a: i32, b: i32) -> i32 { a + b }\n\nstruct Point { x: i32, y: i32 }\n";
    const s = await parseFileAsync(src, "rust");
    expect(s.functions.length + s.classes.length).toBeGreaterThan(0);
  }, 30000);

  it("parseFileAsync falls through to the sync TS Compiler path for TypeScript", async () => {
    const src = "export function foo(): number { return 1; }\nexport const bar = 2;\n";
    const s = await parseFileAsync(src, "typescript");
    expect(s.functions.some((f) => f.name === "foo")).toBe(true);
  });

  it("parseFileAsync honors quick mode (regex scan, no WASM)", async () => {
    const src = "def quick_fn():\n    pass\n";
    const s = await parseFileAsync(src, "python", "quick");
    // quick scan finds the function name without Tree-sitter
    expect(s.functions.some((f) => f.name === "quick_fn")).toBe(true);
  });

  it("extractElementAsync extracts a Python function (awaits init)", async () => {
    const src = "def target():\n    return 42\n";
    const extracted = await extractElementAsync(
      src,
      "python",
      { type: "function", name: "target" },
      { includeImports: false, includeComments: false }
    );
    expect(extracted).not.toBeNull();
    expect(extracted?.content).toContain("target");
  }, 30000);

  it("searchElementsAsync finds Rust elements by query (awaits init)", async () => {
    const src = "pub fn handler() {}\npub fn helper() {}\n";
    const results = await searchElementsAsync(src, "rust", "handl");
    expect(results.length).toBeGreaterThan(0);
  }, 30000);
});
