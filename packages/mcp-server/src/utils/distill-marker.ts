/**
 * Distill compression marker — opt-in output envelope for compressed payloads.
 *
 * The marker is a plain-text envelope around compressed output:
 *
 *   [DISTILL:COMPRESSED ratio=0.42 method=semantic]
 *   <compressed payload>
 *   [/DISTILL:COMPRESSED]
 *
 * Purpose: give Claude Code's PreCompact hook (shipped in US-009) a stable
 * token to instruct the compact-summary LLM to preserve the region verbatim.
 * Without this envelope the summarizer may re-summarize Distill's already-
 * compressed output at its own fidelity, erasing compression gains.
 *
 * Opt-in via env var per hard constraint C2 (v0.9.x backwards compatibility).
 * Default behavior is NO wrapping — existing consumers see unchanged output.
 */

export const MARKER_OPEN_PREFIX = "[DISTILL:COMPRESSED";
export const MARKER_CLOSE = "[/DISTILL:COMPRESSED]";

/**
 * Fallback envelope used when the payload already contains the literal marker
 * tokens (edge case #11 in the v0.10 PRD). Prevents ambiguous parsing if the
 * user-supplied input happens to mention our marker string.
 */
export const COLLISION_OPEN_PREFIX = "[DISTILL-USER-TEXT:COMPRESSED";
export const COLLISION_CLOSE = "[/DISTILL-USER-TEXT:COMPRESSED]";

/**
 * Environment variable that enables marker emission. Truthy values: "1",
 * "true", "yes" (case-insensitive). Anything else — including unset — means
 * markers stay off and tool output is identical to v0.9.x.
 */
export const MARKERS_ENV_VAR = "DISTILL_COMPRESSED_MARKERS";

export function areMarkersEnabled(): boolean {
  const raw = process.env[MARKERS_ENV_VAR];
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes";
}

export interface MarkerOptions {
  /**
   * Compression ratio, `compressed_size / original_size`, in [0, 1]. Values
   * outside that range are clamped. Emitted with 2-decimal precision.
   */
  ratio: number;
  /**
   * Short token identifying the compressor that produced the payload, e.g.
   * `"semantic"`, `"build"`, `"diff"`, `"skeleton"`, `"extract"`, `"search"`,
   * `"tfidf"`, `"summarizer"`.
   */
  method: string;
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 1;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

function sanitizeMethod(method: string): string {
  return (method || "unknown").replace(/[^A-Za-z0-9+_.-]/g, "_") || "unknown";
}

function payloadCollidesWithMarker(payload: string): boolean {
  return payload.includes(MARKER_OPEN_PREFIX) || payload.includes(MARKER_CLOSE);
}

/**
 * Unconditionally wrap a payload in the Distill compression envelope. Callers
 * normally want `maybeWrapInMarker`, which respects the env-var gate and the
 * per-tool savings threshold.
 */
export function wrapInMarker(payload: string, opts: MarkerOptions): string {
  const ratio = clampRatio(opts.ratio).toFixed(2);
  const method = sanitizeMethod(opts.method);
  const [openPrefix, close] = payloadCollidesWithMarker(payload)
    ? [COLLISION_OPEN_PREFIX, COLLISION_CLOSE]
    : [MARKER_OPEN_PREFIX, MARKER_CLOSE];
  return `${openPrefix} ratio=${ratio} method=${method}]\n${payload}\n${close}`;
}

/**
 * Wrap a payload only if (a) markers are enabled via env var, AND (b) the
 * caller's own threshold (`shouldWrap`) signals that compression produced a
 * meaningful savings. Returns the payload unchanged otherwise. No half-wrapped
 * markers are ever produced.
 */
export function maybeWrapInMarker(
  payload: string,
  opts: MarkerOptions & { shouldWrap: boolean }
): string {
  if (!opts.shouldWrap) return payload;
  if (!areMarkersEnabled()) return payload;
  if (!payload) return payload;
  return wrapInMarker(payload, opts);
}
