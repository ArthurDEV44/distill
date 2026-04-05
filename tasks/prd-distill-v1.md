[PRD]

# PRD: Distill v1.0 — "3 Tools, Zero Friction"

## Problem Statement

Distill is an MCP server that optimizes LLM token usage through intelligent context compression. However, after deep analysis of Claude Code's internals (the primary consumer), a critical finding emerged: **Claude Code already implements deferred tool loading, context compression (autocompact/microcompact), session memory, and tool result persistence natively.** Distill's 21+ tools create ~3,700 tokens of overhead per turn while duplicating capabilities the host already provides.

The 18 redundant tools (session_stats, context_budget, conversation_compress, optimization_tips, detect_retry_loop, discover_tools, browse_tools, run_tool, etc.) add friction without proportional value. Users must discover and learn tools that duplicate built-in features.

**Core question:** How do we transform Distill from a "21-tool Swiss army knife with diminishing returns" into a "3-tool precision instrument" that delivers unique value Claude Code cannot provide natively?

## Research Findings

### Competitive Landscape
- **No direct competitor** does AST extraction + multi-strategy compression for MCP
- **Context7** (Upstash, 20K+ stars) does selective docs injection — different domain, not compression
- **Block Engineering** reduced their MCP server from 30+ to 2 consolidated tools — validates the "fewer is better" thesis
- **Claude Code native capabilities** handle tool-schema lazy loading (~95% savings), context autocompact (87% threshold), microcompact (cache-edit API), and tool result persistence (50K char disk threshold)

### Best Practices (Block, Phil Schmid, MCP spec)
- 5-15 tools per server sweet spot; over 15 requires splitting
- Tool descriptions: 1-2 sentences, "use when..." pattern, service-prefixed names
- Return curated data only; 400KB ceiling before returning content
- Claude Code truncates MCP tool descriptions at 2048 chars
- Each tool adds ~500 tokens overhead per API call

### Distill's Unique Value (what Claude Code CANNOT do)
1. **AST-powered code reading** — extract specific functions/classes from 7 languages instead of loading entire 25K-token files
2. **Content-aware pre-compression** — shrink build output, logs, diffs BEFORE they enter the context window (Claude Code compresses AFTER)
3. **Multi-operation batching** — one `code_execute` call replaces 5-10 tool calls (each costing ~500 tokens overhead)

### Platform Risks
- Claude Code may internalize AST extraction in future versions
- `_meta['anthropic/alwaysLoad']` is undocumented — mitigated by `searchHint` fallback
- MCP spec churn (elicitation, OAuth 2.1) requires ongoing maintenance
- Distribution gap: Smithery/MCPcat presence needed

## Solution Overview

Refactor Distill from 21+ tools to exactly 3 always-loaded tools:

| Tool | Purpose | Unique Value | Token Savings |
|------|---------|-------------|---------------|
| `auto_optimize` | Universal content-aware compression | 9 strategies (build, logs, diff, stacktrace, code, semantic, config, errors, auto) | 40-95% per compression |
| `smart_file_read` | AST-powered code reading | Extract functions/classes/signatures from 7 languages | 50-70% vs raw Read |
| `code_execute` | TypeScript SDK in QuickJS sandbox | Batch 5-10 operations in 1 call via ctx.* API | 75-98% overhead reduction |

All 3 tools set `_meta['anthropic/alwaysLoad'] = true` to bypass Claude Code's deferred loading — present from turn 1 with zero discovery friction.

Hook-powered guidance installed via `distill-mcp setup`:
- `PreToolUse[Read]` — suggest `smart_file_read` for supported languages
- `PostToolUse[Bash]` — suggest `auto_optimize` for large outputs
- `UserPromptSubmit` — light reminder of Distill's 3 tools

## Success Metrics

| Metric | Baseline (v0.8.1) | Target (v1.0) | Timeframe |
|--------|-------------------|---------------|-----------|
| Tool count | 21+ tools | 3 tools | Release day |
| Distill's own token overhead | ~3,700 tokens/turn | < 2,500 tokens/turn | Release day |
| Tool description length | Mixed (some > 3000 chars) | All < 2048 chars | Release day |
| Test pass rate | 605/609 (99.3%) | 100% (excluding pre-existing git.test.ts) | Release day |
| Build success | Pass | Pass | Every commit |
| npm weekly downloads | Current baseline | +50% within 3 months | 3 months post-release |

