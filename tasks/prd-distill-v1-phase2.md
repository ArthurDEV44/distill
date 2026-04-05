[PRD]

# PRD: Distill v1.0 Phase 2 — Tool Optimization

**Parent PRD:** `tasks/prd-distill-v1.md` (Phase 1: Core Architecture Refactor — DONE)

## Problem Statement

Phase 1 reduced Distill from 21 tools to 3 and simplified the server architecture. The 3 remaining tools (`auto_optimize`, `smart_file_read`, `code_execute`) now work but are not optimized for maximum model adoption. Specifically:

1. **Descriptions are not structured per Anthropic guidelines** — missing "when to use" + "how to format" + "what to expect" pattern. Anthropic's evals show that adding concrete examples to descriptions improves parameter accuracy from 72% to 90%.
2. **No server-level `instructions` field** — Claude Code's ToolSearch relies on this for discovery guidance.
3. **`inputSchema` uses sub-optimal patterns** — missing enum constraints, implicit defaults, potential `anyOf`/`oneOf` issues.
4. **`annotations` may not be correctly set** — `readOnlyHint: true` is critical because Claude Code uses it for `isConcurrencySafe()`, enabling parallel execution.
5. **`outputSchema` in `tools/list` risks silent tool drop** on older Claude Code versions (Issue #25081) — need to remove from registration while keeping `structuredContent` in responses.
6. **4 pre-existing test failures** in `git.test.ts` that block CI green.
7. **No comprehensive test suites** for the 3 remaining tools post-refactor.
8. **README and web app** still reflect the old 21-tool architecture.

**Core question:** How do we optimize descriptions, schemas, annotations, and responses so that Claude Code's model **actively chooses** Distill's tools over built-in Read/Bash when appropriate?

## Research Findings

All findings verified against Claude Code v2.1.92 source code at `/home/arthur/dev/claude-code`.

### Tool Description Best Practices (Anthropic Engineering + Block + Phil Schmid)
- **3 required elements:** (1) when to use, (2) how to format args, (3) what to expect back
- **Concrete examples** boost parameter accuracy from 72% to 90% (Anthropic internal evals)
- **Front-load critical info** — Claude Code truncates at 2048 chars (`MAX_MCP_DESCRIPTION_LENGTH`)
- **`{service}_{action}_{resource}` naming** — reduces ambiguity, Block's recommendation
- **Enums/Literal types** constrain hallucination — Phil Schmid's "Complexity leads to hallucination"
- **`response_format` enum param** lets the model request verbosity level — Anthropic recommendation

### Claude Code `_meta` Fields (source-verified)
- `_meta['anthropic/alwaysLoad']` at `client.ts:1785` — bypass deferred loading (undocumented in MCP spec, works in Claude Code)
- `_meta['anthropic/searchHint']` at `client.ts:1780` — keyword hint for ToolSearch (whitespace collapsed)
- `maxResultSizeChars` is a `Tool` property, NOT a `_meta` field — set on the tool object directly

### Claude Code Annotation Handling (source-verified)
- `annotations.readOnlyHint` → `isConcurrencySafe()` + `isReadOnly()` at `client.ts:1796-1799`
- `annotations.destructiveHint` → `isDestructive()` at `client.ts:1805`
- `annotations.title` → `userFacingName()` display at `client.ts:1974`
- `annotations.openWorldHint` → `isOpenWorld()` at `client.ts:1808`
- Bug: `outputSchema`/`toolAnnotations` in `tools/list` caused silent tool drop in older versions (Issue #25081) — **fixed in v2.1.92**

### Risks
- `outputSchema` in `tools/list` breaks older Claude Code versions — omit from registration, keep `structuredContent` in responses
- `_meta['anthropic/alwaysLoad']` is undocumented — `searchHint` as fallback
- Tool descriptions are a proxy for prompt engineering — must be tested empirically

## Solution Overview

Optimize the 3 Distill tools across 4 dimensions: descriptions, schemas, server config, and response format.

### Description Optimization
Rewrite each tool's description following Anthropic's 3-element pattern with concrete examples. Each < 2048 chars.

### Schema Optimization
- Use enums for all constrained params (`strategy`, `mode`, `response_format`)
- Flat args only (no nesting > 2 levels)
- Explicit `.default()` on all optional params
- No `anyOf`/`oneOf` unions

### Server Config
- Add `instructions` field to MCP server initialization
- Remove `outputSchema` from `tools/list` response (keep in tool definitions for internal use)
- Set `maxResultSizeChars` on each tool (100K chars)
- Return `structuredContent` alongside `content` in tool results

### Response Format
- Add `response_format: "minimal" | "normal" | "detailed"` param to `auto_optimize`
- All tools return Markdown-formatted text (more token-efficient than JSON per Block)
- Include compression stats in a structured footer

## Success Metrics

| Metric | Baseline (current) | Target | Timeframe |
|--------|-------------------|--------|-----------|
| Description length | Unmeasured | All < 2048 chars | Release day |
| Description structure | Missing when/how/what | All 3 elements + example | Release day |
| Tool name length (with prefix) | mcp__distill__* | All < 64 chars | Release day |
| Test pass rate | 605/609 (99.3%) | 609/609 (100%) | Release day |
| Test suites for 3 tools | Partial coverage | Comprehensive (all strategies, modes, edge cases) | Release day |
| Server instructions | None | Present, < 2048 chars | Release day |
| Annotations correct | Partially set | readOnlyHint/title on all 3 tools | Release day |

## Scope Boundaries

### In Scope
- Rewrite 3 tool descriptions with examples
- Add server-level instructions
- Add response_format param to auto_optimize
- Optimize inputSchema (enums, defaults, flat)
- Fix annotations (readOnlyHint, title, destructiveHint)
- Remove outputSchema from tools/list response
- Add structuredContent to tool results
- Set maxResultSizeChars on tools
- Fix git.test.ts failures (sanitizeGitArg)
- Comprehensive test suites for all 3 tools
- README rewrite
- Web app landing page update

### Out of Scope
- New tools or tool renaming
- Compression algorithm changes
- AST parser changes
- Sandbox security changes
- CI/CD pipeline changes
- Smithery/MCPcat registry listing (separate story)

---

## EP-001: Tool Description & Schema Optimization (P0)

**Definition of done:** All 3 tools have Anthropic-compliant descriptions with examples, optimized inputSchema with enums and defaults, correct annotations, and no outputSchema in tools/list.

### US-001: Rewrite auto_optimize description and schema
**As a** Claude Code model, **I want** a clear description of auto_optimize with usage examples **so that** I know when to use it instead of dumping raw output into context.

**Priority:** P0 | **Size:** M (3) | **Dependencies:** None

- [ ] Description follows Anthropic 3-element pattern: when-to-use, how-to-format, what-to-expect
- [ ] Include concrete example: `auto_optimize({ content: "<paste build output>", strategy: "build" })`
- [ ] Description < 2048 chars (measured with `description.length`)
- [ ] `strategy` param uses z.enum (not z.string) with all 9 values
- [ ] `response_format` param added: z.enum(["minimal", "normal", "detailed"]).default("normal")
- [ ] `preservePatterns` param validated with safe-regex check
- [ ] All optional params have explicit `.default()` or `.optional()`
- [ ] No `anyOf`/`oneOf` in the schema
- [ ] `annotations: { title: "Auto Optimize", readOnlyHint: true, idempotentHint: true }`
- [ ] Returns error message (not crash) for empty content input

### US-002: Rewrite smart_file_read description and schema
**As a** Claude Code model, **I want** a clear description of smart_file_read **so that** I choose it over built-in Read for supported languages.

**Priority:** P0 | **Size:** M (3) | **Dependencies:** None

- [ ] Description leads with differentiation: "Read code with AST extraction — get functions, classes, signatures without loading the full file"
- [ ] Include concrete example: `smart_file_read({ filePath: "src/server.ts", mode: "extract", target: { type: "function", name: "createServer" } })`
- [ ] Description < 2048 chars
- [ ] `mode` param uses z.enum(["auto", "full", "skeleton", "extract", "search"]).default("auto")
- [ ] `target` param uses z.object with z.enum for `type` field
- [ ] All optional params have explicit `.default()` or `.optional()`
- [ ] `annotations: { title: "Smart File Read", readOnlyHint: true, idempotentHint: true }`
- [ ] Returns graceful fallback (not error) for unsupported languages

### US-003: Rewrite code_execute description and schema
**As a** Claude Code model, **I want** a clear description of code_execute with SDK examples **so that** I batch multiple operations instead of making separate tool calls.

**Priority:** P0 | **Size:** M (3) | **Dependencies:** None

- [ ] Description leads with value: "Execute TypeScript in sandbox — replace 5-10 tool calls with one"
- [ ] Include SDK example: `code_execute({ code: "return ctx.compress.auto(ctx.files.read('build.log'))" })`
- [ ] List all ctx.* namespaces with key methods
- [ ] Description < 2048 chars
- [ ] `timeout` param uses z.number().min(1000).max(30000).default(5000)
- [ ] `annotations: { title: "Code Execute", readOnlyHint: false, idempotentHint: false }`
- [ ] Returns partial result + timeout error when execution times out

### US-004: Remove outputSchema from tools/list response
**As a** Distill server, **I want** to omit outputSchema from the tools/list registration **so that** older Claude Code versions don't silently drop all my tools.

**Priority:** P0 | **Size:** S (2) | **Dependencies:** None

- [ ] `getToolDefinitions()` in registry.ts excludes `outputSchema` from the response
- [ ] `structuredContent` is still returned in tool results (alongside `content` text)
- [ ] Tool definitions internally retain outputSchema (for documentation/validation)
- [ ] Verify tools still appear in Claude Code after change
- [ ] No regression in existing tests

### US-005: Set maxResultSizeChars on all 3 tools
**As a** Distill tool, **I want** a high maxResultSizeChars **so that** Claude Code doesn't persist my compressed results to disk unnecessarily.

**Priority:** P1 | **Size:** XS (1) | **Dependencies:** US-004

- [ ] Each tool definition includes `maxResultSizeChars: 100000` (or equivalent mechanism)
- [ ] Verify this is passed through in the tools/list response or tool result metadata
- [ ] If Claude Code doesn't read this from MCP tools, document the limitation

---

## EP-002: Server Infrastructure (P0/P1)

**Definition of done:** Server has instructions field, correct _meta fields, and returns structuredContent in all tool results.

### US-006: Add server-level instructions field
**As a** Claude Code ToolSearch, **I want** server instructions **so that** I know when to suggest Distill's tools to the model.

**Priority:** P0 | **Size:** S (2) | **Dependencies:** None

- [ ] `instructions` field set on MCP Server initialization
- [ ] Content: 3-5 lines explaining when to use each tool
- [ ] Length < 2048 chars (Claude Code truncation limit)
- [ ] Instructions don't include dynamic data (no timestamps, versions — breaks prompt caching)
- [ ] Verified visible in Claude Code's MCP server instructions section

### US-007: Add structuredContent to tool results
**As a** MCP client, **I want** structured JSON alongside text content **so that** I can programmatically process tool results.

**Priority:** P1 | **Size:** M (3) | **Dependencies:** US-004

- [ ] `auto_optimize` returns `structuredContent: { compressed, stats: { originalTokens, compressedTokens, reductionPercent, strategy, technique } }`
- [ ] `smart_file_read` returns `structuredContent: { content, structure: { language, totalLines, elements }, metadata: { mode } }`
- [ ] `code_execute` returns `structuredContent: { result, stats: { executionTimeMs }, error? }`
- [ ] All tools still return text `content` as primary (backward compat)
- [ ] `structuredContent` is valid JSON (no circular references, no undefined values)

### US-008: Optimize _meta fields in ListTools response
**As a** Claude Code client, **I want** correct _meta fields **so that** tools are always loaded and discoverable.

**Priority:** P0 | **Size:** S (2) | **Dependencies:** US-006

- [ ] `_meta['anthropic/alwaysLoad'] = true` on all 3 tools (already done — verify)
- [ ] `_meta['anthropic/searchHint']` on each tool with optimized keywords:
  - auto_optimize: "compress optimize token reduce build logs diff errors stacktrace"
  - smart_file_read: "read code file AST extract function class skeleton signature"
  - code_execute: "execute typescript sandbox batch SDK script multi-operation"
- [ ] searchHint has no newlines (Claude Code collapses whitespace but newlines inject lines)
- [ ] Verify tools appear as always-loaded in Claude Code (not deferred)

---

## EP-003: Testing & Bug Fixes (P1)

**Definition of done:** 100% test pass rate, comprehensive coverage for all 3 tools.

### US-009: Fix git.test.ts pre-existing failures
**As a** maintainer, **I want** 100% test pass rate **so that** CI is green.

**Priority:** P1 | **Size:** S (2) | **Dependencies:** None

- [ ] Fix `sanitizeGitArg` to allow `--format=%(refname:short)` (legitimate git format specifier, not shell injection)
- [ ] Allowlist `(`, `)`, `:` characters inside `--format=` arguments specifically
- [ ] Fix "Not a git repository" error message matching for `/tmp` non-git directory
- [ ] All 4 previously failing tests pass
- [ ] No regressions in other git SDK tests

### US-010: Comprehensive auto_optimize test suite
**As a** maintainer, **I want** full test coverage for auto_optimize **so that** all 9 compression strategies are validated.

**Priority:** P1 | **Size:** M (3) | **Dependencies:** US-101

- [ ] Test each strategy: auto, build, logs, diff, stacktrace, code, semantic, config, errors
- [ ] Test `response_format`: minimal, normal, detailed produce different output lengths
- [ ] Test `preservePatterns`: regex patterns are preserved in output
- [ ] Test auto-detection correctness (build output detected as "build", not "logs")
- [ ] Test empty input returns 0% savings (not error)
- [ ] Test very large input (>100K chars) doesn't crash
- [ ] Test invalid strategy value defaults gracefully

### US-011: Comprehensive smart_file_read test suite
**As a** maintainer, **I want** full test coverage for smart_file_read **so that** all modes and languages work.

**Priority:** P1 | **Size:** M (3) | **Dependencies:** US-002

- [ ] Test all 5 modes: auto, full, skeleton, extract, search
- [ ] Test skeleton mode for TypeScript, Python, Go (representative set)
- [ ] Test extract mode: function, class, interface, type targets
- [ ] Test search mode: substring matching across AST elements
- [ ] Test unsupported language fallback (returns raw content, not error)
- [ ] Test non-existent file returns error with helpful message
- [ ] Test binary file detection and rejection

### US-012: Comprehensive code_execute test suite
**As a** maintainer, **I want** full test coverage for code_execute **so that** the sandbox is safe and reliable.

**Priority:** P1 | **Size:** M (3) | **Dependencies:** US-003

- [ ] Test basic execution: `return 1 + 1` returns `2`
- [ ] Test ctx.files.read and ctx.files.glob
- [ ] Test ctx.compress.auto on a string
- [ ] Test ctx.git.diff (in a git repository)
- [ ] Test ctx.search.grep
- [ ] Test security blocks: eval, require, import(), process all rejected
- [ ] Test timeout: code that sleeps > timeout returns error
- [ ] Test memory limit: code that allocates > 128MB returns error
- [ ] Test output that exceeds maxOutputTokens gets auto-compressed

---

## EP-004: Documentation & Distribution (P2)

**Definition of done:** README and web app reflect the 3-tool architecture with accurate information.

### US-013: Rewrite README for 3-tool value proposition
**As a** potential user, **I want** to understand Distill's value in < 30 seconds **so that** I decide to install it.

**Priority:** P2 | **Size:** M (3) | **Dependencies:** US-101, US-002, US-003

- [ ] Lead with 3-tool value proposition (not old 21-tool catalog)
- [ ] "Why Distill?" section with before/after token savings table
- [ ] Quick start: `npx distill-mcp` + `claude mcp add distill -- npx distill-mcp`
- [ ] SDK example showing code_execute batching
- [ ] Remove all references to lazy/core/all modes, discover_tools, browse_tools
- [ ] Update token overhead table (3 tools, ~2000 tokens)
- [ ] All code examples are accurate and runnable

### US-014: Update web app landing page
**As a** visitor, **I want** accurate information on the landing page **so that** I trust the product.

**Priority:** P2 | **Size:** M (3) | **Dependencies:** US-013

- [ ] Update hero section stats (3 tools, not 21+)
- [ ] Update feature cards to match 3 tools
- [ ] Fix JSON-LD softwareVersion (currently hardcoded "0.7.1")
- [ ] Update or remove documentation pages referencing deleted tools
- [ ] All links work (no 404s to deleted tool docs)

### US-015: Update CLAUDE.md with Phase 2 changes
**As a** Claude Code agent working in this repo, **I want** accurate documentation **so that** I make correct decisions.

**Priority:** P1 | **Size:** XS (1) | **Dependencies:** US-006, US-008

- [ ] Document server instructions field
- [ ] Document maxResultSizeChars approach
- [ ] Document structuredContent response pattern
- [ ] Document that outputSchema is intentionally omitted from tools/list

---

## Dependency Map

```
US-101 (auto_optimize desc) ──┐
US-002 (smart_file_read desc) ├──> US-004 (remove outputSchema) ──> US-005 (maxResultSizeChars)
US-003 (code_execute desc)  ──┘              │
                                              ├──> US-007 (structuredContent)
US-006 (server instructions) ──> US-008 (_meta fields) ──> US-015 (CLAUDE.md)
                                              
US-009 (git.test fix) ── independent

US-101 ──> US-010 (auto_optimize tests)
US-002 ──> US-011 (smart_file_read tests)
US-003 ──> US-012 (code_execute tests)

US-101 + US-002 + US-003 ──> US-013 (README) ──> US-014 (web app)
```

## Quality Gates

| Gate | Command | Pass Criteria |
|------|---------|---------------|
| Build | `bun run build` | 0 errors |
| Type-check | `bun run check-types` | 0 type errors |
| Tests | `cd packages/mcp-server && bun run test` | 100% suites pass, 100% tests pass |
| Lint | `bun run lint` | 0 errors |
| Description length | `tool.description.length` per tool | All < 2048 chars |
| Tool name length | `"mcp__distill__" + tool.name` | All < 64 chars |
| Instructions length | `server.instructions.length` | < 2048 chars |
| No outputSchema in tools/list | Connect and call tools/list | No `outputSchema` field on any tool |
| structuredContent valid | Call each tool, parse structuredContent | Valid JSON, matches expected shape |

## Files to Modify

### EP-001 (Descriptions & Schema)
- `packages/mcp-server/src/tools/auto-optimize.ts` — description, inputSchema, annotations
- `packages/mcp-server/src/tools/smart-file-read.ts` — description, inputSchema, annotations
- `packages/mcp-server/src/tools/code-execute.ts` — description, inputSchema, annotations
- `packages/mcp-server/src/tools/registry.ts` — exclude outputSchema from getToolDefinitions()

### EP-002 (Server Infrastructure)
- `packages/mcp-server/src/server.ts` — instructions field, _meta optimization, structuredContent

### EP-003 (Testing)
- `packages/mcp-server/src/sandbox/sdk/git.ts` — fix sanitizeGitArg
- `packages/mcp-server/src/sandbox/sdk/git.test.ts` — fix assertions
- New test files for each tool

### EP-004 (Documentation)
- `README.md` — full rewrite
- `CLAUDE.md` — update with Phase 2 changes
- `apps/web/src/components/marketing/HeroSection.tsx` — stats update
- `apps/web/src/components/marketing/Stats.tsx` — feature cards
- `apps/web/src/components/JsonLd.tsx` — softwareVersion fix

## Files NOT to Modify

- `src/ast/` — AST parsers are correct, no changes needed
- `src/compressors/` — Compression engines are correct
- `src/sandbox/` (except git.ts fix) — Sandbox security layers unchanged
- `src/parsers/` — Build output parsers unchanged
- `src/summarizers/` — Log summarizers unchanged
- `src/utils/token-counter.ts` — Token counting unchanged
- `src/middleware/` — Logging middleware unchanged

## Glossary

| Term | Definition |
|------|-----------|
| `alwaysLoad` | `_meta['anthropic/alwaysLoad']` — Claude Code internal field (undocumented in MCP spec) that bypasses deferred tool loading |
| `searchHint` | `_meta['anthropic/searchHint']` — keyword string Claude Code's ToolSearch uses for discovery |
| `maxResultSizeChars` | Tool property controlling when Claude Code persists results to disk (default: 50K chars) |
| `structuredContent` | MCP 2025-06-18 JSON response alongside text `content` — enables programmatic processing |
| `outputSchema` | JSON Schema on tool definition — **intentionally omitted** from tools/list to avoid Issue #25081 |
| `annotations` | MCP 2025-06-18 tool hints: readOnlyHint, destructiveHint, idempotentHint, title |
| `isConcurrencySafe` | Claude Code property derived from `readOnlyHint` — enables parallel tool execution |

[/PRD]
