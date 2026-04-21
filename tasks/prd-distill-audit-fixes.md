[PRD]
# PRD: Distill Full Codebase Audit Remediation

## Overview

A comprehensive 5-agent swarm audit of the `packages/` directory identified ~80 findings across security, tools, AST/compression, infrastructure, and best practices. This PRD covers the complete remediation plan organized into 5 epics by domain. Stories are designed for parallel execution by AI agent swarms.

**Audit sources:**
- **tools-auditor** (Opus): 24 findings on tools, registry, middleware
- **security-auditor** (Opus): 14 findings on sandbox, path traversal, injection
- **ast-compressor-auditor** (Opus): 25 findings on parsers, compression, search
- **config-auditor** (Sonnet): 23 findings on packages, CI, TypeScript, ESLint
- **research-auditor** (Opus): 10 findings on MCP spec, dependencies, best practices

## Goals

- Eliminate all CRITICAL security vulnerabilities (sandbox escape, path traversal, arbitrary file read)
- Achieve full MCP 2025-06-18 compliance across all tools (outputSchema + annotations)
- Reach >80% test coverage on core modules (compressors, parsers, tools)
- Standardize dependency versions, TypeScript config, and validation patterns
- Add proper CI pipeline (build + typecheck + lint + test)
- Migrate shared types to `@distill/shared` and upgrade to Zod v4

## Quality Gates

These commands must pass for every user story:
- `bun run build` - All packages build successfully
- `bun run check-types` - TypeScript type checking passes
- `bun run lint` - ESLint passes across all packages
- `cd packages/mcp-server && bun run test` - All 730+ tests pass (including new tests added by the story)

## User Stories

---

### Epic 1: Security

---

#### US-001: Remove legacy sandbox mode and make QuickJS the only executor

**Description:** As a maintainer, I want to remove the fundamentally insecure legacy `new Function()` sandbox so that all code execution uses QuickJS WASM isolation.

**Acceptance Criteria:**
- [ ] Remove the `DISTILL_USE_QUICKJS` environment variable check in `src/sandbox/executor.ts`
- [ ] Remove the legacy `new Function()` execution path (`executor.ts:~310-350`)
- [ ] Remove `src/sandbox/code-analyzer.ts` (regex-based analysis only needed for legacy mode)
- [ ] QuickJS is the sole execution engine — no fallback
- [ ] Update `src/tools/code-execute.ts` to remove any legacy mode references
- [ ] All existing sandbox tests (`src/sandbox/sandbox.test.ts`, `src/sandbox/sdk/*.test.ts`) pass
- [ ] `code_execute` tool works correctly via QuickJS

---

#### US-002: Add path validation to pipeline read step and codebaseOverview

**Description:** As a user, I want pipeline operations to be sandboxed to the working directory so that arbitrary files cannot be read via pipeline manipulation.

**Acceptance Criteria:**
- [ ] `src/sandbox/sdk/pipeline.ts:~181-195` — add `validatePath(file, workingDir)` check before `fs.readFileSync` in the `read` pipeline step
- [ ] `src/sandbox/sdk/pipeline.ts:~280-291` — add `validatePath(dir, workingDir)` check in `codebaseOverview()` before `path.join`
- [ ] Files outside `workingDir` return an error result instead of file content
- [ ] Add test: pipeline read with `../../../etc/passwd` path is rejected
- [ ] Add test: `codebaseOverview("../../../")` is rejected
- [ ] Existing pipeline tests still pass

---

#### US-003: Add path validation to code_skeleton tool

**Description:** As a user, I want the `code_skeleton` tool to validate file paths so it cannot read arbitrary files on the host.

**Acceptance Criteria:**
- [ ] Extract `validatePath()` from `src/tools/smart-file-read.ts` into a shared utility at `src/utils/path-validator.ts`
- [ ] `src/tools/code-skeleton.ts:~170-172` uses the shared `validatePath()` before reading files
- [ ] Blocked file patterns (`.env`, `.pem`, `id_rsa`, credentials) are rejected
- [ ] Paths outside `process.cwd()` are rejected
- [ ] Add test: `code_skeleton` with `../../etc/passwd` is rejected
- [ ] Add test: `code_skeleton` with `.env` is rejected

---

#### US-004: Add path validation to multifile_compress tool

**Description:** As a user, I want the `multifile_compress` tool to validate file paths and enforce working directory boundaries.

