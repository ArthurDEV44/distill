import { describe, expect, it } from "vitest";
import { buildConfigSkeleton } from "./config.js";

describe("buildConfigSkeleton — JSON", () => {
  it("outlines top-level keys with collapsed nested objects at depth 1", () => {
    const json = JSON.stringify({
      name: "distill-mcp",
      version: "0.11.1",
      scripts: { build: "tsc", test: "vitest", lint: "eslint" },
      dependencies: { zod: "^3", typescript: "^5" },
    });
    const out = buildConfigSkeleton(json, "json", 1)!;
    expect(out).toContain('name: "distill-mcp"');
    expect(out).toContain('version: "0.11.1"');
    expect(out).toContain("scripts: {3 keys}");
    expect(out).toContain("dependencies: {2 keys}");
    // depth 1 must NOT expand nested object keys
    expect(out).not.toContain("build:");
  });

  it("expands one more level at depth 2", () => {
    const json = JSON.stringify({ scripts: { build: "tsc", test: "vitest" } });
    const out = buildConfigSkeleton(json, "json", 2)!;
    expect(out).toContain("scripts: {");
    expect(out).toContain('build: "tsc"');
    expect(out).toContain('test: "vitest"');
  });

  it("summarizes arrays by length and shows first element shape", () => {
    const json = JSON.stringify({ items: [{ a: 1 }, { a: 2 }, { a: 3 }] });
    const out = buildConfigSkeleton(json, "json", 3)!;
    expect(out).toContain("items: [3 items]");
    expect(out).toContain("... (2 more)");
  });

  it("truncates long string leaves", () => {
    const long = "x".repeat(200);
    const out = buildConfigSkeleton(JSON.stringify({ blob: long }), "json", 1)!;
    expect(out).toContain("...");
    expect(out.length).toBeLessThan(long.length);
  });

  it("returns null on invalid JSON (caller falls back to full file)", () => {
    expect(buildConfigSkeleton("{ not valid json,,, }", "json", 1)).toBeNull();
  });

  it("handles a root array", () => {
    const out = buildConfigSkeleton(JSON.stringify([1, 2, 3, 4]), "json", 1)!;
    expect(out).toContain("[4 items]");
  });
});

describe("buildConfigSkeleton — YAML", () => {
  const yaml = [
    "name: distill",
    "on:",
    "  push:",
    "    branches:",
    "      - main",
    "      - dev",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
  ].join("\n");

  it("keeps top-level keys and collapses deeper nesting at depth 1", () => {
    const out = buildConfigSkeleton(yaml, "yaml", 1)!;
    expect(out).toContain("name: distill");
    expect(out).toContain("on:");
    expect(out).toContain("jobs:");
    expect(out).toMatch(/\.\.\. \(\d+ deeper lines\)/);
    expect(out).not.toContain("runs-on");
  });

  it("expands more levels at higher depth", () => {
    const out = buildConfigSkeleton(yaml, "yaml", 3)!;
    expect(out).toContain("push:");
    expect(out).toContain("build:");
  });

  it("drops comments and blank lines", () => {
    const withComments = ["# header comment", "", "key: value", "  # nested comment"].join("\n");
    const out = buildConfigSkeleton(withComments, "yaml", 2)!;
    expect(out).not.toContain("# header comment");
    expect(out).toContain("key: value");
  });
});
