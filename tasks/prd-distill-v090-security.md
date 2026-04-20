[PRD]

# PRD: Distill v0.9.0 — Security & Claude Code Integration Overhaul

## Changelog

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2025-04-05 | ArthurDEV44 + Claude | Initial draft from 11-agent deep audit (983K tokens, 498 tool calls across Claude Code + Distill codebases) |

## Problem Statement

After a deep audit of both the Claude Code source code (~1900 files) and the Distill codebase (~200 files), three categories of critical issues were identified:

1. **Security vulnerability in `code_execute` sandbox**: The default execution mode uses `new Function("ctx", code)` (no process isolation) instead of QuickJS WASM. The 17 regex patterns in the static analyzer are the only defense. Known bypass vectors include infinite synchronous loops (warned but not blocked), prototype chain access, and `arguments.callee.caller` stack climbing. This affects every user running `code_execute` without explicitly setting `DISTILL_USE_QUICKJS=true`.

2. **Output size mismatch with Claude Code thresholds**: Claude Code persists tool results > 50,000 chars to disk, showing only a 2KB preview to the model. Distill's `auto_optimize` and `smart_file_read` have no output size cap — compressed results of 60-80K chars defeat the purpose of compression by getting persisted to disk. Additionally, parallel tool results exceeding 200K chars aggregate are force-persisted, and MCP tool results are excluded from Claude Code's micro-compact cleanup (unlike built-in tools like Read/Bash).

3. **Incomplete MCP annotation compliance**: `openWorldHint` is absent from the `ToolAnnotations` interface entirely. `destructiveHint` is typed but never set. The MCP 2025-03-26 spec defaults are `destructiveHint: true` and `openWorldHint: true` (assume worst case) — meaning Claude Code treats Distill's tools as destructive and open-world by default, triggering unnecessary confirmation dialogs and trust-boundary warnings.

**Why now:** Distill v1.0 (the "3 tools, zero friction" refactor from prd-distill-v1.md) is complete. Before promoting to stable, these security and integration issues must be resolved. The audit also revealed that the CLAUDE.md documentation contains an incorrect autocompact threshold (states "~87%" but the actual value is 83.5% for 200K models), which affects compression strategy decisions.

## Overview

Distill v0.9.0 is a hardening release that addresses security vulnerabilities, aligns with Claude Code's internal behavior, and ensures MCP spec compliance. No new user-facing features — only correctness, safety, and integration quality.

The release has 5 epics: (1) sandbox security hardening — QuickJS as default, git write blocklist, `ctx.pipe` port; (2) output size integration — 45K char cap with intelligent re-compression; (3) MCP annotation compliance — all 4 hints per spec; (4) internal cleanup — tiktoken singleton, semantic compressor fix, dead code removal; (5) test coverage — TypeScript AST parser, MCP integration, compression regression.

Key architectural decision: QuickJS WASM becomes the default execution mode for `code_execute`. The legacy `new Function()` path remains available via `DISTILL_LEGACY_EXECUTOR=true` for development/debugging only, with a startup warning.

## Goals

| Goal | Month-1 Target | Month-6 Target |
|------|---------------|----------------|
| Zero sandbox escape vectors in default mode | QuickJS default, all known bypasses closed | No reported security incidents |
| Tool results never trigger Claude Code disk persistence | 100% of outputs < 45K chars | Maintain with new compression strategies |
| MCP annotation spec compliance (2025-03-26) | All 4 hints set on all 3 tools | Track spec updates, adapt within 2 weeks |
| Test coverage for critical paths | TS parser + MCP integration + compression regression | 90%+ line coverage on `src/` |

## Target Users

