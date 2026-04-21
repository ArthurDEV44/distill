[PRD]

# PRD: Distill v0.9.1 — Audit Cleanup (Security + Dead Code + CI)

## Changelog

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-04-20 | ArthurDEV44 + Claude | Initial draft from 6-agent swarm audit (legacy, security, quality, concept, debt, web packages) |

## Problem Statement

A full-codebase audit (6 parallel agents over `packages/mcp-server`, `apps/web`, shared packages, and root config) surfaced four problem classes that v0.9.0 did not address:

1. **Residual sandbox vulnerabilities.** v0.9.0 shipped QuickJS-as-default and added deprecation warnings, but the `DISTILL_LEGACY_EXECUTOR=true` env var still exists and silently replaces the WASM sandbox with `new Function()` — OWASP A02:2025 classes this as a reportable misconfiguration (bypass of all isolation). The static analyzer regex blocks `.constructor[` but NOT `.constructor(`, allowing the canonical `this.constructor.constructor("…")()` escape chain (same attack class as [SandboxJS GHSA-jjpw-65fv-8g48](https://github.com/nyariv/SandboxJS/security/advisories/GHSA-jjpw-65fv-8g48)). `git config` is absent from `BLOCKED_GIT_COMMANDS` in `sandbox/sdk/git.ts:34-58`, permitting persistent compromise via `core.sshCommand`. Directory walkers in `host-bridge.ts:88-111` and `search.ts:59-91` traverse symlinks without `isSymbolicLink()` checks, enabling workspace-escape reads of `/etc/*`. `path-validator.ts:72-84` silently accepts non-existent paths (no symlink check), creating a TOCTOU window.

2. **~3 600 lines of dead code + 1 unused package.** Evidence from import-graph traversal and `Grep`: `tools/analyze-context.ts` (4th tool, never registered), `tools/dynamic-loader.ts` (fake "dynamic" 20-line wrapper), `analytics/session-tracker.ts` (zero importers), `utils/{toon-serializer,output-estimator,output-similarity,project-detector,command-normalizer,error-normalizer}.ts` (all with zero production callers), 4 `summarizers/*` advanced modules (1 852 LOC, never wired), `src/config/` empty directory, `packages/ui/` (three stub components, zero consumers), Turborepo starter SVGs in `apps/web/public/`, `apps/web/src/components/ui/Button/` duplicate, and `turbo.json` orphan env vars (`DATABASE_URL`, `CLERK_*`, `POLAR_*`) and `db:*` tasks inherited from the starter template.

3. **CI/CD is incomplete and documentation lies.** `.github/workflows/build.yml` runs only `bun run lint`; typecheck, test, and build do not run on push/PR. `CLAUDE.md:110` claims "4 parallel jobs". `packages/shared/src/types.ts` is `export {}` but CLAUDE.md claims it exports `SupportedLanguage`/`ContentType`. `ROADMAP.md` still lists deprecated tool names (`browse_tools`, `run_tool`, `summarize_logs`, `diff_compress`). `apps/web/src/app/layout.tsx:15` hardcodes `lang="en"` on a French-first site. `packages/shared/src/constants.ts` pricing is 4 months stale.

4. **Over-engineering detected.** `src/middleware/` is a 313-LOC priority-ordered dispatch chain for one middleware (`logging`, verbose mode only). `sandbox/branded-types.ts:118-147` defines 4 runtime type guards that are all identical `typeof === "string"` checks — false sense of safety. `compressors/logs.ts:75` re-implements `parseLogLine()` locally while `utils/log-parser.ts` already exports one.

**Why now:** v0.9.0 is DONE (2026-04-05). Before tagging v1.0 stable, these findings must be resolved or explicitly accepted. OWASP A02:2025 puts a concrete deadline on the legacy executor removal (SemVer minor → major removal path), and every release that ships with CI running only `lint` ships untypechecked and untested code. Dead code inflates maintenance cost on every audit and obscures the "3 Tools, Zero Friction" concept that is Distill's differentiator.

## Overview

Distill v0.9.1 is a hardening + cleanup release. No new tools, no new capabilities. The release closes the audit findings in six coherent epics:

1. **Sandbox hardening v2** — remove `DISTILL_LEGACY_EXECUTOR` entirely, block `.constructor(` chain, blacklist `git config`, enforce `isSymbolicLink` checks in directory walkers, re-validate paths at open time.
2. **Dead code purge** — `knip`-assisted sweep that removes ~3 600 LOC of unreachable code plus the `packages/ui/` package and starter artefacts.
3. **CI restoration** — add typecheck, test, and build jobs; enforce a Vitest coverage threshold (75% lines / 70% branches per ecosystem norm); add a `knip` check in CI to prevent dead-code regression.
4. **De-over-engineering** — inline the 1-middleware pipeline into `registry.ts`, fix or remove `branded-types` runtime guards, dedupe `parseLogLine`.
5. **Docs & config truth-up** — fix CLAUDE.md claims (CI jobs, shared exports), modernize ROADMAP.md tool list, correct root layout `lang`, update Anthropic pricing constants or remove `packages/shared` if genuinely unused.
6. **Compressor test coverage** — add regression tests for the 9 compressor files that currently have zero test neighbours (the core product feature).

Key architectural decision: the legacy executor is **removed**, not deprecated further — v0.9.0 shipped the warning in March, and OWASP A02:2025 explicitly flags a user-toggleable sandbox-bypass as a reportable finding. Users who relied on it must move to QuickJS or to external tooling.

## Goals

| Goal | Month-1 Target | Month-6 Target |
|------|---------------|----------------|
| Zero CRITICAL/HIGH findings in the swarm audit remain open | 5/5 closed | 0 regressions |
| `packages/mcp-server/src` line count reduction from dead-code purge | −3 500 LOC | maintained below pre-purge count |
| CI blocks merges that break typecheck/test/build (not only lint) | 100% of PRs | 100% |
| Vitest line coverage on `packages/mcp-server/src/compressors/**` | ≥ 75% | ≥ 80% |
| `knip` reports zero unused files in `packages/mcp-server/src` | 0 | 0 |

## Target Users

### Distill Maintainer (primary)
- **Role:** engineer contributing to or triaging Distill issues.
- **Behaviours:** reads CLAUDE.md to orient; trusts CI green to mean "ready to merge"; uses `grep`/`bun run check-types` during refactors.
- **Pain points:** audit findings from outside contributors keep surfacing legacy files (`dynamic-loader.ts`, `analyze-context.ts`) that look like features but aren't; CI green means nothing today because only lint runs; CLAUDE.md contains several claims that don't hold (4 CI jobs, shared types, pricing freshness).
- **Current workaround:** runs `bun run check-types` and tests manually before pushing; keeps mental models of "what is actually live" vs what the code suggests.
- **Success looks like:** a green CI means typecheck/test/build all passed; every file in `src/` is reachable from an entry point; CLAUDE.md claims match code reality.

### Claude Code User (indirect beneficiary)
- **Role:** end-user of Distill through the MCP protocol, running Claude Code sessions.
- **Behaviours:** invokes `auto_optimize`, `smart_file_read`, `code_execute` via Claude Code turn-by-turn; occasionally uses `code_execute` on untrusted or model-generated code.
- **Pain points:** relies on Distill's sandbox promise — a silent `DISTILL_LEGACY_EXECUTOR=true` in the environment nullifies it; untested compressors may silently return wrong output.
- **Current workaround:** trusts the `3 tools, zero friction` contract at face value.
- **Success looks like:** the sandbox is sandboxed, always; compressor regressions are caught before npm publish.

## Research Findings

### Competitive Context

- **SandboxJS advisory [GHSA-jjpw-65fv-8g48](https://github.com/nyariv/SandboxJS/security/advisories/GHSA-jjpw-65fv-8g48):** confirms the `.constructor.constructor` → `Function` chain is a real, exploited attack pattern on JS sandboxes. Mitigation: block `.constructor` access patterns in static analysis.
- **`@sebastianwessel/quickjs` v3** (July 2025): removed default WASM variant fallback to eliminate module-confusion vectors — evidence the upstream ecosystem treats these issues as release-blockers.
- **Block Engineering (MCP servers at scale)**: reduced their tool count from 30+ to 2, validating that pruning is higher-value than expansion — aligns with Distill's 3-tool philosophy and this PRD's deletion-heavy scope.

### Best Practices Applied

- **Knip for dead-code detection** (ts-prune archived, 2026 standard) — will drive Epic 2 with machine confirmation of the manual findings.
- **OWASP Top 10 A02:2025 Security Misconfiguration** — explicitly names "user-toggleable bypass of security controls" as a finding → justifies removing (not further deprecating) `DISTILL_LEGACY_EXECUTOR`.
- **Vitest `coverage.thresholds`** (75% lines / 70% branches for OSS TS tools of this size) — drives Epic 3 CI configuration.
- **SandboxJS/QuickJS hardening guidance** — block `.constructor` access, use `realpath` at open time (not validation time), accept residual TOCTOU but narrow the window — drives Epic 1.

*Full research sources stored in the agent audit transcripts (6 agents, 2026-04-20).*

## Assumptions & Constraints

### Assumptions (to validate)

- **A1.** Nobody in the wild depends on `DISTILL_LEGACY_EXECUTOR=true` for a non-debugging use case. *Evidence:* env var introduced only in v0.9.0, not documented in README, CLI, or public docs. *Validation:* GitHub issue search + CHANGELOG notice during v0.9.1 pre-release.
- **A2.** `knip` correctly identifies all dead files in Bun + Turborepo with default config. *Evidence:* Knip documentation claims native Turborepo/Bun workspace support. *Validation:* Run `knip` and spot-check 3 known-dead files and 3 known-live files before trusting its full report.
- **A3.** Removing `packages/ui/` does not break Turborepo caching for other packages. *Evidence:* no file imports from `@repo/ui`. *Validation:* `bun run build` must pass after removal.

### Hard Constraints

- **C1.** No breaking change to the 3 public tool signatures (`auto_optimize`, `smart_file_read`, `code_execute`). Input/output schemas stay identical.
- **C2.** No change to the stdio transport contract — stderr for diagnostics, stdout for MCP protocol.
- **C3.** Must ship before v1.0 tag (pre-1.0 window is the last chance to remove `DISTILL_LEGACY_EXECUTOR` without SemVer violation).
- **C4.** Node `>= 20` remains the minimum; no runtime bump in this release.

## Quality Gates

These commands must pass for every user story:

- `bun run lint` — ESLint flat config across all packages
- `bun run check-types` — TypeScript strict across all packages
- `cd packages/mcp-server && bun run test` — Vitest unit + integration tests
- `bun run build` — Turborepo build across all packages

For Epic 3 stories (CI), the acceptance includes the CI job running green on GitHub Actions for the story's branch.

## Epics & User Stories

### EP-001: Sandbox Hardening v2

Close the 2 CRITICAL and 3 HIGH sandbox findings from the audit. Builds on v0.9.0's QuickJS-as-default foundation by removing the bypass and closing layered defence gaps.

**Definition of Done:** `DISTILL_LEGACY_EXECUTOR` no longer exists in the codebase; `this.constructor.constructor` chain is rejected by the static analyzer; `git config` is in the blocklist; directory walkers reject symlinks pointing outside the working directory; `path-validator` re-validates at file-open time for non-existent paths.

#### US-001: Remove the `DISTILL_LEGACY_EXECUTOR` env var and the legacy executor code path
**Description:** As a Distill maintainer, I want the legacy `new Function()` executor removed from the codebase so that no environment configuration can silently disable the QuickJS sandbox.

**Priority:** P0
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] All code at `packages/mcp-server/src/sandbox/executor.ts:65-96,372` (legacy branch + env-var read) is deleted
- [ ] `DISTILL_LEGACY_EXECUTOR` does not appear anywhere in `packages/mcp-server/src/**` (verified by Grep)
- [ ] `DISTILL_USE_QUICKJS` deprecated env var handling at `executor.ts:91-94` is also removed (QuickJS is the only path)
- [ ] Given the env var was previously set, when the server starts, then it ignores the var silently (no warning, no crash)
- [ ] Given the legacy code was invoked via a code path that no longer compiles, when `bun run check-types` runs, then it passes with zero errors
- [ ] CHANGELOG.md (new file, see US-016) documents the removal as a BREAKING CHANGE for the sandbox

#### US-002: Block `.constructor(` chain in the static analyzer
**Description:** As a Distill maintainer, I want the static code analyzer to reject `.constructor(` paren-call patterns so that the canonical sandbox-escape chain `this.constructor.constructor("…")()` is refused before reaching QuickJS.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] The regex blocklist at `packages/mcp-server/src/sandbox/security/code-analyzer.ts:14-51` rejects `.constructor(`, `.constructor\s*(`, and `["constructor"]`
- [ ] Given user code containing `this.constructor.constructor("return process")()`, when passed to the analyzer, then it returns an error containing `"blocked: constructor-chain access"` (exact error code TBD by engineering)
- [ ] Given user code containing the legitimate pattern `Array.prototype.constructor` (read-only, no paren call) at the top level, when passed to the analyzer, then it returns an error (conservative; documented as a false positive we accept)
- [ ] A new test file `code-analyzer.test.ts` covers at minimum: 3 positive cases (bypass attempts) and 2 negative cases (safe patterns)
- [ ] Unhappy path: given obfuscated code `this["con"+"structor"]["con"+"structor"]("…")()`, the analyzer either rejects it OR QuickJS-level containment is documented as the final defence (test confirms QuickJS rejects `process` access)

#### US-003: Add `git config` and related write commands to the git blocklist
**Description:** As a Distill maintainer, I want `git config` and related commands blocked in the sandbox so that model-generated code cannot write persistent state to `~/.gitconfig`.

**Priority:** P0
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `BLOCKED_GIT_COMMANDS` at `packages/mcp-server/src/sandbox/sdk/git.ts:34-58` includes `"config"`, `"update-ref"`, `"reflog"`, `"gc"`, `"filter-branch"`, `"filter-repo"`
- [ ] Given sandbox code calls `ctx.git.execRaw(["config", "--global", "core.sshCommand", "x"])`, when executed, then `executeSandbox` returns an error with code `"GIT_COMMAND_BLOCKED"`
- [ ] Given sandbox code calls allowed read-only commands (`diff`, `log`, `blame`, `status`, `branch`, `show`, `tag`, `rev-parse`), when executed, then they succeed
- [ ] `git.test.ts` (or equivalent) has one test per newly blocked command asserting rejection
- [ ] The block list in `git.ts` is documented with a comment explaining why `config` is blocked (persistent compromise vector)

#### US-004: Enforce `isSymbolicLink` checks in all directory walkers
**Description:** As a Distill maintainer, I want directory walkers to refuse symlinks that point outside the working directory so that sandbox code cannot escape via `workingDir/escape → /etc`.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `walkDirectory` in `packages/mcp-server/src/sandbox/quickjs/host-bridge.ts:88-111` calls `entry.isSymbolicLink()` on every dirent; if true, it resolves the link and refuses if `realpath` falls outside `workingDir`
- [ ] Same change applied to `packages/mcp-server/src/sandbox/sdk/search.ts:59-91`
- [ ] Given `workingDir/escape → /etc/` exists, when sandbox code calls `ctx.files.glob("**/*")`, then the walker skips the symlinked entry and emits no file under `/etc`
- [ ] Given a safe in-tree symlink (e.g., `node_modules/.bin/foo → ../foo/bin.js` within the working directory), when the walker encounters it, then the resolved target is returned only if still under `workingDir`
- [ ] Unhappy path: given a symlink loop inside `workingDir`, when the walker runs, then it terminates (depth cap or visited-set) without stack overflow

#### US-005: Re-validate paths at file-open time, not only at validation time
**Description:** As a Distill maintainer, I want `validatePath` to refuse non-existent paths OR have file-read/write operations re-call `realpath` before the `fs` call so that the TOCTOU window between validation and open is closed.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/sandbox/security/path-validator.ts:72-84` no longer silently passes non-existent paths — it either (a) refuses them, or (b) marks the `ValidatedPath` with a "must re-check on open" flag
- [ ] `host-bridge.ts:58` (and every other `fs.readFileSync` / `fs.writeFileSync` call under `sandbox/`) re-validates the path immediately before the syscall, either by re-running `path-validator` or by passing an `openat`-style resolved file descriptor
- [ ] Given sandbox code requests a path `tmp/x` that does not exist at validation time, when it is opened for read, then the path is re-resolved and an error is returned if the resolved path has moved outside `workingDir`
- [ ] A new test simulates the TOCTOU race (mock filesystem state change between validate and open) and asserts the read is refused
- [ ] Unhappy path: given a symlink created between validation and open pointing to `/etc/passwd`, the read is refused with `"PATH_VALIDATION_FAILED_AT_OPEN"`

---

### EP-002: Dead Code Purge

Delete ~3 600 LOC of confirmed dead code, the `packages/ui/` package, starter artefacts, and orphan `turbo.json` config. Reduce maintenance surface and align code with the stated "3 Tools, Zero Friction" architecture.

**Definition of Done:** All files listed below are deleted; `bun run build` + `bun run check-types` + `bun run test` pass; `knip` reports zero unused files in `packages/mcp-server/src`.

#### US-006: Delete unreachable tool-layer files
**Description:** As a Distill maintainer, I want `tools/analyze-context.ts` and `tools/dynamic-loader.ts` removed so that the tool layer contains only the 3 registered tools and no misleading "dynamic loader" wrapper.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/tools/analyze-context.ts` is deleted
- [ ] `packages/mcp-server/src/tools/dynamic-loader.ts` is deleted; `server.ts` imports the 3 tools directly (which it already does at `server.ts:18-20`)
- [ ] The `ToolCategory` type (exported only from `dynamic-loader.ts`) is removed; any importer is updated
- [ ] `src/index.ts` no longer re-exports `getAllTools`
- [ ] Given the deletions, when `bun run check-types` runs, then zero errors
- [ ] Given the deletions, when the MCP server starts, then `tools/list` returns exactly 3 tools

#### US-007: Delete unused utility and analytics modules
**Description:** As a Distill maintainer, I want confirmed-dead utils/analytics modules removed so that the `utils/` directory becomes trustworthy again.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] These files are deleted along with their co-located test files:
  - `packages/mcp-server/src/analytics/session-tracker.ts`
  - `packages/mcp-server/src/utils/toon-serializer.ts` + test
  - `packages/mcp-server/src/utils/output-estimator.ts` + test
  - `packages/mcp-server/src/utils/output-similarity.ts`
  - `packages/mcp-server/src/utils/project-detector.ts`
  - `packages/mcp-server/src/utils/command-normalizer.ts`
  - `packages/mcp-server/src/utils/error-normalizer.ts`
