[PRD]

# PRD: Distill v0.10 — Claude Code Alignment

## Changelog

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-04-21 | ArthurDEV44 + Claude | Initial draft from swarm exploration of `/home/arthur/dev/claude-code/` (5 agent-explore subagents). Corrects 4 documented assumptions proven wrong, removes 2 dead-code paths, and adds 3 new integration vectors (PreCompact hook, MCP prompts, custom agent preset). |

## Problem Statement

A five-agent deep-exploration pass over the full Claude Code CLI source at `/home/arthur/dev/claude-code/` (tools/, services/mcp/, services/compact/, utils/hooks.ts, schemas/) surfaced that **Distill's public documentation and server code encode four concrete misunderstandings of how Claude Code actually consumes MCP tools**, and that **three high-leverage integration points that Distill could exploit are currently unused**. These are not speculative — every finding is grounded at a specific file:line in the Claude Code source.

1. **`CLAUDE.md:50` claims "Tool results > 50K chars are persisted to disk"**. Wrong for MCP tools. `utils/mcpValidation.ts:16` sets `DEFAULT_MAX_MCP_OUTPUT_TOKENS = 25_000` and `services/mcp/client.ts:2720` (`processMCPResult`) applies that threshold in **tokens**, not chars. The 50K-char limit in `constants/toolLimits.ts:13` is for built-in tools only. Distill's 45K-char internal cap still survives the heuristic gate (`length/4` ≤ 12 500 tokens), but the justification in our docs is wrong and maintainers will eventually ship a change based on a fictional constant.

2. **`CLAUDE.md:48` treats "20K reserved tokens" as a constant**. Wrong. `services/compact/autoCompact.ts:33-48` computes `reserved = min(getMaxOutputTokensForModel(model), 20_000)`. For Haiku (max_output = 4 096) the reserved window is 4 096 tokens, not 20 000. A user on Haiku reading our docs will compute a wrong autocompact threshold by ~16K tokens.

3. **`packages/mcp-server/src/server.ts:109-111` populates `structuredContent` on every tool response**. `services/mcp/client.ts:2675-2684` JSON-stringifies it and then `messages.ts:468-516` **excludes `mcpMeta` from the blocks sent to the Anthropic API**. The LLM never sees `structuredContent`. Every Distill response pays bandwidth and serialization cost for a field that dies at the MCP client boundary.

4. **`packages/mcp-server/src/server.ts:66-86` declares a `searchHints` map**. `tools/ToolSearchTool/prompt.ts:112-116` (`formatDeferredToolLine`) renders only the tool name — never the hint. `searchHint` is used exclusively for internal ToolSearch ranking. Distill's tools set `alwaysLoad = true`, so they are **never passed to ToolSearch**. The map is unreachable code that suggests a non-existent mechanism to contributors reading `server.ts`.

5. **Distill ignores the only real post-hoc context lever**. `utils/hooks.ts:3961-4025` dispatches `PreCompact` hooks whose stdout becomes `newCustomInstructions` in the compact-summary prompt (`services/compact/compact.ts:420`). This is the **sole documented way** a third-party can influence Claude Code's autocompact behavior. Distill compresses pre-context but has no voice in post-context compaction.

6. **Distill ignores three zero-overhead UX vectors**: MCP `prompts/list` → slash commands (`services/mcp/client.ts:2043-2096`), `annotations.readOnlyHint: true` → `isConcurrencySafe` parallel execution (`services/mcp/client.ts:1796-1800`), and custom agent markdown files under `~/.claude/agents/` with `requiredMcpServers` gating (`services/AgentSummary/loadAgentsDir.ts:307-312`). All three ship in current Claude Code. None are used by Distill.

**Why now:** v0.9.2 (2026-04-21) closes the pre-v1.0 hardening queue. v1.0 stable is targeted for 2026-06-01. The doc corrections in EP-001 are load-bearing: they affect every maintainer decision about output sizing and every user understanding of compression budgets. Shipping them as part of v1.0 removes the risk of a "why was this constant wrong" thread surfacing in post-release. The new integration vectors (EP-003, EP-004, EP-005) are the last feature set where breaking tolerance is acceptable — post-1.0 we commit to API stability. And all three vectors are low-risk, opt-in, and reversible.

## Overview

Distill v0.10 is a **correctness + native-integration release**. Zero changes to the 3 core tools' contracts (`auto_optimize`, `smart_file_read`, `code_execute`). Zero changes to the sandbox engine, the AST parsers, or the compression algorithms. Six coherent epics:

1. **EP-001 Documentation Correctness** — rewrite the four incorrect claims in `CLAUDE.md` (MCP persistence threshold, autocompact reserved formula, `outputSchema` behavior, plus a consolidated "what we learned from reading Claude Code" appendix with file:line citations).
2. **EP-002 Code Alignment Cleanup** — remove the `structuredContent` branch in `server.ts:109-111`, delete the `searchHints` map in `server.ts:66-86`, add `annotations: { readOnlyHint: true }` to `smart_file_read` for parallel-read optimization.
3. **EP-003 PreCompact Hook Preset** — ship `packages/mcp-server/scripts/precompact-hook.sh` and `distill-mcp setup --install-precompact-hook`. Hook prints guidance ("preserve verbatim any `[DISTILL:COMPRESSED ratio=X]...[/DISTILL:COMPRESSED]` block") to stdout, which Claude Code merges into the compact-summary prompt.
4. **EP-004 MCP Prompts as Slash Commands** — expose three MCP prompts (`compress-session`, `analyze-tokens`, `forget-large-results`) via `prompts/list`. Zero token overhead when unused. Invokable by the user as `/mcp__distill-mcp__compress-session` etc.
5. **EP-005 Custom Agent Preset** — ship `distill-compressor.md` template and `distill-mcp setup --install-agent` subcommand. The agent declares `requiredMcpServers: ["distill-mcp"]`, `disallowedTools: [code_execute]`, and a read-only toolset for compression workflows.
6. **EP-006 MCP Skills R&D Spike** — timeboxed investigation of whether Distill can expose SKILL.md files via the MCP server such that Claude Code loads them with `loadedFrom === 'mcp'` (making them model-invokable via `SkillTool`). Go/no-go deliverable only; any follow-on implementation lands in v0.11.

Key architectural decisions (Phase 3 brainstorm):
- **Correctness via citation, not restatement.** Every doc fix includes the `file:line` reference into `claude-code/` so future maintainers can re-verify against a moving upstream.
- **Marker-based compaction contract.** No MCP metadata protects tool results from autocompact — only LLM-visible text survives. The `[DISTILL:COMPRESSED ratio=X]...[/DISTILL:COMPRESSED]` marker pattern is the only channel, and the PreCompact hook is how we instruct the summarizer to honor it.
- **Opt-in, not default.** All three new integration vectors (PreCompact hook, agent preset, prompts) ship as opt-in setup subcommands, not as side effects of server start. Users who want vanilla Distill keep vanilla Distill.
- **Skills deferred to spike.** MCP-side skill exposure is the highest-upside integration point (model-invokable skills) but the lowest-confidence — the mechanism is inferred from `SkillTool.ts:82-93` but the server-side contract isn't documented publicly. Spike first, commit second.

## Goals