## Scope Boundaries

### In Scope
- Delete 18 redundant tools and all associated code
- Refactor `server.ts` to direct 3-tool registration
- Refactor `auto_optimize` to absorb all compression strategies
- Add skeleton mode to `smart_file_read`
- Update CLI (remove loading modes), hooks, CLAUDE.md
- Comprehensive test suite for the 3 remaining tools
- README and npm package description rewrite
- Web app landing page update

### Out of Scope
- New tool creation (no `distill_batch`, `distill_analyze`, etc.)
- Docs injection capabilities (Context7's domain)
- LSP/code search intelligence
- Multi-language web app content rewrite (French/English marketing copy)
- Smithery/MCPcat listing (tracked as P2 but not blocking release)

## Assumptions & Risks

| ID | Assumption | Risk Level | Validation |
|----|-----------|------------|------------|
| A1 | `_meta['anthropic/alwaysLoad']` will continue to work in Claude Code | MEDIUM | Fallback via `searchHint`; monitor Claude Code releases |
| A2 | 3 tools provide sufficient coverage for all compression use cases | LOW | `auto_optimize` strategy param covers all 9 strategies internally |
| A3 | Removing 18 tools won't break existing users significantly | MEDIUM | Pre-1.0 semver allows breaking changes; migration guide provided |
| A4 | Claude Code won't internalize AST extraction in the near term | MEDIUM | No signals in Claude Code source; Tree-sitter integration is complex |
| A5 | The QuickJS sandbox security model is sufficient | LOW | 7 security layers, 30s timeout, 128MB limit — battle-tested |

---

## EP-001: Core Architecture Refactor (P0 — Must Have)

**Definition of done:** Distill serves exactly 3 tools via MCP stdio, all with `_meta['anthropic/alwaysLoad']`, no loading modes, no dynamic loader catalog.

### US-001: Delete redundant tool files
**As a** maintainer, **I want** all 18 redundant tool files and their tests removed **so that** the codebase reflects the 3-tool architecture.

**Priority:** P0 | **Size:** S (2) | **Dependencies:** None | **Status:** DONE

- [x] Delete 18 tool implementation files (discover-tools, lazy-mcp, semantic-compress, summarize-logs, analyze-build-output, deduplicate-errors, diff-compress, compress-context, multifile-compress, code-skeleton, conversation-compress, conversation-memory, context-budget, session-stats, smart-cache-tool, smart-pipeline, optimization-tips, set-output-config, detect-retry-loop)
- [x] Delete associated test files (lazy-mcp.test, context-budget.test, token-budget.test, dynamic-loader.test, semantic-compress.test)
- [x] Delete config/output-config.ts (TOON output config singleton)
- [x] Build passes after deletion

### US-002: Simplify server.ts — direct 3-tool registration
**As a** developer, **I want** the MCP server to directly register 3 tools without loading modes **so that** startup is simpler and tool availability is deterministic.

**Priority:** P0 | **Size:** M (3) | **Dependencies:** US-001 | **Status:** DONE

- [x] Remove `LoadingMode` type ("lazy" | "core" | "all")
- [x] Remove DynamicToolLoader import and usage
- [x] Remove lazy mode meta-tools (browse_tools, run_tool)
- [x] Remove discover_tools registration
- [x] Simplify `ServerConfig` to `{ verbose?: boolean }` only
- [x] Import and register 3 tools directly (auto_optimize, smart_file_read, code_execute)
- [x] Add `_meta: { 'anthropic/alwaysLoad': true }` to ListTools response
- [x] Return error for unknown tool names (no dynamic loading fallback)
- [x] Build and type-check pass

### US-003: Refactor auto_optimize to absorb all compression strategies
**As a** user, **I want** a single `auto_optimize` tool that handles all compression types **so that** I don't need to discover and choose between 9 separate tools.

**Priority:** P0 | **Size:** L (5) | **Dependencies:** US-001 | **Status:** DONE

- [x] Add `strategy` param: "auto" | "logs" | "build" | "diff" | "stacktrace" | "code" | "semantic" | "config" | "errors"
- [x] Add `preservePatterns` param (regex strings to never compress)
- [x] Auto-detection flow: build > logs > diff > stacktrace > config > code > generic
- [x] Each strategy routes to the correct compressor/parser
- [x] Export `createAutoOptimizeTool()` factory function
- [x] Add MCP 2025-06-18 annotations (title, readOnlyHint, idempotentHint)
- [x] Description under 2048 chars, front-loaded
- [x] Returns compression stats (original tokens, compressed tokens, reduction %)

### US-004: Simplify dynamic-loader.ts
**As a** maintainer, **I want** the dynamic loader reduced to a simple 3-tool export **so that** there's no dead code from the old TOOL_CATALOG.

**Priority:** P0 | **Size:** S (2) | **Dependencies:** US-002 | **Status:** DONE

- [x] Delete TOOL_CATALOG (21 entries), DynamicToolLoader class, BM25/semantic search
- [x] Export only `getAllTools()` returning the 3 tool definitions
- [x] Update index.ts re-exports (remove old exports)
- [x] Build passes

### US-005: Simplify CLI entry point
**As a** user, **I want** `distill-mcp serve` to work without mode flags **so that** setup is simpler.

**Priority:** P0 | **Size:** S (2) | **Dependencies:** US-002 | **Status:** DONE

- [x] Remove `--mode`, `--lazy`, `--all` flags from bin/cli.js
- [x] Serve command passes only `{ verbose }` to `runServer()`
- [x] Update help text to remove mode references
- [x] Update hooks prompt-inject script to reference only 3 tools
- [x] `distill-mcp serve` starts successfully

---

## EP-002: Tool Enhancement (P0 — Must Have)

**Definition of done:** All 3 tools have optimal descriptions, `_meta` fields, skeleton mode for smart_file_read, and pass comprehensive tests.

### US-006: Add skeleton mode to smart_file_read
**As a** developer, **I want** to get just function/class signatures from a file **so that** I can understand structure without loading full implementations.

**Priority:** P0 | **Size:** M (3) | **Dependencies:** US-001 | **Status:** TODO

- [ ] Add `mode` param: "auto" | "full" | "skeleton" | "extract" | "search"
- [ ] Skeleton mode returns signatures only (function names, class definitions, type declarations) without bodies
- [ ] Absorbs code_skeleton functionality
- [ ] Search mode finds AST elements by name substring
- [ ] All 7 languages supported (TS, JS, Python, Go, Rust, PHP, Swift)
- [ ] Returns empty result (not error) for unsupported languages in skeleton mode
- [ ] Description under 2048 chars

### US-007: Optimize tool descriptions for Claude Code's 2048-char limit
**As a** tool, **I want** my descriptions front-loaded and under 2048 chars **so that** Claude Code doesn't truncate critical information.

**Priority:** P0 | **Size:** S (2) | **Dependencies:** US-003, US-006 | **Status:** TODO

- [ ] `auto_optimize` description: lead with "Compress any content — build output, logs, diffs, code, configs. Auto-detects type."
- [ ] `smart_file_read` description: lead with "Read code files with AST extraction — get functions, classes, signatures without loading full file."
- [ ] `code_execute` description: lead with "Execute TypeScript in sandbox. Access files, git, search, compress via ctx.* SDK. Replaces 5-10 tool calls."
- [ ] Each description < 2048 chars (verify with `description.length`)
- [ ] Include `_meta['anthropic/searchHint']` on each tool (3-10 word keyword hint)

### US-008: Add MCP 2025-06-18 compliance to all 3 tools
**As an** MCP client, **I want** proper annotations and outputSchema on each tool **so that** permission prompts and structured output work correctly.

**Priority:** P1 | **Size:** S (2) | **Dependencies:** US-003, US-006 | **Status:** TODO

- [ ] `auto_optimize`: annotations `{ title: "Auto Optimize", readOnlyHint: true, idempotentHint: true }`
- [ ] `smart_file_read`: annotations `{ title: "Smart File Read", readOnlyHint: true, idempotentHint: true }`
- [ ] `code_execute`: annotations `{ title: "Code Execute", readOnlyHint: false, idempotentHint: false }`
- [ ] All tools include `outputSchema` (JSON Schema for the response shape)
- [ ] `structuredContent` returned when outputSchema is present

### US-009: Fix pre-existing git.test.ts failures
**As a** maintainer, **I want** 100% test pass rate **so that** CI is green and reliable.

**Priority:** P1 | **Size:** S (2) | **Dependencies:** None | **Status:** TODO

- [ ] Fix `sanitizeGitArg` rejecting `--format=%(refname:short)` (legitimate git format string, not injection)
- [ ] Fix "Not a git repository" error message matching in non-git directory test
- [ ] All 4 failing tests pass
- [ ] No regressions in other test suites

---

## EP-003: Testing & Quality (P1 — Should Have)

**Definition of done:** Comprehensive test coverage for all 3 tools, CI green, no regressions.

### US-010: Comprehensive auto_optimize test suite
**As a** maintainer, **I want** tests for all 9 compression strategies **so that** regressions are caught.

**Priority:** P1 | **Size:** M (3) | **Dependencies:** US-003 | **Status:** TODO

- [ ] Test auto-detection for each content type (build, logs, diff, stacktrace, config, code, generic)
- [ ] Test explicit `strategy` param overrides auto-detection
- [ ] Test `preservePatterns` regex preservation
- [ ] Test empty input returns original with 0% savings
- [ ] Test `aggressive` mode produces higher compression
- [ ] Test error handling for malformed input
- [ ] Test compression stats accuracy (originalTokens, compressedTokens, reductionPercent)

### US-011: Comprehensive smart_file_read test suite
**As a** maintainer, **I want** tests for all read modes and languages **so that** AST extraction is reliable.

**Priority:** P1 | **Size:** M (3) | **Dependencies:** US-006 | **Status:** TODO

- [ ] Test skeleton mode for all 7 languages
- [ ] Test extract mode (function, class, interface, type targets)
- [ ] Test search mode (substring matching in AST elements)
- [ ] Test unsupported language fallback (raw line-range read)
- [ ] Test binary file rejection
- [ ] Test path traversal protection (no reads outside working dir)
- [ ] Test large file handling (>25K tokens)

### US-012: Comprehensive code_execute test suite
**As a** maintainer, **I want** tests for the sandbox SDK and security **so that** sandboxed execution is safe and reliable.

**Priority:** P1 | **Size:** M (3) | **Dependencies:** None | **Status:** TODO

- [ ] Test each ctx.* namespace (files, code, compress, git, search, analyze, pipeline)
- [ ] Test security blocks (eval, require, import(), process, Reflect, Proxy)
- [ ] Test timeout enforcement (5s default, 30s max)
- [ ] Test memory limit (128MB)
- [ ] Test output token cap with auto-compression
- [ ] Test error messages don't leak host paths
- [ ] Test concurrent execution safety

---

## EP-004: Documentation & Distribution (P1/P2)

**Definition of done:** README reflects 3-tool architecture, web app updated, npm description optimized.

### US-013: Rewrite README for 3-tool value proposition
**As a** potential user, **I want** to immediately understand Distill's value from the README **so that** I can decide to install it in < 30 seconds.

**Priority:** P1 | **Size:** M (3) | **Dependencies:** US-007 | **Status:** TODO

- [ ] Lead with the 3-tool value proposition (not the old 21-tool catalog)
- [ ] Include "Why Distill?" section with before/after token savings
- [ ] Quick start: `npx distill-mcp` + `claude mcp add distill -- npx distill-mcp`
- [ ] SDK code example showing `code_execute` batching
- [ ] Remove references to lazy/core/all loading modes
- [ ] Remove references to deleted tools (discover_tools, browse_tools, etc.)
- [ ] Update token overhead table (3 tools, ~2000 tokens)

### US-014: Update CLAUDE.md with architecture insights
**As a** Claude Code agent working in this repo, **I want** accurate architecture documentation **so that** I make correct decisions.

**Priority:** P0 | **Size:** S (2) | **Dependencies:** US-002 | **Status:** DONE

- [x] Add "Claude Code Integration" section with critical design constraints
- [x] Document 2048-char description limit, 500-token overhead, alwaysLoad pattern
- [x] Update architecture gotchas to reflect 3-tool server (not 21-tool)
- [x] Remove references to loading modes, TOOL_CATALOG, discover_tools

### US-015: Update web app landing page
**As a** visitor, **I want** the landing page to reflect the current 3-tool architecture **so that** information is accurate.

**Priority:** P2 | **Size:** M (3) | **Dependencies:** US-013 | **Status:** TODO

- [ ] Update hero section stats (3 tools, not 21+)
- [ ] Update feature cards (Auto Compress, Smart Read, Code Execute)
- [ ] Update or remove tool catalog pages in docs
- [ ] Update installation guide to remove mode references
- [ ] Fix JSON-LD softwareVersion (currently hardcoded "0.7.1")

### US-016: Publish to MCP registries
**As a** developer, **I want** to find Distill on Smithery and MCPcat **so that** I discover it where I look for MCP servers.

**Priority:** P2 | **Size:** S (2) | **Dependencies:** US-013 | **Status:** TODO

- [ ] Submit to Smithery registry
- [ ] Submit to MCPcat registry
- [ ] Verify listing is accurate (3 tools, descriptions, install command)
- [ ] Add registry badges to README

---

## Dependency Map

```
US-001 (delete files) ──DONE──┬──> US-002 (server.ts) ──DONE──> US-004 (dynamic-loader) DONE
                               │                                        │
                               ├──> US-003 (auto_optimize) ──DONE──────>├──> US-007 (descriptions)
                               │                                        │          │
                               └──> US-006 (smart_file_read skeleton)──>├──> US-008 (MCP compliance)
                                                                        │
                               US-005 (CLI) ──DONE                      ├──> US-010 (auto_optimize tests)
                                                                        ├──> US-011 (smart_file_read tests)
                               US-009 (git.test fix) ──────────────────>├──> US-012 (code_execute tests)
                                                                        │
                               US-014 (CLAUDE.md) ──DONE               ├──> US-013 (README)
                                                                        │          │
                                                                        │          └──> US-015 (web app)
                                                                        │          └──> US-016 (registries)
                                                                        │
                                                                  All DONE/TODO stories
```

## Quality Gates

| Gate | Command | Pass Criteria |
|------|---------|---------------|
| Build | `bun run build` | 0 errors, all 3 packages compile |
| Type-check | `bun run check-types` | 0 type errors |
| Tests | `cd packages/mcp-server && bun run test` | 100% suites pass, 100% tests pass |
| Lint | `bun run lint` | 0 errors (warnings acceptable) |
| Tool count | Connect via MCP, call `tools/list` | Exactly 3 tools returned |
| Always loaded | Connect via Claude Code | All 3 tools present without ToolSearch |
| Description length | `tool.description.length` per tool | All < 2048 chars |
| Token overhead | Count tokens of all 3 tool schemas | Total < 2500 tokens |

## Files NOT to Modify

These internal engine files power the 3 remaining tools and should NOT be modified in this refactor:

- `src/ast/` — All 37 AST parser files (power smart_file_read)
- `src/compressors/` — All 8 compressor implementations (power auto_optimize)
- `src/sandbox/` — QuickJS sandbox + ctx SDK (power code_execute)
- `src/parsers/` — Build output parsers (power auto_optimize build strategy)
- `src/summarizers/` — Log summarizers (power auto_optimize logs strategy)
- `src/utils/token-counter.ts` — Token counting (power all tools)
- `src/utils/content-detector.ts` — Content type detection (power auto_optimize)
- `src/utils/tfidf.ts`, `src/utils/segment-scorer.ts` — TF-IDF scoring (power semantic compression)
- `src/middleware/` — Logging middleware

## Glossary

| Term | Definition |
|------|-----------|
| MCP | Model Context Protocol — standard for LLM tool servers |
| `alwaysLoad` | `_meta['anthropic/alwaysLoad']` — Claude Code field that bypasses deferred tool loading |
| `searchHint` | `_meta['anthropic/searchHint']` — keyword hint for Claude Code's ToolSearch discovery |
| Deferred loading | Claude Code's native mechanism to load MCP tool schemas on-demand via ToolSearch |
| Autocompact | Claude Code's native context compression at ~87% context usage |
| Microcompact | Claude Code's native tool result clearing (cache-edit API or time-based) |
| AST extraction | Parsing source code into Abstract Syntax Tree to extract specific elements |
| Tree-sitter | WASM-based incremental parser used for Python, Go, Rust, PHP, Swift |
| QuickJS | Lightweight JavaScript engine (WASM) used for sandboxed code execution |
| TOON | Token-Oriented Object Notation — compact serialization format (removed in v1.0) |

[/PRD]
