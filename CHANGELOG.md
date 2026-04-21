# Changelog

All notable changes to **Distill** (`distill-mcp` on npm) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical long-form release notes for versions prior to `v0.9.0` live under [`docs/releases/`](./docs/releases).

---

## [Unreleased] — v0.9.2 draft

Hardening + deviation-cleanup patch release. Zero new tools, zero public
contract changes, zero sandbox engine swap. Closes the eight follow-up items
surfaced by the v0.9.1 `/review-story` pass (2026-04-21) across sandbox
defence-in-depth, static-analyzer obfuscation coverage, type-safety payoff,
Next.js SSR i18n, and two v0.9.1 dead-code deviations (US-007 `error-normalizer.ts`
inline, US-008 summarizer trio acceptance).

### Changed

- **Summarizer `scoring` / `clustering` / `pattern-extraction` formally
  accepted as product code** (was: framed as "advanced 2026 modules never
  wired" in v0.9.1 audit). `genericSummarizer` depends on all three
  transitively via `auto_optimize` + `sandbox/sdk/compress`. Docstrings,
  barrel comments, and CLAUDE.md Architecture section were rewritten to
  reflect that these modules are load-bearing, not optional enhancements.
  No behavioural change, no knip allowlist change (none was present).
  Path B from the v0.9.1 US-008 deviation note. (v0.9.2 US-010.)

---

## [Unreleased] — v0.9.1 draft

Hardening + cleanup release. No new tools, no new capabilities. Closes audit findings
from the 6-agent swarm audit (2026-04-20) across sandbox, dead code, CI, over-engineering,
docs, and compressor test coverage.

### Breaking

- **Removed** the `DISTILL_LEGACY_EXECUTOR` environment variable and its legacy
  `new Function()` code path. QuickJS WASM is now the only sandbox executor — there is
  no user-toggleable bypass. Setting the variable is silently inert. Users who relied
  on the legacy path must move to QuickJS or to external tooling.
  (PRD US-001, OWASP A02:2025.)
- **Removed** the `DISTILL_USE_QUICKJS` alias that was deprecated in `v0.9.0`
  (bundled with US-001 — QuickJS is unconditional).

### Security

- **Sandbox: constructor-chain blocker.** The static code analyzer now rejects
  `.constructor(` / `.constructor\s*(` / `["constructor"]` paren-call patterns,
  closing the canonical `this.constructor.constructor("…")()` escape chain
  (same attack class as SandboxJS
  [GHSA-jjpw-65fv-8g48](https://github.com/nyariv/SandboxJS/security/advisories/GHSA-jjpw-65fv-8g48)).
  (PRD US-002.)
- **Sandbox: git write-command blocklist.** Added `config`, `update-ref`, `reflog`,
  `gc`, `filter-branch`, `filter-repo` to `BLOCKED_GIT_COMMANDS`, preventing
  persistent compromise via `core.sshCommand` and similar. (PRD US-003.)
- **Sandbox: symlink-escape protection.** Directory walkers in
  `sandbox/quickjs/host-bridge.ts` and `sandbox/sdk/search.ts` now call
  `isSymbolicLink()` on every dirent and refuse entries whose `realpath` falls
  outside the working directory. Depth cap + visited-set guard against symlink
  loops. (PRD US-004.)
- **Sandbox: TOCTOU hardening.** Path validation re-resolves paths at file-open
  time (not only at argument-validation time), closing the race window between
  validate and open. Non-existent paths are refused or carry a
  must-re-check-on-open marker. (PRD US-005.)

### Removed

- **Dead code purge (~3 600 LOC).** Deleted files confirmed unreachable by
  import-graph traversal and `knip`:
  - `tools/analyze-context.ts` (never registered)
  - `tools/dynamic-loader.ts` (fake dynamic wrapper)
  - `analytics/session-tracker.ts`
  - `utils/toon-serializer.ts`, `utils/output-estimator.ts`,
    `utils/output-similarity.ts`, `utils/project-detector.ts`,
    `utils/command-normalizer.ts`, `utils/error-normalizer.ts`
  - `summarizers/hierarchical.ts` + empty `src/config/` directory
  - `packages/ui/` entire package (3 stub components, zero consumers)
  - `packages/shared/` entire package — Path B of the US-017 decision: no file
    anywhere in the monorepo actually imported `@distill/shared`, so the web
    app dep, `tsconfig.json` path aliases, `next.config.mjs` `transpilePackages`
    entry, and stale pricing constants are all removed.
  - `packages/typescript-config/react-library.json` + `packages/eslint-config/react-internal.js`
  - Starter SVGs in `apps/web/public/` (turborepo, vercel, file-text, globe, window)
  - `apps/web/src/components/ui/Button/` (duplicate of the shadcn Button)
  - Orphan `turbo.json` env vars (`DATABASE_URL`, `CLERK_*`, `POLAR_*`) and
    `db:*` tasks inherited from the Turborepo starter template.
  (PRD US-006 / US-007 / US-008 / US-009.)
- **`src/middleware/`** priority-ordered dispatch chain (313 LOC) removed. Verbose
  logging is inlined in `ToolRegistry.execute` as two `if (verbose)` blocks.
  (PRD US-013.)
- **`branded-types.ts`** — the 4 runtime guards (`isValidatedPath`, `isSafePattern`,
  `isSanitizedGitArg`, `isSanitizedCode`) that were all identical
  `typeof === "string"` checks are removed. The compile-time brand types are
  preserved. (PRD US-014.)
- **Duplicate `parseLogLine`** in `compressors/logs.ts` removed — compressor now
  imports the canonical `parseLogLine` from `utils/log-parser.ts`. (PRD US-015.)

### Changed

- **CI pipeline** now runs 5 parallel jobs — `lint`, `typecheck`, `test` (mcp-server
  only), `build`, `knip` — on every `push` to `main`/`dev` and on every `pull_request`.
  A failing job blocks merge; no job has `continue-on-error: true`. Vitest runs with
  `--coverage`. Tree-sitter WASM init is retried once on flake. (PRD US-010.)
- **Vitest coverage thresholds** enforced on `packages/mcp-server/src/**/*.ts`
  (excluding tests, `*.d.ts`, and types-only files). Initial floors are
  baseline − 2 pts per the PRD unhappy-path (lines 64%, branches 51%, functions 65%,
  statements 63%). Targets: 75 / 70 / 75 / 75. Floors raise toward targets as new
  tests land. (PRD US-011.)
- **`knip`** added as a monorepo-root dev dependency with a scoped
  `knip.jsonc`. `bun run knip` runs as the 5th CI job and fails on any new
  unused file or export. A short allowlist documents intentional API surface.
  (PRD US-012.)

### Documentation

- `CLAUDE.md` updated: CI claim corrected (5 jobs, not 4), `packages/shared/`
  description reconciled with current code state, Tool Registry section
  documents the inlined middleware, coverage threshold table added.
- `ROADMAP.md` Phase 1 table rewritten around the current 3-tool architecture
  (`auto_optimize`, `smart_file_read`, `code_execute`). Deprecated tool names
  (`summarize_logs`, `diff_compress`, `browse_tools`, `run_tool`) moved to a
  "Legacy (pre-v0.9.0)" note.
- Historical long-form release notes for `v0.6.0-beta` and `v0.8.0` moved from
  repo root to `docs/releases/`. This file (`CHANGELOG.md`) is the canonical
  change log going forward.

### Compressor test coverage

- Regression tests added for every file under `packages/mcp-server/src/compressors/`
  (except the barrel), with per-compressor compression-ratio floors, snapshot
  fixtures under `compressors/__fixtures__/`, and unhappy-path assertions for
  empty / random / whitespace input. Coverage ≥ 75% lines on `compressors/**`.
  (PRD US-019.)

---

## [0.9.0] — 2026-04-05

Security and MCP-ergonomics release. QuickJS sandbox promoted from experimental to
default; 3-tool architecture hardened against Claude Code ingest quirks.

### Added

- **QuickJS WASM as the default executor.** User code runs inside a WASM sandbox
  by default. `DISTILL_LEGACY_EXECUTOR=true` emits a deprecation warning and
  remains available for one release. (US-001.)
- **`ctx.pipe` fluent builder** ported to the QuickJS guest SDK so the step-array
  `ctx.pipeline` and the fluent `ctx.pipe` API are available in both executor modes.
  (US-002.)
- **MCP 2025-06-18 annotation hints** (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `longRunningHint`) set on all 3 tools. (US-010.)
- **Server `instructions` field** enriched with a concise 4-line tool decision
  guide. (US-011, US-015.)
- **Structured `structuredContent`** on every tool response now includes
  compression metadata (`inputTokens`, `outputTokens`, `savingsPercent`,
  compressor used). (US-008.)
- **45 000-character output budget cap** enforced in-tool by `auto_optimize`
  (US-006) and `smart_file_read` (US-007), because Claude Code persists tool
  results > 50K chars to disk and only previews 2KB to the model.
- **Static analyzer blocks infinite-loop patterns.** `while(true)`, `for(;;)`,
  recursive self-reference heuristics rejected before reaching QuickJS. (US-004.)
- **Sandbox git blocklist expanded** to cover write and network operations
  (`push`, `fetch`, `clone`, `remote add`, …). (US-003.)
- **Test suite expanded:** TypeScript parser unit tests (US-016), MCP server
  integration tests (US-017), compression-ratio regression floors on existing
  compressors (US-018).

### Changed

- **`detect_retry_loop`** removed; pattern detection subsumed by
  `auto_optimize` / `semantic`. Retry-loop analytics remains available via
  `ctx.analyze.*`.
- **`tiktoken` encoder** centralized via `countTokens` in `utils/tokens.ts` —
  one cached encoder, consistent behaviour across the compressor stack. (US-012.)
- **Compressors handle dense content** via a line/char fallback path when
  tokenization fails on pathological input. (US-013.)
- **Autocompact threshold documentation** corrected from an approximate `~87%`
  to the exact formula `(effectiveContextWindow - 13K) / contextWindow` (83.5%
  for 200K models, ~96.7% for 1M). (US-009.)

### Removed

- **Dead `PIPELINE_DEFINITIONS`** pipeline (US-014) — was never referenced by
  any tool handler.
- **`_meta`** entries cleaned up to the two Claude Code consumes:
  `anthropic/alwaysLoad` and `anthropic/searchHint`. (US-011.)

### Deprecated

- **`DISTILL_LEGACY_EXECUTOR`** environment variable. The legacy `new Function()`
  path is scheduled for removal in the next release (see `v0.9.1 draft`).

---

## [0.8.1] — 2026-01-05

### Changed

- `distill-mcp setup` CLI improved: CLAUDE.md-aware install path, saner `npx`
  configuration defaults.

---

## [0.8.0] — 2026-01-02

MCP 2025-06-18 compliance, QuickJS sandbox as experimental, and the type-safe
neverthrow SDK. Full French-language release notes preserved in
[`docs/releases/RELEASE_NOTES_v0.8.0.md`](./docs/releases/RELEASE_NOTES_v0.8.0.md).

### Added

- **Detailed AST extraction** for all 6 supported languages (TS/JS, Python, Go,
  Rust, PHP, Swift): visibility modifiers, generics with constraints, parameter
  details, decorators / attributes, enum type. Rust gains lifetimes, `where`
  clauses, `async`/`unsafe`/`const`, `#[derive(...)]`. Swift gains Swift-6+
  support: distributed actors, `async/await`, `Sendable`, typed throws,
  `@MainActor`, `package` access level.
- **neverthrow `Result<T, E>` SDK** across the sandbox. Legacy throwing APIs
  remain available for backward compatibility; QuickJS uses the legacy variants
  because `Result` cannot cross the WASM boundary.
- **Branded types** (`ValidatedPath`, `SafePattern`, `SanitizedGitArg`,
  `SanitizedCode`) for compile-time input discipline.
- **Disposable resources** using TypeScript 5.2 `using` — timers and sandboxes
  release automatically on scope exit or error.
- **QuickJS experimental executor** via `DISTILL_USE_QUICKJS=true`.
- **Intelligent log summarization:** BM25/TF-IDF multi-factor scoring, semantic
  clustering, pattern extraction with variable templating, and hierarchical
  summaries for very large log files.
- **MCP 2025-06-18 compliance:** output schemas, per-tool annotations, richer
  parameter descriptions.
- **Fluent pipeline builder** (`glob().read().parse().filter().map().compress()`).

### Changed

- Parsing `detailed` option deprecated — detailed extraction is always on.

---

## [0.7.0-beta] — 2025-12-29

Interactive setup wizard + docs polish.

### Added

- Interactive `distill-mcp setup` wizard with Antigravity support.
- Docs site: logo, solar theme, Clerk-style TOC.

---

## [0.6.0-beta] — 2025-12-28

All 6 development phases complete. Full long-form release notes preserved in
[`docs/releases/RELEASE_NOTES_v0.6.0-beta.md`](./docs/releases/RELEASE_NOTES_v0.6.0-beta.md).

### Added

- **Phase 1 — Core stability:** `auto_optimize`, `smart_file_read`,
  `code_execute`, 7 language parsers (TS, JS, Python, Go, Rust, PHP, Swift).
- **Phase 2 — Smart search:** BM25 + semantic hybrid search for tool discovery
  using local `all-MiniLM-L6-v2` embeddings.
- **Phase 3 — SDK enhancement:** `ctx.git.*`, `ctx.search.*`, `ctx.analyze.*`,
  `ctx.pipeline` composable DSL.
- **Phase 4 — Intelligence layer:** `context_budget` pre-flight estimation,
  `detect_retry_loop`, `session_stats`.
- **Phase 5 — Ecosystem integration:** one-click setup for Claude Code / Cursor
  / Windsurf, GitHub Action for CI token analysis, pre-commit hook, CLI
  `analyze` command.
- **Phase 6 — Advanced compression:** `multifile_compress` (cross-file
  deduplication), `conversation_memory` (long-conversation summarization),
  TOON output format, configurable verbosity.

### Notes

- Test coverage at release was ~21% — subsequent releases expanded it
  substantially.
- Several Phase 1 – Phase 4 tools (`summarize_logs`, `diff_compress`,
  `browse_tools`, `run_tool`, `discover_tools`, `multifile_compress`,
  `conversation_memory`, `set_output_config`, `context_budget`,
  `detect_retry_loop`, `session_stats`) were consolidated into the current
  3-tool architecture during the `v0.9.0` cycle.
