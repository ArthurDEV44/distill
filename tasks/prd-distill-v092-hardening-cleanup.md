[PRD]

# PRD: Distill v0.9.2 — Hardening v2.1 + Deviation Cleanup

## Changelog

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-04-21 | ArthurDEV44 + Claude | Initial draft from v0.9.1 /review-story findings (3 SHOULD_FIX security items, 5 observations, 2 deferred deviations) |

## Problem Statement

The v0.9.1 `/review-story` pass on 2026-04-21 green-lit the 19-story audit cleanup release (all stories `DONE`, quality gates passing, 1042/1042 tests, coverage 71.8% lines) but surfaced **eight follow-up items** that were tiered as non-blocking at the time and deferred. v0.9.2 closes them before the v1.0 tag:

1. **Three sandbox defense-in-depth gaps** — `validatePath` (path-validator.ts:69,85) compares `realpath(resolvedPath)` against a *non-realpathed* `workingDir`, producing false-positive "symlink escape" rejections on macOS (`/tmp` → `/private/tmp`) and any system with symlinked workingDirs; `fileExists` (host-bridge.ts:64-69) ignores the `mustRecheckOnOpen` flag, creating a one-bit host-filesystem enumeration oracle via the TOCTOU window documented in CWE-362; `BLOCKED_GIT_COMMANDS` (git.ts:34-71) lists `worktree`, `archive`, `notes` but omits `replace` (ref poisoning) and `bundle` (arbitrary file write via `--output`). None of these are RCE paths — QuickJS WASM and `execFileSync` are the primary controls — but all are cheap hardening wins that tighten layered defence ahead of v1.0.

2. **Two static-analysis-layer regex gaps** — per CVE-2025-68613 (n8n sandbox escape) and GHSA-jjpw-65fv-8g48 (SandboxJS prototype whitelist bypass), `String.fromCharCode` and `Reflect.ownKeys`/`Reflect.get` reconstruct blocked keywords at runtime and evade literal-substring regex checks. QuickJS is the real backstop but these are 2-line additions that raise the bar for casual bypass.

3. **Security dep not pinned** — `@sebastianwessel/quickjs@^3.0.0` caret range in `packages/mcp-server/package.json`. This is the most security-critical dep in the stack; caret auto-upgrades to any `3.x` release. Lockfile is pinned at `3.0.0` exactly, so pinning package.json to `3.0.0` aligns manifest with installed state.

4. **One type-safety gap** — `SanitizedCode` brand and `brandAsSanitizedCode` exist in `branded-types.ts` but `executor.ts` never calls the brand after `analyzeCode()` succeeds. The compile-time guarantee that user code went through static analysis is unenforced — future refactors could bypass analyzer without a TypeScript error.

5. **One web hydration anti-pattern** — `apps/web/src/app/layout.tsx:15` hardcodes `lang="fr"` on the root `<html>`; `SetHtmlLang` (client component) patches `document.documentElement.lang` via `useLayoutEffect` on `/en/*` routes. v0.9.1 US-018 unhappy-path explicitly permitted this fallback, but Next.js 16 docs (`internationalization.mdx`) confirm the canonical server-component pattern (`<html lang={lang}>` inside `[lang]/layout.tsx` with `params: Promise<{lang}>` + `await params`) works cleanly. The current code masks the flash via `suppressHydrationWarning`, which silences real hydration bugs as a side effect.

6. **One code consistency gap** — `git.ts:blame()` (line 432) pushes the raw `file` string into args instead of `validation.resolvedPath`. `execFileSync` + `--` separator blocks injection, but every other git callsite uses `resolvedPath`.

7. **Two v0.9.1 deviations carrying over** — US-007 PRD AC asked to delete `utils/error-normalizer.ts`; implementation kept it because `utils/signature-grouper.ts` (consumed by `tools/auto-optimize.ts:21,327-329` for log deduplication) imports 6 of its functions. US-008 kept `summarizers/{scoring,clustering,pattern-extraction}.ts` (~1,800 LOC) because `genericSummarizer` (consumed by `auto_optimize` + `sandbox/sdk/compress`) depends on them transitively. Both deviations are documented in the v0.9.1 status JSON but the repo state still conflicts with the audit's "dead code" framing — knip allowlist grows, maintainers are confused about what's live.

**Why now:** v0.9.1 shipped 2026-04-21. v1.0 stable is targeted for 2026-06-01 (v0.9.1 success metric). These eight items are either (a) security hardening that belongs in pre-1.0, (b) cleanup that reconciles the code with the audit's original framing, or (c) architectural fixes whose cost grows if deferred past v1.0's stability guarantee (Next.js layout change, brand type application). No single item is urgent; bundled they justify a focused patch release.

## Overview

Distill v0.9.2 is a **hardening + deviation-cleanup patch release**. Zero new tools, zero public contract changes, zero sandbox engine swap. Four coherent epics:

1. **EP-001 Sandbox Hardening v2.1** — realpath workingDir at validate entry, enforce `mustRecheckOnOpen` in `fileExists`, extend git blocklist (`replace`, `bundle`), extend static-analyzer blocklist (`String.fromCharCode`, `Reflect.ownKeys`, `Reflect.get`), pin `@sebastianwessel/quickjs` to exact `3.0.0`, use `validation.resolvedPath` in `git.blame()`.
2. **EP-002 Type-Safety Payoff** — apply `SanitizedCode` brand after `analyzeCode` and tighten `sandbox.execute`'s parameter type to force all callers through the static analyzer.
3. **EP-003 Web SSR Lang Fix** — move `<html lang={lang}>` ownership from `app/layout.tsx` (server root, hardcoded) into `[lang]/layout.tsx` (server, dynamic via `await params`). Delete `SetHtmlLang`. Remove `suppressHydrationWarning` if no longer needed.
4. **EP-004 Dead-Code Deviation Resolution** — inline the 6 functions of `error-normalizer.ts` used by `signature-grouper.ts` and delete the file (Path A from v0.9.1 US-007 notes); formally accept `scoring/clustering/pattern-extraction` as first-class summarizer code with updated docs/knip comments (Path B from v0.9.1 US-008 notes). Raise vitest coverage thresholds to current baseline as a ratchet.