- [ ] Their exports are removed from `utils/index.ts` and `index.ts`
- [ ] Given the deletions, when `knip` runs, then the removed files are gone from its unused-files report and no new unused files appear as a consequence
- [ ] Unhappy path: if `knip` flags a file as still referenced after the first-pass delete (a transitive import we missed), revert that specific file and document the callers as a follow-up investigation

#### US-008: Delete unwired `summarizers/` advanced modules and empty `config/` directory
**Description:** As a Distill maintainer, I want the 4 "Advanced 2026" summarizer modules and the empty `src/config/` directory removed so that the codebase reflects what actually ships.

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/summarizers/hierarchical.ts`, `clustering.ts`, `pattern-extraction.ts`, `scoring.ts` are deleted
- [ ] `summarizers/index.ts` no longer exports them
- [ ] `packages/mcp-server/src/config/` directory is removed
- [ ] The 4 basic summarizers (`server-logs`, `build-logs`, `test-logs`, `generic`) are untouched — they are the ones actually used
- [ ] Given the deletions, when `bun run test` runs, then all existing tests still pass
- [ ] Unhappy path: if a future feature needs clustering/hierarchical logic, a new branch resurrects from git history (documented in CHANGELOG)

#### US-009: Remove `packages/ui/`, starter artefacts, and orphan `turbo.json` config
**Description:** As a Distill maintainer, I want the vestigial UI package and starter residue removed so that `bun install` / `turbo build` do not waste cycles on dead workspaces.

**Priority:** P0
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/ui/` directory is deleted entirely
- [ ] `packages/typescript-config/react-library.json` is deleted (only consumer was `packages/ui`)
- [ ] `packages/eslint-config/react-internal.js` is deleted (only consumer was `packages/ui`)
- [ ] `packages/ui` reference removed from the root `package.json` `workspaces` array (if listed)
- [ ] `apps/web/public/turborepo-dark.svg`, `turborepo-light.svg`, `file-text.svg`, `globe.svg`, `window.svg`, `vercel.svg` are deleted
- [ ] `apps/web/src/components/ui/Button/` directory is deleted (not the shadcn `button.tsx`)
- [ ] `turbo.json` `globalEnv` no longer contains `DATABASE_URL`, `CLERK_WEBHOOK_SECRET`, `POLAR_*`, or the 3 other orphan vars
- [ ] `turbo.json` tasks `db:generate`, `db:migrate`, `db:studio` are deleted
- [ ] Given the deletions, when `bun install && bun run build` runs, then it succeeds
- [ ] Unhappy path: given any remaining reference to `@repo/ui` anywhere in the monorepo (should be zero), `bun run check-types` fails and the build is blocked until the reference is fixed