| Goal | Month-1 Target | Month-6 Target |
|------|---------------|----------------|
| Documentation errors corrected (claims mismatching Claude Code source) | 0 in `CLAUDE.md` and `README.md` | 0, with a CI check that grep-validates citations resolve |
| Dead code paths removed from `server.ts` | 2 (`structuredContent` branch, `searchHints` map) | 0 dead paths (verified by knip + manual audit) |
| Native Claude Code annotations applied where applicable | `readOnlyHint` on `smart_file_read` | All 3 tools have complete `annotations` (title, readOnly/open-world hints) |
| Setup-installable integration presets shipped | 2 (PreCompact hook, agent preset) | 3+ (add MCP skill preset if EP-006 spike succeeds) |
| MCP prompts exposed as slash commands | 3 | 3-5 (expand based on user signal) |

## Target Users

### Distill Maintainers

- **Role:** Contributors reading `server.ts` and `CLAUDE.md` to onboard or extend.
- **Behaviors:** Trust `CLAUDE.md` as ground truth for "how Claude Code actually works". Assume comments in `server.ts` reflect reality.
- **Pain points:** Current docs conflate "built-in tool 50K-char cap" with "MCP 25K-token cap". A contributor sizing a new tool output budget from `CLAUDE.md:50` will land on the wrong number. The `searchHints` map in `server.ts:66-86` implies a discovery mechanism that doesn't apply to `alwaysLoad` tools — wasted cognitive load on every file read.
- **Current workaround:** Read the actual Claude Code source on each non-trivial decision. Slow, and not everyone does it.
- **Success looks like:** Every claim in `CLAUDE.md` is citation-linked to `claude-code/<file>:<line>` so re-verification is a single grep.

### Claude Code End Users (Distill Consumers)

- **Role:** Developers using Claude Code with Distill connected. Many use Haiku for cheap tasks and Opus for heavy work.
- **Behaviors:** Read Distill's README to decide when to reach for `auto_optimize`. Rarely read CC internals.
- **Pain points:** Haiku users with `max_output = 4 096` computing autocompact thresholds from our docs get a number ~16K tokens wrong. Users hitting large tool results never realize Distill can't protect its own compressed outputs from autocompact without an explicit PreCompact hook. Power users would benefit from `/mcp__distill-mcp__compress-session` but it doesn't exist.
- **Current workaround:** For autocompact: accept that Claude Code will re-summarize Distill's compressed outputs on its own terms. For workflow: manually prompt "please call auto_optimize on the previous build log".
- **Success looks like:** `distill-mcp setup` installs a PreCompact hook that preserves Distill-compressed regions; `/mcp__distill-mcp__compress-session` one-shot replaces the manual prompt; `@distill-compressor` custom agent is available for delegation.

## Research Findings

Full swarm report is preserved in conversation context; this PRD excerpts the findings that shaped each epic. Every claim below resolves to a `claude-code/<path>:<line>` citation.

### Competitive Context

Distill occupies a unique niche (pre-context compression for Claude Code). There is **no direct competitor** — related tools (e.g., `tiktoken`-based counters, log summarizers) operate inside ad-hoc scripts or editor plugins, not inside the MCP surface Claude Code consumes. The competitive analysis therefore focuses on **first-party alignment**: does Distill look like a native Claude Code primitive, or does it look like a foreign component bolted on? Every finding in EP-001 through EP-005 pushes Distill toward "feels native".

### Key Mechanisms Discovered (with citations)

- **MCP tool persistence threshold**: tokens, not chars. `utils/mcpValidation.ts:16` → `DEFAULT_MAX_MCP_OUTPUT_TOKENS = 25_000`. API call gated by `roughTokenCountEstimation = length / 4` heuristic (~12 500 tokens ≈ 50K chars).
- **Autocompact formula**: `effectiveContextWindow - 13_000` where `effectiveContextWindow = contextWindow - min(maxOutputTokens, 20_000)` — `services/compact/autoCompact.ts:33-76`, `AUTOCOMPACT_BUFFER_TOKENS = 13_000`.
- **`structuredContent` terminates at MCP client**: `services/mcp/client.ts:2675-2684` (JSON.stringify then stored in `mcpMeta`), `messages.ts:468-516` (`mcpMeta` not included in API blocks).
- **`searchHint` invisible to model**: `tools/ToolSearchTool/ToolSearchTool.ts:283-285` (scoring only), `tools/ToolSearchTool/prompt.ts:112-116` (`formatDeferredToolLine` renders name only).
- **`alwaysLoad` semantics**: `services/mcp/client.ts:1785` (reads `_meta['anthropic/alwaysLoad']`), `tools/ToolSearchTool/prompt.ts:62-65` (bypasses ToolSearch deferral when true).
- **PreCompact hook**: `utils/hooks.ts:3961-4025` (`executePreCompactHooks`), `services/compact/compact.ts:420` (stdout merged as `newCustomInstructions` into summary prompt).
- **MCP prompts → slash commands**: `services/mcp/client.ts:2043-2096` (`prompts/list` handler), naming convention `mcp__<server>__<prompt>`.
- **Custom agent loading**: `services/AgentSummary/loadAgentsDir.ts:307-312`, gating fields `requiredMcpServers: string[]` and `disallowedTools: string[]` (`loadAgentsDir.ts:107-108, 229-241`).
- **`annotations.readOnlyHint`**: `services/mcp/client.ts:1796-1800` — mapped to `isConcurrencySafe` / `isReadOnly` on the internal Tool record, enables parallel execution.
- **MCP skills**: `tools/SkillTool/SkillTool.ts:82-93` — skills with `loadedFrom === 'mcp'` appear in the skill menu as model-invokable. Server-side contract undocumented publicly (hence spike).

### Best Practices Applied

- **Citation-first documentation** — every correction in EP-001 is a replacement of a vague assertion with a `file:line` citation, enabling re-verification against a moving upstream.
- **Marker-based compaction contracts** — since no MCP metadata protects tool results from autocompact, the marker `[DISTILL:COMPRESSED ratio=X]...[/DISTILL:COMPRESSED]` is the only channel; EP-003 pairs it with a PreCompact hook that instructs the summarizer.
- **Opt-in integration surfaces** — all three new vectors (hook, agent, prompts) ship as explicit setup subcommands, not as default server behavior, preserving backwards compatibility for existing integrators.

*Full file-by-file mapping of the exploration lives in the conversation record and in the teamlead synthesis shipped alongside this PRD.*

## Assumptions & Constraints

### Assumptions (to validate)

- **A1** — The PreCompact hook mechanism is stable across Claude Code versions currently shipped (verified at `utils/hooks.ts:3961-4025` in the source copy at `/home/arthur/dev/claude-code/`). **Evidence:** direct read of the hook dispatch logic. **Risk if wrong:** EP-003 becomes no-op on older Claude Code installs; setup must detect and skip-with-warning.
- **A2** — Claude Code's compact-summary LLM will honor a `PreCompact`-injected instruction that says "preserve verbatim any `[DISTILL:COMPRESSED …]` block". **Evidence:** `services/compact/compact.ts:420` (`mergeHookInstructions`) confirms the instruction reaches the LLM; the LLM's compliance is a behavioral bet, not a guaranteed contract. **Risk if wrong:** marker preservation is best-effort, compression-value retention degrades during compaction.
- **A3** — Custom agents loaded from `~/.claude/agents/*.md` with `requiredMcpServers: ["distill-mcp"]` are gated out of the agent list when Distill isn't connected (`loadAgentsDir.ts:229-241`). **Evidence:** code read. **Risk if wrong:** users see a dangling "distill-compressor" agent that fails on invocation — acceptable degradation.
- **A4** — MCP `prompts/list` → slash command exposure works for the current `@modelcontextprotocol/sdk` version Distill uses. **Evidence:** Claude Code reads prompts at connect (`services/mcp/client.ts:2043-2096`); our SDK version should support the capability. **Risk if wrong:** EP-004 requires an SDK upgrade, which is in-scope.

