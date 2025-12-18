# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-18

### Added

- Initial release
- PTY management with portable-pty (cross-platform)
- Stream analysis with pattern detection:
  - TypeScript/TSC errors
  - Rust/Cargo errors
  - ESLint errors
  - Python errors
  - Go errors
- Context injection with suggestions:
  - Build errors: suggests `auto_optimize`
  - Large output: suggests `compress_context`
  - File reads: suggests `smart_file_read`
  - Prompt ready: MCP tools reminder
- Token estimation using claude-tokenizer
- NAPI bindings for Node.js:
  - `CtxOptSession` class
  - `utils` namespace
  - `version()` and `ping()` functions
- Cross-platform support:
  - macOS (x64, arm64)
  - Linux (x64, arm64)
  - Windows (x64, arm64)
- Throttling and rate limiting for suggestions
- Session statistics tracking
- ANSI code stripping

### Performance

- Latency overhead < 5ms
- Memory footprint < 50MB
- Async I/O with Tokio runtime

### Documentation

- API reference
- Usage examples
- Platform support matrix
