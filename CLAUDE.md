# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Distill is an open-source MCP server (`distill-mcp` on npm) that optimizes LLM token usage through intelligent context compression. Designed primarily for Claude Code. Bun workspaces + Turborepo monorepo.

**Architecture: "3 Tools, Zero Friction"** — 3 always-loaded tools with `_meta['anthropic/alwaysLoad'] = true`:
- `auto_optimize` — Universal content-aware compression (build output, logs, diffs, code, stacktraces)
- `smart_file_read` — AST-powered code reading for 7 languages. 5 modes: `auto`, `full`, `skeleton` (signatures + depth 1-3), `extract` (by name), `search` (by query)
- `code_execute` — TypeScript SDK in QuickJS sandbox (batch 5-10 operations in 1 call)

## Monorepo Structure

- `packages/mcp-server/` — **Main package** (published as `distill-mcp`). Almost all development happens here. `SupportedLanguage` / `ContentType` live in `src/ast/types.ts`.
- `packages/eslint-config/` — ESLint v9 flat configs: `base.js`, `next.js`
- `packages/typescript-config/` — TypeScript presets: `base.json`, `nextjs.json`
- `apps/web/` — Next.js 16 landing page + fumadocs docs site. **French-first i18n** (default locale `fr`).

## Commands

```bash
bun install                    # Install dependencies
bun run build                  # Build all packages (turbo)
bun run dev                    # Dev mode with watch (turbo)
bun run dev:mcp                # Dev MCP server only
bun run dev:web                # Dev web app only (uses --turbopack)
bun run lint                   # ESLint all packages
bun run format                 # Prettier format
bun run check-types            # TypeScript type check all packages

# MCP server tests (from packages/mcp-server/)
cd packages/mcp-server
bun run test                   # Run tests (vitest)
bun run test:watch             # Watch mode
bun run test:coverage          # V8 coverage report
```

Run a single test: `cd packages/mcp-server && npx vitest run src/path/to/file.test.ts`

### Coverage thresholds (mcp-server)

`vitest.config.ts` enforces minimums on `src/**/*.ts` (excluding tests, `*.d.ts`, and `types.ts`). CI fails when any category drops below floor:

| Category   | Floor (v0.9.2 ratchet)      | Baseline (2026-04-21) | Target |
|------------|-----------------------------|-----------------------|--------|
| Lines      | 70%                         | 71.80%                | 75%    |
| Branches   | 56%                         | 57.58%                | 70%    |
| Functions  | 70%                         | 71.93%                | 75%    |
| Statements | 69%                         | 70.99%                | 75%    |

Floors were raised by v0.9.2 US-011 from the initial v0.9.1 floors (baseline − 2pts) to the current baseline − 1pt buffer. Raise toward v1.0 targets as new tests land.

## Architecture Gotchas

These are non-obvious behaviors that WILL cause mistakes if not understood.

### Claude Code Integration (CRITICAL for Distill's design)

- **Claude Code defers ALL MCP tools by default** via its ToolSearch mechanism. Use `_meta['anthropic/alwaysLoad'] = true` on tools that must be present from turn 1.
- **Tool descriptions are truncated at 2048 chars** by Claude Code. Front-load the most important info.
- **Each tool adds ~500 tokens overhead** per API call. Fewer tools = less overhead. This is why we have only 3.
- **Tool results > 50K chars are persisted to disk** by Claude Code with only a 2KB preview shown to the model.
- **Autocompact triggers at `effectiveContextWindow - 13,000 tokens`** — for 200K models: `(200K - 20K reserved) - 13K = 167K tokens (83.5%)`; for 1M context: `(1M - 20K) - 13K = 967K tokens`. Distill compresses BEFORE content enters context; Claude Code compresses AFTER.
- **Subagents get ALL MCP tools** automatically — Distill's 3 tools are available in every subagent session.
- **`_meta['anthropic/searchHint']`** improves discoverability if a tool is somehow deferred.
- **MCP tools are sorted alphabetically** after built-in tools in the system prompt. `distill` starts with 'd'.

### MCP Server (`src/server.ts`)

