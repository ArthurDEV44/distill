# CtxOpt Roadmap

Strategic roadmap for CtxOpt - the open source MCP server for LLM token optimization.

---

## Vision

Position CtxOpt as the **comprehensive token optimization layer** for AI coding assistants, complementing Anthropic's Tool Search Tool with content-focused compression.

```
Tool Search Tool (Anthropic) = "Which tools to load?"
CtxOpt                       = "How to compress content?"
CtxOpt + Smart Search        = "Both, optimized"
```

---

## Phase 1: Core Stability (Current)

**Status: Complete**

| Feature | Status | Token Savings |
|---------|--------|---------------|
| `auto_optimize` | Done | 40-95% |
| `smart_file_read` (AST) | Done | 50-70% |
| `code_execute` SDK | Done | 98% |
| `semantic_compress` (TF-IDF) | Done | 40-60% |
| `summarize_logs` | Done | 80-90% |
| `diff_compress` | Done | 50-80% |
| Lazy MCP (`browse_tools`/`run_tool`) | Done | 95% |

**Supported Languages**: TypeScript, JavaScript, Python, Go, Rust, PHP, Swift

---

## Phase 2: Smart Search

**Goal**: Achieve feature parity with Anthropic's Tool Search Tool while maintaining content compression advantage.

### 2.1 BM25 Tool Search

**Status: Complete**

```typescript
// DynamicToolLoader now uses BM25 ranking
loader.searchTools("compress logs")
// Returns ranked results: summarize_logs, auto_optimize, compress_context

// With scores for debugging
loader.searchToolsWithScores("compress logs")
// Returns: [{ item: ToolMetadata, score: 2.5, matchedTerms: ["compress", "logs"] }]
```

**Implementation**:
- [x] Add BM25 scoring algorithm (`packages/mcp-server/src/utils/bm25.ts`)
- [x] Tool catalog already has keywords/tags (TOOL_CATALOG)
- [x] Integrated BM25 into `DynamicToolLoader.searchTools()`
- [x] Added `searchToolsWithScores()` for relevance debugging

### 2.2 Semantic Search

**Status: Complete**

```typescript
// Hybrid search with embeddings
await loader.searchToolsHybrid("shrink output")
// → Finds "compress" even without keyword match!

// Preload embeddings during idle time
await loader.preloadSemanticSearch()

// Check if semantic ready
loader.isSemanticSearchReady() // true after preload
```

**Implementation**:
- [x] Add `@huggingface/transformers` for local embeddings
- [x] Add `embeddings.ts` with all-MiniLM-L6-v2 model (384 dims)
- [x] Add `hybrid-search.ts` combining BM25 (40%) + cosine similarity (60%)
- [x] Integrate into `DynamicToolLoader.searchToolsHybrid()`
- [x] Add `preloadSemanticSearch()` for background initialization

---

## Phase 3: SDK Enhancement

**Goal**: Make `code_execute` the killer feature - things competitors can't easily replicate.

### 3.1 Extended SDK API

**Status: Complete**

```typescript
// Current SDK
ctx.files.read(path)
ctx.files.glob(pattern)
ctx.code.skeleton(content, lang)
ctx.compress.auto(content)

// New additions
ctx.git.diff(ref?)              // Git diff with auto-compression
ctx.git.log(limit?)             // Commit history
ctx.git.blame(file, line?)      // Blame info
ctx.search.grep(pattern, glob?) // Integrated grep
ctx.search.symbols(query)       // Cross-file symbol search
ctx.analyze.dependencies(file)  // Import/export analysis
ctx.analyze.callGraph(fn)       // Function call graph
```

**Tasks**:
- [x] `ctx.git.*` - Git operations module (diff, log, blame, status, branch)
- [x] `ctx.search.*` - Code search module (grep, symbols, files, references)
- [x] `ctx.analyze.*` - Static analysis module (dependencies, callGraph, exports, structure)
- [x] Improve sandbox security for new operations
- [x] Add SDK documentation with examples

### 3.2 Composable Pipelines

**Status: Complete**

```typescript
// Chain operations declaratively
ctx.pipeline([
  { glob: "src/**/*.ts" },
  { filter: f => !f.includes("test") },
  { map: f => ctx.code.skeleton(ctx.files.read(f), "ts") },
  { compress: "semantic", ratio: 0.3 }
])

// Built-in templates
ctx.pipeline.codebaseOverview(dir)   // Vue d'ensemble du code
ctx.pipeline.findUsages(symbol)      // Trouver usages d'un symbole
ctx.pipeline.analyzeDeps(file)       // Analyser dépendances
```

**Pipeline Steps**:
- `{ glob: pattern }` - Select files matching pattern
- `{ filter: fn }` - Filter items
- `{ read: true }` - Read file contents
- `{ map: fn }` - Transform each item
- `{ reduce: fn, initial }` - Reduce to single value
- `{ compress: type }` - Compress result (auto/semantic/logs)
- `{ limit: n }` - Limit results
- `{ sort: direction, by? }` - Sort items
- `{ unique: boolean|key }` - Deduplicate items

