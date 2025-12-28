## 🚀 CtxOpt v0.6.0-beta

**Token optimization MCP server for Claude Code, Cursor, and Windsurf.**

This beta release marks the completion of all 6 development phases.

### ✨ Features

#### Phase 1: Core Stability
- `auto_optimize` - Auto-detect and compress (40-95% savings)
- `smart_file_read` - AST-based file reading (50-70% savings)
- `code_execute` - TypeScript SDK execution (**98% savings**)
- Support for 7 languages: TypeScript, JavaScript, Python, Go, Rust, PHP, Swift

#### Phase 2: Smart Search
- BM25 keyword search for tool discovery
- Semantic search with local embeddings (all-MiniLM-L6-v2)
- Hybrid search combining both approaches

#### Phase 3: SDK Enhancement
- `ctx.git.*` - Git operations (diff, log, blame, status)
- `ctx.search.*` - Code search (grep, symbols, files)
- `ctx.analyze.*` - Static analysis (dependencies, callGraph)
- `ctx.pipeline` - Composable data pipelines

#### Phase 4: Intelligence Layer
- `context_budget` - Pre-flight token estimation
- `detect_retry_loop` - Failure pattern detection
- `session_stats` - Usage analytics and cost tracking

#### Phase 5: Ecosystem Integration
- One-click setup for Claude Code, Cursor, Windsurf
- GitHub Action for CI/CD token analysis
- Pre-commit hooks for large file warnings
- CLI `analyze` command

#### Phase 6: Advanced Compression
- `multifile_compress` - Cross-file deduplication
- `conversation_memory` - Long conversation summarization
- TOON format output optimization
- Configurable verbosity levels

### 📊 Test Results

- ✅ 437 tests passing
- ✅ TypeScript type checking clean
- ✅ Build successful

### ⚠️ Known Limitations

- Test coverage at ~21% (critical tools need more tests)
- Some ESLint warnings in web app (Three.js properties)

### 🛠️ Installation

```bash
# npm
npx @ctxopt/mcp-server

# Or add to Claude Code settings
claude mcp add ctxopt -- npx @ctxopt/mcp-server
```

### 📖 Documentation

See [CLAUDE.md](./CLAUDE.md) for usage guidelines and [ROADMAP.md](./ROADMAP.md) for project vision.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