**Acceptance Criteria:**
- [ ] `src/tools/multifile-compress.ts` — `findFiles()` and `loadFiles()` use the shared `validatePath()` from `src/utils/path-validator.ts`
- [ ] Sensitive files (`.env`, credentials, keys) are excluded from file discovery
- [ ] File discovery is restricted to `process.cwd()` boundary
- [ ] Symlinks pointing outside the working directory are rejected
- [ ] Add test: `multifile_compress` with patterns targeting `../` paths is rejected
- [ ] Add test: sensitive file patterns are filtered out

---

#### US-005: Prevent symlink escape in walkDirectory implementations

**Description:** As a maintainer, I want all `walkDirectory` implementations to check symlink targets so that sandbox boundaries cannot be bypassed via symbolic links.

**Acceptance Criteria:**
- [ ] `src/sandbox/sdk/search.ts:~63-91` — check each entry via `fs.realpathSync()` and verify resolved path is within `workingDir` before recursing or reading
- [ ] `src/sandbox/sdk/pipeline.ts:~108-143` — same symlink check
- [ ] `src/sandbox/sdk/analyze.ts:~461-474` — same symlink check
- [ ] Extract symlink-safe directory walking into a shared utility (e.g., `src/sandbox/sdk/safe-walk.ts`)
- [ ] Add test: symlinked directory pointing outside workingDir is skipped
- [ ] Add test: symlinked file pointing outside workingDir is not read

---

#### US-006: Secure git SDK argument handling

**Description:** As a user, I want git operations to prevent flag injection so that attackers cannot write files or exfiltrate data via git flags.

**Acceptance Criteria:**
- [ ] `src/sandbox/sdk/git.ts` — add `--` separator before user-provided refs/paths in `diff()`, `blame()`, `log()`
- [ ] Validate that user-provided `ref` parameter in `diff(ref?)` does not start with `--`
- [ ] Validate that user-provided args don't contain spaces (split and validate individually if needed)
- [ ] Add test: `git.diff("--output=/tmp/exfil")` is rejected
- [ ] Add test: `git.diff("HEAD --no-index")` is rejected
- [ ] Add test: normal refs like `"HEAD"`, `"main"`, `"abc123"` still work
- [ ] Existing git SDK tests (`src/sandbox/sdk/git.test.ts`) all pass

---

#### US-007: Validate host bridge inputs

**Description:** As a maintainer, I want host bridge functions to validate inputs at the boundary so that invalid data cannot reach internal APIs.

**Acceptance Criteria:**
- [ ] `src/sandbox/quickjs/host-bridge.ts:~165` — validate `lang` against the `SupportedLanguage` enum before calling `codeParse()`
- [ ] `src/sandbox/quickjs/host-bridge.ts:~168` — validate `targetJson` against `ExtractionTarget` schema (use Zod) before calling `codeExtract()`
- [ ] `src/sandbox/quickjs/host-bridge.ts:~248-251` — validate pipeline steps JSON against expected schema
- [ ] Invalid inputs return descriptive error messages instead of runtime crashes
- [ ] Add tests for host bridge validation edge cases

---

#### US-008: Fix error sanitization and QuickJS resource cleanup

**Description:** As a maintainer, I want error messages to be properly sanitized and QuickJS resources to be actively cleaned up.

**Acceptance Criteria:**
- [ ] `src/sandbox/code-analyzer.ts:~90` (or wherever sanitizeError moves after US-001) — escape `workingDir` for regex before using in `new RegExp()`
- [ ] Add path scrubbing for `/root/`, `/Users/`, `/var/`, `/opt/`, `/tmp/` patterns
- [ ] `src/sandbox/disposables.ts:~185-191` — investigate `@sebastianwessel/quickjs` disposal APIs and call them explicitly instead of no-op flag
- [ ] Add test: error sanitization with regex metacharacters in working directory
- [ ] Add test: various host path patterns are properly redacted

---

### Epic 2: Tools System

---

#### US-009: Add Zod validation to all tools missing it

**Description:** As a maintainer, I want all tools to use Zod validation on input so that malformed arguments are caught consistently.