- [x] Pipeline DSL design
- [x] Built-in pipeline templates
- [x] Pipeline result caching

---

## Phase 4: Intelligence Layer

**Goal**: Proactive optimization suggestions and automatic context management.

### 4.1 Context Budget Manager

**Status: Complete**

```typescript
// Pre-flight estimation
context_budget({
  files: ["src/**/*.ts"],
  operation: "refactor",
  target_tokens: 50000
})
// Returns: recommended approach, estimated tokens, warnings
```

- [x] Intelligent file selection based on relevance
- [x] Token budget recommendations
- [x] Warning system for oversized contexts

### 4.2 Retry Loop Detection Enhancement

**Status: Complete**

- [x] Pattern recognition for common failure loops
- [x] Automatic suggestion of alternative approaches
- [x] Integration with error deduplication

### 4.3 Session Analytics

**Status: Complete**

```typescript
session_stats()
// Returns: tokens saved, cost reduction, optimization breakdown
```

- [x] Per-tool usage statistics
- [x] Cumulative savings tracking
- [x] Exportable session reports

---

## Phase 5: Ecosystem Integration

**Goal**: Seamless integration with major AI coding tools.

### 5.1 IDE-Specific Optimizations

**Status: Complete**

| IDE | Integration |
|-----|-------------|
| Claude Code | Native MCP (current) |
| Cursor | MCP server config |
| Windsurf | MCP server config |
| VS Code + Continue | MCP adapter |

- [x] One-click setup scripts per IDE (`scripts/install.sh`, `install.ps1`)
- [x] IDE-specific configuration templates (`ctxopt-mcp setup`)
- [x] Integration documentation (`docs/guides/`)

### 5.2 CI/CD Integration

**Status: Complete**

```yaml
# GitHub Actions example
- uses: ctxopt/analyze-action@v1
  with:
    patterns: 'src/**/*.{ts,js}'
    threshold: 2000
    fail-on-threshold: false
```

- [x] GitHub Action for token usage analysis (`action/action.yml`)
- [x] Pre-commit hook for large file warnings (`scripts/pre-commit-hook.sh`)
- [x] CLI analyze command (`ctxopt-mcp analyze`)
- [ ] PR comment with optimization suggestions (future enhancement)

---

## Phase 6: Advanced Compression

**Goal**: Push compression boundaries with advanced techniques.

### 6.1 Multi-File Context Compression

- [ ] Cross-file deduplication (shared imports, types)
- [ ] Dependency-aware skeleton extraction
- [ ] Smart chunking for large codebases

### 6.2 Conversation Memory Compression

- [ ] Long conversation summarization
- [ ] Key decision extraction
- [ ] Context restoration from compressed state

### 6.3 Output Format Optimization

- [ ] TOON format for all tool outputs
- [ ] Configurable verbosity levels
- [ ] Structured vs prose output modes

---

## Non-Goals

Things we explicitly won't pursue:

| Non-Goal | Reason |
|----------|--------|
| Cloud/SaaS version | Keep it local, private, free |
| API key requirements | Zero-config philosophy |
| ML-based compression | Latency concerns, dependency bloat |
| Full IDE replacement | Stay focused on optimization |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Average token savings | >60% |
| Setup time | <2 minutes |
| Latency overhead | <100ms per operation |
| Supported languages | 10+ |
| GitHub stars | Community growth indicator |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Priority areas for contributions**:
1. New language parsers (Java, C#, Kotlin)
2. SDK extensions (`ctx.git.*`, `ctx.search.*`)
3. Documentation and examples
4. Performance optimizations

---

## Changelog

### v0.3.0 (Current)
- Hybrid semantic search with Transformers.js
- `searchToolsHybrid()` for BM25 + embedding similarity
- `preloadSemanticSearch()` for background model loading
- Local embeddings with all-MiniLM-L6-v2 (no API keys)

### v0.2.0
- BM25 search algorithm for tool discovery
- `searchToolsWithScores()` API for relevance debugging

### v0.1.0
- Initial release
- 19 optimization tools
- 7 language parsers
- Lazy MCP pattern
- `code_execute` SDK

### Next Release
- Extended SDK (`ctx.search.*`, `ctx.analyze.*`)
- Composable pipelines
- Improved session analytics

### v0.5.0 (Current)
- Phase 5: Ecosystem Integration
- GitHub Action for token usage analysis (`action/action.yml`)
- Pre-commit hook for large file warnings (`scripts/pre-commit-hook.sh`)
- CLI `analyze` command for codebase token analysis
- Phase 5.1: IDE setup scripts and documentation (already existed)

### v0.4.0
- `ctx.git.*` module: diff, log, blame, status, branch
- `ctx.search.*` module: grep, symbols, files, references
- `ctx.analyze.*` module: dependencies, callGraph, exports, structure
- `ctx.pipeline` module: composable pipelines with DSL and templates
- Git sandbox security: blocked network commands, argument sanitization
- Pipeline result caching with TTL-based expiration
- SDK.md documentation with comprehensive examples
- `detect_retry_loop` tool: command history analysis, pattern detection, suggestions
- `session_stats` tool: per-session analytics, token savings, cost estimation
