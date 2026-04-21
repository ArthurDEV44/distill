/**
 * Signature Grouper regression snapshot (v0.9.2 US-009)
 *
 * Locks the `groupBySignature` + `formatGroups` + `calculateStats` output
 * shape against a deterministic 1,000-line multi-tool error-log fixture.
 * Any future drift — regex tweak, ordering change, signature composition
 * difference — fails this snapshot. The US-009 inline of `error-normalizer.ts`
 * into this module was validated locally by running this test against the
 * pre-refactor code (snapshot captured) and then the post-refactor code
 * (snapshot matched unchanged) before shipping. From this point forward the
 * snapshot is the persistent guardrail for `auto_optimize`'s log-dedup path.
 */

import { describe, it, expect } from "vitest";
import {
  groupBySignature,
  formatGroups,
  calculateStats,
} from "./signature-grouper.js";

/**
 * Deterministic 1,000-line error-log fixture.
 *
 * Covers every ERROR_PATTERNS entry (TypeScript, ESLint, GCC/Clang, Python
 * trace + error, Go, Rust + location, generic-bracket, generic-colon) plus
 * non-error noise. Strong cross-line dedup happens on the code-carrying
 * patterns (TS2304/TS2322/E0425/@typescript-eslint/no-unused-vars) — their
 * file paths, line numbers, and column numbers are stripped by
 * `normalizeErrorLine`, collapsing N variants to one signature. The
 * generic-bracket/colon variants intentionally vary on a sub-5-digit numeric
 * suffix (`db-0..db-4`, `1000..1499ms`) that `normalizeErrorLine` preserves,
 * so they exercise the "many unique signatures" branch rather than dedup.
 * Pure function of N — no randomness.
 */
function buildFixture(n: number): string[] {
  const lines: string[] = [];
  let i = 0;
  while (lines.length < n) {
    // TypeScript compile errors — many at different locations, same signature.
    lines.push(
      `src/foo/bar${i % 37}.ts(${10 + (i % 80)},${5 + (i % 40)}): error TS2304: Cannot find name 'missing'.`
    );
    lines.push(
      `src/baz/qux${i % 41}.ts(${20 + (i % 60)},${8 + (i % 50)}): error TS2322: Type 'string' is not assignable to type 'number'.`
    );
    // ESLint — same rule, different files.
    lines.push(
      `/project/src/app${i % 29}.tsx:${15 + (i % 70)}:${7 + (i % 30)} error @typescript-eslint/no-unused-vars: 'x' is defined but never used.`
    );
    // GCC / Clang.
    lines.push(
      `/home/user/main${i % 19}.c:${30 + (i % 100)}:${9 + (i % 50)}: error: expected ';' before 'return'`
    );
    // Python file header + error.
    lines.push(`File "/app/src/handler${i % 23}.py", line ${40 + (i % 60)}, in process`);
    lines.push(`ValueError: could not convert string 'abc' to int`);
    // Go.
    lines.push(
      `/go/src/main${i % 31}.go:${12 + (i % 80)}:${4 + (i % 30)}: undeclared name: foo`
    );
    // Rust error + location pair.
    lines.push(`error[E0425]: cannot find value \`missing_var\` in this scope`);
    lines.push(`  --> /rust/src/lib${i % 17}.rs:${22 + (i % 90)}:${11 + (i % 25)}`);
    // Generic logs.
    lines.push(`[ERROR] Connection refused to postgres://db-${i % 5}:5432`);
    lines.push(`WARNING: slow query detected (${1000 + (i % 500)}ms)`);
    // Noise: plain stdout, not an error.
    lines.push(`INFO: build completed in ${i * 100}ms`);
    lines.push(`processing batch #${i}`);
    i++;
  }
  return lines.slice(0, n);
}

describe("signature-grouper — byte-parity snapshot (US-009)", () => {
  it("groups and formats the 1000-line fixture identically across refactors", () => {
    const fixture = buildFixture(1000);
    const result = groupBySignature(fixture);

    // Serialize groups deterministically (Map iteration order is insertion
    // order, which is itself a function of input line order, so this is
    // stable across runs on the same input).
    const serializedGroups = Array.from(result.groups.entries()).map(
      ([sig, group]) => ({
        signature: sig,
        count: group.count,
        firstOccurrence: group.firstOccurrence,
        locationCount: group.locations.length,
        sampleCount: group.samples.length,
        code: group.code,
        message: group.message,
      })
    );

    const snapshot = {
      totalErrorLines: result.totalErrorLines,
      nonErrorLineCount: result.nonErrorLines.length,
      groupCount: result.groups.size,
      stats: calculateStats(result),
      groups: serializedGroups,
      formattedPlain: formatGroups(result, "plain"),
      formattedMarkdown: formatGroups(result, "markdown"),
    };

    expect(snapshot).toMatchSnapshot();
  });
});
