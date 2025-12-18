# @ctxopt/core

Native PTY wrapper for Claude Code with automatic token optimization.

## Installation

```bash
npm install @ctxopt/core
# or
bun add @ctxopt/core
```

## Usage

### Basic Usage

```javascript
import { CtxOptSession, utils, version } from '@ctxopt/core';

// Check version
console.log('Version:', version());

// Create a PTY session
const session = new CtxOptSession(24, 80, 'claude');

// Read output with suggestions
const result = await session.read();
console.log('Output:', result.output);
console.log('Token estimate:', result.tokenEstimate);
console.log('Suggestions:', result.suggestions);

// Write to PTY
await session.write('Hello\n');

// Get session stats
const stats = await session.stats();
console.log('Total tokens:', stats.totalTokens);

// Check if process is running
const running = await session.isRunning();

// Wait for process to exit
const exitCode = await session.wait();
```

### With Configuration

```javascript
const session = CtxOptSession.withConfig(
  30,      // rows
  100,     // cols
  'claude', // command
  5000,    // injection interval (ms)
  true     // suggestions enabled
);
```

### Utilities

```javascript
import { utils } from '@ctxopt/core';

// Estimate tokens
const tokens = utils.estimateTokens('Hello, world!');

// Check if file is a code file
const isCode = utils.isCodeFile('src/main.ts'); // true

// Strip ANSI codes
const clean = utils.stripAnsi('\x1b[31mError\x1b[0m'); // 'Error'
```

## API Reference

### CtxOptSession

Main class for managing PTY sessions.

#### Constructor

```typescript
new CtxOptSession(rows?: number, cols?: number, command?: string)
```

#### Factory Method

```typescript
CtxOptSession.withConfig(
  rows?: number,
  cols?: number,
  command?: string,
  injectionIntervalMs?: number,
  suggestionsEnabled?: boolean
): CtxOptSession
```

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `read()` | `Promise<ReadResult>` | Read PTY output with suggestions |
| `write(data: string)` | `Promise<void>` | Write string to PTY |
| `writeBytes(data: Buffer)` | `Promise<void>` | Write bytes to PTY |
| `isRunning()` | `Promise<boolean>` | Check if process is running |
| `wait()` | `Promise<number>` | Wait for exit and get code |
| `resize(rows, cols)` | `Promise<void>` | Resize PTY |
| `kill()` | `Promise<void>` | Terminate process |
| `stats()` | `Promise<SessionStats>` | Get session statistics |
| `setSuggestionsEnabled(enabled)` | `Promise<void>` | Toggle suggestions |
| `resetStats()` | `Promise<void>` | Reset counters |

### ReadResult

```typescript
interface ReadResult {
  output: string;           // Clean output text
  suggestions: string[];    // Generated suggestions
  tokenEstimate: number;    // Estimated tokens
  detectedTypes: string[];  // Content types detected
  totalSize: number;        // Buffer size
}
```

### SessionStats

```typescript
interface SessionStats {
  totalTokens: number;      // Total tokens estimated
  totalSuggestions: number; // Suggestions shown
  totalBuildErrors: number; // Build errors detected
  elapsedMs: number;        // Session duration
}
```

## Supported Platforms

| Platform | Architecture | Package |
|----------|-------------|---------|
| macOS | x64 | @ctxopt/cli-darwin-x64 |
| macOS | arm64 | @ctxopt/cli-darwin-arm64 |
| Linux | x64 | @ctxopt/cli-linux-x64-gnu |
| Linux | arm64 | @ctxopt/cli-linux-arm64-gnu |
| Windows | x64 | @ctxopt/cli-win32-x64-msvc |
| Windows | arm64 | @ctxopt/cli-win32-arm64-msvc |

## Development

```bash
# Build
bun run build

# Run tests
cargo test
node test/index.mjs

# Benchmarks
cargo bench
```

## License

MIT