### Hard Constraints

- **C1** — Must not regress v0.9.2 coverage floors: Lines 70%, Branches 56%, Functions 70%, Statements 69% (`vitest.config.ts`). Floors ratchet up only.
- **C2** — Must not change the signatures or output shapes of `auto_optimize`, `smart_file_read`, `code_execute`. Any marker insertion must remain backwards-compatible (opt-in via flag or environment variable).
- **C3** — Must use `bun` / `bunx` only (enforced by `enforce-bun.sh` hook in `~/.claude/settings.json`). No `npm` / `pnpm` / `yarn` / `npx`.
- **C4** — All shell scripts must be POSIX-compliant (`sh`, not `bash`-only) to run on macOS/Linux without runtime deps.
- **C5** — Setup subcommands must be idempotent and atomic — no partial writes to `~/.claude/settings.json` on interrupt.
- **C6** — v0.10 ships before v1.0 (target 2026-06-01). Scope cap: 17 stories, no story > L (5 pts).

## Quality Gates

These commands must pass for every user story:

- `bun install` — workspace install
- `bun run build` — turbo build across packages
- `bun run lint` — ESLint across packages
- `bun run check-types` — TypeScript strict check
- `cd packages/mcp-server && bun run test` — vitest suite
- `cd packages/mcp-server && bun run test:coverage` — must meet v0.9.2 floors (Lines 70%, Branches 56%, Functions 70%, Statements 69%)

For stories adding new shell scripts (EP-003, EP-005):
- `shellcheck packages/mcp-server/scripts/*.sh` — static analysis

For documentation stories (EP-001, EP-004, EP-005, EP-007):
- Manual visual verification that every `claude-code/<path>:<line>` citation resolves in `/home/arthur/dev/claude-code/`

## Epics & User Stories

### EP-001: Documentation Correctness

Realign `CLAUDE.md`, `README.md`, and `packages/mcp-server/README.md` with Claude Code's actual MCP consumption mechanics, every claim backed by `claude-code/<file>:<line>` citations.

**Definition of Done:** All four incorrect claims corrected with citations. No doc assertion in `CLAUDE.md` or the MCP server `README.md` refers to a constant/behavior that does not resolve to a current `claude-code/` source line.

#### US-001: Correct the MCP persistence threshold claim in `CLAUDE.md`

**Description:** As a Distill maintainer, I want `CLAUDE.md:50` to describe the MCP persistence threshold accurately (25K tokens via `mcpValidation.ts:16`, with the `length/4` heuristic gate at ~12 500 tokens) so that sizing decisions for new tool outputs are grounded in the real constraint rather than a fictional 50K-char limit.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given `CLAUDE.md` contains the line asserting `Tool results > 50K chars are persisted to disk`, when EP-001 merges, then that line is replaced with text referencing `DEFAULT_MAX_MCP_OUTPUT_TOKENS = 25_000` at `claude-code/utils/mcpValidation.ts:16` and the `length/4` heuristic gate at ~12 500 tokens.
- [ ] Given the updated line, when a reader greps for the cited file:line, then the file exists in `/home/arthur/dev/claude-code/` and the constant resolves.
- [ ] Given Distill's internal 45K-char cap is mentioned elsewhere, when the doc is re-read end-to-end, then the justification references the heuristic gate (not the former fictional limit).
- [ ] Given a malformed citation is introduced (e.g., a path that does not exist), when `bun run lint` or manual review runs, then the error is caught — document this as a follow-on CI check candidate in Open Questions.

#### US-002: Correct the autocompact reserved-tokens formula in `CLAUDE.md`

**Description:** As a Claude Code user on Haiku, I want `CLAUDE.md:48` to describe the autocompact threshold formula accurately (`reserved = min(maxOutputTokens, 20_000)`) so that I compute the correct trigger point for my model.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given `CLAUDE.md` describes autocompact with a hardcoded "20K reserved" value, when EP-001 merges, then the formula is rewritten as `reserved = min(maxOutputTokens, 20_000)` with a citation to `claude-code/services/compact/autoCompact.ts:33-48`.
- [ ] Given the formula update, when a Haiku-specific example is present (or added), then it correctly shows `reserved = 4096` and a lower trigger threshold.
- [ ] Given a Sonnet/Opus 200K example, when verified, then it yields `reserved = 20_000` and the existing `167K` trigger number remains correct.
- [ ] Given a 1M-context model example, when verified, then the formula yields `reserved = 20_000` and the existing `967K` trigger number remains correct.

#### US-003: Retire the obsolete `outputSchema` Issue #25081 claim

**Description:** As a Distill maintainer, I want `CLAUDE.md:54` to stop citing an obsolete GitHub issue and accurately describe the `outputSchema` behavior (silently ignored, not dropped) so future contributors don't chase a phantom bug.

**Priority:** P0
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given `CLAUDE.md:54` references Issue #25081, when EP-001 merges, then that reference is removed and replaced with "outputSchema is silently ignored by `claude-code/services/mcp/client.ts` (not read during `tools/list` → `Tool` mapping); not dropped, not rejected".
- [ ] Given the update, when a maintainer searches the file for "25081", then the issue reference no longer appears.
- [ ] Given the claim is now positive (what happens) rather than negative (what bug occurs), when re-read, then it matches the behavior in the current `claude-code/` source.

#### US-004: Add a `Claude Code Mechanics — Verified Citations` appendix

**Description:** As a new Distill contributor, I want a single `CLAUDE.md` appendix that lists every Claude Code mechanism Distill relies on with its source citation, so that I can re-verify assumptions in one pass whenever the upstream evolves.

**Priority:** P0
**Size:** M (3 pts)
**Dependencies:** Blocked by US-001, US-002, US-003

**Acceptance Criteria:**
- [ ] Given the appendix is added, when opened, then it contains at minimum: `alwaysLoad` semantics, `searchHint` scoring, `outputSchema` handling, MCP persistence threshold, autocompact formula, MCP → API block transport path (`structuredContent` dropped), PreCompact hook dispatch, prompt → slash command mapping, custom agent loading, `readOnlyHint` → `isConcurrencySafe` mapping, each with `claude-code/<path>:<line>` citations.
- [ ] Given the appendix, when each citation is grep-resolved in `/home/arthur/dev/claude-code/`, then all resolve.
- [ ] Given an unhappy path where a citation no longer resolves, when flagged, then the contributor knows exactly which upstream change to investigate — this is documented as the purpose of the appendix.
- [ ] Given the appendix is comprehensive, when the older scattered claims in `CLAUDE.md` are compared, then no contradictions remain (all older claims either match the appendix or are removed).

---

### EP-002: Code Alignment Cleanup

Remove dead code paths and add annotations that activate first-party Claude Code optimizations. Scope restricted to `packages/mcp-server/src/server.ts` and its direct consumers.

**Definition of Done:** `structuredContent` branch and `searchHints` map removed. `annotations.readOnlyHint: true` declared on `smart_file_read`. No regression in the vitest suite.

#### US-005: Remove the `structuredContent` branch from the CallTool handler