### Claude Code Developer (Primary)
- **Role:** Software developer using Claude Code as their AI coding assistant with Distill MCP server installed
- **Behaviors:** Uses `auto_optimize` for build/test output compression, `smart_file_read` for code navigation, `code_execute` for batched operations. Runs in terminal with Claude Code CLI.
- **Pain points:** Compressed output sometimes gets persisted to disk by Claude Code (only 2KB preview visible), defeating compression. `code_execute` scripts may behave unexpectedly (infinite loops hang server). No visibility into why compression was bypassed.
- **Current workaround:** Manually re-runs compression with smaller chunks. Kills MCP server process on hang.
- **Success looks like:** Compression always stays in-context (never disk-persisted). `code_execute` reliably terminates. Tool annotations correctly classify security behavior.

### Distill Contributor (Secondary)
- **Role:** Open-source contributor to the Distill MCP server
- **Behaviors:** Reads CLAUDE.md for architecture guidance, runs test suite, submits PRs
- **Pain points:** CLAUDE.md documents incorrect thresholds. TypeScript AST parser (most-used code path) has zero unit tests. No integration tests for the MCP wire protocol.
- **Current workaround:** Relies on `smart-file-read.test.ts` to indirectly test TS parser.
- **Success looks like:** Accurate documentation. Comprehensive test coverage on critical paths. Clear separation of security layers.

## Research Findings

Key findings from the deep audit (11 agents, 983K tokens) and web research:

