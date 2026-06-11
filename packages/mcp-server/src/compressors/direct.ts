/**
 * Direct-invocation compressors (US-005).
 *
 * `semanticCompressor` and `diffCompressor` are NOT part of the
 * `compressContent()` dispatch array in `./index.ts` — `getCompressor()` will
 * never select them, and `compressContent()` can never route to them. They are
 * invoked DIRECTLY by:
 *   - `tools/auto-optimize.ts` for its explicit `semantic` / `diff` strategies
 *     (`compressDiff`, `semanticCompressor`), and
 *   - `sandbox/sdk/compress.ts` (`ctx.compress.semantic` / `ctx.compress.diff`).
 *
 * This module is the single, honest surface for that direct-only access, so the
 * generic `./index.ts` barrel no longer re-exports `semanticCompressor` and
 * thereby implies it is routable through the dispatch table.
 */

export { semanticCompressor } from "./semantic.js";
export { diffCompressor, compressDiff } from "./diff.js";