**Description:** As a Distill maintainer, I want the CallTool handler in `server.ts:92-115` to stop populating `response.structuredContent` so that we don't pay serialization cost for a field that dies at the MCP client boundary (stored in `mcpMeta` but excluded from `messages.ts:468-516` API blocks).

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given `server.ts:109-111` contains the `if (result.structuredContent)` branch, when EP-002 merges, then that branch and the assignment to `response.structuredContent` are removed.
- [ ] Given the ToolResult type may still carry `structuredContent` internally for test assertions, when tests run, then the field remains populable inside `tools.execute()` return values but is not emitted on the wire.
- [ ] Given the removal, when the full vitest suite runs, then no test regresses; tests that assert the presence of `structuredContent` on MCP responses are updated to assert on the internal tool-registry return value instead.
- [ ] Given a tool that used to emit rich `structuredContent`, when invoked after the change, then its `content[].text` payload carries the information the LLM needs (unhappy-path: if any tool currently relied on `structuredContent` as the **only** vector for critical data, it is flagged and its `content[].text` is updated in the same PR).

#### US-006: Delete the `searchHints` map and `_meta['anthropic/searchHint']` emission

**Description:** As a Distill maintainer, I want `server.ts:66-86` to stop declaring and emitting `anthropic/searchHint` so that the file no longer suggests a discovery mechanism that doesn't apply to `alwaysLoad: true` tools.

**Priority:** P0
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given `server.ts` declares `const searchHints: Record<string, string>` at lines 66-86, when EP-002 merges, then the declaration is removed.
- [ ] Given the ListToolsRequestSchema handler emitted `_meta['anthropic/searchHint']`, when the handler is updated, then only `_meta['anthropic/alwaysLoad']: true` is emitted per tool.
- [ ] Given the removal, when a consumer inspects the `tools/list` response, then `_meta.['anthropic/searchHint']` is absent (rather than empty-string) on every tool.
- [ ] Given the justification comment at `server.ts:74-80`, when updated, then it references the actual reason (hint is scoring-only and unreachable when `alwaysLoad = true`) with a `claude-code/tools/ToolSearchTool/prompt.ts:112-116` citation.
- [ ] Given the change, when the full vitest suite runs, then no test regresses.

#### US-007: Add `annotations.readOnlyHint: true` to `smart_file_read`

**Description:** As a Claude Code user, I want `smart_file_read` to be marked `isConcurrencySafe` so that Claude Code can invoke it in parallel with other read-only tools, reducing wall-clock latency on multi-file explorations.

**Priority:** P0
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given the tool definition for `smart_file_read`, when EP-002 merges, then the definition includes `annotations: { readOnlyHint: true, title: "Smart File Read" }` (title added for UX improvements in the Claude Code tool list).
- [ ] Given `auto_optimize` is purely computational (no filesystem mutation), when evaluated, then it also gains `annotations: { readOnlyHint: true, title: "Auto Optimize" }` in the same story — documented in PR description.
- [ ] Given `code_execute` can mutate via sandboxed git operations, when evaluated, then it does NOT declare `readOnlyHint: true` (keeping its default, which is safe).
- [ ] Given the annotations are emitted in `tools/list`, when Claude Code consumes the response, then `isConcurrencySafe` is true for `smart_file_read` and `auto_optimize` — verify via a mocked consumer test.
- [ ] Given an unhappy path where a tool's behavior changes later (e.g., `auto_optimize` gains a write side effect), when a contributor modifies the tool, then the annotations must be re-evaluated — document this as a `CLAUDE.md` contributor note.

---

### EP-003: PreCompact Hook Preset

Ship an opt-in PreCompact hook that instructs Claude Code's compact-summary LLM to preserve `[DISTILL:COMPRESSED]` marker regions verbatim. The hook is the only documented lever to influence autocompact behavior (`utils/hooks.ts:3961-4025`, `services/compact/compact.ts:420`).

**Definition of Done:** Hook script shipped, installable via `distill-mcp setup --install-precompact-hook`, uninstallable, tested against a synthetic `PreCompact` dispatch, documented in `apps/web` docs.

#### US-008: Design the `[DISTILL:COMPRESSED]` marker contract

**Description:** As a Distill maintainer, I want a canonical marker format documented in `CLAUDE.md` and applied by all three tools when they produce compressed output, so that the PreCompact hook has a stable token to instruct the summarizer to preserve.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** Blocked by US-004

**Acceptance Criteria:**
- [ ] Given the marker format is decided, when documented, then it reads exactly `[DISTILL:COMPRESSED ratio=X.XX method=<name>]\n<payload>\n[/DISTILL:COMPRESSED]` — `X.XX` is the compression ratio (0.00–1.00), `<name>` is the compressor that produced the output (`tfidf`, `summarizer`, `ast`, etc.).
- [ ] Given `auto_optimize` emits compressed text, when compression ratio ≤ 0.7 (savings ≥ 30%) the output is wrapped in the marker.
- [ ] Given `smart_file_read` emits a skeleton or extract, when the output is < 50% the size of the full file, the output is wrapped in the marker.
- [ ] Given `code_execute` is a programmable surface, when its `ctx.compress*` helpers emit compressed output, they wrap in the marker.
- [ ] Given an unhappy path where compression fails or is below the threshold, when the tool emits unwrapped text, then the consumer still sees valid output (no half-wrapped markers).
- [ ] Given existing tool output integration tests, when re-run, they either update to the new wrapped format or (if testing raw compression logic) remain untouched. No silent breakage.
- [ ] Given the marker format is documented in `CLAUDE.md` and in each tool's description, when a user reads the description of `auto_optimize`, they understand what the marker guarantees.

#### US-009: Ship the `precompact-hook.sh` script

**Description:** As a Claude Code end user who has opted into the Distill PreCompact hook, I want a POSIX shell script that prints the correct instruction to stdout when Claude Code dispatches a `PreCompact` event, so that the compact-summary LLM receives guidance to preserve my compressed regions verbatim.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** Blocked by US-008

**Acceptance Criteria:**
- [ ] Given `packages/mcp-server/scripts/precompact-hook.sh` is created, when executed with no args, then it prints a single-paragraph instruction to stdout referencing the `[DISTILL:COMPRESSED …]` marker contract.
- [ ] Given the hook is invoked with hook-input JSON on stdin per the Claude Code hook protocol (`schemas/hooks.ts`), when executed, then it emits valid JSON on stdout with `additionalContext` or `newCustomInstructions` as required by the `PreCompact` hook contract.
- [ ] Given `shellcheck` is run against the script, then it reports zero errors or warnings.
- [ ] Given the script is POSIX-only (no bash-isms, no GNU-only utilities), when tested on macOS (BSD utilities) and Linux (GNU utilities), then both produce identical output.
- [ ] Given an unhappy path where stdin is not JSON or the event is unexpected, when the script runs, then it exits 0 with an empty-but-valid response (never blocks the compaction).
- [ ] Given the script, when executed with `--help`, then it prints its purpose, the marker contract, and a link to the CLAUDE.md documentation.

#### US-010: `distill-mcp setup --install-precompact-hook` CLI subcommand

**Description:** As a Claude Code end user, I want a single command to wire the Distill PreCompact hook into my `~/.claude/settings.json` so that I don't have to hand-edit JSON.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** Blocked by US-009