### Claude Code Internals (from source code audit)
- **Autocompact threshold:** `effectiveContextWindow - 13,000 tokens` = 167K tokens for 200K models (83.5%, not 87%)
- **Micro-compact whitelist:** Only built-in tools (Read, Bash, Grep, Glob, WebSearch, WebFetch, Edit, Write) — MCP tools excluded
- **Tool result persistence:** `DEFAULT_MAX_RESULT_SIZE_CHARS = 50,000` with 2KB preview. Per-message budget: 200K chars aggregate
- **MCP tool annotations used:** `readOnlyHint` → `isConcurrencySafe()` + `isReadOnly()`, `destructiveHint` → `isDestructive()`, `openWorldHint` → `isOpenWorld()`, `annotations.title` → UI display
- **structuredContent:** Propagated to model via `inferCompactSchema()`. Visible in disk-persisted result previews.
- **Token estimation:** `roughTokenCountEstimation = chars / 4` (same as Distill's fallback)

### MCP Spec Compliance (from web research)
- **MCP 2025-03-26 annotations:** `destructiveHint` defaults `true`, `openWorldHint` defaults `true` — assume worst case unless explicitly set to `false`
- **OWASP MCP Top 10:** Command injection (#5), path traversal (22% of audited servers), prompt injection via tool output
- **Best practice:** `execFileSync` over `execSync` (Distill does this), Unicode sanitization on outputs, explicit annotation of all tool behaviors

### Sandbox Landscape (from web research)
- **QuickJS WASM:** No public CVEs for `@sebastianwessel/quickjs`. v3.0 (July 2025) improved security model. WASM boundary provides memory isolation.
- **`new Function()` risks:** Same-process execution, no memory isolation, event loop shared. Infinite synchronous loops block the entire server.
- **Alternatives:** isolated-vm (V8 isolates, stronger but no TS transpilation), Deno subprocess (heavier), vm2 (resurrected but historical CVEs)

*Full research sources available in the web research agent output.*

## Assumptions & Constraints

### Assumptions (to validate)
- QuickJS WASM initialization adds < 500ms cold-start latency per session (acceptable for MCP server lifecycle)
- The 45K char output cap covers 99%+ of real-world compression results (based on typical compression ratios of 40-95%)
- Porting `ctx.pipe` fluent builder to QuickJS guest SDK is feasible without major architectural changes
- Claude Code's `inferCompactSchema()` on `structuredContent` produces useful metadata for the model

### Hard Constraints
- Must maintain backward compatibility with existing `code_execute` scripts (no breaking SDK API changes)
- Must work with `web-tree-sitter` pinned at `0.22.6` (do not upgrade)
- Must keep ES Modules with `.js` extensions on all local imports
- Must pass existing 857 test cases without regression
- `DISTILL_USE_QUICKJS` env var must continue to work (but semantics inverted: now opt-out instead of opt-in)

## Quality Gates

These commands must pass for every user story:

- `cd packages/mcp-server && bun run check-types` — TypeScript type checking
- `cd packages/mcp-server && bun run lint` — ESLint
- `cd packages/mcp-server && bun run test` — Full vitest suite (857+ test cases)
- `cd packages/mcp-server && bun run test:coverage` — V8 coverage report (verify new code covered)

## Epics & User Stories

### EP-001: Sandbox Security Hardening

Harden the `code_execute` tool's sandbox to eliminate known escape vectors and align with OWASP MCP security best practices. This is the highest-priority epic — security fixes ship first.

**Definition of Done:** QuickJS is the default execution mode. All known bypass vectors (infinite loops, git write commands, prototype chain) are closed. `ctx.pipe` works in both modes.

#### US-001: Make QuickJS the default sandbox execution mode
**Description:** As a Claude Code developer, I want `code_execute` to use QuickJS WASM isolation by default so that model-generated code cannot escape the sandbox.

**Priority:** P0
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `executor.ts` defaults to QuickJS mode (invert the `USE_QUICKJS` check)
- [ ] New env var `DISTILL_LEGACY_EXECUTOR=true` enables the `new Function()` path
- [ ] Old env var `DISTILL_USE_QUICKJS` continues to work (mapped to new semantics) with deprecation warning on stderr
- [ ] Startup log message indicates which executor mode is active
- [ ] All existing `code_execute` tests pass in QuickJS mode
- [ ] Given a `while(true){}` infinite loop, when executed in default mode, then the sandbox terminates within `timeout` ms (not hang the server)

#### US-002: Port `ctx.pipe` fluent builder to QuickJS guest SDK
**Description:** As a Claude Code developer, I want `ctx.pipe` to work in QuickJS mode so that existing `code_execute` scripts using the fluent pipeline API don't break.

**Priority:** P0
**Size:** L (5 pts)
**Dependencies:** Blocked by US-001

**Acceptance Criteria:**
- [ ] `generateGuestSDKCode()` in `runtime.ts` includes `ctx.pipe` bindings
- [ ] `ctx.pipe.glob().filter().read().compress()` chain works identically in QuickJS and legacy modes
- [ ] Given a script using `ctx.pipe`, when executed in QuickJS mode, then output matches legacy mode output
- [ ] Given a script using `ctx.pipe` with an invalid step, when executed, then a clear error message is returned (not a silent failure)

#### US-003: Expand git command blocklist to include write operations
**Description:** As a security-conscious user, I want `code_execute` sandbox to prevent git write operations so that model-generated code cannot rewrite local git history.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `BLOCKED_GIT_COMMANDS` in `sdk/git.ts` includes: `commit`, `add`, `reset`, `checkout`, `rm`, `merge`, `rebase`, `stash drop`, `stash pop`, `cherry-pick`, `revert`, `clean`
- [ ] Existing read-only commands (`diff`, `log`, `blame`, `status`, `branch`, `show`, `tag`, `stash list`, `stash show`, `rev-parse`) remain allowed
- [ ] Given `ctx.git.log()` call, when executed, then it succeeds
- [ ] Given a code snippet that calls git with a blocked command via any SDK path, when executed, then it returns an error containing "blocked" and the command name

#### US-004: Block `while(true)` and `for(;;)` in static analyzer
**Description:** As a security-conscious user, I want infinite loop patterns to be blocked (not just warned) in the static code analyzer so that a malicious script cannot hang the server in legacy mode.

**Priority:** P1
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `BLOCKED_PATTERNS` in `code-analyzer.ts` includes `while(true)`, `while (true)`, `for(;;)`, `for (;;)` as blocked (not warning)
- [ ] Given code containing `while(true){}`, when analyzed, then `analysis.safe` is `false` with `blockedPatterns` containing the match
- [ ] Given code containing a legitimate `while(condition)` loop, when analyzed, then it passes

#### US-005: Add warning when legacy executor is active
**Description:** As a Distill operator, I want a visible warning when the legacy `new Function()` executor is active so that I know the sandbox provides limited isolation.

**Priority:** P1
**Size:** XS (1 pt)
**Dependencies:** Blocked by US-001

**Acceptance Criteria:**
- [ ] When `DISTILL_LEGACY_EXECUTOR=true`, a warning is logged to stderr at server startup: `"[distill] WARNING: Legacy executor active (new Function). Limited isolation. Set DISTILL_LEGACY_EXECUTOR=false for QuickJS WASM sandbox."`
- [ ] When `DISTILL_USE_QUICKJS=false` (deprecated), a deprecation notice is logged: `"[distill] DEPRECATED: DISTILL_USE_QUICKJS is deprecated. Use DISTILL_LEGACY_EXECUTOR=true instead."`
- [ ] Given default configuration (no env vars), when server starts, then no warning is logged (QuickJS is default)

---

### EP-002: Claude Code Output Integration

Ensure Distill's tool outputs never trigger Claude Code's disk persistence mechanism, and enrich `structuredContent` with metadata the model can exploit.

**Definition of Done:** All 3 tools produce outputs < 45K chars. `structuredContent` includes output size and truncation metadata. CLAUDE.md threshold corrected.

#### US-006: Add output budget cap to `auto_optimize`
**Description:** As a Claude Code developer, I want `auto_optimize` results to stay under 45,000 characters so that Claude Code never persists them to disk (50K threshold).

**Priority:** P0
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Constant `MAX_OUTPUT_CHARS = 45_000` defined in a shared constants file
- [ ] After compression, if output > `MAX_OUTPUT_CHARS`: re-compress with `aggressive: true` and `targetRatio: 0.2`
- [ ] If still over budget after aggressive re-compression: truncate with `\n\n[... {N} chars truncated. Original: {path_or_size}. Use auto_optimize with smaller chunks.]`
- [ ] `structuredContent` includes `outputChars: number` and `truncated: boolean`
- [ ] Given a 200K char build log, when compressed, then output is < 45,000 chars
- [ ] Given a 500 char input (below threshold), when processed, then no cap logic runs

#### US-007: Add output budget cap to `smart_file_read`
**Description:** As a Claude Code developer, I want `smart_file_read` results to stay under 45,000 characters so that large file skeletons/extracts aren't persisted to disk.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Modes `skeleton`, `extract`, `search`, `full` respect `MAX_OUTPUT_CHARS`
- [ ] Mode `lines` is exempt from the cap (raw content, user explicitly requested specific lines)
- [ ] If output exceeds cap: truncate with element count annotation `[... showing {N}/{total} elements. Use extract mode for specific elements.]`
- [ ] `structuredContent` includes `outputChars: number` and `truncated: boolean`
- [ ] Given a 10,000-line file in `skeleton` mode, when read, then output is < 45,000 chars
- [ ] Given a `lines: {start: 1, end: 50}` request, when read, then the cap is not applied

#### US-008: Enrich `structuredContent` with compression metadata
**Description:** As a Claude Code developer, I want `structuredContent` to include output size and compression quality metrics so that Claude can make informed decisions about re-compression or caching.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** Blocked by US-006

**Acceptance Criteria:**
- [ ] `auto_optimize` structuredContent adds: `outputChars` (number), `truncated` (boolean), `compressionRatio` (number, 0-1)
- [ ] `smart_file_read` structuredContent adds: `outputChars` (number), `truncated` (boolean), `elementCount` (number, count of functions/classes/etc found)
- [ ] `code_execute` structuredContent adds: `sandboxMode` ("quickjs" | "legacy")
- [ ] Given any tool call, when `structuredContent` is returned, then `outputChars` matches `content[0].text.length`

#### US-009: Correct CLAUDE.md autocompact threshold documentation
**Description:** As a Distill contributor, I want CLAUDE.md to document the correct autocompact threshold so that compression strategy decisions are based on accurate data.

**Priority:** P0
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] CLAUDE.md states the correct formula: `effectiveContextWindow - 13,000 tokens` with example: `(200K - 20K reserved) - 13K = 167K tokens (83.5%)`
- [ ] For 1M context: `(1M - 20K) - 13K = 967K tokens`
- [ ] Reference to "~87%" is replaced with the correct values
- [ ] Given a reader checking the threshold, when they read CLAUDE.md, then they find the correct formula with examples for both 200K and 1M models

---

### EP-003: MCP Annotation Compliance

Align all 3 tool annotations with the MCP 2025-03-26 specification. Ensures Claude Code correctly classifies tools for parallel execution, security dialogs, and retry behavior.

**Definition of Done:** All 4 annotation hints explicitly set on all 3 tools. `ToolAnnotations` interface includes `openWorldHint`.

#### US-010: Add `openWorldHint` to ToolAnnotations interface and set all annotations
**Description:** As a Claude Code integration, I want all MCP annotation hints explicitly set on every Distill tool so that Claude Code correctly classifies tool behavior.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `ToolAnnotations` interface in `registry.ts` adds `openWorldHint?: boolean`
- [ ] `auto_optimize` annotations: `{ title: "Auto Optimize", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
- [ ] `smart_file_read` annotations: `{ title: "Smart File Read", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }`
- [ ] `code_execute` annotations: `{ title: "Code Execute", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false, longRunningHint: true }`
- [ ] Given Claude Code reading tool annotations, when it checks `readOnlyHint` on `auto_optimize`, then it returns `true` (enabling parallel execution)

#### US-011: Remove dead `maxResultSizeChars` from `_meta` and document why
**Description:** As a Distill contributor, I want the non-functional `maxResultSizeChars: 100_000` removed from `_meta` so that the codebase doesn't contain misleading declarations.

**Priority:** P1
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `server.ts` no longer sets `maxResultSizeChars` in `_meta`
- [ ] Comment in `server.ts` explains: Claude Code clamps to 50K via `DEFAULT_MAX_RESULT_SIZE_CHARS` and reads from top-level Tool object (not `_meta`), so this field has no effect
- [ ] Given the `tools/list` response, when inspected, then `_meta` contains only `anthropic/alwaysLoad` and `anthropic/searchHint`

---

### EP-004: Internal Quality & Cleanup

Fix internal issues that affect compression quality, memory usage, and code maintainability. No user-facing behavior change.

**Definition of Done:** Tiktoken singleton centralized. Semantic compressor handles dense content. Dead code removed. Server instructions enriched.

#### US-012: Centralize tiktoken encoder to single singleton
**Description:** As a Distill contributor, I want a single tiktoken encoder instance shared across all modules so that we don't waste memory on 4 duplicate encoder allocations.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `compressors/generic.ts`, `compressors/logs.ts`, `compressors/stacktrace.ts` import `countTokens` from `utils/token-counter.ts` instead of creating local `encodingForModel("gpt-4")` instances
- [ ] Module-level `const encoding = encodingForModel(...)` removed from all 3 compressor files
- [ ] Given server startup, when memory is profiled, then only 1 tiktoken encoder instance exists
- [ ] All existing compression tests pass without behavior change

#### US-013: Fix semantic compressor no-op on content without blank lines
**Description:** As a Claude Code developer, I want `auto_optimize` with `semantic` strategy to actually compress dense content (no blank lines) instead of silently returning the original unchanged.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] When content has `<= 1` blank-line segments, fall back to fixed-size line-based segmentation (e.g., 10 lines per segment)
- [ ] `structuredContent.method` indicates `"semantic-line-fallback"` when the fallback is used
- [ ] Given minified JSON (no blank lines), when compressed with semantic strategy, then `savingsPercent > 0`
- [ ] Given content with normal blank-line separation, when compressed, then behavior is unchanged from current

#### US-014: Remove dead `detectPipelineContentType` and `PIPELINE_DEFINITIONS`
**Description:** As a Distill contributor, I want unused pipeline definitions removed so that the codebase doesn't contain dead code paths that confuse new contributors.

**Priority:** P2
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `PIPELINE_DEFINITIONS` constant removed from `pipelines/definitions.ts`
- [ ] `detectPipelineContentType()` function removed
- [ ] `PipelineContentType` type removed
- [ ] No remaining imports of these symbols anywhere in `src/`
- [ ] Given a grep for `PIPELINE_DEFINITIONS`, when searched, then zero results
- [ ] Build detection logic in `auto_optimize` (`isBuildOutput()`, `isDiffOutput()`) is unaffected

#### US-015: Enrich server `instructions` with usage guidance
**Description:** As a Claude Code model, I want the MCP server instructions to include specific usage guidance so that I use Distill tools optimally without needing CLAUDE.md.

**Priority:** P2
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Server `instructions` field updated with additional guidance (total must stay under 2048 chars)
- [ ] Includes: "Prefer smart_file_read over Read for TS/JS/Python/Go/Rust/PHP/Swift — saves ~60% tokens"
- [ ] Includes: "Always pipe build/test output through auto_optimize — saves 80-95% tokens"
- [ ] Includes: "code_execute batches 5-10 tool calls into 1, saving ~500 tokens overhead per avoided call"
- [ ] Given the total instructions length, when measured, then it is < 2048 characters

---

### EP-005: Test Coverage Gaps

Add tests for critical untested paths identified by the audit. Focus on the TypeScript AST parser (most-used, 0 tests), MCP integration (0 tests), and compression regression.

**Definition of Done:** TypeScript parser has dedicated unit tests. MCP server has integration tests. Compression ratios have regression floors.

#### US-016: Add TypeScript AST parser unit tests
**Description:** As a Distill contributor, I want dedicated unit tests for `ast/typescript/parser.ts` so that the most-used code path (1,324 lines) has direct test coverage for edge cases.

**Priority:** P1
**Size:** L (5 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] New file `ast/typescript/parser.test.ts` with 40+ test cases
- [ ] Tests cover: generics (`<T extends Foo>`), decorators (`@Component`), namespace declarations, conditional types, overloaded function signatures, `satisfies` operator, computed property names, ambient declarations (`declare module`)
- [ ] Tests cover arrow functions at module level, re-exports, `export default` expressions
- [ ] Given a TypeScript file with complex generics, when parsed, then all type parameters appear in signatures
- [ ] Given a file with decorators, when parsed, then decorator names appear in element metadata

#### US-017: Add MCP server integration tests
**Description:** As a Distill contributor, I want integration tests that verify the MCP wire protocol so that tool registration, `_meta`, and response format are validated end-to-end.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] New file `server.test.ts` with 15+ test cases
- [ ] Tests verify: `tools/list` returns exactly 3 tools with correct names
- [ ] Tests verify: `_meta['anthropic/alwaysLoad']` is `true` on all 3 tools
- [ ] Tests verify: `_meta['anthropic/searchHint']` is a non-empty string on all 3 tools
- [ ] Tests verify: `outputSchema` is NOT present in `tools/list` response (Issue #25081 workaround)
- [ ] Tests verify: `annotations` are present on all 3 tools with correct values
- [ ] Tests verify: `tools/call` with valid args returns `content` array + `structuredContent`
- [ ] Given a `tools/call` for an unknown tool, when invoked, then `isError: true` is returned

#### US-018: Add compression ratio regression tests
**Description:** As a Distill contributor, I want minimum compression ratio assertions so that a compressor regression is caught before release.

**Priority:** P2
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] New test file or section in `auto-optimize.test.ts` with floor assertions
- [ ] Build output (1000+ lines): `savingsPercent >= 70`
- [ ] Log output (500+ lines with patterns): `savingsPercent >= 50`
- [ ] Stacktrace with duplicates: `savingsPercent >= 40`
- [ ] Git diff (100+ lines): `savingsPercent >= 30`
- [ ] Given a future compressor change that degrades quality, when tests run, then the floor assertion fails

## Functional Requirements

- FR-01: The system must use QuickJS WASM sandbox by default for `code_execute` tool execution
- FR-02: The system must cap all tool outputs at 45,000 characters, applying re-compression or truncation when exceeded
- FR-03: The system must set all 4 MCP annotation hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) on every registered tool
- FR-04: The system must block git write commands (`commit`, `add`, `reset`, `checkout`, `rm`, `merge`, `rebase`, `stash drop`, `stash pop`, `cherry-pick`, `revert`, `clean`) in the sandbox
- FR-05: The system must include `outputChars` and `truncated` fields in `structuredContent` for all tool results
- FR-06: The system must NOT break existing `ctx.pipe` usage when switching to QuickJS default

## Non-Functional Requirements

- **Performance:** QuickJS cold-start < 500ms. Warm execution within 2x of legacy mode latency.
- **Memory:** Single tiktoken encoder instance (< 10MB). QuickJS WASM binary loaded once per server lifecycle.
- **Security:** Zero sandbox escape vectors in default mode. All OWASP MCP Top 10 command injection patterns blocked.
- **Compatibility:** All 857 existing tests pass. `DISTILL_USE_QUICKJS` env var continues to work with deprecation notice.
- **Output size:** 100% of tool results < 45,000 characters in default configuration.

## Edge Cases & Error States

| # | Scenario | Trigger | Expected Behavior | User Message |
|---|----------|---------|-------------------|--------------|
| 1 | QuickJS WASM fails to load | Corrupted WASM binary, unsupported platform | Fall back to legacy mode with warning | `"[distill] WARNING: QuickJS WASM failed to load: {error}. Falling back to legacy executor."` |
| 2 | Output exactly at 45K boundary | Compressed content = 44,999 chars + stats header pushes to 45,100 | Stats header counts toward budget; re-compress if total > 45K | No message — transparent re-compression |
| 3 | Concurrent `code_execute` calls writing same file | Two parallel sandbox instances via `ctx.files.write()` | Last-write-wins (no locking in sandbox) | No error — documented as known limitation |
| 4 | Re-compression still exceeds budget | Content is inherently incompressible (binary, base64) | Truncate with clear annotation | `"[... {N} chars truncated. Content is not compressible.]"` |
| 5 | Tree-sitter WASM not initialized on first call | Cold start, sync parse path | Returns empty FileStructure; async warmup fires | File structure appears empty on first call, correct on second |
| 6 | `ctx.pipe` chain with invalid step in QuickJS | Method not available in guest SDK | Clear error with available methods listed | `"Error: ctx.pipe.{method} is not available. Available: glob, filter, read, compress, ..."` |
| 7 | Legacy env var `DISTILL_USE_QUICKJS=false` | User explicitly opts out of QuickJS | Map to `DISTILL_LEGACY_EXECUTOR=true` with deprecation notice | Deprecation warning on stderr |

## Risks & Mitigations

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|------------|
| 1 | QuickJS cold-start latency exceeds 500ms on slow hardware | Low | Medium | Lazy singleton ensures one-time cost. Fallback to legacy if WASM load fails. |
| 2 | `ctx.pipe` port to QuickJS introduces behavioral differences | Medium | High | Comprehensive comparison tests between modes. Run existing tests in both modes. |
| 3 | 45K cap over-compresses legitimately large results | Low | Medium | `lines` mode exempt. `truncated: true` in structuredContent signals the model to use alternative approach. |
| 4 | Blocking `git commit` breaks legitimate automation workflows | Low | Low | Read-only git operations remain available. Users needing write ops use Bash tool directly. |
| 5 | Existing users relying on `DISTILL_USE_QUICKJS=false` silently break | Medium | Medium | Backward-compatible env var mapping with deprecation warning. Document migration. |

## Non-Goals

Explicit boundaries for v0.9.0:

- **No new tools.** This is a hardening release — only the existing 3 tools are modified.
- **No new compression strategies.** Compression quality improvements (e.g., better build detection) are deferred to v1.1.
- **No Claude Code upstream changes.** We don't submit PRs to Claude Code (e.g., adding Distill to `classifyForCollapse`). Integration is one-directional.
- **No `smart_file_read` mode changes.** Adding a `compact` mode for Haiku subagents is deferred to v1.1.
- **No breaking SDK API changes.** All `ctx.*` methods remain backward-compatible.

## Files NOT to Modify

- `packages/shared/` — Shared types used by multiple packages. Changes here affect the web app.
- `packages/ui/` — Vestigial Turborepo starter. Not used by mcp-server.
- `apps/web/` — Next.js landing page / docs site. Independent of mcp-server changes.
- `packages/eslint-config/` — ESLint configs. No changes needed.
- `packages/typescript-config/` — TypeScript presets. No changes needed.
- `packages/mcp-server/src/ast/typescript/parser.ts` — Core TS parser. Only EP-005 tests add coverage; no modifications to the parser itself in this release.

## Technical Considerations

- **QuickJS WASM binary loading:** The `@sebastianwessel/quickjs` v3.0 changed how the WASM module is loaded. Confirm the lazy singleton pattern in `runtime.ts` is compatible with the latest version. Engineering to validate.
- **`ctx.pipe` in QuickJS:** The fluent builder uses `Proxy` for chaining, which may not be available in QuickJS's restricted environment. Alternative: explicit method-chain class without Proxy. Engineering to evaluate.
- **Tiktoken centralization:** Replace module-level `encodingForModel("gpt-4")` in 3 compressor files with imports from `token-counter.ts`. Verify no circular dependency introduced.
- **Output budget enforcement point:** Cap should be applied in `registry.ts:execute()` (after middleware, before return) — not inside each tool. This ensures all tools are covered uniformly. Engineering to confirm this doesn't interfere with middleware.

## Success Metrics

| Metric | Baseline (v0.8.1) | Target (v0.9.0) | Timeframe | How Measured |
|--------|-------------------|-----------------|-----------|-------------|
| Sandbox escape vectors | 4 known (infinite loop, prototype chain, stack climbing, git write) | 0 | Release day | Security test suite |
| Tool results > 50K chars | Unknown (no cap) | 0% | Release day | `structuredContent.outputChars` audit |
| MCP annotation compliance | 2/4 hints set | 4/4 hints on all 3 tools | Release day | `tools/list` integration test |
| Test cases count | 857 | 950+ (93 new) | Release day | `bun run test` output |
| TS parser test coverage | 0 dedicated tests | 40+ unit tests | Release day | `parser.test.ts` count |
| Tiktoken memory usage | 4 encoder instances | 1 encoder instance | Release day | Code review (no module-level instantiations) |

## Open Questions

- **QuickJS `Proxy` support:** Does the QuickJS engine support `Proxy` objects? If not, `ctx.pipe` fluent builder needs a different implementation strategy. Engineering to validate before US-002.
- **Output budget enforcement point:** Should the 45K cap be enforced in `registry.ts` (uniform) or per-tool (flexible)? Per-tool allows `lines` mode exemption naturally. Registry-level requires an opt-out mechanism. Engineering to decide.
- **Deprecation timeline for `DISTILL_USE_QUICKJS`:** How many releases should the backward-compatible mapping persist? Suggest: remove in v1.0 (next major).

[/PRD]