Key architectural decisions (Phase 3):
- **US-009 = Path A** (inline + delete): error-normalizer's used subset is ~100 LOC and collapses cleanly.
- **US-010 = Path B** (accept as product): summarizers are 1,800 LOC of test-covered modular code; inlining adds risk without value.
- **Next.js lang = server-side**: canonical Next.js 16 pattern works; client-side patching is the documented fallback only.
- **QuickJS pin = `3.0.0` exact**: matches lockfile; manual bump on upstream security patch.

## Goals

| Goal | Month-1 Target | Month-6 Target |
|------|---------------|----------------|
| SHOULD_FIX items from v0.9.1 review closed | 8/8 closed | 0 regressions |
| v0.9.1 deviations resolved (US-007, US-008) | Documented path chosen + executed | No knip allowlist growth |
| Static-analyzer bypass obfuscation coverage | +3 patterns (`String.fromCharCode`, `Reflect.ownKeys`, `Reflect.get`) | +0 regressions |
| Git blocklist completeness vs Phase 2 research gaps | `replace`, `bundle` added | No new Git 2.47+ write commands unblocked |
| Vitest line coverage floor on `packages/mcp-server/src` | Raised from 64% → 70% | ≥ 75% |
| `packages/mcp-server/src` LOC after US-009 refactor | −157 LOC (error-normalizer.ts deleted) | stable |

## Target Users

### Distill Maintainer (primary)
- **Role:** engineer contributing to or triaging Distill issues; the same persona targeted by v0.9.1.
- **Behaviours:** reads the knip allowlist as a "what's kept intentionally" signal; trusts `validatePath` to reject symlink escapes without false positives.
- **Pain points:** the v0.9.1 knip allowlist grew to accommodate US-007 and US-008 deviations without a clear follow-up plan; `validatePath` mis-rejects legitimate paths on macOS dev machines; the `SanitizedCode` brand reads like a security guarantee it isn't enforcing.
- **Success looks like:** knip allowlist stable or shrinking; `validatePath` correctness parity across Linux/macOS; brand-type discipline matches README-level claims.

### Claude Code User (indirect beneficiary)
- **Role:** end-user running Distill via MCP stdio, invoking `code_execute` on model-generated code.
- **Behaviours:** unchanged from v0.9.1 — this release has no public surface change.
- **Success looks like:** unchanged UX, lower residual TOCTOU surface, no false-positive "symlink escape" errors on macOS workstations.

## Research Findings

Research performed during v0.9.1 Phase 2 (2026-04-20). Key sources re-cited here for v0.9.2 acceptance criteria:

### Security advisories
- **CVE-2025-68613** (n8n, 2025): canonical `this.constructor.constructor("return process")()` chain bypassed via `String.fromCharCode` reconstruction and `Reflect.ownKeys`. QuickJS WASM is the real defence; regex layer is a bar-raiser.
- **GHSA-jjpw-65fv-8g48** (SandboxJS, 2025): prototype whitelist bypass through `hasOwnProperty` shadowing — tangentially relevant; confirms that static regex sandboxes keep getting escaped.
- **Snyk 2025 safe-path-handling analysis**: Node.js 20+ lacks `openat`/`O_NOFOLLOW`; `realpath + prefix check` is SOTA. Critical correctness requirement: pre-realpath the root, not just the candidate.

### OWASP + CWE references
- **OWASP A02:2025 Security Misconfiguration** — "Remove or do not install unused features." v0.9.1 removed `DISTILL_LEGACY_EXECUTOR`; v0.9.2 closes the residual defence-in-depth gaps that A02 also covers under layered controls.
- **CWE-22** (Path Traversal — US-001 macOS false positive + US-006 raw-file arg consistency)
- **CWE-59** (Link Following — US-002 `fileExists` oracle)
- **CWE-74** (Injection — US-003 git blocklist defence in depth, US-006 consistency)
- **CWE-362** (TOCTOU — US-002 window between `validatePath` and `existsSync`)
- **CWE-693** (Defence in Depth — US-004 obfuscation regex, US-007 brand application)

### Framework docs
- **Next.js 16 internationalization.mdx + layout.mdx**: server-component `<html lang={lang}>` with `params: Promise<{lang}>` + `await params` is the canonical pattern; `useLayoutEffect` patching `document.documentElement.lang` is the documented fallback when dynamic params can't be read in the root layout (not the case here — `[lang]/layout.tsx` already reads params correctly).
- **Knip 6.x reference/configuration**: `ignoreDependencies` + `ignoreWorkspaces` are the 2026 field names; allowlist entries require comments per v0.9.1 US-012 norm.
- **Vitest coverage**: flat `coverage.thresholds: { lines, branches, functions, statements }`; per-file threshold overrides via same object.

### Codebase constraints
- `@sebastianwessel/quickjs` installed at exactly `3.0.0` (bun.lock line ~1200).
- `signature-grouper.ts` consumed by `auto-optimize.ts:21,327-329` — MUST preserve log-dedup output byte-for-byte in US-009.
- `genericSummarizer` consumed by `auto_optimize` + `sandbox/sdk/compress` — MUST NOT change output format in US-010 (re-framing only).

*Full sources: v0.9.1 Phase 2 transcripts + Snyk article, OWASP Top 10 2025, n8n advisory, Next.js GitHub docs.*

## Assumptions & Constraints

### Assumptions (to validate)