**Acceptance Criteria:**
- [ ] Given `distill-mcp setup --install-precompact-hook` is invoked, when run with no pre-existing `PreCompact` hook array in `~/.claude/settings.json`, then the array is created and populated with an entry pointing to the shipped `precompact-hook.sh` absolute path.
- [ ] Given a pre-existing `PreCompact` array with user entries, when the command runs, then the Distill entry is appended idempotently — re-running the command does not create a duplicate.
- [ ] Given the command, when run with `--dry-run`, then the intended changes are printed to stdout with no file mutation.
- [ ] Given the command, when run without the `~/.claude/settings.json` file existing, then it is created with correct permissions (0644) and parent dirs (0755).
- [ ] Given an unhappy path where `~/.claude/settings.json` contains malformed JSON, when the command runs, then it aborts with a clear error pointing to the line number and does not mutate the file.
- [ ] Given the command, when run with `--uninstall-precompact-hook`, then the Distill-specific entry is removed atomically (tempfile + rename). Other entries preserved.
- [ ] Given atomic write requirements, when the process is SIGTERM'd mid-install, then `~/.claude/settings.json` is either the pre-state or the post-state — never a half-written file.
- [ ] Given the install adds an entry, when the entry is inspected, then it includes a sentinel comment `"__distill_version": "0.10.x"` enabling targeted uninstall.

#### US-011: Validate the hook end-to-end against a synthetic PreCompact dispatch

**Description:** As a Distill maintainer, I want an integration test that synthesizes a `PreCompact` hook invocation, runs the shipped script, and asserts the output is valid per the Claude Code hook contract, so that regression on the hook protocol is caught in CI rather than in production.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** Blocked by US-009

**Acceptance Criteria:**
- [ ] Given a vitest integration test, when it spawns `precompact-hook.sh` with a synthetic stdin payload matching the Claude Code `PreCompact` hook shape, then the script exits 0.
- [ ] Given the script's stdout, when parsed, then it contains `newCustomInstructions` (or `additionalContext` per the schema) with the marker-preservation instruction.
- [ ] Given the instruction text, when asserted, then it contains at minimum: `[DISTILL:COMPRESSED` and `preserve verbatim` and `do not re-summarize`.
- [ ] Given an unhappy path where stdin is empty, when the test asserts, then the script exits 0 with empty-but-valid output.
- [ ] Given an unhappy path where stdin is non-JSON, when the test asserts, then the script exits 0 with empty-but-valid output (never blocks compaction).
- [ ] Given the test runs under CI's Ubuntu runner, when executed, then it passes — this validates POSIX-only shell.

---

### EP-004: MCP Prompts as Slash Commands

Expose three zero-argument MCP prompts via `prompts/list` (`services/mcp/client.ts:2043-2096`), making them available as `/mcp__distill-mcp__<name>` slash commands in Claude Code. No token cost when unused.

**Definition of Done:** Three prompts registered, manually invokable, tested, documented in user-facing docs.

#### US-012: Register the MCP prompt handlers on the server

**Description:** As a Claude Code end user, I want `/mcp__distill-mcp__compress-session`, `/mcp__distill-mcp__analyze-tokens`, and `/mcp__distill-mcp__forget-large-results` to appear as slash commands so that common Distill workflows are one keystroke away.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given the MCP server, when Claude Code issues `prompts/list`, then the response contains exactly three prompts: `compress-session`, `analyze-tokens`, `forget-large-results`.
- [ ] Given each prompt definition, when inspected, then it has a clear one-line description, zero required arguments, and `prompts: {}` server capability declared in `server.ts`.
- [ ] Given `prompts/get` is invoked for `compress-session`, when the handler runs, then it returns a `GetPromptResult` with a single user-role message containing workflow guidance: "Survey recent tool results in the session, identify those with >500 chars of raw output, and call `auto_optimize` on each to compress before it contributes to autocompact."
- [ ] Given `prompts/get` for `analyze-tokens`, when invoked, then it returns guidance: "Estimate current session token usage: (1) list all messages with their approximate token weights via `roughTokenCountEstimation = length/4`, (2) identify the top 3 largest contributions, (3) suggest which can be compressed via `auto_optimize` or `smart_file_read` refactoring."
- [ ] Given `prompts/get` for `forget-large-results`, when invoked, then it returns guidance: "Identify tool results currently persisted to disk by Claude Code (those >25K tokens, per `claude-code/utils/mcpValidation.ts:16`), list their paths, and propose which can be safely re-compressed via `auto_optimize` to reduce context bloat."
- [ ] Given an unhappy path where a prompt name does not exist, when `prompts/get` is called with that name, then the response is a proper MCP error with the "unknown prompt" code (not a 500).

#### US-013: Unit-test the prompt handlers

**Description:** As a Distill maintainer, I want vitest coverage on the prompt handlers so that regressions (missing prompts, malformed messages, unknown-prompt error handling) are caught in CI.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** Blocked by US-012

**Acceptance Criteria:**
- [ ] Given a vitest test suite for prompts, when `prompts/list` is simulated, then the test asserts all three prompts are present with correct names and descriptions.
- [ ] Given tests for each `prompts/get`, when each prompt name is requested, then the test asserts the message array length, role, and a substring of the content text.
- [ ] Given an unhappy path test, when `prompts/get` is called with a non-existent name, then the handler returns an error with code matching the MCP error schema.
- [ ] Given coverage is measured, when the handlers are added, then they are included in the coverage report and contribute positively (not negatively) to the floor.

#### US-014: Document the MCP prompts in `apps/web` user docs

**Description:** As a Claude Code end user reading Distill's docs site, I want a page documenting the three slash commands with examples and expected output so that I understand when to reach for each.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** Blocked by US-012

**Acceptance Criteria:**
- [ ] Given `apps/web` docs (fumadocs), when the user navigates to "Slash Commands" (or equivalent), then they see documentation for all three prompts.
- [ ] Given each prompt section, when inspected, then it contains: name, when-to-use, example invocation in a Claude Code session, expected model behavior after receiving the prompt message.
- [ ] Given the page, when verified in both locales (fr default, en), then both translations exist and are consistent.
- [ ] Given an unhappy path where the user's Distill server is not connected, when the user tries `/mcp__distill-mcp__compress-session`, then the docs explain the expected Claude Code error and how to fix it (`distill-mcp setup`).

---

### EP-005: Custom Agent Preset

Ship a `distill-compressor.md` custom agent template and install subcommand. The agent declares `requiredMcpServers: ["distill-mcp"]` and a read-only toolset (`disallowedTools: ["mcp__distill-mcp__code_execute"]`) for delegating compression workflows.

**Definition of Done:** Agent markdown template versioned in the repo, installable via `distill-mcp setup --install-agent`, documented.

#### US-015: Author the `distill-compressor.md` agent template

**Description:** As a Claude Code end user, I want a `@distill-compressor` custom subagent pre-configured with exactly the tools needed for read-only compression work, so that I can delegate "compress this log" or "skeleton-read these 5 files" to a focused agent without my main session consuming its tools.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** Blocked by US-007

**Acceptance Criteria:**
- [ ] Given `packages/mcp-server/assets/agents/distill-compressor.md` is created, when opened, then it contains YAML frontmatter with: `name: distill-compressor`, `description: <clear use cases>`, `tools: [Read, Grep, Glob, Bash, mcp__distill-mcp__auto_optimize, mcp__distill-mcp__smart_file_read]`, `disallowedTools: [mcp__distill-mcp__code_execute]`, `requiredMcpServers: [distill-mcp]`.
- [ ] Given the agent body (below the frontmatter), when read, then it contains a multi-paragraph instructional prompt explaining the agent's role: content-aware compression, AST-based skeleton reads, summarization of long outputs, and the marker contract from US-008.
- [ ] Given the agent is used from a parent session, when the parent invokes `@distill-compressor` with a clear task, then the agent completes using only its declared tools — any attempt to use `code_execute` fails with a tool-not-available error (validated manually during PR review).
- [ ] Given an unhappy path where Distill is not connected, when the user tries to invoke `@distill-compressor`, then the agent is not listed (per `requiredMcpServers` gating).