---

### EP-003: CI Restoration

Make CI trustworthy. Today a green CI means nothing beyond "lint passed". After this epic, green means typecheck + tests + build + coverage + knip all passed.

**Definition of Done:** `.github/workflows/build.yml` runs 4 parallel jobs + knip; Vitest coverage thresholds are enforced at 75% lines / 70% branches on `packages/mcp-server/src/**`; PRs cannot merge with red CI.

#### US-010: Add typecheck, test, and build jobs to CI
**Description:** As a Distill maintainer, I want CI to run typecheck, test, and build in addition to lint so that green CI means "ready to merge".

**Priority:** P0
**Size:** S (2 pts)
**Dependencies:** Blocked by US-006, US-007, US-008, US-009 (dead code removal must succeed before CI can verify clean)

**Acceptance Criteria:**
- [ ] `.github/workflows/build.yml` defines 4 jobs: `lint`, `typecheck`, `test`, `build`, running in parallel on `ubuntu-latest` with Bun
- [ ] `typecheck` runs `bun run check-types` at the monorepo root
- [ ] `test` runs tests only for `packages/mcp-server` (per existing convention in CLAUDE.md)
- [ ] `build` runs `bun run build` at the monorepo root
- [ ] All 4 jobs trigger on `push` to `main`, `dev`, and on `pull_request`
- [ ] No job has `continue-on-error: true`
- [ ] Given a PR that fails any of the 4 jobs, when the PR status is checked, then merge is blocked
- [ ] Unhappy path: given Tree-sitter WASM init failures on CI ubuntu runner (known flakiness), the test job retries once before failing

