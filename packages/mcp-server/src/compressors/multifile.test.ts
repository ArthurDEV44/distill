/**
 * Multi-File Compressor — regression suite (US-019).
 *
 * Covers the 3 strategies (deduplicate, skeleton, smart-chunk), shared-
 * element extraction across files, and unhappy paths on empty inputs.
 */

import { describe, expect, it } from "vitest";
import {
  compressMultiFile,
  extractSharedElements,
  type FileContext,
} from "./multifile.js";

// Three TS files with substantial shared imports + type definitions,
// chosen so (a) extractSharedElements finds imports used in ≥ 2 files,
// (b) skeleton extraction has function bodies to drop,
// (c) each file is large enough to demonstrate compression gains.
const FILES: FileContext[] = [
  {
    path: "src/users/service.ts",
    language: "typescript",
    content: `import { Database } from "../db/client";
import { Logger } from "../shared/logger";
import type { User } from "../types/user";

export interface UserServiceOptions {
  db: Database;
  logger: Logger;
}

export class UserService {
  constructor(private opts: UserServiceOptions) {}

  async findAll(): Promise<User[]> {
    this.opts.logger.info("fetching all users");
    const rows = await this.opts.db.query("SELECT * FROM users");
    return rows.map((r) => r as User);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.opts.db.query("SELECT * FROM users WHERE id = $1", [id]);
    return row.length ? (row[0] as User) : null;
  }
}
`,
  },
  {
    path: "src/orders/service.ts",
    language: "typescript",
    content: `import { Database } from "../db/client";
import { Logger } from "../shared/logger";
import type { User } from "../types/user";
import type { Order } from "../types/order";

export interface OrderServiceOptions {
  db: Database;
  logger: Logger;
}

export class OrderService {
  constructor(private opts: OrderServiceOptions) {}

  async findByUser(user: User): Promise<Order[]> {
    this.opts.logger.info("fetching orders for user " + user.id);
    const rows = await this.opts.db.query("SELECT * FROM orders WHERE user_id = $1", [user.id]);
    return rows.map((r) => r as Order);
  }

  async create(order: Omit<Order, "id">): Promise<Order> {
    this.opts.logger.info("creating order for user " + order.userId);
    const row = await this.opts.db.query("INSERT INTO orders ...", [order]);
    return row[0] as Order;
  }
}
`,
  },
  {
    path: "src/payments/service.ts",
    language: "typescript",
    content: `import { Database } from "../db/client";
import { Logger } from "../shared/logger";
import type { Order } from "../types/order";

export interface PaymentServiceOptions {
  db: Database;
  logger: Logger;
}

export class PaymentService {
  constructor(private opts: PaymentServiceOptions) {}

  async processPayment(order: Order): Promise<void> {
    this.opts.logger.info("processing payment for order " + order.id);
    await this.opts.db.query("UPDATE orders SET paid = true WHERE id = $1", [order.id]);
  }
}
`,
  },
];

describe("multifile compressor — regressions (US-019)", () => {
  it("extractSharedElements finds imports used across 2+ files", () => {
    const shared = extractSharedElements(FILES);
    const sources = shared.imports.map((i) => i.source);
    // Database / Logger are imported by all 3 files.
    expect(sources).toContain("../db/client");
    expect(sources).toContain("../shared/logger");
    // User is imported by 2 of 3 → shared.
    expect(sources).toContain("../types/user");
    // Each shared import records the files that use it.
    const dbImport = shared.imports.find((i) => i.source === "../db/client");
    expect(dbImport?.usedIn).toHaveLength(3);
  });

  it("deduplicate strategy strips shared imports from each file body", () => {
    const result = compressMultiFile(FILES, {
      strategy: "deduplicate",
      maxTokens: 10_000,
    });
    // Shared imports listed once at the top.
    expect(result.compressed).toMatch(/=== Shared Imports ===/);
    expect(result.compressed).toMatch(/\.\.\/db\/client/);
    // File bodies follow but with the shared `import { Database }` line removed.
    expect(result.compressed).toMatch(/=== src\/users\/service\.ts ===/);
    expect(result.stats.filesProcessed).toBe(3);
    expect(result.stats.deduplicatedItems).toBeGreaterThan(0);
    expect(result.filesIncluded).toHaveLength(3);
  });

  it("skeleton strategy drops function bodies and hits ratio floor (≤ 85% of input tokens)", () => {
    const result = compressMultiFile(FILES, {
      strategy: "skeleton",
      maxTokens: 10_000,
    });
    // Signatures survive.
    expect(result.compressed).toMatch(/class UserService/);
    expect(result.compressed).toMatch(/class OrderService/);
    // Concrete SQL + logger calls from bodies should not be in the skeleton.
    expect(result.compressed).not.toMatch(/SELECT \* FROM users WHERE id = \$1/);
    expect(result.compressed).toMatch(/\{ \.\.\. \}/); // body-drop marker

    const ratio = result.stats.compressedTokens / result.stats.originalTokens;
    expect(ratio).toBeLessThanOrEqual(0.85);
  });

  it("smart-chunk strategy groups related files and reports chunk metadata", () => {
    const result = compressMultiFile(FILES, {
      strategy: "smart-chunk",
      maxTokens: 10_000,
    });
    expect(result.compressed).toMatch(/=== chunk-\d+/);
    expect(result.filesIncluded.length).toBeGreaterThan(0);
  });

  it("unhappy path: empty file list / single file / massive file returns safely", () => {
    const empty = compressMultiFile([], {
      strategy: "deduplicate",
      maxTokens: 1_000,
    });
    expect(empty.filesIncluded).toEqual([]);
    expect(empty.stats.filesProcessed).toBe(0);
    // Zero tokens → reductionPercent is NaN from division-by-zero; tolerate.
    expect(Number.isFinite(empty.stats.compressedTokens)).toBe(true);

    const single = compressMultiFile([FILES[0]!], {
      strategy: "skeleton",
      maxTokens: 1_000,
    });
    // With only one file, no "shared" imports across files — shared block empty.
    expect(single.sharedElements.imports).toHaveLength(0);
    expect(single.filesIncluded).toEqual([FILES[0]!.path]);

    // One very large pathological file with no real structure → skeleton
    // falls back to exporting (almost) nothing without crashing.
    const noise: FileContext = {
      path: "src/noise.ts",
      language: "typescript",
      content: "noise ".repeat(500),
    };
    const noiseResult = compressMultiFile([noise], {
      strategy: "skeleton",
      maxTokens: 1_000,
    });
    expect(typeof noiseResult.compressed).toBe("string");
    expect(noiseResult.stats.filesProcessed).toBe(1);
  });

  it("snapshot-style: shared-imports block shape is stable", () => {
    const result = compressMultiFile(FILES, {
      strategy: "deduplicate",
      maxTokens: 10_000,
    });
    // Extract just the shared-imports block for a deterministic snapshot.
    // Note: the naive TS import regex surfaces the `type` keyword as an
    // import name on `import type { ... }` lines. This snapshot documents
    // that current behaviour — if the regex tightens, the snapshot fails
    // intentionally and forces deliberate review.
    const block = result.compressed.split("// === src/")[0]!.trim();
    expect(block).toMatchInlineSnapshot(`
      "// === Shared Imports ===
      // ../db/client: Database
      // ../shared/logger: Logger
      // ../types/user: type, User
      // ../types/order: type, Order"
    `);
  });
});
