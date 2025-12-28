# CtxOpt SDK Reference

Complete reference for the `code_execute` sandbox SDK (`ctx`).

**Token savings**: 98% compared to multiple tool calls.

---

## Quick Start

```typescript
// Get skeletons of all TypeScript files
const files = ctx.files.glob("src/**/*.ts").slice(0, 5);
return files.map(f => ({
  file: f,
  skeleton: ctx.code.skeleton(ctx.files.read(f), "typescript")
}));
```

---

## Modules

### ctx.compress

Content compression utilities.

| Method | Description |
|--------|-------------|
| `auto(content, hint?)` | Auto-detect type and compress (hint: `build`\|`logs`\|`errors`\|`code`\|`auto`) |
| `logs(logs)` | Summarize log output |
| `diff(diff)` | Compress git diff |
| `semantic(content, ratio?)` | TF-IDF compression (ratio: 0.0-1.0, default 0.3) |

```typescript
// Compress build output
const output = ctx.files.read("build.log");
return ctx.compress.auto(output, "build");

// Semantic compression at 20% ratio
return ctx.compress.semantic(largeContent, 0.2);
```

---

### ctx.code

AST-based code analysis.

| Method | Description |
|--------|-------------|
| `parse(content, lang)` | Parse to AST structure |
| `extract(content, lang, target)` | Extract function/class by name |
| `skeleton(content, lang)` | Get signatures only (no bodies) |

**Supported languages**: `typescript`, `javascript`, `python`, `go`, `rust`, `php`, `swift`

```typescript
// Extract a specific function
const content = ctx.files.read("src/api.ts");
return ctx.code.extract(content, "typescript", {
  type: "function",
  name: "handleRequest"
});

// Get file skeleton
return ctx.code.skeleton(content, "typescript");
```

---

### ctx.files

File system operations (read-only).

| Method | Description |
|--------|-------------|
| `read(path)` | Read file content |
| `exists(path)` | Check if file exists |
| `glob(pattern)` | Find files by pattern |

```typescript
// Find and read all test files
const tests = ctx.files.glob("**/*.test.ts");
return tests.map(f => ({
  file: f,
  exists: ctx.files.exists(f)
}));
```

---

### ctx.utils

Utility functions.

| Method | Description |
|--------|-------------|
| `countTokens(text)` | Count tokens in text |
| `detectType(content)` | Detect content type |
| `detectLanguage(path)` | Detect language from file path |

```typescript
// Check token count
const content = ctx.files.read("large-file.ts");
return {
  tokens: ctx.utils.countTokens(content),
  type: ctx.utils.detectType(content),
  lang: ctx.utils.detectLanguage("large-file.ts")
};
```

---

### ctx.git

Git repository operations (read-only, no network access).

| Method | Description |
|--------|-------------|
| `diff(ref?)` | Get diff (default: HEAD) |
| `log(limit?)` | Get commit history (max 100) |
| `blame(file, line?)` | Get blame info |
| `status()` | Get repository status |
| `branch()` | Get branch info |

```typescript
// Get recent changes
const status = ctx.git.status();
const diff = ctx.git.diff();
return {
  branch: status.branch,
  staged: status.staged,
  additions: diff.stats.additions,
  deletions: diff.stats.deletions
};

// Get last 5 commits
return ctx.git.log(5);

// Blame a specific line
return ctx.git.blame("src/index.ts", 42);
```

---

### ctx.search

Code search operations.

| Method | Description |
|--------|-------------|
| `grep(pattern, glob?)` | Search file contents with regex |
| `symbols(query, glob?)` | Find symbol definitions |
| `files(pattern)` | Find files by name pattern |
| `references(symbol, glob?)` | Find all references to a symbol |

```typescript
// Find all TODO comments
return ctx.search.grep("TODO:", "**/*.ts");

// Find function definitions
return ctx.search.symbols("handleRequest");

// Find all usages of a function
return ctx.search.references("validateInput", "src/**/*.ts");
```

---

### ctx.analyze

Static code analysis.

| Method | Description |
|--------|-------------|
| `dependencies(file)` | Analyze imports/exports |
| `callGraph(fn, file, depth?)` | Build function call graph |
| `exports(file)` | List all exports |
| `structure(dir?, depth?)` | Get directory structure |

```typescript
// Analyze file dependencies
return ctx.analyze.dependencies("src/api/handler.ts");

// Get call graph (max depth 3)
return ctx.analyze.callGraph("processRequest", "src/api.ts", 3);

// Get project structure
return ctx.analyze.structure("src", 2);
```

---

### ctx.pipeline

Composable data pipelines with caching.

**Pipeline steps**:
- `{ glob: pattern }` - Find files
- `{ filter: fn }` - Filter items
- `{ read: true }` - Read file contents
- `{ map: fn }` - Transform items
- `{ reduce: fn, initial }` - Reduce to single value
- `{ compress: type }` - Compress (`auto`|`semantic`|`logs`)
- `{ limit: n }` - Limit results
- `{ sort: direction, by? }` - Sort items
- `{ unique: boolean|key }` - Deduplicate

```typescript
// Find large TypeScript files
return ctx.pipeline([
  { glob: "src/**/*.ts" },
  { filter: f => !f.includes("test") },
  { read: true },
  { map: item => ({ file: item.file, lines: item.content?.split("\n").length }) },
  { sort: "desc", by: "lines" },
  { limit: 10 }
]);
```

**Template methods** (cached for 5 minutes):

| Method | Description |
|--------|-------------|
| `codebaseOverview(dir?)` | Get codebase statistics |
| `findUsages(symbol, glob?)` | Find all symbol usages |
| `analyzeDeps(file, depth?)` | Analyze dependency tree |

```typescript
// Get codebase overview
return ctx.pipeline.codebaseOverview("src");

// Find all usages of a symbol
return ctx.pipeline.findUsages("Logger", "**/*.ts");

// Analyze dependencies
return ctx.pipeline.analyzeDeps("src/index.ts", 3);
```

---

## Limits & Security

### Execution Limits

| Limit | Value |
|-------|-------|
| Timeout | 5s (max 30s) |
| Memory | 128MB |
| Max output tokens | 4000 |
| Max files per operation | 1000 |
| Max file size | 1MB |

### Blocked Operations

- `eval()`, `Function()`, `require()`, dynamic `import()`
- `process`, `global`, `globalThis`
- `setTimeout`, `setInterval`
- Prototype pollution (`__proto__`, `.constructor`)
- Path traversal (`../`)
- Sensitive files (`.env`, `.pem`, credentials)

### Git Security

- Blocked commands: `push`, `fetch`, `pull`, `clone`, `remote`, `submodule`
- All arguments are sanitized (shell metacharacters blocked)
- Read-only operations only

---

## Error Handling

```typescript
// Errors are thrown as exceptions
try {
  return ctx.files.read("nonexistent.ts");
} catch (e) {
  return { error: "File not found" };
}

// Check existence before reading
if (ctx.files.exists("config.json")) {
  return ctx.files.read("config.json");
}
return { error: "No config found" };
```

---

## Tips

1. **Use glob patterns wisely** - Avoid `**/*` without file extension filters
2. **Leverage caching** - Pipeline template methods are cached for 5 minutes
3. **Chain operations** - Use pipelines instead of multiple tool calls
4. **Check token count** - Use `ctx.utils.countTokens()` for large outputs
5. **Compress results** - Use `ctx.compress.auto()` for large outputs