#### US-016: `distill-mcp setup --install-agent` CLI subcommand

**Description:** As a Claude Code end user, I want a single command that copies the `distill-compressor.md` template into `~/.claude/agents/` so that the custom agent becomes available without manual filesystem work.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** Blocked by US-015

**Acceptance Criteria:**
- [ ] Given `distill-mcp setup --install-agent` is run, when `~/.claude/agents/distill-compressor.md` does not exist, then the file is copied from the package `assets/agents/` with mode 0644.
- [ ] Given the file already exists, when the command runs without `--force`, then it prints a warning, shows a diff if the content differs, and exits without overwriting.
- [ ] Given `--force` is passed and the file differs, when run, then it is overwritten atomically (tempfile + rename).
- [ ] Given `--uninstall-agent`, when run, then the file is deleted if present, with a confirmation log.
- [ ] Given the command, when run with `--dry-run`, then intended actions are printed, no mutation.
- [ ] Given an unhappy path where `~/.claude/agents/` does not exist, when the command runs, then the directory is created with mode 0755 before copying.
- [ ] Given the installed file, when inspected in a real Claude Code session, then the `@distill-compressor` agent appears in the agent list (validated manually during PR review).

---

### EP-006: MCP Skills R&D Spike

Timeboxed investigation of whether Distill can expose SKILL.md files via the MCP server such that Claude Code loads them with `loadedFrom === 'mcp'` (model-invokable via `SkillTool`). **Spike only** — no implementation beyond a proof-of-concept and a go/no-go write-up.

**Definition of Done:** Spike report committed to `docs/spikes/mcp-skills-exposure.md` with a go/no-go decision and either (a) a PoC in a `spike/` branch or (b) a rationale for why MCP skill exposure isn't viable in current Claude Code.

#### US-017: Spike — investigate MCP skills exposure feasibility

**Description:** As a Distill maintainer, I want to know whether we can expose SKILL.md files via the MCP server (triggering `loadedFrom === 'mcp'` per `claude-code/tools/SkillTool/SkillTool.ts:82-93`) so that v0.11 planning has a concrete go/no-go.

**Priority:** P2
**Size:** L (5 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given the spike, when started, then `docs/spikes/mcp-skills-exposure.md` is created with sections: Goal, Hypothesis, Method, Findings, Decision, Follow-ups.
- [ ] Given exploration, when the `claude-code/skills/loadSkillsDir.ts` logic is fully traced, then the exact mechanism by which a skill becomes `loadedFrom === 'mcp'` is documented in Findings (including whether it requires a specific MCP capability, resource type, or out-of-band protocol).
- [ ] Given a prototype attempt, when made, then it either: (a) successfully loads a demo SKILL.md via Distill's MCP server with `loadedFrom === 'mcp'` in a test Claude Code session — PoC committed to a `spike/mcp-skills` branch; or (b) fails with a documented root cause.
- [ ] Given the decision section, when written, then it includes: go / no-go / defer, with concrete rationale referencing the Findings.
- [ ] Given the spike timeboxes at 2 working days, when the budget is exhausted, then a decision is forced (defer is an acceptable outcome) — no open-ended exploration.
- [ ] Given an unhappy path where the mechanism is found to require an Anthropic-internal protocol, when documented, then the spike closes with "no-go for external MCP servers" and the Findings section lists what would need to change upstream.

---

### EP-007: Release Coordination

Roll v0.10 into the existing release cadence: CHANGELOG, version bumps, ROADMAP updates, consolidated release notes, `PostToolUse` documentation addition.

**Definition of Done:** All release artifacts updated. `apps/web` user docs updated with `PostToolUse` matcher example. Version tag ready.

#### US-018: Update CHANGELOG, ROADMAP, and package version to v0.10.0

**Description:** As a Distill maintainer, I want v0.10 entries in `CHANGELOG.md` and `ROADMAP.md`, and the `packages/mcp-server/package.json` version bumped to `0.10.0` so that the release is coherent.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** Blocked by all P0 stories (EP-001, EP-002)

**Acceptance Criteria:**
- [ ] Given `CHANGELOG.md`, when updated, then it contains a `## [0.10.0] — 2026-XX-XX` section listing all merged stories grouped by epic with one-line descriptions.
- [ ] Given `ROADMAP.md`, when updated, then v0.10 is marked as in-progress or complete (per actual state) and v0.11 gains an entry for "MCP skills exposure (if US-017 spike goes 'go')" as a contingent item.
- [ ] Given `packages/mcp-server/package.json`, when inspected, then `"version": "0.10.0"`.
- [ ] Given consolidated release notes in the `apps/web` changelog, when published, then users see a summary of doc corrections, dead code removal, and the three new integration vectors (hook, prompts, agent).
- [ ] Given an unhappy path where a story was deferred, when CHANGELOG is written, then the deferral is noted explicitly with a pointer to the tracking issue.

#### US-019: Document `PostToolUse` matchers for Distill tools in `apps/web` docs

**Description:** As a Claude Code end user, I want a docs page showing how to wire `PostToolUse` hooks (matcher `mcp__distill-mcp__*`) to audit, log, or post-process Distill tool calls so that I can build workflow telemetry on top of Distill.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] Given `apps/web` user docs, when the user navigates to "Hooks" (or similar), then they see an example `settings.json` snippet with `"matcher": "mcp__distill-mcp__*"` under `PostToolUse`.
- [ ] Given the snippet, when copy-pasted into a real `~/.claude/settings.json`, then it runs on every Distill tool invocation (manually verified during PR review).
- [ ] Given the docs, when read, then they reference the `updatedMCPToolOutput` return channel per `claude-code/schemas/hooks.ts:19-27`.
- [ ] Given an unhappy path (hook returns invalid JSON), when documented, then the docs explain Claude Code's graceful-degradation behavior.
- [ ] Given the docs, when available in both fr (default) and en locales, then both are consistent.

---

## Functional Requirements

- **FR-01:** `CLAUDE.md` must not assert any Claude Code constant, threshold, or behavior without a `claude-code/<path>:<line>` citation that resolves in `/home/arthur/dev/claude-code/`.
- **FR-02:** `packages/mcp-server/src/server.ts` must not emit `structuredContent` on MCP CallTool responses.
- **FR-03:** `packages/mcp-server/src/server.ts` must not declare or emit `_meta['anthropic/searchHint']`.
- **FR-04:** Tools marked as read-only (`smart_file_read`, `auto_optimize`) must declare `annotations: { readOnlyHint: true, title: <name> }` in their `tools/list` entry.
- **FR-05:** The MCP server must declare `prompts: {}` in its capabilities and handle `prompts/list` + `prompts/get` for at least three named prompts (`compress-session`, `analyze-tokens`, `forget-large-results`).
- **FR-06:** When Distill tools produce compressed output with savings ≥ 30%, they must wrap the output in `[DISTILL:COMPRESSED ratio=X.XX method=<name>] … [/DISTILL:COMPRESSED]`.
- **FR-07:** `distill-mcp setup --install-precompact-hook` must idempotently install a `PreCompact` hook entry into `~/.claude/settings.json` using atomic file writes.
- **FR-08:** `distill-mcp setup --install-agent` must idempotently install `distill-compressor.md` into `~/.claude/agents/`.
- **FR-09:** All setup subcommands must support `--dry-run` and `--uninstall-<target>` counterparts.
- **FR-10:** The shipped `precompact-hook.sh` must be POSIX-compliant (no bash-isms) and pass `shellcheck`.
- **FR-11:** The system must NOT modify existing tool signatures or output shapes — backwards compatibility with v0.9.x consumers preserved.
- **FR-12:** The system must NOT mutate `~/.claude/settings.json` or `~/.claude/agents/*.md` without an explicit `distill-mcp setup --install-*` invocation (no implicit side effects on server start).