#### US-011: Enforce Vitest coverage thresholds
**Description:** As a Distill maintainer, I want coverage thresholds enforced in CI so that coverage cannot silently regress.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** Blocked by US-010

**Acceptance Criteria:**
- [ ] `packages/mcp-server/vitest.config.ts` adds a `coverage.thresholds` block: `{ lines: 75, branches: 70, functions: 75, statements: 75 }`
- [ ] `coverage.include` widens from `src/ast/**` only to `src/**/*.ts` (excluding `*.test.ts` and types-only files)
- [ ] The `test` CI job runs `vitest run --coverage` (not just `vitest run`)
- [ ] Given coverage drops below threshold on a PR, when CI runs, then the `test` job fails
- [ ] Documented baseline coverage % at the moment of this story's completion is added to `packages/mcp-server/README.md` (or CLAUDE.md) — informational, not a gate
- [ ] Unhappy path: given current coverage below threshold after widening the include scope (likely for untested areas), the thresholds are initially set to "current minus 2 points" per category for the first release, with a tracked follow-up to raise them

#### US-012: Add `knip` CI check to prevent dead-code regression
**Description:** As a Distill maintainer, I want `knip` running in CI so that dead exports/files cannot reaccumulate after this PRD's cleanup.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** Blocked by US-006, US-007, US-008, US-009, US-010