**Acceptance Criteria:**
- [ ] `src/tools/discover-tools.ts:~84` — replace `args as` cast with Zod `.parse()` or `.safeParse()`
- [ ] `src/tools/lazy-mcp.ts:~35,120` — same for both `browse_tools` and `run_tool` handlers
- [ ] `src/tools/code-execute.ts:~59` — same
- [ ] `src/tools/auto-optimize.ts:~291` — same
- [ ] Standardize all tools on `.safeParse()` with explicit error messaging (preferred) OR `.parse()` (if you choose this, update all 11 `.parse()` tools too for consistency)
- [ ] All existing tests pass

---

#### US-010: Add MCP 2025-06-18 outputSchema and annotations to all tools

**Description:** As a maintainer, I want all 17 tools missing MCP 2025-06-18 compliance to have `outputSchema` and `annotations` so that LLM clients get structured guidance.

**Acceptance Criteria:**
- [ ] Add `outputSchema` (JSON Schema for the tool's text output structure) to: `compress_context`, `semantic_compress`, `diff_compress`, `conversation_compress`, `analyze_build_output`, `context_budget`, `deduplicate_errors`, `code_skeleton`, `smart_cache`, `smart_pipeline`, `optimization_tips`, `detect_retry_loop`, `set_output_config`, `multifile_compress`, `conversation_memory`, `browse_tools`, `run_tool`
- [ ] Add `annotations` to all 17 tools — at minimum: `readOnlyHint: true` (for all compression/analysis tools), `idempotentHint: true` (where applicable), `title` (human-readable name)
- [ ] `set_output_config` should have `readOnlyHint: false` (it modifies state)
- [ ] `run_tool` should have `readOnlyHint: false` (executes arbitrary tools)
- [ ] Token budget tests (`token-budget.test.ts`) updated to cover all tools
- [ ] Existing tests pass

---

#### US-011: Implement session tracking and remove dead code in compression tools

**Description:** As a maintainer, I want compression tools to properly track session stats and have no dead code.

**Acceptance Criteria:**
- [ ] `src/tools/compress-context.ts:~77-78` — implement `getSessionTracker().recordInvocation()` in the empty `if (tokensSaved > 0)` block (matching `multifile-compress.ts:280` pattern)
- [ ] `src/tools/semantic-compress.ts:~122-123` — same
- [ ] `src/tools/diff-compress.ts:~105-106` — same
- [ ] `src/tools/smart-pipeline.ts:~356-357` — same
- [ ] Remove unused `_omittedInfo` parameter from `compress-context.ts:48` `formatResult()`
- [ ] Remove unused `_technique`/`_strategy` parameters from `semantic-compress.ts:55` and `diff-compress.ts:52`
- [ ] All existing tests pass

---

#### US-012: Standardize tool loading patterns and centralize utilities

**Description:** As a maintainer, I want all tools to follow the same `ToolDefinition` export pattern and use centralized utilities.

**Acceptance Criteria:**
- [ ] Refactor `src/tools/analyze-context.ts` to export a proper `ToolDefinition` object (not raw function + schema)
- [ ] Refactor `src/tools/optimization-tips.ts` to export a proper `ToolDefinition` object
- [ ] Remove the inline adapter wrappers from `src/tools/dynamic-loader.ts:~90-99` and `~161-169`
- [ ] `analyze-context.ts` uses centralized `countTokens()` from `src/utils/token-counter.ts` instead of its own `encodingForModel("gpt-4")`
- [ ] Extract `formatLogSummary()` from `src/tools/auto-optimize.ts:~142-184` into `src/utils/format-helpers.ts`, replace duplicate in `smart-pipeline.ts:~83-114`
- [ ] Extract `formatDuration()` from `middleware/logging.ts:~18-21` and `session-stats.ts:~68-79` into shared utility
- [ ] Use centralized `detectContentType()` from `src/utils/content-detector.ts` in `auto-optimize.ts:~96-107` instead of local `isBuildOutput()`
- [ ] Fix `session-stats.ts:~21-24` to use shared `ANTHROPIC_MODELS` pricing instead of hardcoded Claude 3.5 Sonnet rates
- [ ] Fix `server.ts:~109` — replace hardcoded `"0.1.0"` with actual package version (import from `package.json` or build-time constant)
- [ ] All existing tests pass

---

#### US-013: Fix multifile-compress architecture issues

**Description:** As a maintainer, I want `multifile-compress` to use async filesystem APIs and proper glob matching.

**Acceptance Criteria:**
- [ ] `src/tools/multifile-compress.ts` — replace `fs.readdirSync`/`fs.readFileSync` with `fs/promises` (async `readdir`/`readFile`)
- [ ] Replace naive `matchesPattern()` function with `minimatch` or `fast-glob` for proper glob support
- [ ] `src/**/*.ts` correctly matches only files under `src/`
- [ ] `src/*.js` does not match files in subdirectories
- [ ] `tool.execute()` remains async-compatible (it already returns Promise)
- [ ] Add test: glob patterns match correctly (nested, wildcards, negation)

---

#### US-014: Add ReDoS protection for user-controlled RegExp

**Description:** As a maintainer, I want user-supplied regex patterns to be safe from catastrophic backtracking.

**Acceptance Criteria:**
- [ ] `src/tools/deduplicate-errors.ts:~44-45` — wrap `new RegExp()` in try/catch, add complexity check or timeout
- [ ] `src/tools/semantic-compress.ts:~90` — same
- [ ] `src/tools/compress-context.ts:~61` — same
- [ ] Consider using a ReDoS-safe library (e.g., `safe-regex2`) or implementing a simple complexity check (reject patterns with nested quantifiers)
- [ ] Add test: malicious regex pattern `(a+)+$` is rejected or handled safely
- [ ] Add test: normal regex patterns still work

---

#### US-015: Fix server startup edge cases

**Description:** As a maintainer, I want the server to handle startup edge cases properly.

**Acceptance Criteria:**
- [ ] `src/server.ts:~147-149` — guard `tools.onToolsChanged()` notification against missing client connection during startup
- [ ] `src/tools/conversation-memory.ts:~28` — move `sessionMemory` from module-level singleton into a context or registry pattern that supports testing and multiple instances
- [ ] Existing tests pass

---

### Epic 3: AST & Compression

---

#### US-016: Fix Python parser detailed flag and inconsistencies

**Description:** As a maintainer, I want the Python parser to always extract full information so it behaves consistently with all other language parsers.

**Acceptance Criteria:**
- [ ] `src/ast/python/parser.ts:~141` — remove the `detailed` parameter, always extract signatures and documentation
- [ ] Remove the `@deprecated` `detailed` flag from anywhere it's referenced
- [ ] Verify `extractPythonElement` and `searchPythonElements` still work correctly
- [ ] Existing Python AST tests pass
- [ ] Add test: `parse()` returns elements with signatures and docs by default

---

#### US-017: Fix Go parser isAsync semantic misuse and TS parser hardcode

**Description:** As a maintainer, I want parser fields to have correct semantics and handle language variants properly.

**Acceptance Criteria:**
- [ ] `src/ast/types.ts` — add optional `metadata?: Record<string, unknown>` field to `CodeElement` interface
- [ ] `src/ast/go/parser.ts:~286,311` — use `metadata.isGeneric` instead of `isAsync` for Go generic types
- [ ] Remove the type-unsafe `as unknown as CodeElement & { metadata }` cast in `src/ast/rust/parser.ts:~754`
- [ ] `src/ast/typescript/search.ts:~162` — add `isTypeScript` parameter to `searchTypeScriptElements()`, pass it to `parseTypeScript(content, isTypeScript)` instead of hardcoding `true`
- [ ] Existing parser tests pass

---

#### US-018: Add retry mechanism for Tree-sitter initialization failure

**Description:** As a maintainer, I want Tree-sitter parser initialization to be recoverable so that transient failures don't permanently break parsing.

**Acceptance Criteria:**
- [ ] In all 5 Tree-sitter parsers (`python/parser.ts`, `go/parser.ts`, `rust/parser.ts`, `php/parser.ts`, `swift/parser.ts`): add error handling that clears `initPromise` and `parserInstance` on initialization failure
- [ ] A failed init allows retry on next call instead of caching the rejected promise permanently
- [ ] Add test: simulate init failure (mock WASM loading), verify retry succeeds on second call
- [ ] Existing parser tests pass

---

#### US-019: Extract TreeSitterParserBase to eliminate duplication

**Description:** As a maintainer, I want a shared base utility for Tree-sitter parsers so that ~750 lines of duplicated boilerplate are eliminated.

**Acceptance Criteria:**
- [ ] Create `src/ast/tree-sitter-base.ts` with a generic utility that handles: singleton init pattern (`parserInstance`/`initPromise`), `extractElement` structure, `searchElements` structure, `LanguageParser` implementation
- [ ] Refactor Python, Go, Rust, PHP, and Swift parsers to use the base utility, parameterized by language-specific logic (node type mappings, element extraction rules)
- [ ] Remove dead/unused Tree-sitter S-expression queries from `src/ast/python/queries.ts` (~200 lines) and `src/ast/go/queries.ts` (~150 lines) that are never imported by their respective parsers
- [ ] All existing parser tests pass
- [ ] Quick-scan (`src/ast/quick-scan.ts`): add regex patterns for Rust (`fn`, `struct`, `impl`, `enum`, `trait`, `mod`), PHP (`function`, `class`, `interface`, `trait`, `enum`), and Swift (`func`, `class`, `struct`, `protocol`, `enum`, `actor`)

---

#### US-020: Centralize tiktoken encoder and fix BM25 stopwords

**Description:** As a maintainer, I want a single tiktoken encoder instance and consistent tokenization across search algorithms.

**Acceptance Criteria:**
- [ ] Remove all 6 duplicate `encodingForModel("gpt-4")` calls: `src/compressors/generic.ts:11`, `logs.ts:11`, `stacktrace.ts:11`, `config.ts:11`, `src/parsers/index.ts:19`, `src/tools/analyze-context.ts:39`
- [ ] All call sites import and use `countTokens()` from `src/utils/token-counter.ts` (which already has the proper lazy singleton)
- [ ] `src/utils/bm25.ts:~60-66` — add stopword filtering to `tokenize()`, matching the pattern already used in `src/utils/tfidf.ts:~117-123`
- [ ] Consider creating a shared tokenizer utility used by both BM25 and TF-IDF
- [ ] Existing search and compression tests pass

---

#### US-021: Optimize clustering and summarizer algorithms

**Description:** As a maintainer, I want clustering and summarization to perform well on large inputs.

**Acceptance Criteria:**
- [ ] `src/summarizers/clustering.ts:~89-111` — optimize `clusterLogs()`: add pre-grouping by first-token + length-bucket before pairwise comparison, OR add max entry limit (e.g., 1000) with sampling fallback
- [ ] `src/summarizers/clustering.ts:~222-246` — optimize Levenshtein to rolling-row (2 rows instead of full matrix), reducing space from O(n*m) to O(min(n,m))
- [ ] Extract duplicate `normalizeForPattern`/`normalizeMessage` from `scoring.ts:~279-290` and `clustering.ts:~195-206` into a shared utility
- [ ] Extract duplicate `generateClusterId`/`generatePatternId` from `clustering.ts:~267-274` and `pattern-extraction.ts:~320-329` into a shared utility
- [ ] Extract duplicate `truncate()` from `hierarchical.ts:~428` and `pattern-extraction.ts:~464` into a shared utility
- [ ] `src/utils/hybrid-search.ts:~149` — replace `Math.max(...spread)` with `.reduce()` to avoid potential stack overflow on large arrays
- [ ] Existing tests pass

---

### Epic 4: Test Coverage

---

#### US-022: Create compressor tests — generic and index

**Description:** As a maintainer, I want the generic compressor and auto-detection router to have test coverage.

**Acceptance Criteria:**
- [ ] Create `src/compressors/generic.test.ts` covering: line deduplication, pattern grouping, token reduction, empty/null input handling
- [ ] Create `src/compressors/index.test.ts` covering: auto-detection routing (logs detected → log compressor, diffs → diff compressor, code → code compressor, generic fallback)
- [ ] Tests validate compression actually reduces token count
- [ ] Tests verify edge cases (empty string, very long input, binary content)
- [ ] All tests pass

---

#### US-023: Create compressor tests — semantic and diff

**Description:** As a maintainer, I want the semantic and diff compressors to have test coverage.

**Acceptance Criteria:**
- [ ] Create `src/compressors/semantic.test.ts` covering: TF-IDF segment scoring, segment selection by ratio, preservation of high-relevance segments, ratio parameter validation (0-1)
- [ ] Create `src/compressors/diff.test.ts` covering: all three strategies (hunks-only, summary, semantic), git diff format parsing, empty diff handling, large diff handling
- [ ] Tests validate output contains key information from input
- [ ] All tests pass

---

#### US-024: Create compressor tests — logs, stacktrace, conversation, multifile

**Description:** As a maintainer, I want all remaining compressors to have test coverage.

**Acceptance Criteria:**
- [ ] Create `src/compressors/logs.test.ts` covering: pattern deduplication, log clustering, timestamp handling, error/warning extraction
- [ ] Create `src/compressors/stacktrace.test.ts` covering: stack trace parsing, error grouping, normalization, multi-language stack traces
- [ ] Create `src/compressors/conversation.test.ts` covering: rolling-summary strategy, key-extraction strategy, hybrid strategy, message preservation (system, last-N)
- [ ] Create `src/compressors/multifile.test.ts` covering: deduplication strategy, skeleton strategy, smart-chunk strategy, shared element extraction
- [ ] All tests pass

---

#### US-025: Create TypeScript parser tests

**Description:** As a maintainer, I want the TypeScript/JavaScript parser (the most complex parser) to have comprehensive test coverage.

**Acceptance Criteria:**
- [ ] Create `src/ast/typescript/parser.test.ts` covering: function extraction (regular, arrow, async, generator), class extraction (members, constructors, static), interface extraction, enum extraction, type alias extraction, generic type parameters, decorators, JSX handling
- [ ] Test both TypeScript and JavaScript parsing (the `isTypeScript` flag)
- [ ] Test extraction of specific elements by name and type
- [ ] Test skeleton generation
- [ ] All tests pass

---

#### US-026: Create content-detector and utility tests

**Description:** As a maintainer, I want content type auto-detection and key utilities to have test coverage.

**Acceptance Criteria:**
- [ ] Create `src/utils/content-detector.test.ts` covering: detection of logs, git diffs, config files, stack traces, build output, code, conversation, generic content
- [ ] Create `src/utils/error-normalizer.test.ts` covering: error message normalization, pattern extraction, grouping
- [ ] Create `src/utils/signature-grouper.test.ts` covering: deduplication by error signature
- [ ] Each test file covers normal cases, edge cases, and empty/null inputs
- [ ] All tests pass

---

#### US-027: Create core tool tests

**Description:** As a maintainer, I want the 4 always-loaded core tools to have unit tests.

**Acceptance Criteria:**
- [ ] Create `src/tools/auto-optimize.test.ts` covering: content type detection, build output compression, log compression, generic compression, empty input
- [ ] Create `src/tools/smart-file-read.test.ts` covering: file reading, AST extraction by target, skeleton mode, path validation (blocked patterns), non-existent file
- [ ] Create `src/tools/code-execute.test.ts` covering: basic code execution, SDK access (`ctx.files`, `ctx.compress`, `ctx.code`), timeout handling, blocked code patterns
- [ ] Create `src/tools/discover-tools.test.ts` covering: tool browsing by category, tool loading, TOON format output
- [ ] All tests pass

---

#### US-028: Create on-demand tool tests

**Description:** As a maintainer, I want on-demand tools to have basic test coverage.

**Acceptance Criteria:**
- [ ] Create `src/tools/compress-context.test.ts` covering: basic compression, content type parameter, token savings output
- [ ] Create `src/tools/diff-compress.test.ts` covering: all three strategies, invalid input
- [ ] Create `src/tools/conversation-compress.test.ts` covering: basic conversation compression
- [ ] Create `src/tools/summarize-logs.test.ts` covering: log type detection, summary output format
- [ ] Create `src/tools/analyze-build-output.test.ts` covering: build tool detection, error extraction
- [ ] Create `src/tools/deduplicate-errors.test.ts` covering: error grouping, deduplication
- [ ] Create `src/tools/code-skeleton.test.ts` covering: skeleton generation, path validation
- [ ] Create `src/tools/smart-pipeline.test.ts` covering: pipeline step execution, auto-detection
- [ ] All tests pass

---

### Epic 5: Infrastructure & Configuration

---

#### US-029: Add comprehensive CI pipeline

**Description:** As a maintainer, I want the CI pipeline to run tests, typecheck, and build verification so that broken code cannot be merged.

**Acceptance Criteria:**
- [ ] `.github/workflows/build.yml` — rename to `ci.yml` and rename workflow to "CI"
- [ ] Add job: `test` — runs `cd packages/mcp-server && bun run test`
- [ ] Add job: `typecheck` — runs `bun run check-types`
- [ ] Add job: `build` — runs `bun run build`
- [ ] Keep existing job: `lint` — runs `bun run lint`
- [ ] Trigger on push to `main` AND `dev`, and PRs to `main` AND `dev` (align with branch strategy)
- [ ] All jobs run on `ubuntu-latest` with Bun
- [ ] CI passes on current codebase

---

#### US-030: Migrate all packages to Zod v4

**Description:** As a maintainer, I want all packages to use Zod v4 so that there are no version mismatches.

**Acceptance Criteria:**
- [ ] Upgrade `zod` from `^3.24.1` to `^4.x` in `packages/mcp-server/package.json`
- [ ] Upgrade `zod` from `^3.24.1` to `^4.x` in `packages/shared/package.json`
- [ ] Verify `apps/web` already uses `^4.2.1` (no change needed)
- [ ] Fix any Zod v4 breaking changes in `packages/mcp-server/src/` (API changes: `z.object()` → check for breaking changes in schemas)
- [ ] Fix any Zod v4 breaking changes in `packages/shared/src/`
- [ ] Run `bun install` to update lockfile
- [ ] Remove `server.deps.inline: ["zod"]` from `vitest.config.ts` if no longer needed with Zod v4
- [ ] All tests pass

---

#### US-031: Migrate shared types and constants to @distill/shared

**Description:** As a maintainer, I want `@distill/shared` to contain actually-shared types and constants so that it serves its architectural purpose.

**Acceptance Criteria:**
- [ ] Move `ANTHROPIC_MODELS` pricing constants (currently in `src/shared/` or inline) to `packages/shared/src/constants.ts`
- [ ] Move shared type definitions (e.g., `SupportedLanguage`, `ContentType`, `ElementType`) used across packages to `packages/shared/src/types.ts`
- [ ] Update `packages/mcp-server` to import from `@distill/shared` instead of local definitions
- [ ] Remove zod from `packages/shared/dependencies` if not needed, or move to `peerDependencies`
- [ ] Verify `@distill/shared` builds correctly and exports are correct
- [ ] All consuming packages build and tests pass

---

#### US-032: Standardize TypeScript configuration across packages

**Description:** As a maintainer, I want consistent TypeScript configuration so that all packages follow the same strict standards.

**Acceptance Criteria:**
- [ ] `packages/typescript-config/base.json` — change `"module"` and `"moduleResolution"` to values actually used by child packages (currently set to `"NodeNext"` but every child overrides to `"Bundler"` or `"ESNext"`)
- [ ] Standardize all packages to `"typescript": "5.9.3"` — update `packages/shared`, `packages/ui`, `apps/web` from `5.9.2`, and `packages/mcp-server` from `^5.0.0`
- [ ] Enable `"incremental": true` in base.json for faster rebuilds
- [ ] Consider splitting base.json into `base-node.json` (without DOM lib) and `base-web.json` (with DOM lib) — MCP server doesn't need DOM types
- [ ] All packages build and typecheck successfully

---

#### US-033: Fix ESLint configuration and add neverthrow plugin

**Description:** As a maintainer, I want stricter ESLint rules and Result type safety enforcement.

**Acceptance Criteria:**
- [ ] `packages/eslint-config/base.js` — remove `eslint-plugin-only-warn` (let errors be errors)
- [ ] Upgrade from `tseslint.configs.recommended` to `tseslint.configs.strictTypeChecked` (or at minimum `recommendedTypeChecked`)
- [ ] Add `@ninoseki/eslint-plugin-neverthrow` (or equivalent) with `must-use-result` rule to enforce `Result` handling in `packages/mcp-server`
- [ ] Remove duplicate config imports in `packages/eslint-config/next.js` and `react-internal.js`
- [ ] Fix any new lint errors introduced by stricter rules
- [ ] `bun run lint` passes

---

#### US-034: Expand vitest coverage and clean up infrastructure

**Description:** As a maintainer, I want comprehensive test coverage reporting and a clean monorepo configuration.

**Acceptance Criteria:**
- [ ] `packages/mcp-server/vitest.config.ts` — expand coverage `include` from `["src/ast/**/*.ts"]` to `["src/**/*.ts"]`
- [ ] Clean up `turbo.json` — remove unused `globalEnv` entries (`DATABASE_URL`, `CLERK_WEBHOOK_SECRET`, `POLAR_*`) and unused tasks (`db:generate`, `db:migrate`, `db:studio`)
- [ ] Remove `"distill-mcp": "workspace:*"` from root `package.json` devDependencies if not used by root scripts
- [ ] Bump `packageManager` from `bun@1.3.4` to `bun@1.3.8` in root `package.json`
- [ ] Add `"engines": { "node": ">=20" }` to `packages/mcp-server/package.json`
- [ ] All tests pass and build succeeds

---

#### US-035: Fix UI package production-readiness

**Description:** As a maintainer, I want the UI package to follow proper React patterns and be production-ready.

**Acceptance Criteria:**
- [ ] `packages/ui/src/button.tsx` — remove `alert()` call, replace with `onClick?: () => void` callback prop
- [ ] `packages/ui/src/button.tsx` — remove unnecessary `appName` prop
- [ ] `packages/ui/src/button.tsx` — add `type="button"` attribute to prevent form submission
- [ ] `packages/ui/src/card.tsx` — remove hardcoded UTM parameters (`?utm_source=create-turbo&...`)
- [ ] Standardize React type imports across all UI components (consistent pattern)
- [ ] Add `aria-label` attributes where appropriate for accessibility
- [ ] Add a build script to `packages/ui/package.json` or document that it's a source-only package
- [ ] All consuming packages still work after changes

---

## Functional Requirements

- FR-1: All code execution MUST use QuickJS WASM isolation; no `new Function()` execution path may exist
- FR-2: All filesystem operations in tools and sandbox SDK MUST validate paths against working directory boundaries using a shared `validatePath()` utility
- FR-3: All MCP tools MUST declare `outputSchema` and `annotations` per MCP 2025-06-18 specification
- FR-4: All tools MUST validate input via Zod before processing — no raw `args as Type` casts
- FR-5: Git operations MUST use `execFileSync` (array form, no shell) and include `--` separator before user-provided arguments
- FR-6: All Tree-sitter parsers MUST recover from initialization failures and allow retry
- FR-7: A single `countTokens()` utility MUST be used for all token counting across the codebase
- FR-8: CI pipeline MUST run build, typecheck, lint, and test on every PR and push to main/dev
- FR-9: All packages MUST use the same Zod major version (v4) and TypeScript version (5.9.3)
- FR-10: User-supplied regex patterns MUST be validated for complexity before compilation

## Non-Goals (Out of Scope)

- MCP 2025-11-25 features (Tasks primitive, Streamable HTTP transport, OAuth) — future work
- Tree-sitter WASM upgrade (0.22.6 → 0.25.x) — requires WASM ABI compatibility testing, separate initiative
- New language parser support (Java, C#, Kotlin) — separate feature PRD
- Custom color schemes or theming for the CLI — not relevant
- Database or payment integration (Polar, Clerk) — separate domain
- Performance benchmarking infrastructure — separate initiative
- Web app (`apps/web/`) improvements — separate PRD

## Technical Considerations

- **Dependency on US-001**: Stories US-002 through US-008 can run in parallel with US-001, but US-001 should land first since it removes legacy mode which simplifies the codebase for other security stories
- **Dependency on US-003**: US-003 creates the shared `validatePath()` utility that US-004 and US-005 depend on. US-003 should complete before US-004 and US-005.
- **Zod v4 migration (US-030)**: Should complete before US-009 (Zod validation standardization) to avoid doing work twice
- **Test stories (Epic 4)**: Can run in parallel with each other but should run AFTER the corresponding fix stories in Epics 1-3 to test the fixed code
- **ESLint changes (US-033)**: May introduce new lint errors that need fixing across the codebase. Run after major code changes in Epics 1-3 are complete.
- **Tree-sitter base extraction (US-019)**: Large refactor affecting 5 parsers. Should not run in parallel with US-016, US-017, US-018 which modify individual parsers.

## Success Metrics

- 0 CRITICAL or HIGH severity security findings on re-audit
- 730+ tests passing (baseline) with new tests bringing total to 900+
- 100% of MCP tools have `outputSchema` and `annotations`
- CI pipeline runs build + typecheck + lint + test on every PR
- Single Zod version (v4) across all packages
- Single TypeScript version (5.9.3) across all packages
- Single tiktoken encoder instance (down from 7)
- Vitest coverage reporting on all `src/**/*.ts` (not just AST)

## Open Questions

1. Should we add `pool: 'threads'` to Vitest config for better test performance?
2. Should `@distill/shared` also export Zod schemas (not just types)?
3. Should we adopt `ResultAsync` from neverthrow for all async operations in the sandbox, or is `Promise<Result>` acceptable?
4. What's the minimum supported Node.js version going forward — 20 or 22?
5. Should we set up automated dependency update tooling (Renovate/Dependabot)?

[/PRD]
