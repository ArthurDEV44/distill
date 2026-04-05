# Distill

> 3 tools. Zero friction. Maximum token savings.

**Distill** is an open-source MCP server that optimizes LLM token usage through intelligent context compression. 3 always-loaded tools replace dozens of individual calls. Works with Claude Code, Cursor, and Windsurf.

[![npm version](https://img.shields.io/npm/v/distill-mcp.svg)](https://www.npmjs.com/package/distill-mcp)
[![smithery badge](https://smithery.ai/badge/@ArthurDEV44/distill-mcp)](https://smithery.ai/server/@ArthurDEV44/distill-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Distill?

Claude Code already compresses context *after* it enters the window. Distill compresses *before* — catching large outputs at the source.

| Problem | Distill Tool | How | Savings |
|---------|-------------|-----|---------|
| Large build output, logs, diffs | `auto_optimize` | Auto-detects type, applies best compressor | 40-95% |
| Reading entire files for one function | `smart_file_read` | AST extraction for 7 languages | 50-90% |
| Chaining 5-10 tool calls | `code_execute` | TypeScript SDK in sandbox — one call | **98%** |

**Before:** 5 tool calls (Read + Grep + Read + Read + compress) = ~2,500 tokens overhead
**After:** 1 `code_execute` call = ~500 tokens overhead

## Quick Start

```bash
# Run directly with npx
npx distill-mcp

# Or install globally
npm install -g distill-mcp

# Auto-configure your IDE
distill-mcp setup
```

### Add to Claude Code

```bash
claude mcp add distill -- npx distill-mcp
```

All 3 tools are available immediately — no discovery step, no loading modes.

## The 3 Tools

### `auto_optimize` — Compress Any Content

Auto-detects content type and applies the optimal compression strategy.

| Strategy | Content Type | Typical Savings |
|----------|-------------|-----------------|
| `build` | Compiler errors (tsc, rustc, webpack) | 95% |
| `logs` | Server/test/build logs | 80-90% |
| `errors` | Repeated error lines | 70-90% |
| `diff` | Git diffs | 60-80% |
| `stacktrace` | Stack traces | 50-80% |
| `code` / `semantic` | Source code (TF-IDF) | 40-60% |
| `config` | JSON/YAML configs | 30-60% |
| `auto` | Auto-detect best strategy | varies |

```
auto_optimize content="<large build output>" strategy="auto"
```

### `smart_file_read` — AST-Powered Code Reading

Read code with precision — extract exactly what you need.

**5 modes:**
- `skeleton` — Function/class signatures only (depth 1-3)
- `extract` — Pull a specific function, class, or interface by name
- `search` — Find elements matching a query
- `full` — Complete file structure overview
- `auto` — Detect mode from params

**7 languages:** TypeScript, JavaScript, Python, Go, Rust, PHP, Swift

```
smart_file_read filePath="src/server.ts" mode="skeleton"
smart_file_read filePath="src/server.ts" mode="extract" target={"type":"function","name":"createServer"}
smart_file_read filePath="src/server.ts" mode="search" query="register"
```

### `code_execute` — TypeScript SDK in Sandbox

Write TypeScript instead of chaining tool calls. Access files, git, search, and compress via the `ctx.*` SDK.

```
code_execute code="return ctx.compress.auto(ctx.files.read('build.log'))"
```

**Batch multiple operations in one call:**

```typescript
// Read 3 files, extract key functions, compress the result — 1 tool call instead of 7
const files = ["src/server.ts", "src/registry.ts", "src/executor.ts"];
const skeletons = files.map(f => ctx.code.skeleton(ctx.files.read(f), "typescript"));
return ctx.compress.auto(skeletons.join("\n---\n"));
```

**SDK API:**

```typescript
// File operations
ctx.files.read(path)         // Read file content
ctx.files.glob(pattern)      // Find files by pattern
ctx.files.exists(path)       // Check if file exists

// Code analysis
ctx.code.parse(content, lang)                  // Parse to structure
ctx.code.extract(content, lang, {type, name})  // Extract element
ctx.code.skeleton(content, lang)               // Signatures only

// Compression
ctx.compress.auto(content, hint?)    // Auto-detect and compress
ctx.compress.logs(logs)              // Log summarization
ctx.compress.diff(diff)              // Diff compression
ctx.compress.semantic(content, ratio?) // TF-IDF compression

// Git
ctx.git.diff(ref?)         // Get diff
ctx.git.log(limit?)        // Commit history
ctx.git.blame(file, line?) // Blame info
ctx.git.status()           // Working tree status
ctx.git.branch()           // Current branch info

// Search
ctx.search.grep(pattern, glob?)       // Search file contents
ctx.search.symbols(query, glob?)      // Find code symbols
ctx.search.files(pattern)             // Find files by pattern
ctx.search.references(symbol, glob?)  // Find symbol references

// Analysis
ctx.analyze.dependencies(file)           // File dependencies
ctx.analyze.callGraph(fn, file, depth?)  // Call graph
ctx.analyze.exports(file)               // Exported symbols
ctx.analyze.structure(dir, depth?)       // Directory structure

// Pipeline
ctx.pipeline(steps)                  // Run step array
ctx.pipeline.codebaseOverview(dir?)  // Quick overview
ctx.pipeline.findUsages(symbol)      // Find all usages
ctx.pipeline.analyzeDeps(file)       // Dependency analysis

// Utilities
ctx.utils.countTokens(text)      // Count tokens
ctx.utils.detectType(content)    // Detect content type
ctx.utils.detectLanguage(path)   // Detect language from path
```

## Token Overhead

Distill's 3 tools add minimal overhead to every API call:

| | Tool Schemas | Description |
|--|-------------|-------------|
| **Distill** | ~2,000 tokens | 3 always-loaded tools |
| **Equivalent** | ~10,000+ tokens | 20+ individual tools doing the same |

All 3 tools use `_meta['anthropic/alwaysLoad']` — present from turn 1 with zero discovery friction.

## CLI Commands

```bash
distill-mcp setup          # Auto-configure detected IDEs
distill-mcp setup --claude # Configure Claude Code only
distill-mcp setup --cursor # Configure Cursor only
distill-mcp doctor         # Verify installation
distill-mcp serve          # Start MCP server
distill-mcp analyze        # Analyze codebase token usage
distill-mcp --help         # Show help
```

## IDE Configuration

### Claude Code

After running `distill-mcp setup`, your config will include:

```json
{
  "mcpServers": {
    "distill": {
      "command": "npx",
      "args": ["distill-mcp", "serve"]
    }
  }
}
```

### Cursor / Windsurf

Configuration is automatically added to the appropriate settings file.

## Security

Code execution runs in a sandboxed environment with 7 security layers:
- **Static analysis** blocks `eval`, `require`, `import()`, `process`, `Reflect`, `Proxy`
- **File access** restricted to working directory
- **Sensitive files** blocked (`.env`, credentials, keys)
- **Git commands** allowlisted (no push, fetch, clone)
- **Memory limit:** 128MB | **Timeout:** 30s | **Output cap:** 4000 tokens

## Development

```bash
bun install          # Install dependencies
bun run build        # Build all packages
bun run test         # Run tests
bun run dev          # Start dev server
bun run check-types  # TypeScript type check
bun run lint         # ESLint
```

## Community

- **[GitHub Discussions](https://github.com/ArthurDEV44/distill/discussions)** — Questions, ideas, feedback
- **[Issues](https://github.com/ArthurDEV44/distill/issues)** — Bug reports

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Priority areas:**
- New language parsers (Java, C#, Kotlin)
- SDK extensions
- Documentation

## License

MIT

---

**[npm](https://www.npmjs.com/package/distill-mcp)** · **[GitHub](https://github.com/ArthurDEV44/distill)** · **[Documentation](./docs)** · **[Discussions](https://github.com/ArthurDEV44/distill/discussions)**
