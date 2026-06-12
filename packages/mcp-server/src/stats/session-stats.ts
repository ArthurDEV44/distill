/**
 * Session savings telemetry (F1).
 *
 * Distill's entire promise is token reduction, yet pre-F1 there was no in-session
 * feedback: `ToolResult.tokensSaved` was hardcoded to 0 in the registry and the
 * `SmartCache.tokensSaved` counter only ever reached stderr in verbose mode. This
 * module is the single process-scoped accumulator the registry feeds on every
 * tool call, plus the opt-in model-facing line.
 *
 * Process-scoped, in-memory, no disk state — same lifetime as the stdio server
 * process (one per Claude Code session). Reset between sessions is implicit
 * (process exit). `reset()` exists for tests.
 *
 * The model-facing line is opt-in via DISTILL_SAVINGS_STATS (mirrors the
 * DISTILL_COMPRESSED_MARKERS gate) so default output is byte-identical to v0.11.x.
 */

/** Environment variable that enables the model-facing savings line. */
export const SAVINGS_STATS_ENV_VAR = "DISTILL_SAVINGS_STATS";

/**
 * Whether the opt-in savings line should be appended to tool output. Truthy
 * values: "1", "true", "yes" (case-insensitive). Anything else — including
 * unset — keeps the line off and output identical to v0.11.x.
 */
export function areSavingsStatsEnabled(): boolean {
  const raw = process.env[SAVINGS_STATS_ENV_VAR];
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes";
}

/** A single tool call's compression savings, in tokens. */
export interface CallSavings {
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
}

/** Cumulative session totals, derived on demand. */
export interface SavingsSnapshot {
  /** Number of calls that produced a positive saving. */
  calls: number;
  originalTokens: number;
  optimizedTokens: number;
  tokensSaved: number;
  /** Cumulative savings as a whole-number percent of original tokens. */
  savingsPercent: number;
}

/**
 * In-memory accumulator. Only calls with a positive saving are recorded, so the
 * session percentage reflects compression work, not pass-throughs.
 */
export class SessionStats {
  private calls = 0;
  private originalTokens = 0;
  private optimizedTokens = 0;

  /** Record one tool call. No-op unless original > 0 and a positive saving exists. */
  record(originalTokens: number, optimizedTokens: number): void {
    if (!Number.isFinite(originalTokens) || !Number.isFinite(optimizedTokens)) return;
    if (originalTokens <= 0) return;
    const saved = originalTokens - optimizedTokens;
    if (saved <= 0) return;
    this.calls += 1;
    this.originalTokens += originalTokens;
    this.optimizedTokens += optimizedTokens;
  }

  snapshot(): SavingsSnapshot {
    const tokensSaved = Math.max(0, this.originalTokens - this.optimizedTokens);
    const savingsPercent =
      this.originalTokens > 0 ? Math.round((tokensSaved / this.originalTokens) * 100) : 0;
    return {
      calls: this.calls,
      originalTokens: this.originalTokens,
      optimizedTokens: this.optimizedTokens,
      tokensSaved,
      savingsPercent,
    };
  }

  reset(): void {
    this.calls = 0;
    this.originalTokens = 0;
    this.optimizedTokens = 0;
  }
}

let singleton: SessionStats | null = null;

/** The process-wide session stats accumulator (lazy singleton). */
export function getSessionStats(): SessionStats {
  if (!singleton) singleton = new SessionStats();
  return singleton;
}

/** Locale-independent thousands grouping (deterministic for tests). */
function formatInt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The opt-in, model-facing savings line. Compact and single-line so it stays
 * well under the output budget. Example:
 *
 *   [distill: saved 1,234 tokens (62%) this call; session total 8,901 tokens over 5 calls]
 */
export function formatSavingsLine(call: CallSavings, snapshot: SavingsSnapshot): string {
  const pct =
    call.originalTokens > 0 ? Math.round((call.tokensSaved / call.originalTokens) * 100) : 0;
  return (
    `[distill: saved ${formatInt(call.tokensSaved)} tokens (${pct}%) this call; ` +
    `session total ${formatInt(snapshot.tokensSaved)} tokens over ${snapshot.calls} calls]`
  );
}
