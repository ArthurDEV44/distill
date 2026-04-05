# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Distill is an open-source MCP server (`distill-mcp` on npm) that optimizes LLM token usage through intelligent context compression. Designed primarily for Claude Code. Bun workspaces + Turborepo monorepo.

**Architecture: "3 Tools, Zero Friction"** — 3 always-loaded tools with `_meta['anthropic/alwaysLoad'] = true`:
- `auto_optimize` — Universal content-aware compression (build output, logs, diffs, code, stacktraces)
- `smart_file_read` — AST-powered code reading for 7 languages. 5 modes: `auto`, `full`, `skeleton` (signatures + depth 1-3), `extract` (by name), `search` (by query)
- `code_execute` — TypeScript SDK in QuickJS sandbox (batch 5-10 operations in 1 call)

## Monorepo Structure

- `packages/mcp-server/` — **Main package** (published as `distill-mcp`). Almost all development happens here.
- `packages/shared/` — Shared types (`SupportedLanguage`, `ContentType`) and Anthropic model pricing constants
- `packages/ui/` — Vestigial Turborepo starter (3 stub components). **Not used by the web app** — it uses shadcn/ui instead.
- `packages/eslint-config/` — ESLint v9 flat configs: `base.js`, `next.js`, `react-internal.js`
- `packages/typescript-config/` — TypeScript presets: `base.json`, `nextjs.json`, `react-library.json`
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
- **`maxResultSizeChars: 100_000`** is set in `_meta` for all 3 tools. Note: Claude Code reads this from the Tool object directly (not `_meta`), so it may not take effect for MCP tools. The MCP SDK strips unknown top-level Tool properties via Zod.
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

- **`detectContentType()` does NOT detect `build` or `diff`.** Use `detectPipelineContentType()` from `pipelines/definitions.ts` for those.
- `semanticCompressor` and `diffCompressor` are exported but **NOT in the default compressor priority array**. They are invoked via direct import in `auto_optimize`, not via `compressContent()`.
- **TF-IDF scoring** uses a 3-signal weighted model: TF-IDF (0.4) + position U-curve (0.3) + keyword boosts (0.3).
- Token counting uses `js-tiktoken` with `gpt-4` encoding (cl100k_base). Fallback: `Math.ceil(length / 4)`.

### Sandbox (`src/sandbox/`)

- **7 security layers:** (1) static regex code analysis, (2) QuickJS WASM isolation (no fetch/fs), (3) path validation + symlink resolution, (4) git command allowlist, (5) error message sanitization (strips host paths), (6) `safe-walk` directory traversal guards, (7) output token cap with auto-compression.
- **Blocked in user code:** `eval`, `require`, `import()`, `process`, `global`, `globalThis`, `Reflect`, `Proxy`, `setTimeout`, `__proto__`, `../..`.
- **`ctx.pipe` is available in both QuickJS and legacy modes.** The guest-side implementation runs callbacks locally in QuickJS and delegates I/O steps to host bridge functions. `ctx.pipeline` (step-array API) also works in both modes.
- **Dual API pattern:** `createFooAPI()` (returns `Result<T, E>`) and `createFooAPILegacy()` (throws). The QuickJS bridge uses the legacy throwing versions because `Result` objects cannot cross the WASM boundary.
- **Git SDK uses `execFileSync`** (not `execSync`) to bypass shell interpretation — `%(refname:short)` format specifiers pass through safely. **`LC_ALL=C`** is set to force English error messages regardless of system locale.
- Default limits: 5s timeout (30s max), 128MB memory, 4000 output tokens (auto-compressed if exceeded).

### Middleware (`src/middleware/`)

- `beforeTool` runs in priority order (lower = first). **`afterTool` runs in REVERSE order** (LIFO).
- Middleware errors are **non-fatal** — recorded in `ctx.middlewareErrors[]`, chain continues.
- Only built-in middleware: `logging` (priority 0, verbose mode only).

## Key Patterns

- **Error handling:** `neverthrow` (`Result<T, E>`) with discriminated union errors using `code` literal discriminant. Factories use `as const satisfies FactoryInterface`.
- **ES Modules:** `"type": "module"` — all local imports MUST use `.js` extensions.
- **Test files:** Co-located as `*.test.ts`. Vitest with `globals: true`. **30s test timeout** for Tree-sitter WASM init.
- **Lazy singletons:** WASM parsers and HuggingFace embeddings use `let promise: Promise | null` pattern with retry-on-failure.
- **Conventional Commits:** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **Branch strategy:** PRs target `dev`, releases merge to `main`
- **Node requirement:** `>= 20`
- **CLI:** Manual `process.argv` parsing in `bin/cli.js`. Commands: `serve`, `setup`, `doctor`, `analyze`.
- **CI:** 4 parallel jobs — lint, typecheck, test (mcp-server only), build. All on `ubuntu-latest` with Bun.