**Acceptance Criteria:**
- [ ] `knip` is added as a root `devDependency`
- [ ] A `knip.json` config file is added at the repo root, scoped to `packages/mcp-server/**` and `apps/web/**`
- [ ] A `bun run knip` script exists at the root
- [ ] A `knip` job is added to `.github/workflows/build.yml`, running in parallel with the other 4
- [ ] Given `knip` reports any unused file or dead export in `packages/mcp-server/src`, when CI runs, then the job fails
- [ ] A short allowlist exists for known-exported-but-not-yet-used code that must ship (e.g., a test-only helper) with a comment explaining each entry
- [ ] Unhappy path: given a knip false positive (e.g., a type-only import knip doesn't understand), the allowlist mechanism is used and the failure is not suppressed globally

---

### EP-004: De-Over-Engineering

Reduce over-abstractions that add cost without value. Each item removes an indirection for one concrete use.

**Definition of Done:** The middleware chain is inlined; branded-types runtime guards are either real or removed; `parseLogLine` has a single implementation.

#### US-013: Inline the middleware chain into the tool registry
**Description:** As a Distill maintainer, I want the `middleware/` pipeline inlined into `registry.ts` so that there is no priority-ordered dispatch abstraction for a single middleware.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/middleware/chain.ts`, `types.ts`, and `logging.ts` are deleted
- [ ] The logging behaviour (verbose-mode-only) is inlined at `src/tools/registry.ts:150-228` (before-tool and after-tool hook points) as two simple `if (verbose)` blocks
- [ ] No `beforeTool` / `afterTool` / `onError` / `priority` concepts remain in the codebase (verified by Grep)
- [ ] Given verbose mode is enabled, when any tool runs, then the same log lines appear as before (regression check against a captured baseline)
- [ ] Given verbose mode is disabled, when any tool runs, then no log output is emitted
- [ ] Unhappy path: given a tool handler throws, the logging still runs for the "after" path (error is still logged)

#### US-014: Fix or remove broken `branded-types` runtime guards
**Description:** As a Distill maintainer, I want the misleading 4-identical-`typeof-string` runtime guards either replaced with real checks or removed so that the brand system doesn't give a false sense of safety.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `packages/mcp-server/src/sandbox/branded-types.ts:118-147` — the 4 guards (`isValidatedPath`, `isSafePattern`, `isSanitizedGitArg`, `isSanitizedCode`) are either (a) implemented with brand-specific validation (path prefix check, pattern regex, arg metacharacter check, code blocklist regex) OR (b) deleted entirely; NOT left as identical `typeof === "string"`
- [ ] The branded **types** themselves are kept — they add compile-time discipline
- [ ] If guards are deleted, every call site of the deleted guards is updated (verified by Grep)
- [ ] If guards are implemented, at least one positive and one negative test per guard exists in `branded-types.test.ts`
- [ ] Unhappy path: given an untrusted string passed to a function expecting a branded type (bypassing the validator), TypeScript compile fails — compile-time enforcement is preserved

#### US-015: Deduplicate `parseLogLine` — compressors use the utils implementation
**Description:** As a Distill maintainer, I want a single `parseLogLine` implementation so that log parsing behaviour is consistent between compressors and summarizers.

**Priority:** P1
**Size:** XS (1 pt)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] The local `parseLogLine` at `packages/mcp-server/src/compressors/logs.ts:75` is deleted
- [ ] `compressors/logs.ts` imports `parseLogLine` from `utils/log-parser.ts` instead
- [ ] If the two implementations had behavioural differences, the unified version matches the more permissive one and a test is added documenting the chosen behaviour
- [ ] Given identical log input, when compressed via `logs` compressor vs summarized via `generic` summarizer, then the parsed line structure is identical (regression test)

---

### EP-005: Docs & Config Truth-Up

Fix the claims in CLAUDE.md, ROADMAP.md, and sibling docs that no longer match code.

**Definition of Done:** CLAUDE.md CI claim matches reality; `packages/shared/src/types.ts` either contains the claimed types or is deleted/repurposed; ROADMAP.md tool list is current; root layout `lang` is dynamic; pricing constants are current or removed.

#### US-016: Truth-up `CLAUDE.md`, `ROADMAP.md`, and add a `CHANGELOG.md`
**Description:** As a Distill maintainer, I want the top-level docs to reflect the current state of the code so that a new contributor reading them can trust what they say.

**Priority:** P1
**Size:** S (2 pts)
**Dependencies:** Blocked by US-001 (legacy executor removal) — CHANGELOG documents the breaking change

**Acceptance Criteria:**
- [ ] `CLAUDE.md` CI claim "4 parallel jobs — lint, typecheck, test, build" is either (a) true after US-010 ships, or (b) updated to match reality at time of writing
- [ ] `CLAUDE.md` claim about `packages/shared` exporting `SupportedLanguage`, `ContentType` is reconciled with US-017
- [ ] `CLAUDE.md` section "Anti-Friction Rules" is preserved (not edited by this PRD)
- [ ] `ROADMAP.md` Phase 1 table is updated: deprecated tool names (`browse_tools`, `run_tool`, `summarize_logs`, `diff_compress`) are replaced with the current 3-tool list or moved to a "History" section
- [ ] A new root `CHANGELOG.md` is created following keep-a-changelog format, with entries for v0.8.0, v0.9.0, and a draft v0.9.1 section documenting: `DISTILL_LEGACY_EXECUTOR` removal (BREAKING), dead-code purge, CI restoration, sandbox hardening
- [ ] `RELEASE_NOTES_v0.6.0-beta.md` and `RELEASE_NOTES_v0.8.0.md` are either moved under `docs/releases/` or superseded by `CHANGELOG.md` (decision to be made during implementation — documented in the commit message)

#### US-017: Reconcile `packages/shared` with its actual usage (repurpose or delete)
**Description:** As a Distill maintainer, I want `packages/shared` to either contain real exports that are really used, or to be deleted, so that the workspace graph matches reality.

**Priority:** P1
**Size:** M (3 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] One of the two paths is taken (decision logged in the PR description):
  - **Path A (repurpose):** `packages/shared/src/types.ts` gains the `SupportedLanguage` and `ContentType` exports (moved from `packages/mcp-server/src/ast/types.ts`), and `packages/mcp-server` imports them via `@distill/shared`. OR
  - **Path B (delete):** `packages/shared/` is removed entirely; `apps/web/package.json` dependency on `@distill/shared` is removed; pricing constants relocate to wherever they are actually (will be) used.
- [ ] Path A: `packages/shared/src/types.ts` is no longer `export {}` — at minimum `SupportedLanguage` and `ContentType` are real exports imported by at least one other package
- [ ] Path B: `bun install && bun run build` succeeds after removal
- [ ] Given the chosen path, when `bun run check-types` runs, then zero errors
- [ ] Unhappy path: given Path A is chosen and moving the types breaks circular-import resolution, Path B is taken instead (fallback plan documented in the PR)

#### US-018: Fix root layout `lang` attribute and update stale pricing
**Description:** As a Distill maintainer, I want the French-first web app to actually declare `lang="fr"` on first render and the Anthropic pricing constants to be current (or clearly flagged as stale).

**Priority:** P2
**Size:** S (2 pts)
**Dependencies:** None

**Acceptance Criteria:**
- [ ] `apps/web/src/app/layout.tsx:15` `<html lang="en">` is replaced with dynamic `lang={params.lang}` or hardcoded `lang="fr"` (French is the default locale)
- [ ] `packages/shared/src/constants.ts` Anthropic pricing is either (a) updated to the current published prices with a new `Updated: 2026-04` comment, OR (b) deleted if Path B of US-017 was taken
- [ ] Given the site is rendered with the default locale, when the HTML is inspected, then `<html lang="fr">` is present
- [ ] Given a user navigates to `/en/...`, when the page renders, then `<html lang="en">` is present
- [ ] Unhappy path: given Next.js root layout cannot read dynamic params (app-router constraint), a `[lang]/layout.tsx` override is added that sets the correct `lang` attribute client-side via `useEffect` or via a server-component pattern

---

### EP-006: Compressor Test Coverage

Close the biggest coverage gap surfaced by the audit: the 9 compressor files have zero test neighbours despite being the core product.

**Definition of Done:** Every file in `packages/mcp-server/src/compressors/` except `index.ts` has at least one test file with ≥75% line coverage and ≥1 unhappy-path assertion.

#### US-019: Add regression tests for all compressors
**Description:** As a Distill maintainer, I want unit tests for every compressor so that compression-ratio and output-shape regressions are caught before npm publish.

**Priority:** P1
**Size:** L (5 pts)
**Dependencies:** Blocked by US-011 (threshold enforcement incentivizes this story)

**Acceptance Criteria:**
- [ ] New test files exist for: `generic.ts`, `diff.ts`, `logs.ts`, `semantic.ts`, `stacktrace.ts`, `conversation.ts`, `multifile.ts`, `config.ts`
- [ ] Each test file includes at least 3 tests: one positive (typical input → expected shape), one compression-ratio floor (input → output size ≤ X% of input, with X chosen per compressor type), one unhappy path (malformed input → graceful fallback, not crash)
- [ ] `vitest.config.ts` coverage threshold of 75% lines is met for `src/compressors/**`
- [ ] Snapshot-style tests are used for compression output shape, with carefully curated fixtures in `src/compressors/__fixtures__/`
- [ ] Given a compressor is modified to change its output format, when tests run, then the snapshot mismatch forces a deliberate review (not a silent pass)
- [ ] Unhappy path: given a compressor receives an empty string, 1 MB of random bytes, or a string with only whitespace, then it returns a well-formed result (no throw, no infinite loop, output length bounded)

## Functional Requirements

- **FR-01:** The MCP server MUST register exactly 3 tools (`auto_optimize`, `smart_file_read`, `code_execute`) — no additions, no removals in this release.
- **FR-02:** The `code_execute` tool MUST NOT have any code path that executes user code outside the QuickJS WASM sandbox.
- **FR-03:** The sandbox code analyzer MUST reject the `.constructor(` paren-call pattern in user-supplied code.
- **FR-04:** The git SDK in the sandbox MUST reject `config`, `update-ref`, `reflog`, `gc`, `filter-branch`, `filter-repo` as subcommands.
- **FR-05:** Directory walkers in the sandbox MUST refuse symlinked entries whose resolved target falls outside `workingDir`.
- **FR-06:** File-read and file-write operations in the sandbox MUST validate the resolved path immediately before the syscall, not only at argument-validation time.
- **FR-07:** CI MUST run lint, typecheck, test, build, and knip in parallel on every push and PR.
- **FR-08:** CI MUST block merge when any of the 5 jobs fails.
- **FR-09:** `vitest run --coverage` MUST fail when coverage drops below 75% lines / 70% branches across `packages/mcp-server/src/**`.
- **FR-10:** The codebase MUST NOT contain unused exports or unreachable files as reported by `knip` (exceptions must be explicitly allowlisted with comments).
- **FR-11:** The system MUST NOT include a `DISTILL_LEGACY_EXECUTOR` env-var code path.

## Non-Functional Requirements

- **Performance:** The `code_execute` tool latency p95 MUST NOT regress by more than 5% vs v0.9.0 baseline (measured by a new benchmark harness on 100 representative inputs; baseline captured before Epic 1 begins).
- **Security:** Zero CRITICAL or HIGH findings from the 6-agent swarm audit remain open at release time. OWASP A02:2025 "Security Misconfiguration" controls pass: no user-toggleable bypass of security controls.
- **Reliability:** `notifications/tools/list_changed` MUST continue to be wrapped in try/catch to survive premature emit during stdio-transport initialization (v0.9.0 behaviour preserved).
- **Code quality:** `packages/mcp-server/src/**/*.ts` line count MUST decrease by ≥ 3 000 LOC from pre-cleanup baseline (measured via `cloc` or equivalent).
- **Coverage:** Line coverage on `packages/mcp-server/src/compressors/**` MUST be ≥ 75% at release.
- **CI latency:** The CI pipeline (5 parallel jobs) MUST complete within 10 minutes p95 on GitHub `ubuntu-latest` runners.
- **Supply chain:** `bun audit` (or equivalent) reports zero HIGH or CRITICAL vulnerabilities in production dependencies at release.

## Edge Cases & Error States

| # | Scenario | Trigger | Expected Behavior | User Message |
|---|----------|---------|-------------------|--------------|
| 1 | User sets removed env var | `DISTILL_LEGACY_EXECUTOR=true` in environment | Ignored; QuickJS always used | — (env var silently inert) |
| 2 | Constructor-chain escape attempt | User code: `this.constructor.constructor("…")()` | Rejected at static analysis | `"Blocked: constructor-chain access is not allowed"` |
| 3 | Blocked git command invocation | Sandbox code: `git config --global …` | `executeSandbox` returns error | `"Git command 'config' is not allowed in the sandbox"` |
| 4 | Symlink escape attempt | `workingDir/escape → /etc/`; `ctx.files.glob("**/*")` | Entry skipped; no `/etc` files returned | — (silent skip; optional warn in verbose mode) |
| 5 | TOCTOU: symlink created between validate and open | Concurrent symlink creation targeting `/etc/passwd` | Read refused; error returned | `"Path validation failed at open time"` |
| 6 | Knip false positive on CI | Type-only import not understood by knip | Build fails; fix = add to allowlist with comment | — (CI log: `"<file>: unused, but used via type import; see knip.json allowlist"`) |
| 7 | Coverage below threshold | New code without tests | `test` job fails | CI log: `"Coverage 72% below threshold 75% for <file>"` |
| 8 | Empty compressor input | `auto_optimize({ content: "" })` | Returns empty result with `compressed: false`, no throw | — |
| 9 | 1 MB random-bytes input | `auto_optimize({ content: <random 1MB> })` | Returns within 45K char cap; no infinite loop | — |
| 10 | `packages/ui` ghost import after removal | Stray `@repo/ui` import somewhere | `check-types` fails; merge blocked | Build error pointing at offending file |
| 11 | Breaking change impact on users | User upgrades and relied on legacy executor | Code runs in QuickJS; some capabilities differ | Surfaced via CHANGELOG.md BREAKING section, not runtime message |

## Risks & Mitigations

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| 1 | Removing `DISTILL_LEGACY_EXECUTOR` breaks an undocumented user workflow | Low | Med | Document in CHANGELOG as BREAKING; offer pre-release tag for one week before final; post issue asking if anyone used it |
| 2 | Knip false positives delay Epic 2 merge | Med | Low | Use allowlist in `knip.json`; treat false positives as "document, don't fight" |
| 3 | Coverage threshold blocks legitimate PRs on day 1 | Med | Med | US-011 sets initial thresholds at "current minus 2pts", increases over time |
| 4 | Symlink check in walker breaks a legitimate workspace with in-tree symlinks | Low | Med | US-004 allows symlinks whose `realpath` is still inside `workingDir` |
| 5 | Removing `packages/ui` causes Turborepo cache invalidation ripple | Low | Low | `bun run build` validation in acceptance criteria; cache invalidation is one-shot |
| 6 | Dead-code removal accidentally deletes a file used only via dynamic `require`/`import()` | Low | High | QuickJS blocks `require` and `import()` in user code; Grep for dynamic imports in source before each deletion; knip CI gate catches future regressions |
| 7 | CI 5-job pipeline exceeds 10 min budget | Med | Low | Jobs run in parallel; Turborepo remote cache (if configured) accelerates `build`; cache Bun install |

## Non-Goals

- **No new tools.** The 3-tool contract is preserved. Do not add a 4th.
- **No sandbox rewrite.** QuickJS stays as the only executor; no move to isolated-vm, Deno runtime, or WebContainers.
- **No language additions to AST.** The 7 existing languages stay; no new grammars.
- **No multifile/conversation compressor retirement.** They are used by the sandbox SDK; moving them is deferred.
- **No Anthropic pricing auto-sync.** Prices stay manually maintained (or deleted per US-017 path B).
- **No changes to the Fumadocs content structure** beyond the `lang` attribute fix.
- **No new middleware abstraction** after US-013 inlines the chain. If a future middleware need arises, re-introduce a minimal chain then.
- **No refactor of `ast/` per-language parsers.** They are repetitive by necessity (Tree-sitter + TS Compiler API).
- **No TypeScript 6 migration.** Tracked as separate debt, not in scope.
- **No removal of `DISTILL_USE_QUICKJS` alias until a separate cycle — actually included in US-001.** (Self-correction: this IS in scope as part of US-001.)

## Files NOT to Modify

- `packages/mcp-server/src/ast/**` — the 6-language parser subsystem; audit confirmed it is correctly factored and out of scope.
- `packages/mcp-server/src/ast/typescript.ts` — intentional backward-compat shim per CLAUDE.md.
- `packages/mcp-server/src/server.ts` `instructions` field — must remain a static string (prompt-cache correctness).
- `packages/mcp-server/src/server.ts` tool registration block (`server.ts:44-47`) — 3 tools, no more, no less.
- `packages/mcp-server/src/tools/auto-optimize.ts`, `smart-file-read.ts`, `code-execute.ts` public signatures — no breaking changes to input/output schemas.
- `packages/mcp-server/package.json` `version` field, `main`/`bin` entries — release tooling handles these.
- `smithery.yaml` — reflects the external contract; out of scope unless an Epic's changes require updates.
- `web-tree-sitter` version pin (`0.22.6`) in `package.json` — documented intentional pin.

## Technical Considerations

- **Architecture:** Epics 1, 2, 4 touch deep internal modules but the public MCP interface is untouched. Engineering to confirm the sandbox changes can ship as a patch bump without breaking existing Claude Code integrations.
- **Data Model:** No schema or persistence changes. In-memory state only.
- **API Design:** `tools/list` response stays identical (3 tools, same annotations). Engineering to confirm that removing `ToolCategory` does not affect any currently-consumed metadata.
- **Dependencies:** Add `knip` as dev dependency at the monorepo root. Consider `@sebastianwessel/quickjs` v3 upgrade as a follow-up (research flagged it but out of scope for v0.9.1).
- **Migration:** `DISTILL_LEGACY_EXECUTOR` removal is the only user-visible breaking change. Recommend a one-week pre-release tag (`v0.9.1-rc.1`) to surface any undocumented usage.
- **Rollback plan:** Each epic is independently revertible (different modules). Worst-case rollback: revert the release tag, publish `v0.9.2` that reverses the single problematic change. Git history of deleted files remains retrievable.
- **Release coordination:** After v0.9.1 merges to `main`, the npm publish flow runs; the CI pipeline must already be green on `main` before the publish step.

## Success Metrics

| Metric | Baseline (current) | Target | Timeframe | How Measured |
|--------|-------------------|--------|-----------|--------------|
| CRITICAL/HIGH audit findings open | 5 | 0 | Month-1 | Re-run 6-agent audit swarm on `main` post-release |
| `packages/mcp-server/src` LOC | ~current (captured pre-Epic-2) | −3 000 | Month-1 | `cloc packages/mcp-server/src` before/after |
| CI jobs run per PR | 1 (lint only) | 5 (lint, typecheck, test, build, knip) | Month-1 | `.github/workflows/build.yml` job count |
| Line coverage on `compressors/**` | 0% | ≥ 75% | Month-1 | Vitest coverage report |
| Line coverage on `packages/mcp-server/src/**` overall | ~current (captured after US-011 widens scope) | +10 pts | Month-6 | Vitest coverage report |
| Issues filed about `DISTILL_LEGACY_EXECUTOR` removal | 0 (new env var in v0.9.0) | ≤ 1 (manageable) | Month-1 post-release | GitHub issue search |
| `knip` unused-files count in `packages/mcp-server/src` | Approx. 10+ (pre-purge) | 0 | Month-1 | `bun run knip` CI job |
| v1.0 tag ship date (post-v0.9.1) | N/A | 2026-06-01 | Month-1 to Month-2 | Git tag |

## Open Questions

- **Should US-017 take Path A (repurpose `packages/shared`) or Path B (delete)?** Owner: Distill maintainer lead. By: US-017 kickoff. Blocks: US-018's pricing-constants subtask.
- **Should we bundle an upgrade to `@sebastianwessel/quickjs` v3 (July 2025) into this release, or defer?** Owner: engineering. By: end of Epic 1. Blocks: nothing in v0.9.1 but could strengthen the sandbox story.
- **What is the exact release channel strategy for v0.9.1-rc.1 — is a one-week RC window acceptable, or ship directly to `@latest`?** Owner: Distill release manager. By: US-001 merge. Blocks: final release tag.
- **For US-011's threshold rollout, what are the precise pre-release baseline coverage numbers per file group?** Owner: engineering, captured as part of US-011 acceptance. By: US-011 kickoff. Blocks: setting the initial thresholds accurately.

[/PRD]