- **A1.** No consumer of `validatePath` relies on the current false-positive rejection on macOS as a test fixture. *Evidence:* grep shows all consumers route through `safeReadFileSyncLegacy` which is already realpath-correct. *Validation:* run `path-validator-toctou.test.ts` and new symlinked-workingDir tests to confirm.
- **A2.** `@sebastianwessel/quickjs` will not ship a `3.0.1` patch during the v0.9.2 cycle that we'd want auto-applied. *Evidence:* upstream cadence is ~quarterly; no CVE in queue per last check. *Validation:* check upstream GitHub releases at US-005 kickoff; if a patch lands with a fix we need, pin to that version instead.
- **A3.** Inlining `error-normalizer.ts` into `signature-grouper.ts` preserves `auto_optimize` log-dedup output byte-identical. *Evidence:* the 6 functions are pure (no side effects, no shared state); inlining is a mechanical move. *Validation:* snapshot-compare `auto_optimize` output on a 1,000-line error log fixture before and after.
- **A4.** Removing `SetHtmlLang` and moving `<html>` into `[lang]/layout.tsx` does not break Fumadocs routing. *Evidence:* docs routes are nested under `[lang]/docs/*`; their layout already has access to `lang`. *Validation:* `bun run build` must generate static pages for `/fr/*` and `/en/*` with correct `lang`.

### Hard Constraints

- **C1.** Zero breaking changes to `auto_optimize` / `smart_file_read` / `code_execute` input/output schemas (3-tool contract preserved per v0.9.1 C1).
- **C2.** Coverage floors from v0.9.1 US-011 must not regress; this PRD's US-011 raises them.
- **C3.** Node ≥ 20 (no runtime bump).
- **C4.** Knip CI gate must remain green — no new allowlist entries without a documented `knip.jsonc` comment.
- **C5.** No new middleware, no new abstractions. Each fix is a bounded, localized change.
- **C6.** No changes to tool descriptions, `_meta` hints, or server `instructions` (prompt-cache correctness).

## Quality Gates

These commands must pass for every user story:

- `bun run lint` — ESLint flat config across all packages
- `bun run check-types` — TypeScript strict across all packages
- `cd packages/mcp-server && bun run test` — Vitest unit + integration tests (all must pass; new tests added where specified)
- `bun run build` — Turborepo build across all packages
- `bun run knip` — zero unused files, zero unused exports outside the documented allowlist

CI (`.github/workflows/build.yml`) already runs all five jobs in parallel per v0.9.1 US-010/US-012. Acceptance = green on all 5.

## Epics & User Stories

### EP-001: Sandbox Hardening v2.1

Close the 3 SHOULD_FIX sandbox gaps + 3 LOW/INFO consistency items surfaced by the v0.9.1 audit. Builds on v0.9.1's defence-in-depth foundation by tightening layered controls in directions flagged by research.

**Definition of Done:** `validatePath` pre-realpaths `workingDir`; `fileExists` honors `mustRecheckOnOpen`; `git.BLOCKED_GIT_COMMANDS` includes `replace` and `bundle`; `code-analyzer.BLOCKED_PATTERNS` includes `String.fromCharCode`, `Reflect.ownKeys`, `Reflect.get`; `@sebastianwessel/quickjs` pinned to `3.0.0` exact; `git.blame()` uses `validation.resolvedPath`. New tests cover each hardening. All quality gates pass.

#### US-001: `validatePath` pre-realpaths `workingDir` to fix macOS false-positive symlink-escape rejections
**Description:** As a Distill maintainer on macOS, I want `validatePath` to resolve `workingDir` via `realpath` at the entry of the function so that paths under a symlinked working directory (`/tmp/foo` → `/private/tmp/foo`) are not falsely rejected as "Symlink escapes working directory".

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/sandbox/security/path-validator.ts:69` and `:85` no longer use the raw `workingDir` parameter for `path.relative` comparisons — both sides of the comparison are `realpath`-resolved (or the `workingDir` itself is resolved once at function entry and reused)
- [ ] The resolution uses `fs.realpathSync(workingDir)` with a try/catch fallback to the raw string (so a not-yet-existing workingDir does not throw — preserve current "best effort" behaviour)
- [ ] Given a symlinked workingDir (`/tmp/project` → `/private/tmp/project`) and a legitimate in-tree path, when `validatePath` is called, then it returns `{ safe: true, resolvedPath: <realpath under /private/tmp/project> }`
- [ ] Given the same workingDir and a path outside the tree, when `validatePath` is called, then it returns `{ safe: false, error: "Path must be within working directory: …" }` (same UX as before)
- [ ] A new test file `path-validator-realpath-root.test.ts` exists with at minimum: one positive case (symlinked workingDir + legit path), one negative case (symlinked workingDir + escape path), one case where workingDir does not exist yet (verify try/catch fallback path)
- [ ] Existing `path-validator-toctou.test.ts` still passes (no regression)
- [ ] Unhappy path: given `fs.realpathSync(workingDir)` throws because the path does not exist, the function does not crash and falls back to treating `workingDir` as a literal string (behaviour documented in a 1-line comment)

#### US-002: `fileExists` honors `mustRecheckOnOpen` to close the one-bit host-filesystem oracle
**Description:** As a Distill maintainer, I want `fileExists` in the QuickJS host bridge to respect the `validation.mustRecheckOnOpen` flag and re-resolve the path through `realpath` before `fs.existsSync` so that a symlink planted between validation and the existence check cannot leak bits about host files outside the working directory.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** US-001 (landed first for consistency; not a hard blocker)

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/sandbox/quickjs/host-bridge.ts:64-69` routes through `resolveWithinWorkingDir(validation.resolvedPath!, workingDir)` when `validation.mustRecheckOnOpen` is truthy, and returns `false` if the realpath resolves outside `workingDir`
- [ ] Given a non-existent path at validate time and a symlink planted to `/etc/passwd` before the existsSync call, when `fileExists` is invoked, then it returns `false` (not `true`)
- [ ] Given a legitimate in-tree path, when `fileExists` is invoked, then it returns `true` (no regression on the happy path)
- [ ] Given a path that exists at validate time (no `mustRecheckOnOpen`), when `fileExists` is invoked, then the behaviour is unchanged from v0.9.1 (fast path preserved)
- [ ] A new test in `sandbox/walker-symlink.test.ts` (or a new `host-bridge-file-exists.test.ts`) asserts the TOCTOU-planted-symlink case returns `false`
- [ ] Unhappy path: given `resolveWithinWorkingDir` throws (e.g. permission denied), `fileExists` returns `false` (no unhandled exception propagated to guest)

