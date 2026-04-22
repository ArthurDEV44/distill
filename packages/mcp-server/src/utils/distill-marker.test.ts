import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COLLISION_CLOSE,
  COLLISION_OPEN_PREFIX,
  MARKER_CLOSE,
  MARKER_OPEN_PREFIX,
  MARKERS_ENV_VAR,
  areMarkersEnabled,
  maybeWrapInMarker,
  wrapInMarker,
} from "./distill-marker.js";

/**
 * Coverage for US-008: marker contract. These tests exercise the utility in
 * isolation. Per-tool integration coverage lives in the tool test files
 * (auto-optimize.test.ts, smart-file-read.test.ts, code-execute.test.ts).
 */

describe("distill-marker — env var gate", () => {
  const originalValue = process.env[MARKERS_ENV_VAR];

  beforeEach(() => {
    delete process.env[MARKERS_ENV_VAR];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[MARKERS_ENV_VAR];
    } else {
      process.env[MARKERS_ENV_VAR] = originalValue;
    }
  });

  it("returns false when env var is unset", () => {
    expect(areMarkersEnabled()).toBe(false);
  });

  it.each([
    ["1", true],
    ["true", true],
    ["True", true],
    ["TRUE", true],
    ["yes", true],
    ["YES", true],
    ["0", false],
    ["false", false],
    ["no", false],
    ["", false],
    ["anything-else", false],
  ] as const)("parses %j as enabled=%s", (value, expected) => {
    process.env[MARKERS_ENV_VAR] = value;
    expect(areMarkersEnabled()).toBe(expected);
  });
});

describe("distill-marker — wrapInMarker", () => {
  it("produces the canonical envelope", () => {
    const out = wrapInMarker("compressed body", { ratio: 0.42, method: "semantic" });
    expect(out).toBe(
      `${MARKER_OPEN_PREFIX} ratio=0.42 method=semantic]\ncompressed body\n${MARKER_CLOSE}`
    );
  });

  it("formats ratio with exactly 2 decimals", () => {
    expect(wrapInMarker("x", { ratio: 0.4, method: "m" })).toContain("ratio=0.40");
    expect(wrapInMarker("x", { ratio: 0.4255, method: "m" })).toContain("ratio=0.43");
    expect(wrapInMarker("x", { ratio: 1, method: "m" })).toContain("ratio=1.00");
    expect(wrapInMarker("x", { ratio: 0, method: "m" })).toContain("ratio=0.00");
  });

  it("clamps ratios outside [0, 1]", () => {
    expect(wrapInMarker("x", { ratio: -0.5, method: "m" })).toContain("ratio=0.00");
    expect(wrapInMarker("x", { ratio: 2.5, method: "m" })).toContain("ratio=1.00");
    expect(wrapInMarker("x", { ratio: Number.NaN, method: "m" })).toContain("ratio=1.00");
    expect(wrapInMarker("x", { ratio: Number.POSITIVE_INFINITY, method: "m" })).toContain(
      "ratio=1.00"
    );
  });

  it("sanitizes method names to ASCII-safe identifiers", () => {
    expect(wrapInMarker("x", { ratio: 0.5, method: "semantic+recompressed" })).toContain(
      "method=semantic+recompressed"
    );
    expect(wrapInMarker("x", { ratio: 0.5, method: "weird name!\n" })).toContain("method=weird_name__");
    expect(wrapInMarker("x", { ratio: 0.5, method: "" })).toContain("method=unknown");
  });

  it("uses the collision fallback when the payload already contains the open marker", () => {
    const payload = "prefix [DISTILL:COMPRESSED something] inner suffix";
    const out = wrapInMarker(payload, { ratio: 0.5, method: "m" });
    expect(out.startsWith(COLLISION_OPEN_PREFIX + " ")).toBe(true);
    expect(out.endsWith(COLLISION_CLOSE)).toBe(true);
    expect(out.includes(payload)).toBe(true);
  });

  it("uses the collision fallback when the payload already contains the close marker", () => {
    const payload = "already closed [/DISTILL:COMPRESSED] tail";
    const out = wrapInMarker(payload, { ratio: 0.5, method: "m" });
    expect(out.startsWith(COLLISION_OPEN_PREFIX + " ")).toBe(true);
    expect(out.endsWith(COLLISION_CLOSE)).toBe(true);
  });
});

describe("distill-marker — maybeWrapInMarker", () => {
  const originalValue = process.env[MARKERS_ENV_VAR];

  beforeEach(() => {
    delete process.env[MARKERS_ENV_VAR];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[MARKERS_ENV_VAR];
    } else {
      process.env[MARKERS_ENV_VAR] = originalValue;
    }
  });

  it("no-ops when markers are disabled, even if shouldWrap is true", () => {
    const out = maybeWrapInMarker("payload", { ratio: 0.3, method: "m", shouldWrap: true });
    expect(out).toBe("payload");
  });

  it("no-ops when shouldWrap is false, even if markers are enabled", () => {
    process.env[MARKERS_ENV_VAR] = "1";
    const out = maybeWrapInMarker("payload", { ratio: 0.3, method: "m", shouldWrap: false });
    expect(out).toBe("payload");
  });

  it("wraps when both gates are on", () => {
    process.env[MARKERS_ENV_VAR] = "1";
    const out = maybeWrapInMarker("payload", { ratio: 0.3, method: "m", shouldWrap: true });
    expect(out).toContain(MARKER_OPEN_PREFIX);
    expect(out).toContain(MARKER_CLOSE);
    expect(out).toContain("payload");
  });

  it("never returns a half-wrapped envelope on empty payload", () => {
    process.env[MARKERS_ENV_VAR] = "1";
    const out = maybeWrapInMarker("", { ratio: 0.3, method: "m", shouldWrap: true });
    expect(out).toBe("");
  });
});
