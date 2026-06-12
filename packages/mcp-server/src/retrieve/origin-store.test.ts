import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OriginStore,
  RETRIEVE_ENV_VAR,
  formatRestoreHint,
  getOriginStore,
  isRetrieveEnabled,
} from "./origin-store.js";

describe("OriginStore", () => {
  it("round-trips an original via its handle", () => {
    const store = new OriginStore();
    const handle = store.put("hello world");
    expect(handle).toMatch(/^d[0-9a-f]{10}$/);
    expect(store.get(handle)).toBe("hello world");
  });

  it("dedupes identical content to one handle/entry", () => {
    const store = new OriginStore();
    const a = store.put("same content");
    const b = store.put("same content");
    expect(a).toBe(b);
    expect(store.size()).toBe(1);
  });

  it("returns undefined for unknown handles", () => {
    const store = new OriginStore();
    expect(store.get("dunknownnnn")).toBeUndefined();
  });

  it("evicts the least-recently-used entry beyond the entry cap", () => {
    const store = new OriginStore();
    const handles: string[] = [];
    for (let i = 0; i < 70; i++) handles.push(store.put(`content number ${i}`));
    expect(store.size()).toBeLessThanOrEqual(64);
    // The earliest inserted entries should have been evicted.
    expect(store.get(handles[0]!)).toBeUndefined();
    // The most recent survive.
    expect(store.get(handles[69]!)).toBe("content number 69");
  });

  it("keeps a re-accessed entry alive across eviction pressure", () => {
    const store = new OriginStore();
    const keep = store.put("keep me alive");
    for (let i = 0; i < 40; i++) store.put(`filler ${i}`);
    // Touch it to bump recency.
    expect(store.get(keep)).toBe("keep me alive");
    for (let i = 40; i < 80; i++) store.put(`filler ${i}`);
    expect(store.get(keep)).toBe("keep me alive");
  });

  it("getOriginStore returns a stable singleton", () => {
    expect(getOriginStore()).toBe(getOriginStore());
  });

  it("formatRestoreHint embeds the handle and code_execute path", () => {
    expect(formatRestoreHint("dabc123")).toBe(
      '[distill: original recoverable via code_execute ctx.restore("dabc123")]'
    );
  });
});

describe("isRetrieveEnabled", () => {
  const original = process.env[RETRIEVE_ENV_VAR];
  beforeEach(() => delete process.env[RETRIEVE_ENV_VAR]);
  afterEach(() => {
    if (original === undefined) delete process.env[RETRIEVE_ENV_VAR];
    else process.env[RETRIEVE_ENV_VAR] = original;
  });

  it("is off when unset", () => expect(isRetrieveEnabled()).toBe(false));
  it.each(["1", "true", "YES"])("is on for %s", (v) => {
    process.env[RETRIEVE_ENV_VAR] = v;
    expect(isRetrieveEnabled()).toBe(true);
  });
  it.each(["0", "false", ""])("is off for %s", (v) => {
    process.env[RETRIEVE_ENV_VAR] = v;
    expect(isRetrieveEnabled()).toBe(false);
  });
});