#### US-003: Add `replace` and `bundle` to the git command blocklist
**Description:** As a Distill maintainer, I want `git replace` (ref poisoning via replacement objects) and `git bundle` (arbitrary file write via `--output`) blocked in the sandbox so that model-generated code cannot corrupt the repository object graph or write bundles to disk.

**Priority:** P0
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `BLOCKED_GIT_COMMANDS` at `packages/mcp-server/src/sandbox/sdk/git.ts:34-71` includes `"replace"` and `"bundle"` (grouped with the persistent-compromise block that already documents `worktree`, `notes`, `archive`)
- [ ] The comment block at lines 59-64 is extended to note why `replace` (redirects object lookups, persists via refs) and `bundle` (`--output` writes arbitrary files) are blocked
- [ ] Given sandbox code calls `ctx.git.execRaw(["replace", "HEAD", "v1.0"])`, when executed, then `executeSandbox` returns an error with code `GIT_COMMAND_BLOCKED`
- [ ] Given sandbox code calls `ctx.git.execRaw(["bundle", "create", "dump.bundle", "HEAD"])`, when executed, then `executeSandbox` returns an error with code `GIT_COMMAND_BLOCKED`
- [ ] Given sandbox code calls allowed read-only commands, when executed, then they succeed (no regression)
- [ ] `git.test.ts` adds one test per newly blocked command asserting rejection

#### US-004: Add `String.fromCharCode`, `Reflect.ownKeys`, `Reflect.get` to the static analyzer blocklist
**Description:** As a Distill maintainer, I want the static code analyzer to reject `String.fromCharCode(...)`, `Reflect.ownKeys`, and `Reflect.get` patterns so that the canonical CVE-2025-68613 obfuscation path that reconstructs blocked keywords at runtime is refused before reaching QuickJS. `\bReflect\b` is already blocked; these are more precise patterns and defence in depth.

**Priority:** P1
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `BLOCKED_PATTERNS` at `packages/mcp-server/src/sandbox/security/code-analyzer.ts:12-60` gains three entries:
  - `{ pattern: /\bString\.fromCharCode\s*\(/, reason: "String.fromCharCode is not allowed (keyword reconstruction vector)" }`
  - `{ pattern: /\bReflect\.ownKeys\s*\(/, reason: "Reflect.ownKeys is not allowed" }`
  - `{ pattern: /\bReflect\.get\s*\(/, reason: "Reflect.get is not allowed" }`
- [ ] The existing `\bReflect\b` pattern is retained (covers Proxy-style cases)
- [ ] Given user code `this[String.fromCharCode(99,…)][String.fromCharCode(99,…)]("…")()`, when passed to the analyzer, then it returns an error containing `"String.fromCharCode is not allowed"`
- [ ] Given legitimate code that uses `String.fromCharCode(65)` as a non-obfuscation utility (conservative false positive accepted — documented in the comment block at lines 31-38)
- [ ] `code-analyzer.test.ts` adds at minimum: 1 positive case per new pattern, 1 negative case asserting `"hello world".length` still passes (baseline regression)
- [ ] Unhappy path: given `Reflect.apply` (not in the new blocklist), when passed to the analyzer, then it is caught by the existing `\bReflect\b` pattern (verify with a test)

#### US-005: Pin `@sebastianwessel/quickjs` to exact `3.0.0`
**Description:** As a Distill maintainer, I want the most security-critical dependency pinned to an exact version so that a future `3.x` auto-upgrade does not silently change WASM sandbox behaviour between a tested lockfile and the next fresh install.

**Priority:** P1
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/package.json` `"@sebastianwessel/quickjs"` value changes from `"^3.0.0"` to `"3.0.0"` (exact, no caret, no tilde)
- [ ] `bun.lock` resolves to the same `3.0.0` entry (already present — verify no change post-`bun install`)
- [ ] A comment in `CLAUDE.md` § Dependencies is added (or the existing pin note for `web-tree-sitter` is extended) documenting: "`@sebastianwessel/quickjs` pinned at `3.0.0` exact — the WASM sandbox engine is the primary security boundary; upgrades are reviewed manually"
- [ ] `bun install && bun run build && bun run test` all pass (no regression from the pin mechanics)
- [ ] Unhappy path: given a future `3.0.1` ships with a security patch, the follow-up issue is filed to bump the pin; `knip` continues to pass because the package is still referenced from `src/`

#### US-006: `git.blame()` uses `validation.resolvedPath` for consistency
**Description:** As a Distill maintainer, I want `git.blame()` to pass the validated resolved path to `execGit` instead of the raw user-supplied `file` string so that every git callsite operates on the canonically-resolved path — defence in depth and consistency with other callers.

**Priority:** P1
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/sandbox/sdk/git.ts:430` — the `args.push("--", file)` line becomes `args.push("--", validation.resolvedPath!)` (or equivalent typed non-null access after the safety check at line 420)
- [ ] Given `blame("./src/foo.ts", 42)` where the path resolves to `/work/src/foo.ts`, when executed, the `git blame --porcelain -L42,42 -- /work/src/foo.ts` command is issued (verified via a test that inspects execGit args OR by captured output parity)
- [ ] Existing `git.test.ts` blame tests continue to pass (no behavioural change for legitimate inputs)
- [ ] Unhappy path: given `validatePath` returns `safe: false`, `blame()` returns the existing `gitError.invalidArg` — no regression

