import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SAVINGS_STATS_ENV_VAR,
  SessionStats,
  areSavingsStatsEnabled,
  formatSavingsLine,
  getSessionStats,
} from "./session-stats.js";

describe("SessionStats", () => {
  it("records only calls with a positive saving", () => {
    const s = new SessionStats();
    s.record(100, 40); // saved 60
    s.record(50, 50); // no saving — ignored
    s.record(30, 40); // negative — ignored
    const snap = s.snapshot();
    expect(snap.calls).toBe(1);
    expect(snap.originalTokens).toBe(100);
    expect(snap.optimizedTokens).toBe(40);
    expect(snap.tokensSaved).toBe(60);
    expect(snap.savingsPercent).toBe(60);
  });

  it("accumulates across calls", () => {
    const s = new SessionStats();
    s.record(100, 40);
    s.record(200, 100);
    const snap = s.snapshot();
    expect(snap.calls).toBe(2);
    expect(snap.tokensSaved).toBe(160);
    expect(snap.savingsPercent).toBe(53); // 160 / 300 rounded
  });

  it("ignores non-finite and non-positive originals", () => {
    const s = new SessionStats();
    s.record(Number.NaN, 10);
    s.record(Number.POSITIVE_INFINITY, 10);
    s.record(0, 0);
    s.record(-5, -10);
    expect(s.snapshot().calls).toBe(0);
  });

  it("reset clears all totals", () => {
    const s = new SessionStats();
    s.record(100, 40);
    s.reset();
    const snap = s.snapshot();
    expect(snap.calls).toBe(0);
    expect(snap.tokensSaved).toBe(0);
    expect(snap.savingsPercent).toBe(0);
  });

  it("getSessionStats returns a stable singleton", () => {
    const a = getSessionStats();
    const b = getSessionStats();
    expect(a).toBe(b);
  });
});

describe("formatSavingsLine", () => {
  it("renders a compact single line with thousands grouping", () => {
    const line = formatSavingsLine(
      { originalTokens: 2000, optimizedTokens: 766, tokensSaved: 1234 },
      { calls: 5, originalTokens: 14000, optimizedTokens: 5099, tokensSaved: 8901, savingsPercent: 64 }
    );
    expect(line).toBe(
      "[distill: saved 1,234 tokens (62%) this call; session total 8,901 tokens over 5 calls]"
    );
    expect(line).not.toContain("\n");
  });
});

describe("areSavingsStatsEnabled", () => {
  const original = process.env[SAVINGS_STATS_ENV_VAR];
  beforeEach(() => {
    delete process.env[SAVINGS_STATS_ENV_VAR];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[SAVINGS_STATS_ENV_VAR];
    else process.env[SAVINGS_STATS_ENV_VAR] = original;
  });

  it("is off when unset", () => {
    expect(areSavingsStatsEnabled()).toBe(false);
  });

  it.each(["1", "true", "TRUE", "yes", "Yes"])("is on for %s", (v) => {
    process.env[SAVINGS_STATS_ENV_VAR] = v;
    expect(areSavingsStatsEnabled()).toBe(true);
  });

  it.each(["0", "false", "no", "off", ""])("is off for %s", (v) => {
    process.env[SAVINGS_STATS_ENV_VAR] = v;
    expect(areSavingsStatsEnabled()).toBe(false);
  });
});
