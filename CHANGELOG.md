# Changelog

All notable changes to **Distill** (`distill-mcp` on npm) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical long-form release notes for versions prior to `v0.9.0` live under [`docs/releases/`](./docs/releases).

---

## [0.10.1] — 2026-04-22

**Patch release — pre-release smoke-test fixes.** Two user-facing bugs surfaced
during the v0.10.0 release verification pass, both fixed with regression tests.
No API or contract changes.

### Fixed

- **`code_execute` now handles code without an explicit `return`.**
  `executeSandbox` used to crash with `"Cannot read properties of undefined
  (reading 'match')"` when user code had no return value (e.g.
  `console.log("hi")`). Root cause: `JSON.stringify(undefined)` returns
  literal `undefined` (not a string), which then broke
  `tiktoken.encode(undefined)` inside `countTokens`. The executor now guards
  the serialization step with `?? ""` and skips token counting for empty
  output — so `console.log`-only scripts (and empty strings) resolve cleanly
  with `success: true`, `tokensUsed: 0`, and output `"(no output)"`.
  (`src/sandbox/executor.ts:152-153`.)
- **`smart_file_read` skeleton no longer emits `async async` on TypeScript
  functions.** The TS signature builder already prefixes `async` in the
  signature string, but the skeleton renderer used to prepend it a second
  time, producing `export async async createServer(...)`. The renderer now
  checks for a pre-existing `\basync\b` in the signature before adding the
  modifier. Affects both top-level functions and class methods.
  (`src/tools/smart-file-read.ts:395-414`.)

### Tests

- `sandbox.test.ts` — new regression test: `console.log`-only code returns
  `success: true` with `tokensUsed: 0`.
- `smart-file-read.test.ts` — new regression assertion: skeleton output never
  contains `/async\s+async/`.
- `code-execute.test.ts` — updated `"should handle empty code string
  gracefully"` to assert the new (correct) behaviour: empty code executes as
  a no-op and succeeds.
- Total: 1203 passing (1 skipped) across 46 files. Coverage held within the
  v0.9.2 floors (lines 72.13%, branches 58.62%, functions 73.46%,
  statements 71.32%).

---

## [0.10.0] — 2026-04-22

**Correctness + native-integration release.** Zero changes to the three
tools' contracts (`auto_optimize`, `smart_file_read`, `code_execute`). Zero
changes to the sandbox engine, the AST parsers, or the compression
algorithms. Closes the 19-story v0.10 PRD
(`tasks/prd-distill-v010-claude-code-alignment.md`), derived from a 5-agent
exploration of `/home/arthur/dev/claude-code/` that surfaced four documented
misunderstandings of how Claude Code actually consumes MCP tools and three
high-leverage integration points that Distill was not using.

This is the first release to hit npm since `v0.8.1`. It consolidates the
previously-draft `v0.9.1` and `v0.9.2` work (below) into a single published
version; nothing was dropped from those drafts.

### Documentation correctness (EP-001)

Every claim below is backed by a `claude-code/<path>:<line>` citation so
future maintainers can re-verify against a moving upstream in one pass.

- **MCP persistence threshold corrected.** `CLAUDE.md` previously claimed
  "tool results > 50K chars are persisted to disk"; the real constraint is
  `DEFAULT_MAX_MCP_OUTPUT_TOKENS = 25_000` at
  `claude-code/utils/mcpValidation.ts:16`, gated by the `length/4`
  heuristic at `:151-163` (≈ 12 500 tokens ≈ 50K chars). Distill's 45K-char
  internal cap survives the heuristic gate by design. (US-001.)
- **Autocompact formula corrected.** The reserved-tokens value is
  `min(maxOutputTokens, 20_000)`, not a hard-coded 20K —
  `claude-code/services/compact/autoCompact.ts:33-48`. Haiku's
  `max_output = 4 096` therefore gives a higher trigger threshold
  (≈ 91.5%) than Sonnet/Opus (≈ 83.5%). (US-002.)