---

### EP-002: Type-Safety Payoff

Apply the `SanitizedCode` brand at the `executeSandbox` callsite so the type system enforces what the audit has been claiming: "code ran through `analyzeCode` before reaching the sandbox". The v0.9.1 US-014 AC kept the brand types but left application for a follow-up — this is the follow-up.

**Definition of Done:** `executeSandbox` brands code with `brandAsSanitizedCode` after `analyzeCode` succeeds; `sandbox.execute` (or its wrapper) accepts `SanitizedCode` instead of `string`; removing the brand call is a TypeScript compile error. All quality gates pass.

#### US-007: Apply `SanitizedCode` brand after `analyzeCode` and thread the branded type into the sandbox execute path
**Description:** As a Distill maintainer, I want `executeSandbox` to call `brandAsSanitizedCode(code)` immediately after `analyzeCode` returns `safe: true`, and I want the resulting `SanitizedCode` type threaded to the `sandbox.execute` boundary so that TypeScript refuses compilation if a future change passes unvalidated user code.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/sandbox/executor.ts:38-49` — after the `analyzeCode` safety check, the code string is branded: `const safeCode = brandAsSanitizedCode(code)` (import added from `./branded-types.js`)
- [ ] The wrapping `wrappedCode` (lines 61-69) continues to be a plain string for QuickJS consumption — the brand is NOT propagated through the template literal (that would defeat the composition); instead, a single `brandAsSanitizedCode` call gates the path into `sandbox.execute` and the wrappedCode is derived from `safeCode` (documented via a comment: "brand demonstrates analyzeCode gate; wrapped string is the QuickJS-facing payload")
- [ ] `sandbox.execute` in `disposables.ts` (or the internal interface) is retyped to accept `SanitizedCode` for its user-code parameter — OR a thin wrapper `executeSanitized(code: SanitizedCode, …)` is introduced and `executeSandbox` calls that wrapper
- [ ] Given a future refactor that removes the `brandAsSanitizedCode` call, when `bun run check-types` runs, then it fails with a TypeScript error (verified by temporarily commenting the call in a `@ts-expect-error`-guarded test; kept as a regression test)
- [ ] `branded-types.ts` no longer has `SanitizedCode` marked as unused by knip (if knip.jsonc had it in the allowlist for this reason, remove it)
- [ ] Unhappy path: given `analyzeCode` returns `safe: false`, `brandAsSanitizedCode` is NOT called and the early-return path is preserved (no change in error UX)
- [ ] The `SanitizedCode` `@ts-expect-error` test in `type-tests.ts` (added in v0.9.1 for symmetry) is updated if the brand-usage pattern changes shape

---

### EP-003: Web SSR Lang Fix

Move `<html lang={lang}>` ownership from the root `app/layout.tsx` (hardcoded `"fr"`) to `[lang]/layout.tsx` (server component, reads `await params`). Delete `SetHtmlLang` and its `useLayoutEffect` client patch. This removes the hydration flash that `suppressHydrationWarning` currently masks and matches the Next.js 16 canonical i18n pattern.

**Definition of Done:** `[lang]/layout.tsx` renders `<html lang={lang}>` as a server component; `app/layout.tsx` no longer owns `<html>` (either becomes a thin pass-through or is removed if Next.js allows); `SetHtmlLang` is deleted; no `suppressHydrationWarning` needed on the `<html>` (unless another unrelated reason exists — documented). Build produces correct `<html lang="fr">` for `/fr/*` and `<html lang="en">` for `/en/*`.

#### US-008: Move `<html lang={lang}>` into `[lang]/layout.tsx` and delete `SetHtmlLang`
**Description:** As a Distill maintainer, I want the locale `lang` attribute rendered server-side by the `[lang]/layout.tsx` layout so that English visitors receive `<html lang="en">` on first paint without a hydration flash and without relying on client-side JavaScript.

**Priority:** P2
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `apps/web/src/app/[lang]/layout.tsx` renders `<html lang={lang}>` and owns `<body>` (moved from root layout). The signature remains `params: Promise<{ lang: string }>` + `const { lang } = await params` (already correct per v0.9.1)
- [ ] `apps/web/src/app/layout.tsx` is either (a) deleted if Next.js 16 allows `[lang]/layout.tsx` as the root, or (b) becomes a thin pass-through that does NOT render `<html>` (Next.js behaviour to be verified during implementation; if a root layout is required, it passes `children` through without HTML structure — document the rationale in a code comment)
- [ ] `apps/web/src/components/SetHtmlLang.tsx` is deleted
- [ ] `suppressHydrationWarning` is removed from `<html>` unless an unrelated reason (e.g., theme class from `next-themes`) justifies keeping it — if kept, a code comment documents why
- [ ] Given a request to `/fr/docs/...`, when the page renders, the HTML source begins with `<html lang="fr">` (verified via a build-time inspection OR a Playwright/Puppeteer smoke test against `bun run build && bun run start`)
- [ ] Given a request to `/en/docs/...`, when the page renders, the HTML source begins with `<html lang="en">` (same verification)
- [ ] `bun run build` succeeds with static pages for all `generateStaticParams` entries
- [ ] Unhappy path: given Next.js 16 requires a root `app/layout.tsx` and moving `<html>` to `[lang]/layout.tsx` is impossible, the fallback is to use `generateStaticParams` + a Next.js `i18n` config redirect so that the root layout receives `lang` via route group — the decision is logged in the commit message and documented in CLAUDE.md

---

### EP-004: Dead-Code Deviation Resolution

Close the two v0.9.1 deviations that the audit originally misclassified as dead code but turned out to be transitively live. US-009 takes Path A for `error-normalizer.ts` (inline + delete). US-010 takes Path B for summarizers (accept as product code). US-011 ratchets coverage floors upward now that the churn has settled.

**Definition of Done:** `error-normalizer.ts` is deleted after its 6 used functions are inlined into `signature-grouper.ts`; the knip allowlist no longer references error-normalizer; `summarizers/scoring|clustering|pattern-extraction.ts` are no longer framed as "unwired advanced modules" in docs/comments — they are labeled as `genericSummarizer` implementation detail; coverage floors raised to current baseline rounded down.

#### US-009: Inline `error-normalizer.ts` into `signature-grouper.ts` (Path A) and delete the file
**Description:** As a Distill maintainer, I want the 6 functions of `error-normalizer.ts` that `signature-grouper.ts` depends on (via `tools/auto-optimize.ts:21,327-329` for log deduplication) inlined into `signature-grouper.ts` so that the audit's original "delete error-normalizer" goal is finally met and knip can re-confirm zero dead files.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] The 6 used exports (`normalizeErrorLine`, `extractErrorParts`, `createSignature`, `formatLocation`, `isLikelyError`, `ErrorParts`) are moved verbatim into `packages/mcp-server/src/utils/signature-grouper.ts` (or a new sibling private module consumed only by `signature-grouper.ts` — implementer's choice, documented in commit)
- [ ] `packages/mcp-server/src/utils/error-normalizer.ts` is deleted
- [ ] `packages/mcp-server/src/utils/index.ts` no longer exports `error-normalizer.js` (confirm current state — may already be unexported; this AC ensures the barrel stays clean)
- [ ] Given identical input log fixture (a 1,000-line error log captured pre-refactor), when `tools/auto-optimize` runs log deduplication before and after the refactor, the output is byte-identical (snapshot regression test, new or extending `auto-optimize.test.ts`)
- [ ] `bun run knip` no longer lists `error-normalizer.ts` in any context; the knip.jsonc allowlist entry for error-normalizer (if any) is removed
- [ ] `bun run test` passes with no new test flakiness
- [ ] The v0.9.1 lint warnings on `error-normalizer.ts` (6 `no-useless-escape` warnings) are resolved in the new inlined location or silenced with justified `// eslint-disable-next-line no-useless-escape` comments
- [ ] Unhappy path: given the snapshot regression test reveals a byte diff in the output, implementation is reverted and the story is re-scoped to a pure-refactor story that preserves the currently-observed output; this AC documents Path A is not taken if byte-identity cannot be preserved

#### US-010: Formally accept `summarizers/{scoring,clustering,pattern-extraction}.ts` as product code (Path B)
**Description:** As a Distill maintainer, I want the 3 summarizer modules (kept in v0.9.1 US-008 because `genericSummarizer` depends on them) relabeled in docs and comments as first-class production code so that future contributors stop treating them as "advanced 2026 modules never wired" and the knip allowlist rationale matches reality.

**Priority:** P1
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/summarizers/index.ts` barrel comment (or top of each kept file) is updated to document: "Used by `genericSummarizer` → `auto_optimize` + `sandbox/sdk/compress`. Not optional."
- [ ] `knip.jsonc` entries for `scoring.ts`, `clustering.ts`, `pattern-extraction.ts` are either (a) kept with an updated comment: "`genericSummarizer` internal — exported for test access and composition" or (b) removed if they are no longer needed (knip's `ignoreExportsUsedInFile` or similar captures the real usage)
- [ ] `CLAUDE.md` § Architecture is updated to note that the summarizer subsystem has 4 compressors (server-logs, build-logs, test-logs, generic) and that `generic` internally uses scoring/clustering/pattern-extraction — replacing any residual "4 basic summarizers, advanced ones deleted" framing from v0.9.1 docs
- [ ] `CHANGELOG.md` v0.9.2 section documents the re-labeling: "summarizer scoring/clustering/pattern-extraction formally accepted as product code (was: marked for deletion in v0.9.1 audit)"
- [ ] `bun run knip` passes with zero output changes vs v0.9.1 (the re-framing does not change knip's behaviour; the allowlist rationale changes)
- [ ] Unhappy path: given a future contributor files an issue asking why these 3 modules exist, the inline comment answers it without needing to read the v0.9.1 PRD deviation note

#### US-011: Raise vitest coverage floors to current baseline
**Description:** As a Distill maintainer, I want the coverage thresholds bumped from v0.9.1's baseline−2 floors (64/51/65/63) to the post-v0.9.1-US-019 measured baseline so that coverage cannot silently regress and the ratchet documented in v0.9.1 US-011 unhappy-path is executed.

**Priority:** P2
**Size:** XS (1 pt)
**Dependencies:** Blocked by US-001 through US-010 (so new tests from this PRD are included in the re-baseline)

**Acceptance Criteria:**
- [ ] `packages/mcp-server/vitest.config.ts` `coverage.thresholds` is updated to: `{ lines: 70, branches: 56, functions: 70, statements: 69 }` (current baseline 71.80/57.58/71.93/70.99 rounded down −1 pt buffer)
- [ ] `CLAUDE.md` § Coverage thresholds table is updated with the new floors and the new baseline captured post-v0.9.2
- [ ] Given a PR that drops coverage below any category's new floor, when CI runs, the `test` job fails
- [ ] `bun run test:coverage` passes at the new floors at the moment this story merges (verified by the CI green check)
- [ ] Unhappy path: given the v0.9.2 implementation work inadvertently reduces coverage below the current baseline (e.g., US-009 inlining deletes tests without adding equivalents), the story is blocked until coverage is restored — it does NOT ship with reduced floors just to pass

---

## Functional Requirements

- **FR-01:** `validatePath` MUST resolve `workingDir` via `realpath` (with try/catch fallback) before comparing candidate paths.
- **FR-02:** `fileExists` in the QuickJS host bridge MUST re-validate paths through `resolveWithinWorkingDir` whenever `mustRecheckOnOpen` is true.
- **FR-03:** `BLOCKED_GIT_COMMANDS` MUST include `replace` and `bundle` in addition to the v0.9.1 list.
- **FR-04:** `BLOCKED_PATTERNS` in the code analyzer MUST include `String.fromCharCode`, `Reflect.ownKeys`, and `Reflect.get`.
- **FR-05:** `@sebastianwessel/quickjs` MUST be pinned to an exact version (no caret, no tilde) in `packages/mcp-server/package.json`.
- **FR-06:** `git.blame()` MUST pass `validation.resolvedPath` (not the raw user-supplied file string) to `execGit`.
- **FR-07:** `executeSandbox` MUST call `brandAsSanitizedCode` after `analyzeCode` succeeds and before invoking `sandbox.execute`.
- **FR-08:** `sandbox.execute` (or its wrapper) MUST accept `SanitizedCode` (not plain `string`) for the user-code parameter.
- **FR-09:** The `<html lang={lang}>` element MUST be rendered by a server component with the locale derived from `await params`, not patched client-side.
- **FR-10:** `utils/error-normalizer.ts` MUST NOT exist in the repo post-US-009; its used exports MUST live inside `signature-grouper.ts` (or a sibling private module).
- **FR-11:** Summarizer modules `scoring.ts`, `clustering.ts`, `pattern-extraction.ts` MUST be documented as production code (not "unwired" or "advanced"); the knip allowlist entries, if any, MUST reflect this.
- **FR-12:** Vitest coverage thresholds MUST be ≥ 70/56/70/69 (lines/branches/functions/statements).

## Non-Functional Requirements

- **Performance:** `code_execute` tool p95 latency MUST NOT regress by more than 3% vs v0.9.1 baseline on the existing 100-input harness (tighter budget than v0.9.1's 5% because this is a hardening release).
- **Security:** Zero new MEDIUM/HIGH/CRITICAL findings in a follow-up `/review-story` pass (self-check). OWASP A02:2025 "layered defence" — all 6 hardening items deliver measurable control additions.
- **Reliability:** `notifications/tools/list_changed` continues to be wrapped in try/catch (v0.9.0 behaviour preserved).
- **Code quality:** `packages/mcp-server/src/**/*.ts` line count MUST decrease by ≥ 100 LOC net (US-009 deletion dominates; other stories are small edits).
- **Coverage:** Line coverage on `packages/mcp-server/src` MUST be ≥ 70% at release (raised floor).
- **CI latency:** 5-job pipeline MUST complete within 10 minutes p95 (v0.9.1 budget maintained).
- **Supply chain:** `bun audit` reports zero HIGH or CRITICAL vulns in production dependencies (including the new exact-pinned `@sebastianwessel/quickjs@3.0.0`).

## Edge Cases & Error States

| # | Scenario | Trigger | Expected Behavior | User Message |
|---|----------|---------|-------------------|--------------|
| 1 | Symlinked workingDir on macOS | User runs Distill in `/tmp/project` (symlink) | `validatePath` resolves `workingDir` first; legitimate paths pass | — (silent success) |
| 2 | workingDir does not exist yet | Fresh directory passed to `validatePath` | try/catch fallback treats workingDir as literal string | — (preserve v0.9.1 best-effort behaviour) |
| 3 | Symlink planted between validate and `fileExists` | Attacker race on non-existent path | `fileExists` re-resolves via `realpath`, returns `false` for out-of-tree target | — (no information leak) |
| 4 | `git replace` invocation | Sandbox code: `git replace HEAD v1.0` | Blocked | `"Git command 'replace' is not allowed in the sandbox"` |
| 5 | `git bundle create` invocation | Sandbox code: `git bundle create /tmp/x HEAD` | Blocked | `"Git command 'bundle' is not allowed in the sandbox"` |
| 6 | `String.fromCharCode` in user code | User code: `this[String.fromCharCode(99,111,…)][…]("…")()` | Rejected at static analysis | `"Blocked: String.fromCharCode is not allowed (keyword reconstruction vector)"` |
| 7 | Legitimate `"a".charCodeAt(0)` | Utility code | Not blocked (no `String.fromCharCode` match) | — |
| 8 | QuickJS upstream ships 3.0.1 | External event post-release | Manual review, bump pin if safe, file issue | — (maintainer workflow) |
| 9 | `brandAsSanitizedCode` accidentally removed in a refactor | Future bad PR | TypeScript compile error on `sandbox.execute` param mismatch | Build error: `"Argument of type 'string' is not assignable to parameter of type 'SanitizedCode'"` |
| 10 | English route `/en/docs/…` | Visitor navigates to EN page | Server renders `<html lang="en">` with no hydration flash | — |
| 11 | log dedup output drifts after US-009 inline | Implementation regression | Snapshot test fails, story blocked | CI error: `"log dedup output mismatch: see snapshot diff"` |
| 12 | Coverage drops below new floor (US-011) | Later PR adds untested code | `test` job fails | CI log: `"Coverage 69% below threshold 70% for <file>"` |

## Risks & Mitigations

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| 1 | US-009 inline accidentally changes log dedup output | Low | High | Pre-refactor snapshot test captured on a 1,000-line fixture; byte-identity gate in AC; unhappy-path aborts Path A |
| 2 | US-008 `<html>` move breaks Fumadocs SSG | Low | Med | Full `bun run build` in acceptance; smoke test against `/fr/docs/*` and `/en/docs/*`; unhappy-path falls back to keeping root layout |
| 3 | US-005 exact pin blocks a critical upstream CVE patch | Low | High | Document manual-bump workflow in CLAUDE.md; add calendar reminder for monthly upstream check |
| 4 | US-001 realpath call slows validatePath on hot path | Low | Low | `fs.realpathSync` is ~10µs on Linux; only called once per `validatePath` invocation; performance NFR (+3% p95) covers this |
| 5 | US-007 brand application breaks sandbox execute signature | Med | Low | Wrapper pattern preferred over changing `sandbox.execute` directly; unhappy-path keeps wrapper as internal |
| 6 | US-011 threshold raise blocks legitimate PRs on day 1 | Med | Low | Rounded-down baseline with 1pt buffer; threshold floor is current measured coverage minus 1 pt — safe margin |
| 7 | US-004 `String.fromCharCode` regex catches a legitimate utility use | Low | Low | Comment documents conservative stance; QuickJS-level containment is the backstop; false positives are accepted and logged as `CodeAnalysis.blockedPatterns` |

## Non-Goals

- **No new tools.** 3-tool contract preserved (same as v0.9.1).
- **No sandbox engine change.** QuickJS stays; no move to isolated-vm, Deno runtime, or Wasmer.
- **No AST parser changes.** The 7 existing languages stay; `web-tree-sitter` stays pinned at `0.22.6`.
- **No Next.js major bump.** 16.x stays.
- **No `@sebastianwessel/quickjs` v4 migration** (if a v4 exists by release time). Only pin v3.0.0 exact.
- **No new middleware abstraction.** US-013 inlining from v0.9.1 stands.
- **No TypeScript 6 migration.** Separate debt.
- **No summarizer inlining (Path A for US-008 from v0.9.1).** Explicitly chose Path B in Phase 3 decisions.
- **No coverage target raise to 75%.** That's v1.0 scope; v0.9.2 ratchets to current baseline only.
- **No re-litigation of v0.9.1 scope.** SHOULD_FIX items from the v0.9.1 review that are not listed here (e.g., changes to `CLAUDE.md` anti-friction rules) are out of scope.

## Files NOT to Modify

- `packages/mcp-server/src/ast/**` — out of scope (same as v0.9.1).
- `packages/mcp-server/src/server.ts` `instructions` field and tool registration block — prompt-cache correctness + 3-tool contract.
- `packages/mcp-server/src/tools/auto-optimize.ts`, `smart-file-read.ts`, `code-execute.ts` public signatures — no breaking schema changes (internal wiring for US-009 snapshot test is allowed as long as output is byte-identical).
- `packages/mcp-server/package.json` `version` / `main` / `bin` — release tooling handles these; US-005 only touches the dependency range.
- `smithery.yaml` — external contract unchanged.
- `web-tree-sitter` version pin.
- `CLAUDE.md` § Anti-Friction Rules — preserved verbatim.

## Technical Considerations

- **Architecture:** All changes are localized to a single module each (except US-008 which spans two web files and a delete). No cross-cutting refactor. The public MCP interface is unchanged.
- **Data Model:** No schema or persistence changes. In-memory state only.
- **API Design:** `tools/list` response stays identical (3 tools, same annotations, same `_meta`). `ListTools` handler untouched.
- **Dependencies:** No new dependencies. US-005 changes a version range only. US-009 removes a file but no package-level dep change.
- **Migration:** Zero user-visible breaking changes. `DISTILL_LEGACY_EXECUTOR` stays removed (v0.9.1 established this).
- **Rollback plan:** Each epic is independently revertible; each story is 1-3 files. Git history retains the pre-refactor state for US-009 byte-identity comparison.
- **Release coordination:** After v0.9.2 merges to `main`, npm publish flow runs. No RC window required (no breaking changes); ship direct to `@latest`.

## Success Metrics

| Metric | Baseline (post-v0.9.1) | Target | Timeframe | How Measured |
|--------|------------------------|--------|-----------|--------------|
| SHOULD_FIX items from v0.9.1 review remaining open | 8 | 0 | Month-1 | Re-run `/review-story` on `main` post-release |
| `packages/mcp-server/src` LOC | current | −100 (net, US-009 dominates) | Month-1 | `cloc packages/mcp-server/src` before/after |
| knip allowlist entries referencing v0.9.1 deviations | 2 (error-normalizer, summarizer trio) | 0 (or 1 if Path B keeps summarizer trio entries with updated rationale) | Month-1 | `knip.jsonc` diff |
| Line coverage on `packages/mcp-server/src/**` | 71.8% | ≥ 70% floor, ≥ 72% measured | Month-1 | Vitest coverage report |
| Branches coverage on `packages/mcp-server/src/**` | 57.58% | ≥ 56% floor, ≥ 58% measured | Month-1 | Vitest coverage report |
| `@sebastianwessel/quickjs` range type | caret (`^3.0.0`) | exact (`3.0.0`) | Month-1 | `package.json` diff |
| v1.0 tag ship date | N/A | 2026-06-01 | Month-1 to Month-2 | Git tag |
| Issues filed about macOS `validatePath` false positives | N/A | 0 post-release | Month-1 post-release | GitHub issue search |

## Open Questions

- **Should US-008 delete `apps/web/src/app/layout.tsx` entirely, or keep it as a minimal pass-through?** Owner: Distill web lead. By: US-008 kickoff. Blocks: US-008 final scope.
- **Should the knip allowlist entry for the summarizer trio be removed entirely (Path B+) or retained with updated rationale (Path B)?** Owner: engineering. By: US-010 kickoff. Blocks: US-010 AC final wording.
- **When `@sebastianwessel/quickjs@3.0.1` ships (if it does during v0.9.2 cycle), do we bump during v0.9.2 or defer to v0.9.3?** Owner: Distill security lead. By: US-005 kickoff. Blocks: final pin value.
- **Should US-011 coverage floor bump include a per-file floor for `src/compressors/**` (US-019 delivered 83%)?** Owner: engineering. By: US-011 kickoff. Blocks: `vitest.config.ts` final shape.

[/PRD]