## Non-Functional Requirements

- **Performance:** `distill-mcp setup --install-*` subcommands complete in < 500ms on a typical developer machine (disk I/O only, no network).
- **Performance:** `prompts/list` response serializes in < 10ms on the MCP stdio transport — zero blocking work.
- **Performance:** `precompact-hook.sh` execution time < 50ms for the typical stdin payload (hook dispatch must not perceptibly slow Claude Code's autocompact).
- **Security:** All setup subcommands must validate JSON integrity of `~/.claude/settings.json` before write; malformed existing content aborts the operation (never overwrites a user's broken file).
- **Security:** Temp files for atomic writes must be created with mode 0600 and renamed atomically — no window where a world-readable intermediate is written.
- **Reliability:** 100% of setup subcommand invocations under SIGTERM must leave target files in either the pre-state or post-state, never a half-written intermediate (validated by a kill-during-write integration test).
- **Test Coverage:** Merging v0.10 must not regress coverage below v0.9.2 floors: Lines 70%, Branches 56%, Functions 70%, Statements 69% (`vitest.config.ts`). New code in EP-003 and EP-004 must contribute ≥ 75% line coverage.
- **Compatibility:** POSIX shell scripts must run identically on macOS (BSD utilities) and Linux (GNU utilities) — validated by CI runners.
- **Documentation:** Every `claude-code/<path>:<line>` citation in `CLAUDE.md` must resolve when verified against `/home/arthur/dev/claude-code/` at PR merge time.

## Edge Cases & Error States

| # | Scenario | Trigger | Expected Behavior | User Message |
|---|----------|---------|-------------------|--------------|
| 1 | Empty state — fresh Claude Code install | User runs `distill-mcp setup --install-precompact-hook` with no `~/.claude/settings.json` | Create parent directory (0755), create file (0644) with minimal valid JSON including the hook entry | "Created ~/.claude/settings.json with PreCompact hook." |
| 2 | Error state — malformed existing `settings.json` | User's `~/.claude/settings.json` contains invalid JSON | Abort without writing, print parse error with line/column | "Aborted: ~/.claude/settings.json is malformed at line N, column M. Fix manually and re-run." |
| 3 | Concurrent modification | Two `distill-mcp setup` processes race on `settings.json` | Atomic tempfile + rename ensures one write wins; second re-read detects the first's change and no-ops (idempotent) | — (silent success) |
| 4 | Interrupted flow | SIGTERM during setup subcommand | Either pre-state or post-state, never partial. No lock file left behind. | — |
| 5 | Boundary — empty stdin to hook script | Claude Code dispatches `PreCompact` with empty event payload | Hook exits 0 with empty-but-valid JSON output; never blocks the compaction | — |
| 6 | Boundary — zero-length compressed output | `auto_optimize` produces empty compression result (edge case: input was already minimal) | No marker wrap (marker only applies to ≥30% savings) | — |
| 7 | External dependency missing | `distill-mcp setup --install-agent` runs with no write permission on `~/.claude/agents/` | Abort with clear error; suggest `chmod` or run with `--user-dir=<alt-path>` | "Cannot write to ~/.claude/agents/. Check permissions or use --user-dir." |
| 8 | Permission revoked mid-session | User revokes `~/.claude/` write after setup | No ongoing operation; uninstall prints error. | "Cannot delete, permission denied." |
| 9 | Unknown prompt name | Claude Code invokes `prompts/get` with a name not in the registered list | Return MCP error with `-32602` (Invalid params) and message "Unknown prompt: <name>" | — (model handles error) |
| 10 | Prompt handler throws | Handler code crashes on prompt resolution | Catch at the server boundary, return MCP error `-32603` (Internal error) with sanitized message (no host paths leaked per v0.9.0 security baseline) | — |
| 11 | Marker collision | User-authored input already contains `[DISTILL:COMPRESSED` literal text | Tool detects the collision and escapes/renames the marker (e.g., `[DISTILL-USER-TEXT:COMPRESSED`) — documented in marker contract | — |
| 12 | Hook script non-executable | User's `precompact-hook.sh` has mode 0644 not 0755 | Setup subcommand sets 0755 on install; if user later chmods it away, Claude Code's hook dispatch fails gracefully (documented in troubleshooting) | "Hook script not executable; run `distill-mcp setup --install-precompact-hook --force` to re-fix." |

## Risks & Mitigations

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| 1 | Claude Code's compact-summary LLM ignores the PreCompact instruction to preserve `[DISTILL:COMPRESSED]` markers (behavioral bet, not contract) | Med | Med | Ship US-011 integration test validating instruction delivery. Add opt-in tracing via `DISTILL_TRACE_COMPACT=1` env var in US-010 so users can sample real compact outputs. Promote from experimental → stable only after ≥3 real-world confirmations. Document in README as "best-effort". |
| 2 | PreCompact hook protocol changes in a future Claude Code release | Low | High | Version-detect in `distill-mcp setup --install-precompact-hook`; refuse to install against unsupported Claude Code versions with a clear upgrade message. Keep the shipped hook script's stdin schema pinned to what is documented at `/home/arthur/dev/claude-code/utils/hooks.ts:3961-4025`. |
| 3 | `structuredContent` removal breaks an external consumer we're not aware of | Low | Low | Migration note in CHANGELOG: the field was never transmitted to the API, so any external consumer was already getting nothing useful. Keep the internal `ToolResult.structuredContent` field in the tool registry for test assertions and SDK integrations outside the MCP boundary. |
| 4 | MCP prompts SDK support lags our server declaration | Low | Med | Verify `@modelcontextprotocol/sdk` version supports `prompts/list` + `prompts/get` capabilities before US-012 starts; bump SDK if needed in the same PR. |
| 5 | Custom agent `.md` format shifts in Claude Code (frontmatter fields renamed) | Low | Med | Pin template to the schema documented at `/home/arthur/dev/claude-code/services/AgentSummary/loadAgentsDir.ts:107-241`. Include the schema version as a comment in the template. |
| 6 | MCP skills spike (EP-006) discovers the mechanism requires Anthropic-internal protocol | Med | Low | Documented as acceptable outcome in US-017 — the spike is "go / no-go", and no-go is a valid result that informs v0.11 planning without wasted implementation effort. |
| 7 | Doc citations in EP-001 go stale as `/home/arthur/dev/claude-code/` evolves | High | Low | Propose (in Open Questions) a CI check that validates every `claude-code/<path>:<line>` citation resolves. Even without the check, the appendix (US-004) makes rot visible in one pass. |
| 8 | Setup subcommand accidentally clobbers a user's custom hook entry | Low | High | Sentinel field `"__distill_version"` in the hook entry enables targeted uninstall. Atomic write guarantees pre-state or post-state. Dry-run mode catches any intended diff before mutation. |

## Non-Goals

Explicit boundaries — what v0.10 does NOT include:

- **No new compression algorithms.** EP-002 touches `server.ts` annotations; it does not change `auto_optimize`, `smart_file_read`, or `code_execute` core logic.
- **No MCP resources exposure.** The swarm confirmed MCP resources are not auto-injected by Claude Code (`ListMcpResources` + `ReadMcpResource` tools are deferred). Resources are out of scope; if a use case emerges, it lands in v0.11 or later.
- **No sandbox engine upgrade.** `@sebastianwessel/quickjs` remains pinned at `3.0.0` per v0.9.2 hardening. Any engine change is a separate release.
- **No transport change.** stdio remains the only transport. SSE / HTTP transports are out of scope.
- **No MCP skills implementation.** EP-006 is a spike; any implementation follows in v0.11.
- **No telemetry.** The `DISTILL_TRACE_COMPACT=1` env var in EP-003 is opt-in, local stderr only. No network calls.
- **No changes to the `apps/web` landing page marketing copy.** Docs-only additions per US-014 and US-019.
- **No CI validator for citations** — proposed in Open Questions, not implemented in v0.10.

## Files NOT to Modify

- `packages/mcp-server/src/sandbox/**` — 7-layer security boundary (EP-002 is server-level, not sandbox-level).
- `packages/mcp-server/src/ast/**` — AST parsers and WASM singletons, unchanged scope.
- `packages/mcp-server/src/compressors/**` and `packages/mcp-server/src/summarizers/**` — compression logic unchanged; only the output-wrapping marker is added at the tool boundary (EP-003 US-008), not inside these modules.
- `packages/mcp-server/vitest.config.ts` coverage floors — may be raised as a ratchet but never lowered.
- `packages/eslint-config/**` and `packages/typescript-config/**` — shared presets, no changes for v0.10.
- `apps/web/src/app/[lang]/**` locale handling — v0.9.2 EP-003 stabilized this; v0.10 only adds new docs pages under the existing routing.

## Technical Considerations

- **Architecture:** The MCP server already follows a clean "3 tools, zero middleware" design. The new prompt handlers (EP-004) and capability declarations (`annotations`, `prompts: {}`) extend `server.ts` without adding new abstractions. **Recommended:** keep prompt registration inline in `server.ts` for discoverability (mirrors the existing tool-registration pattern). Engineering to confirm.
- **Setup subcommand parsing:** `bin/cli.js` currently uses manual `process.argv` parsing per project convention. The new `--install-*` and `--uninstall-*` flags extend that pattern. **Recommended:** stay with manual parsing, do not add `commander` or `yargs` — keeps `bin/` zero-dependency.
- **Settings.json mutation:** JSON-with-comments (JSONC) is not a concern — `~/.claude/settings.json` is plain JSON per project convention. **Recommended:** use `JSON.parse` + `JSON.stringify` with 2-space indent matching existing file; preserve existing key order via careful object composition.
- **Marker contract enforcement:** should markers be enforced inside each compressor (before output returns to the tool handler) or only wrapped at the tool-handler boundary? **Recommended:** wrap at the tool-handler boundary in `auto_optimize.ts` / `smart_file_read.ts` / `code_execute.ts`, not inside individual compressors. This keeps compressors pure (reusable via `sandbox/sdk`). Engineering to confirm for `code_execute` where `ctx.compress*` helpers are called by user code.
- **Dependencies:** No new npm dependencies required for EP-001 through EP-005. EP-006 spike is pure investigation. **Recommended:** reconfirm `@modelcontextprotocol/sdk` version supports `prompts/*` before US-012; if upgrade needed, pin-bump in same PR.
- **Migration:** No migration needed. v0.10 is backwards-compatible: removing `structuredContent` affects a field that was never transmitted; removing `searchHints` affects a field that was never rendered; adding `annotations` and `prompts` are additive.
- **Rollback plan:** Any story in EP-001/EP-002 is a single-commit revert. EP-003/EP-005 setup artifacts are uninstallable via `--uninstall-*`. EP-004 MCP prompts can be disabled by removing the `prompts: {}` capability declaration.

## Success Metrics

| Metric | Baseline (2026-04-21) | Target | Timeframe | How Measured |
|--------|----------------------|--------|-----------|--------------|
| Incorrect Claude Code claims in `CLAUDE.md` | 4 (persistence threshold, autocompact reserved, `outputSchema` Issue #25081, general framing) | 0 | Month-1 | Manual audit at merge; grep-verify all `claude-code/<path>:<line>` citations resolve |
| Dead code paths in `server.ts` (`structuredContent` branch, `searchHints` map) | 2 | 0 | Month-1 | Code inspection + knip report |
| Tools with `annotations.readOnlyHint` declared where applicable | 0 of 2 eligible (`smart_file_read`, `auto_optimize`) | 2 of 2 | Month-1 | `tools/list` response inspection via test |
| MCP prompts exposed | 0 | 3 | Month-1 | `prompts/list` response inspection via test |
| Opt-in integration presets installable via setup CLI | 0 | 2 (PreCompact hook, custom agent) | Month-1 | `distill-mcp setup --help` output includes both; integration tests pass |
| MCP skills exposure decision (EP-006 spike) | Unknown | Go / No-go documented | Month-1 | `docs/spikes/mcp-skills-exposure.md` committed with decision section |
| Test coverage (lines, branches, functions, statements) | 71.80 / 57.58 / 71.93 / 70.99 (%) | ≥ floor (70 / 56 / 70 / 69) with no regression | Month-1 | `vitest run --coverage` in CI |
| Real-world PreCompact marker retention rate (opt-in telemetry) | N/A (new) | ≥ 3 user confirmations that markers survive a real compact | Month-3 | Voluntary user reports via `DISTILL_TRACE_COMPACT=1` + GitHub issue form |
| `/mcp__distill-mcp__compress-session` adoption | N/A (new) | ≥ 1 documented user workflow using the command | Month-3 | GitHub discussions / issue tracker |

## Open Questions

- **Q1** — Should the marker contract use text markers (`[DISTILL:COMPRESSED …]`) or MCP-native resource references? **Decision point:** end of US-008. **Depends on:** whether MCP resources are reliably preserved across autocompact (swarm finding suggests no — resource_link is converted to plain text at `client.ts:2575-2587`). **Current lean:** text markers.
- **Q2** — Should `auto_optimize` be marked `readOnlyHint: true`? It is purely computational but receives tool output as input — is there a scenario where Claude Code should serialize rather than parallelize its invocation? **Decision point:** US-007 implementation. **Depends on:** confirming no implicit side-effect (file I/O, network) in the current compressors.
- **Q3** — Should a CI check enforce that every `claude-code/<path>:<line>` citation in `CLAUDE.md` resolves? **Decision point:** post-v0.10 retrospective. **Depends on:** how often the citations go stale in practice. **Current lean:** propose in v0.11 if rot observed.
- **Q4** — Should EP-004 prompts accept arguments (e.g., `compress-session --since=<timestamp>`)? **Decision point:** US-012 implementation. **Depends on:** whether zero-arg prompts feel complete in user testing. **Current lean:** zero-arg in v0.10, iterate post-feedback.
- **Q5** — Should `distill-mcp setup` auto-detect Claude Code version and refuse to install the PreCompact hook against unsupported versions? **Decision point:** US-010 implementation. **Depends on:** whether a reliable version check exists (inspect `~/.claude/` schema, read `CLAUDE_CODE_VERSION` env var if any, or fall back to a heuristic). **Current lean:** yes, with a `--force` override.
- **Q6** — If EP-006 spike concludes "go", does `MCP skills exposure` land in v0.11 or v1.0? **Decision point:** spike completion (US-017). **Depends on:** implementation cost estimate from the spike. **Current lean:** v0.11 to avoid blocking v1.0.

[/PRD]
