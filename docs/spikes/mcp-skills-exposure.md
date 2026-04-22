# Spike: MCP Skills Exposure

**Story:** US-017 (EP-006, PRD: `tasks/prd-distill-v010-claude-code-alignment.md`).
**Timebox:** 2 working days.
**Started:** 2026-04-22.
**Completed:** 2026-04-22 (single-session; early termination after conclusive evidence).
**Verdict:** **NO-GO for v0.11.** Defer until upstream preconditions listed in [Follow-ups](#follow-ups) are satisfied.

All `claude-code/<path>:<line>` citations below resolve against the local source copy at `/home/arthur/dev/claude-code/`. The "installed production binary" is `/home/arthur/.local/share/claude/versions/2.1.117` (the Claude Code currently on this machine's `$PATH`).

---

## Goal

Determine whether Distill's MCP server can expose `SKILL.md` files such that Claude Code loads them with `loadedFrom === 'mcp'`, causing `SkillTool` to surface them as model-invokable skills alongside local and bundled ones.

If yes: scope the implementation for v0.11 (the spike was never meant to ship code — any implementation follows in a separate PRD).

If no: document what would need to change upstream so Distill can watch for those conditions and revisit.

---

## Hypothesis

**H1 (strong):** The upstream `SkillTool.ts` comment at lines 82-89 — *"Only include MCP skills (loadedFrom === 'mcp'), not plain MCP prompts"* — implied that some MCP primitive, when surfaced by an external server, produces commands with `loadedFrom === 'mcp'`. The most plausible vehicle, given the MCP protocol's existing surface, was `resources/list` with `.md` files.

**H2 (weaker):** If H1 failed, we suspected MCP skills might be gated behind an experiment, feature flag, or user-facing toggle that the external user could opt into.

Both hypotheses turned out to be partially correct but practically NO-GO — see Findings.

---

## Method

Single-session, depth-first source-and-binary audit. No PoC branch was opened: the evidence ruled out a working prototype on shipped Claude Code before any code needed to be written.

1. **Source trace (`/home/arthur/dev/claude-code/`):**
   1. Identified the consumer: `SkillTool.ts:82-93` filters `context.getAppState().mcp.commands` for `{ type: 'prompt', loadedFrom: 'mcp' }` and merges the matches into the skill list.
   2. Traced the producer backward: which code path populates `mcp.commands` entries with `loadedFrom: 'mcp'`?
   3. Mapped every call site of `MCP_SKILLS`, `fetchMcpSkillsForClient`, `getMcpSkillCommands`, `mcpSkills`, `parseSkillFrontmatterFields`, `createSkillCommand`, and `registerMCPSkillBuilders`.
   4. Read `skills/mcpSkillBuilders.ts` end-to-end — the self-documenting leaf registry module that exists precisely to break the cycle between the absent `mcpSkills.ts` and `loadSkillsDir.ts`.
2. **Binary audit (installed Claude Code v2.1.117):**
   1. Ran `strings` over the shipped binary, greping for every skill-loader symbol identified in (1).
   2. Enumerated every `loadedFrom` literal value present in the binary.
   3. Enumerated every MCP protocol method string the binary knows how to emit.
3. **Protocol surface check:** searched the MCP TypeScript SDK request-method constants the binary references, to confirm no `skills/list` or `skills/get` transport exists.

Each step's outcome is in [Findings](#findings).

---

## Findings

### F1 — MCP skill discovery is compile-time gated behind `feature('MCP_SKILLS')`

The only producer path that stamps `loadedFrom: 'mcp'` onto a command is `fetchMcpSkillsForClient`, which is `require`'d conditionally at module load:

> `claude-code/services/mcp/client.ts:117-121`
> ```ts
> const fetchMcpSkillsForClient = feature('MCP_SKILLS')
>   ? (
>       require('../../skills/mcpSkills.js') as typeof import('../../skills/mcpSkills.js')
>     ).fetchMcpSkillsForClient
>   : null
> ```

Every call site that could invoke it is guarded by the same flag:
- `claude-code/services/mcp/client.ts:2174` — first connection of an MCP server; `feature('MCP_SKILLS') && supportsResources ? fetchMcpSkillsForClient!(client) : Promise.resolve([])`.
- `claude-code/services/mcp/client.ts:2348` — reconnection path; identical guard.
- `claude-code/services/mcp/useManageMCPConnections.ts:684, :718` — hook that re-fetches skills when MCP server state changes.

The consumer-side filter is also explicitly gated:

> `claude-code/commands.ts:547-559`
> ```ts
> export function getMcpSkillCommands(
>   mcpCommands: readonly Command[],
> ): readonly Command[] {
>   if (feature('MCP_SKILLS')) {
>     return mcpCommands.filter(
>       cmd =>
>         cmd.type === 'prompt' &&
>         cmd.loadedFrom === 'mcp' &&
>         !cmd.disableModelInvocation,
>     )
>   }
>   return []
> }
> ```

`feature()` is imported from `bun:bundle` (e.g. `claude-code/context.ts:1`, `claude-code/commands.ts:59`). In Bun, `bun:bundle` resolves `feature(name)` to a literal boolean at bundle time, so whichever value `MCP_SKILLS` takes at publish time is frozen into the shipped artifact.

### F2 — The producer module `mcpSkills.ts` is not in the public source tree

`find /home/arthur/dev/claude-code -name 'mcpSkills*'` returns only `skills/mcpSkillBuilders.ts`. The `require('../../skills/mcpSkills.js')` at `services/mcp/client.ts:119` resolves to a non-existent path unless conditional compilation injects the file during a Bun bundle where `MCP_SKILLS=true`.

The builder registry (`skills/mcpSkillBuilders.ts:1-44`) documents this arrangement:
> *"Write-once registry for the two `loadSkillsDir` functions that MCP skill discovery needs. This module is a dependency-graph leaf: it imports nothing but types, so both `mcpSkills.ts` and `loadSkillsDir.ts` can depend on it without forming a cycle."*

The bottom of `loadSkillsDir.ts:1077-1085` confirms the registration side-effect:
> ```ts
> registerMCPSkillBuilders({
>   createSkillCommand,
>   parseSkillFrontmatterFields,
> })
> ```

So the design is: when `MCP_SKILLS` is on, Bun compiles in `mcpSkills.ts`, which grabs `createSkillCommand` and `parseSkillFrontmatterFields` from the registry and uses them to build `Command` objects with `loadedFrom: 'mcp'`. When `MCP_SKILLS` is off, that module is stripped at bundle time.

### F3 — Production binary v2.1.117 has the producer stripped

Audited `/home/arthur/.local/share/claude/versions/2.1.117` with `strings | grep`:

| Symbol | Occurrences in binary |
|---|---|
| `MCP_SKILLS` | 0 |
| `mcpSkills` | 0 |
| `fetchMcpSkill` | 0 |
| `getMcpSkillCommands` | 0 |
| `registerMCPSkill` | 0 |
| `parseSkillFrontmatter` | 3 (likely from `parseSkillFrontmatterFields` being registered) |
| `loadedFrom === "mcp"` (and minified variants) | 12 |

The 12 `loadedFrom === "mcp"` occurrences come from consumer code compiled unconditionally — `SkillTool.ts:89`, `SkillsMenu.tsx:235`, `utils/processUserInput/processSlashCommand.tsx:812`, `attachments.ts:2653`, and `services/mcp/utils.ts:92`. The producer that would ever set `loadedFrom: 'mcp'` on a command is absent, so the filters unconditionally match nothing at runtime.

The installed binary's `loadedFrom` literal universe:
```
loadedFrom:"bundled"       loadedFrom==="bundled"
loadedFrom:"skills"        loadedFrom==="skills"
                           loadedFrom==="plugin"
                           loadedFrom==="mcp"
```
Only `bundled` and `skills` appear as assignment literals (`loadedFrom:"..."`); `plugin` and `mcp` appear only as comparison literals. This is consistent with the assignment sites being stripped and only the filter predicates surviving.

### F4 — There is no MCP protocol method for skills

Enumerating MCP request method strings the binary actually emits:

| Method | Occurrences |
|---|---|
| `prompts/get` | 11 |
| `prompts/list` | 26 |
| `resources/list` | 26 |
| `resources/read` | 14 |
| `tools/list` | 26 |
| `skills/list` | 0 |
| `skills/get` | 0 |

If MCP skills ever ship externally, they either (a) piggyback on `resources/*` — which matches the `supportsResources` precondition at `client.ts:2174` — or (b) require a new standardized MCP protocol method that does not exist in the SDK Distill depends on (`@modelcontextprotocol/sdk ^1.0.0`).

### F5 — Design intent (inferred; not implementable externally today)

From the code that *would* run if `MCP_SKILLS` were true:
- The loader consumes an `MCPServerConnection` (`fetchMcpSkillsForClient(client)` signature inferred from the call site).
- It only runs when the server advertises the `resources` capability (`client.capabilities?.resources` check at `client.ts:2169`).
- It uses `parseSkillFrontmatterFields` (from `loadSkillsDir.ts`) to decode YAML frontmatter.
- It uses `createSkillCommand` to wrap the result into a `Command` with `loadedFrom: 'mcp'`, `type: 'prompt'`, and a `disableModelInvocation` boolean honored by the consumer filters.

The most parsimonious contract consistent with all of the above: **expose `.md` files as MCP resources, with some convention on URI scheme, MIME type (`text/markdown`?), or resource metadata that `mcpSkills.ts` uses to distinguish "this is a skill" from "this is an arbitrary resource".** The exact convention lives inside the absent file and is not publicly documented.

### F6 — A prototype is impossible on shipped Claude Code

Even a prefect Distill-side implementation (exposing `.md` through `resources/list` + `resources/read` with a guessed URI convention) cannot produce `loadedFrom === 'mcp'` entries on the currently-shipped binary, because:

- `fetchMcpSkillsForClient` is `null` in the prod bundle (F1 + F3).
- No runtime toggle exists for the `feature()` check — it is baked at bundle time by `bun:bundle`.
- No public setting, env var, or CLI flag flips `MCP_SKILLS` on.

The filter at `commands.ts:547-558` unconditionally returns `[]`, and `SkillTool.ts:82-93` falls through to `getCommands(getProjectRoot())` — local skills only.

---

## Decision

### NO-GO for v0.11.

Shipping an MCP-skills feature in Distill today would produce bytes on the wire (extra `resources/list` entries) that no production Claude Code client consumes. It would inflate the tools/resources surface without any end-user-observable behavior change, and — worse — might interfere with the future-intended loader behavior once Anthropic flips the flag, because Distill would be guessing at a contract the upstream has not published.

### What would flip this to GO

Upstream preconditions, any one of which would unblock:

1. **`feature('MCP_SKILLS')` compiled true in the public build.** Detectable via `strings /path/to/claude/binary | grep -E 'MCP_SKILLS|fetchMcpSkillsForClient'` — non-zero matches mean the loader is live.
2. **Public documentation of the MCP-skills resource convention** (URI scheme, MIME type, or frontmatter field) such that Distill can implement against a named contract rather than a reverse-engineered one.
3. **A standardized `skills/list` MCP protocol method** in `@modelcontextprotocol/sdk`. Shifts from internal-only to cross-vendor.
4. **Anthropic open-sources `mcpSkills.ts`** or publishes a loader reference implementation, at which point Distill can mirror the logic deterministically.

### Why not defer further ("yellow-light")?

Because a yellow light commits us to a watch-and-wait surface area. The PRD timebox was 2 working days; a single-session audit settled it in ~1 hour by jumping straight to the installed binary. No further exploration is useful until at least one of the 4 preconditions above changes. Mark as no-go, move on, and let a bundled recheck catch the flip (see Follow-ups).

---

## Follow-ups

**For Distill v0.11 PRD scoping:**
- Remove MCP skills from the v0.11 scope entirely. Replace the contingent line in `ROADMAP.md` ("MCP skills exposure (if US-017 spike goes 'go')") with a pointer to this spike and the 4 preconditions above.
- Do not add any `resources/*` surface to Distill's MCP server for the sake of skills. (If `resources/*` is useful for independent reasons, evaluate on its own merits.)

**Watch for upstream movement (low-cost tripwire):**
- One-shot CI job or local script that `strings`-greps the installed Claude Code binary for `MCP_SKILLS`, `fetchMcpSkillsForClient`, or `parseSkillFrontmatterFields` as a symbol (not just as an internal registry key). Any non-zero count means the flag has flipped; the next PRD pass should re-read this spike and implement.
- Subscribe to `@modelcontextprotocol/sdk` release notes for a `skills/*` method addition.
- Monitor `/home/arthur/dev/claude-code/skills/mcpSkills.ts` file presence — if Anthropic ships the loader in a future source drop, the file will appear and the contract will be readable.

**If a GO later occurs, minimum-viable Distill implementation (for the future PRD):**
- Declare the `resources` capability in Distill's MCP server.
- Expose one test SKILL.md (`distill-compressor-skill`) as a resource with the URI convention and MIME type specified by the then-public contract.
- Verify in a live Claude Code session that `/distill-compressor-skill` appears in the skill menu with `loadedFrom === 'mcp'` (checkable via the debug flag or by tracing the skills-list render).
- Only then port the remaining skill templates.

**Re-verification instructions (for the next audit):**
```bash
# 1. Check the installed Claude Code binary for MCP_SKILLS activation
BIN=$(readlink -f $(which claude))
strings "$BIN" | grep -cE 'MCP_SKILLS|fetchMcpSkillsForClient|parseSkillFrontmatter'
# Current (v2.1.117): 3 (only parseSkillFrontmatter, from the registry key)
# GO-threshold: ≥ 5 with fetchMcpSkillsForClient present

# 2. Check for skills/list protocol support
strings "$BIN" | grep -cE '^skills/list$|^skills/get$'
# Current: 0. GO-threshold: ≥ 2.

# 3. Check the public Claude Code source drop for the absent loader
test -f /home/arthur/dev/claude-code/skills/mcpSkills.ts && echo "GO (loader present)" || echo "still NO-GO"
```

---

## Appendix — Citation index

Every upstream claim in this report resolves to the following file:line anchors. If any no longer resolves on the next audit, the mechanism has moved upstream and the spike should be re-run.

| Claim | Citation |
|---|---|
| Consumer filter: `loadedFrom === 'mcp'` in SkillTool | `claude-code/tools/SkillTool/SkillTool.ts:82-93` |
| Producer gated on `feature('MCP_SKILLS')` | `claude-code/services/mcp/client.ts:117-121` |
| First-fetch gate (connect) | `claude-code/services/mcp/client.ts:2174-2176` |
| Reconnect gate | `claude-code/services/mcp/client.ts:2348-2352` |
| React-hook gate | `claude-code/services/mcp/useManageMCPConnections.ts:22-24, :684, :718` |
| Consumer filter: `getMcpSkillCommands` returns `[]` when flag off | `claude-code/commands.ts:547-559` |
| Builder registry documenting the conditional-compile arrangement | `claude-code/skills/mcpSkillBuilders.ts:1-44` |
| Side-effect registration at `loadSkillsDir.ts` module init | `claude-code/skills/loadSkillsDir.ts:1077-1085` |
| `resources/list` request schema used by the path-adjacent loader | `claude-code/services/mcp/client.ts:2000-2031` |
| `prompts/list` / `prompts/get` request schemas (for contrast) | `claude-code/services/mcp/client.ts:2033-2046` |
| Filter distinguisher between MCP prompts and MCP skills | `claude-code/services/mcp/utils.ts:77-94` |
| `feature()` symbol source | `bun:bundle` (imported e.g. at `claude-code/context.ts:1`, `claude-code/commands.ts:59`) |

**Installed binary inspected:** `/home/arthur/.local/share/claude/versions/2.1.117` (Claude Code v2.1.117). Re-run the `strings` audits in [Follow-ups](#follow-ups) against whichever binary is on `$PATH` at next audit time.
