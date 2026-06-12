/**
 * Origin store (F3) — opt-in reversibility for compressed output.
 *
 * Distill's compression is lossy by design; the failure-mode research shows the
 * real risk is dropped constraints/anaphora the agent can't recover. This store
 * keeps the pre-compression original keyed by a short content-derived handle so
 * the agent can call `ctx.restore(handle)` inside code_execute to get it back.
 *
 * In-memory, process-scoped, bounded LRU — same lifetime as the stdio server
 * process (one per Claude Code session). No disk state: this deliberately keeps
 * Distill's stateless posture (the original lived in context already; we only
 * hold it for the duration of the session). Opt-in via DISTILL_RETRIEVE so the
 * default path stores nothing and pays nothing.
 *
 * Handles are deterministic (sha1 prefix of the content) so identical originals
 * dedupe to one entry.
 */

import { createHash } from "node:crypto";

/** Environment variable that enables origin storage + handle emission. */
export const RETRIEVE_ENV_VAR = "DISTILL_RETRIEVE";

export function isRetrieveEnabled(): boolean {
  const raw = process.env[RETRIEVE_ENV_VAR];
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes";
}

/** Max number of originals held at once (LRU eviction beyond this). */
const MAX_ENTRIES = 64;
/** Max total bytes held at once (LRU eviction beyond this). */
const MAX_TOTAL_BYTES = 32 * 1024 * 1024; // 32 MB

function byteLen(s: string): number {
  return Buffer.byteLength(s, "utf-8");
}

/**
 * Bounded, insertion-ordered LRU keyed by a content-derived handle. A Map keeps
 * insertion order; re-inserting on access moves an entry to the most-recent end.
 */
export class OriginStore {
  private readonly map = new Map<string, string>();
  private totalBytes = 0;

  /** Store an original and return its handle. Identical content dedupes. */
  put(original: string): string {
    const handle = "d" + createHash("sha1").update(original).digest("hex").slice(0, 10);
    if (this.map.has(handle)) {
      // Refresh LRU recency without double-counting bytes.
      this.map.delete(handle);
      this.map.set(handle, original);
      return handle;
    }
    this.map.set(handle, original);
    this.totalBytes += byteLen(original);
    this.evict();
    return handle;
  }

  /** Retrieve an original by handle, or undefined if unknown/evicted. */
  get(handle: string): string | undefined {
    const value = this.map.get(handle);
    if (value !== undefined) {
      this.map.delete(handle);
      this.map.set(handle, value); // mark most-recently-used
    }
    return value;
  }

  private evict(): void {
    while (this.map.size > MAX_ENTRIES || this.totalBytes > MAX_TOTAL_BYTES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const value = this.map.get(oldest);
      if (value !== undefined) this.totalBytes -= byteLen(value);
      this.map.delete(oldest);
    }
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
    this.totalBytes = 0;
  }
}

let singleton: OriginStore | null = null;

/** The process-wide origin store (lazy singleton). */
export function getOriginStore(): OriginStore {
  if (!singleton) singleton = new OriginStore();
  return singleton;
}

/**
 * Compact, model-facing hint telling the agent how to recover the original.
 * Self-describing so no tool-description bytes are strictly required.
 */
export function formatRestoreHint(handle: string): string {
  return `[distill: original recoverable via code_execute ctx.restore("${handle}")]`;
}