- **Transport is stdio.** All diagnostic output MUST use `console.error`, never `console.log` — stdout is the MCP protocol channel.
- **3 tools registered directly** — no dynamic loading, no catalog, no discovery mechanism.
- **Server `instructions` field** is set on the MCP Server constructor — a static 4-line string explaining when to use each tool. No dynamic data (breaks prompt caching).
- **Per-tool `searchHint`** is set in the `_meta` object alongside `alwaysLoad` in the ListTools handler.
- **`maxResultSizeChars` is intentionally NOT set.** Claude Code reads this from the top-level Tool object (not `_meta`) and clamps to `DEFAULT_MAX_RESULT_SIZE_CHARS = 50_000` regardless. The MCP SDK also strips unknown top-level Tool properties via Zod, so there's no valid place to put it. Output size is enforced in-tool via the 45K budget cap (see `auto_optimize` and `smart_file_read`).
- **`outputSchema` is intentionally omitted** from the `tools/list` response. Older Claude Code versions silently drop tools with `outputSchema` (Issue #25081). Tool definitions internally retain `outputSchema` for documentation.
- **`structuredContent`** (MCP 2025-06-18) is returned by all 3 tools alongside `content` — a flat JSON object with tool-specific fields.
- **Tool change notification** (`notifications/tools/list_changed`) is wrapped in try/catch because it may fire before the stdio transport is connected.

### AST Parsing (`src/ast/`)

- **TypeScript/JavaScript use the TS Compiler API** (`import ts from "typescript"`), NOT Tree-sitter. All other 5 languages (Python, Go, Rust, PHP, Swift) use Tree-sitter WASM.
- **Tree-sitter sync/async split:** Sync `parseFoo()` returns empty `FileStructure` if WASM not yet initialized, and fires `initParser().catch(()=>{})` as a warm-up side-effect. Async `parseFooAsync()` awaits init. **First sync call to a new language parser returns empty results** — this is by design.
- `web-tree-sitter` is **pinned** at `0.22.6` (not caret range). Do not upgrade without testing all 5 Tree-sitter grammars.
- **Quick scan** (`quick-scan.ts`) is a regex fast path, ~90% faster. Trade-off: no `endLine`, no signatures, no documentation. Enabled via `parseFile(content, lang, 'quick')`.
- **Language mapping conventions:** Rust struct/enum -> `classes`, trait -> `interfaces`. Swift struct -> `classes`, protocol -> `interfaces`. PHP trait -> `classes`, enum -> `types`.

### Compression (`src/compressors/`)

- **`detectContentType()` does NOT detect `build` or `diff`.** Those are detected in `tools/auto-optimize.ts` via `isBuildOutput()` / `isDiffOutput()` before falling back to the generic compressor dispatch.
- `semanticCompressor` and `diffCompressor` are exported but **NOT in the default compressor priority array**. They are invoked via direct import in `auto_optimize`, not via `compressContent()`.
- **TF-IDF scoring** uses a 3-signal weighted model: TF-IDF (0.4) + position U-curve (0.3) + keyword boosts (0.3).
- Token counting uses `js-tiktoken` with `gpt-4` encoding (cl100k_base). Fallback: `Math.ceil(length / 4)`.

### Summarizers (`src/summarizers/`)

- **4 implementations**: `serverLogsSummarizer`, `testLogsSummarizer`, `buildLogsSummarizer`, `genericSummarizer`. The first three match content-type-specific shapes; `genericSummarizer` is the fallback and is also reached directly from `auto_optimize` + `sandbox/sdk/compress` when a specialized summarizer does not `canSummarize()` the input.
- **`genericSummarizer` internally composes three modules** — `scoring.ts` (BM25 + multi-factor importance), `clustering.ts` (semantic grouping), `pattern-extraction.ts` (template mining). These are production code, not optional plug-ins. They are re-exported from the `summarizers/` barrel for test access and sandbox SDK composition; they were mis-labeled as "advanced 2026 enhancements" in v0.9.1 docs and formally accepted as load-bearing in v0.9.2 US-010.

### Sandbox (`src/sandbox/`)

- **7 security layers:** (1) static regex code analysis, (2) QuickJS WASM isolation (no fetch/fs), (3) path validation + symlink resolution, (4) git command allowlist, (5) error message sanitization (strips host paths), (6) `safe-walk` directory traversal guards, (7) output token cap with auto-compression.
- **Blocked in user code:** `eval`, `require`, `import()`, `process`, `global`, `globalThis`, `Reflect`, `Proxy`, `setTimeout`, `__proto__`, `../..`.
- **`ctx.pipe` is available in both QuickJS and legacy modes.** The guest-side implementation runs callbacks locally in QuickJS and delegates I/O steps to host bridge functions. `ctx.pipeline` (step-array API) also works in both modes.
- **Dual API pattern:** `createFooAPI()` (returns `Result<T, E>`) and `createFooAPILegacy()` (throws). The QuickJS bridge uses the legacy throwing versions because `Result` objects cannot cross the WASM boundary.
- **Git SDK uses `execFileSync`** (not `execSync`) to bypass shell interpretation — `%(refname:short)` format specifiers pass through safely. **`LC_ALL=C`** is set to force English error messages regardless of system locale.
- Default limits: 5s timeout (30s max), 128MB memory, 4000 output tokens (auto-compressed if exceeded).
- `@sebastianwessel/quickjs` is **pinned** at `3.0.0` exact (not caret range). The WASM sandbox is the primary security boundary; upgrades are reviewed manually before the pin moves.

### Tool Registry (`src/tools/registry.ts`)

- Verbose-mode logging is **inlined** in `ToolRegistry.execute` as two `if (verbose)` blocks (before-call and after-call). No middleware abstraction — previously lived in `src/middleware/`, removed in v0.9.1 per PRD US-013.
- The after-call log fires on both happy and catch paths, so thrown handler errors are still surfaced to stderr when `verbose: true`.
- Pass verbose through `createToolRegistry(verbose)` or `createServer({ verbose: true })`.

## Key Patterns

- **Error handling:** `neverthrow` (`Result<T, E>`) with discriminated union errors using `code` literal discriminant. Factories use `as const satisfies FactoryInterface`.
- **ES Modules:** `"type": "module"` — all local imports MUST use `.js` extensions.
- **Test files:** Co-located as `*.test.ts`. Vitest with `globals: true`. **30s test timeout** for Tree-sitter WASM init.
- **Lazy singletons:** WASM parsers and HuggingFace embeddings use `let promise: Promise | null` pattern with retry-on-failure.
- **Conventional Commits:** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **Branch strategy:** PRs target `dev`, releases merge to `main`
- **Node requirement:** `>= 20`
- **CLI:** Manual `process.argv` parsing in `bin/cli.js`. Commands: `serve`, `setup`, `doctor`, `analyze`.
- **CI:** 5 parallel jobs — lint, typecheck, test (mcp-server only, runs with coverage + Tree-sitter WASM retry), build, knip. All on `ubuntu-latest` with Bun.

## Anti-Friction Rules (claude-doctor)

Règles pour éviter les patterns de friction détectés par `claude-doctor` sur ce projet : edit-thrashing, restart-cluster, repeated-instructions, negative-drift, error-loop, excessive-exploration.

### Editing discipline (anti edit-thrashing)

- Read the full file before editing. Plan all changes, then make ONE complete edit.
- If you've edited the same file 3+ times, STOP. Re-read the user's original requirements and re-plan from scratch.
- Prefer one large coherent edit over multiple small incremental ones.

### Stay aligned with the user (anti repeated-instructions, rapid-corrections)

- Re-read the user's last message before responding. Follow through on every instruction completely — don't partially address requests.
- Every few turns on a long task, re-read the original request to verify you haven't drifted from the goal.
- When the user corrects you: stop, re-read their message, quote back what they actually asked for, and confirm understanding before proceeding.

### Act, don't explore (anti excessive-exploration)

- Don't read more than 3-5 files before making a change. Get a basic understanding, make the change, then iterate.
- Prefer acting early and correcting via feedback over prolonged reading and planning.

### Break loops (anti error-loop, restart-cluster)

- After 2 consecutive tool failures or the same error twice, STOP. Change your approach entirely — don't retry the same strategy. Explain what failed and try something genuinely different.
- When truly stuck, summarize what you've tried and ask the user for guidance rather than retrying.

### Verify output (anti negative-drift)

- Before presenting your result, double-check it actually addresses what the user asked for.
- If the diff doesn't map cleanly to the user's request, don't ship it — re-plan.