- **`outputSchema` claim retired.** The obsolete Issue #25081 reference is
  replaced with the actual behaviour: `outputSchema` is silently ignored
  during the `tools/list` → internal `Tool` mapping at
  `claude-code/services/mcp/client.ts:1754-1813` (neither dropped nor
  rejected — the field is simply not copied). (US-003.)
- **Citation appendix added to `CLAUDE.md`.** Eleven verified mechanisms
  (alwaysLoad / searchHint / outputSchema / MCP persistence / autocompact /
  `structuredContent` drop / PreCompact hook / MCP prompts / custom agent
  loading / `readOnlyHint` / MCP skills) each pin to a
  `claude-code/<path>:<line>` anchor with a one-liner reverify script.
  (US-004.)

### Code alignment cleanup (EP-002)

- **`structuredContent` removed from the CallTool wire response.** The
  three tools still populate it on their internal `ToolResult` for test
  assertions and non-Claude-Code MCP clients, but `server.ts` no longer
  emits it. Claude Code stashes `structuredContent` in `mcpMeta` and
  explicitly excludes `mcpMeta` from Anthropic-API blocks — so sending it
  on the wire was pure bandwidth cost for zero model-side value. (US-005.)
- **`searchHints` map deleted from `server.ts`.** The
  `anthropic/searchHint` key is rendered only for deferred MCP tools —
  Distill sets `alwaysLoad: true` on all three tools, so the hint was
  unreachable by construction. (US-006.)
- **`annotations: { readOnlyHint: true }`** declared on `smart_file_read`
  and `auto_optimize` (with matching `title` + `destructiveHint: false` +
  `idempotentHint: true` + `openWorldHint: false`). Claude Code maps
  `readOnlyHint` to `isConcurrencySafe()` at
  `claude-code/services/mcp/client.ts:1795-1800`, enabling parallel
  dispatch on multi-tool turns. `code_execute` declares
  `readOnlyHint: false, destructiveHint: true` — it can mutate via
  `ctx.files` and git. (US-007.)

### PreCompact hook preset (EP-003)

- **`[DISTILL:COMPRESSED ratio=X.XX method=<name>]` marker contract.**
  Opt-in wire envelope that lets Claude Code's PreCompact hook preserve
  Distill-compressed regions verbatim during autocompact. Enabled via
  `DISTILL_COMPRESSED_MARKERS=1`. Thresholds per tool: `auto_optimize`
  savings ≥ 30%; `smart_file_read` output < 50% of source and mode ∈
  {skeleton, extract, search}; `code_execute`'s `ctx.compress.*` helpers
  wrap under the same 30%-savings rule. Collision escape uses
  `[DISTILL-USER-TEXT:COMPRESSED …]` when the payload already contains
  the literal marker. (US-008.)
- **`packages/mcp-server/scripts/precompact-hook.sh`** — shipped
  POSIX-compliant hook that emits stdout guidance merged by Claude Code
  into `newCustomInstructions` (per
  `claude-code/utils/hooks.ts:3991-4024`). Exits 0 on every input shape
  (including malformed JSON and unexpected events) so it can never block
  compaction. `shellcheck`-clean. (US-009.)
- **`distill-mcp setup --install-precompact-hook`** — idempotent,
  atomic (tempfile + rename), with `--dry-run`, `--uninstall-precompact-hook`,
  and `--user-dir=<path>` for testing. Aborts on malformed
  `~/.claude/settings.json` with a line/column pointer; never overwrites a
  broken file. A `__distill_version` sentinel on the hook entry enables
  targeted uninstall. (US-010.)
- **End-to-end hook validation.** Vitest integration test synthesises a
  `PreCompact` dispatch, pipes a hook-input JSON on stdin to the shipped
  script, and asserts the stdout shape + instruction text. Runs under
  CI's Ubuntu runner to validate POSIX-only shell. (US-011.)

### MCP prompts as slash commands (EP-004)

- **Three prompts registered via `prompts/list`:**
  `/mcp__distill-mcp__compress-session`,
  `/mcp__distill-mcp__analyze-tokens`,
  `/mcp__distill-mcp__forget-large-results`. Zero-argument by design;
  zero token overhead when unused (prompts are lazy-loaded by Claude
  Code, not injected into the system prompt). Naming convention per
  `claude-code/services/mcp/client.ts:2043-2060`. (US-012.)
- **Vitest coverage** on the prompt handlers — every happy and unhappy
  path including the MCP "unknown prompt" error code. (US-013.)
- **User docs** (`apps/web`, fr + en) describing each slash command,
  when to use it, and the expected model behaviour. (US-014.)

### Custom agent preset (EP-005)

- **`packages/mcp-server/assets/agents/distill-compressor.md`** — a
  read-only subagent template with `name`, `description`, `tools`
  (Read, Grep, Glob, Bash + `auto_optimize` + `smart_file_read`),
  `disallowedTools` (`code_execute`), and `requiredMcpServers`
  (`distill-mcp`). Body covers content-aware compression, AST-based
  skeleton reads, summarization of long outputs, and the
  `[DISTILL:COMPRESSED]` marker contract. (US-015.)
- **`distill-mcp setup --install-agent`** — copies the template into
  `~/.claude/agents/` with mode 0644, creates `~/.claude/agents/`
  (0755) if missing, uses atomic tempfile + rename. Idempotent,
  `--dry-run`-aware, with `--uninstall-agent` and diff-preview on
  existing differing file (requires `--force` to overwrite). (US-016.)

### MCP skills R&D spike (EP-006)

- **`docs/spikes/mcp-skills-exposure.md` — verdict: NO-GO.** A
  single-session source-and-binary audit established that external
  MCP servers cannot produce commands with `loadedFrom === 'mcp'` on
  the currently-shipped Claude Code. Three independent lines of
  evidence: (1) all call sites gated by `feature('MCP_SKILLS')` from
  `bun:bundle` at `services/mcp/client.ts:117-121, :2174, :2348`,
  (2) the producer module `skills/mcpSkills.ts` is absent from the
  public source tree and conditionally compiled only when the flag is
  true, (3) the installed binary v2.1.117 has zero matches for
  `MCP_SKILLS`, `fetchMcpSkills`, `getMcpSkillCommands`, or
  `registerMCPSkill`. The spike report documents four upstream
  preconditions that would flip the decision to GO plus three
  `strings`-based re-verification commands. v0.11 does not include
  MCP skills. (US-017.)

### Release coordination (EP-007)

- **Version bump** from `0.8.1` to `0.10.0`. The two `[Unreleased]`
  `v0.9.1` and `v0.9.2` sections below are rolled into this release —
  every bullet there shipped under `0.10.0`. (US-018.)
- **`PostToolUse` matcher docs.** The `apps/web` hooks page now shows
  a `"matcher": "mcp__distill-mcp__*"` example for auditing or
  post-processing Distill tool calls, referencing the
  `updatedMCPToolOutput` return channel per
  `claude-code/schemas/hooks.ts:19-27`. (US-019.)

### Upgrade notes

- **No migration required.** The three tool signatures and output shapes
  are unchanged. The marker contract, the PreCompact hook, the slash
  commands, and the custom agent are all opt-in — existing `v0.8.x` /
  `v0.9.x` integrators keep vanilla behaviour.
- `structuredContent` no longer travels on the MCP wire (US-005). It was
  already dropped before reaching the Anthropic API by Claude Code itself
  (`mcpMeta` is excluded from API blocks), so no consumer of Claude Code
  loses information. Non-Claude-Code MCP clients that read
  `structuredContent` via the SDK surface can still do so via the
  `ToolResult` returned by the internal registry (kept for tests and
  SDK-level integrations).
- Coverage floors ratchet to v0.9.2 baseline −1 pt: Lines 70% / Branches
  56% / Functions 70% / Statements 69%. Current: Lines 72.15 / Branches
  58.6 / Functions 73.48 / Statements 71.34.

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
