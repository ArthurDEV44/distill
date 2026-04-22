/**
 * Smart File Read Tool Tests
 *
 * Comprehensive tests for all 5 modes (auto, full, skeleton, extract, search),
 * path security, unsupported language fallback, and structuredContent.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { executeSmartFileRead } from "./smart-file-read.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// Test fixtures — temp files created before tests, cleaned up after
// ---------------------------------------------------------------------------

/** Generate a large TypeScript file with ~200 functions (~2000 lines, >25K tokens) */
function generateLargeFile(): string {
  const lines: string[] = [
    'import { EventEmitter } from "events";',
    "",
    "export interface LargeConfig {",
    "  name: string;",
    "  value: number;",
    "}",
    "",
  ];
  for (let i = 0; i < 200; i++) {
    lines.push(`/** Process item ${i} with complex logic */`);
    lines.push(
      `export function processItem${i}(input: string, config: LargeConfig): string {`
    );
    lines.push(`  const result = input.toUpperCase();`);
    lines.push(`  const computed = config.value * ${i + 1};`);
    lines.push(`  const label = \`\${config.name}-\${computed}\`;`);
    lines.push(`  if (computed > 1000) {`);
    lines.push(`    return \`\${label}: \${result}\`;`);
    lines.push(`  }`);
    lines.push(`  return result;`);
    lines.push(`}`);
    lines.push("");
  }
  return lines.join("\n");
}

let tmpDir: string;

const FIXTURES: Record<string, string> = {
  "sample.ts": `
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface ServerConfig {
  verbose?: boolean;
  port?: number;
}

/** Create and start the server */
export async function createServer(config: ServerConfig = {}): Promise<Server> {
  const server = new Server({ name: "test", version: "1.0" });
  return server;
}

export class ToolRegistry {
  private tools: Map<string, unknown> = new Map();

  /** Register a new tool */
  register(name: string, tool: unknown): void {
    this.tools.set(name, tool);
  }

  /** Get tool by name */
  get(name: string): unknown {
    return this.tools.get(name);
  }

  /** List all tool names */
  list(): string[] {
    return Array.from(this.tools.keys());
  }
}

export const VERSION = "1.0.0";
`.trimStart(),

  "sample.js": `
const express = require("express");

function createApp(config) {
  const app = express();
  app.get("/health", (req, res) => res.json({ ok: true }));
  return app;
}

class Router {
  constructor() {
    this.routes = [];
  }

  addRoute(method, path, handler) {
    this.routes.push({ method, path, handler });
  }
}

module.exports = { createApp, Router };
`.trimStart(),

  "sample.py": `
import os
from typing import Optional, List

class DatabaseConnection:
    """Manages database connections."""

    def __init__(self, url: str, pool_size: int = 5):
        self.url = url
        self.pool_size = pool_size
        self._pool = None

    async def connect(self) -> None:
        """Establish connection pool."""
        pass

    async def query(self, sql: str, params: Optional[List] = None):
        """Execute a SQL query."""
        pass

def create_connection(url: str) -> DatabaseConnection:
    """Factory function for database connections."""
    return DatabaseConnection(url)

API_VERSION = "2.0"
`.trimStart(),

  "sample.go": `
package main

import (
	"fmt"
	"net/http"
)

type Server struct {
	Port    int
	Handler http.Handler
}

func NewServer(port int) *Server {
	return &Server{Port: port}
}

func (s *Server) Start() error {
	addr := fmt.Sprintf(":%d", s.Port)
	return http.ListenAndServe(addr, s.Handler)
}

func main() {
	s := NewServer(8080)
	s.Start()
}
`.trimStart(),

  "sample.rs": `
use std::collections::HashMap;

pub struct Config {
    pub name: String,
    pub values: HashMap<String, String>,
}

impl Config {
    pub fn new(name: &str) -> Self {
        Config {
            name: name.to_string(),
            values: HashMap::new(),
        }
    }

    pub fn get(&self, key: &str) -> Option<&String> {
        self.values.get(key)
    }
}

pub fn load_config(path: &str) -> Result<Config, std::io::Error> {
    Ok(Config::new("default"))
}
`.trimStart(),

  "sample.php": `
<?php

namespace App\\Controllers;

use App\\Models\\User;

interface AuthInterface {
    public function login(string $email, string $password): bool;
    public function logout(): void;
}

class AuthController implements AuthInterface {
    private $userModel;

    public function __construct(User $userModel) {
        $this->userModel = $userModel;
    }

    public function login(string $email, string $password): bool {
        return $this->userModel->verify($email, $password);
    }

    public function logout(): void {
        session_destroy();
    }
}

function middleware($request, $next) {
    return $next($request);
}
`.trimStart(),

  "sample.swift": `
import Foundation

protocol DataStore {
    func save(_ data: Data) throws
    func load(key: String) -> Data?
}

struct AppConfig {
    let name: String
    let version: String
    let debug: Bool
}

class FileStore: DataStore {
    let basePath: String

    init(basePath: String) {
        self.basePath = basePath
    }

    func save(_ data: Data) throws {
        let url = URL(fileURLWithPath: basePath)
        try data.write(to: url)
    }

    func load(key: String) -> Data? {
        return nil
    }
}

func createStore(path: String) -> FileStore {
    return FileStore(basePath: path)
}
`.trimStart(),

  "config.json": `{
  "name": "test-project",
  "version": "1.0.0",
  "dependencies": { "express": "^4.18.0" }
}`,

  "data.yaml": `
name: test
version: 1.0
settings:
  debug: true
  port: 3000
`.trimStart(),

  "empty.ts": "",

  "large.ts": generateLargeFile(),

  // Dedicated file for cache tests (unique content so no prior test can cache it)
  "cache-test.ts": `
export function cacheTestFn(): string {
  return "cache-test-unique-content";
}
`.trimStart(),
};

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "smart-read-test-"));
  for (const [name, content] of Object.entries(FIXTURES)) {
    await fs.writeFile(path.join(tmpDir, name), content, "utf-8");
  }

  // Create a very large file for output cap testing (US-007)
  const capLine = "export function capfn_NNNN(x: number): number { return x * 2; }\n";
  let capContent = "";
  for (let i = 0; i < 2000; i++) {
    capContent += capLine.replace("NNNN", String(i).padStart(4, "0"));
  }
  await fs.writeFile(path.join(tmpDir, "huge-cap-test.ts"), capContent, "utf-8");

  // Warm up Tree-sitter WASM parsers so skeleton tests get real results.
  // First sync call fires init as side-effect; second call gets actual AST.
  // Each language is wrapped in try/catch so one failure doesn't abort the rest.
  // Note: process.chdir is safe here since Vitest isolates test files in separate workers.
  const origCwd = process.cwd();
  process.chdir(tmpDir);
  try {
    for (const ext of ["py", "go", "rs", "php", "swift"]) {
      try {
        await executeSmartFileRead({ filePath: `sample.${ext}`, mode: "skeleton", cache: false });
        // Give the event loop time to resolve WASM init
        await new Promise((r) => setTimeout(r, 200));
        await executeSmartFileRead({ filePath: `sample.${ext}`, mode: "skeleton", cache: false });
      } catch {
        // WASM init may fail in some environments — individual language tests will catch it
      }
    }
  } finally {
    process.chdir(origCwd);
  }
}, 60_000);

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Helper to call executeSmartFileRead with tmpDir paths
async function read(args: Record<string, unknown>) {
  // Temporarily change cwd to tmpDir for path validation
  const origCwd = process.cwd();
  process.chdir(tmpDir);
  try {
    const result = await executeSmartFileRead(args);
    const text = result.content[0]?.text ?? "";
    const sc = result.structuredContent;
    return { text, sc, result };
  } finally {
    process.chdir(origCwd);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("smart_file_read", () => {
  describe("mode resolution", () => {
    it("should default to full mode when no params given", async () => {
      const { sc } = await read({ filePath: "sample.ts" });
      expect(sc?.mode).toBe("full");
    });

    it("should auto-detect extract mode from target param", async () => {
      const { sc } = await read({
        filePath: "sample.ts",
        target: { type: "function", name: "createServer" },
      });
      expect(sc?.mode).toBe("extract");
    });

    it("should auto-detect search mode from query param", async () => {
      const { sc } = await read({ filePath: "sample.ts", query: "register" });
      expect(sc?.mode).toBe("search");
    });

    it("should use explicit skeleton mode", async () => {
      const { sc } = await read({ filePath: "sample.ts", mode: "skeleton" });
      expect(sc?.mode).toBe("skeleton");
    });

    it("should use explicit full mode", async () => {
      const { sc } = await read({ filePath: "sample.ts", mode: "full", cache: false });
      expect(sc?.mode).toBe("full");
    });
  });

  describe("full mode", () => {
    it("should return file structure summary for TS", async () => {
      const { text, sc } = await read({ filePath: "sample.ts", cache: false });
      expect(sc?.language).toBe("typescript");
      expect(text).toContain("createServer");
      expect(text).toContain("ToolRegistry");
    });

    it("should include totalLines", async () => {
      const { sc } = await read({ filePath: "sample.ts", cache: false });
      expect(sc?.totalLines).toBeGreaterThan(10);
    });
  });

  describe("skeleton mode — TypeScript", () => {
    it("should return function signatures", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton" });
      expect(text).toContain("createServer");
    });

    it("should not duplicate 'async' keyword in async function signatures", async () => {
      // Regression: TS signature builder already emits "async" in the signature
      // string; the skeleton renderer used to prepend it a second time, yielding
      // "export async async createServer(...)".
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton" });
      expect(text).not.toMatch(/\basync\s+async\b/);
    });

    it("should return class with methods", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton" });
      expect(text).toContain("ToolRegistry");
      expect(text).toContain("register");
    });

    it("should return interface", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton" });
      expect(text).toContain("ServerConfig");
    });

    it("should return exported variable", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton" });
      expect(text).toContain("VERSION");
    });

    it("should include token stats", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton", cache: false });
      // Plain format: "Tokens: X/Y (Z% saved)"
      expect(text).toMatch(/Tokens:\s*\d+\/\d+/);
    });

    it("should support depth 1 (signatures only)", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton", depth: 1 });
      // Depth 1: no doc comments
      expect(text).not.toContain("/**");
    });

    it("should support depth 2 (signatures + doc preview)", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton", depth: 2 });
      // Depth 2: inline doc comments
      expect(text).toContain("//");
    });

    it("should support depth 3 (full docs)", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "skeleton", depth: 3 });
      // Depth 3: full JSDoc blocks
      expect(text).toContain("/**");
    });
  });

  describe("skeleton mode — JavaScript", () => {
    it("should return function and class signatures", async () => {
      const { text } = await read({ filePath: "sample.js", mode: "skeleton" });
      expect(text).toContain("createApp");
      expect(text).toContain("Router");
    });
  });

  // Tree-sitter languages: WASM parsers are warmed up in beforeAll.
  // After warm-up, skeleton mode should return actual AST elements.
  describe("skeleton mode — Python", { timeout: 30000 }, () => {
    it("should extract class and function signatures", async () => {
      const { text } = await read({ filePath: "sample.py", mode: "skeleton", cache: false });
      expect(text).toContain("sample.py");
      expect(text).toContain("DatabaseConnection");
      expect(text).toContain("create_connection");
    });
  });

  describe("skeleton mode — Go", { timeout: 30000 }, () => {
    it("should extract struct and function signatures", async () => {
      const { text } = await read({ filePath: "sample.go", mode: "skeleton", cache: false });
      expect(text).toContain("sample.go");
      expect(text).toContain("Server");
      expect(text).toContain("NewServer");
    });
  });

  describe("skeleton mode — Rust", { timeout: 30000 }, () => {
    it("should extract struct and function signatures", async () => {
      const { text } = await read({ filePath: "sample.rs", mode: "skeleton", cache: false });
      expect(text).toContain("sample.rs");
      expect(text).toContain("Config");
      expect(text).toContain("load_config");
    });
  });

  describe("skeleton mode — PHP", { timeout: 30000 }, () => {
    it("should extract class and function signatures", async () => {
      const { text } = await read({ filePath: "sample.php", mode: "skeleton", cache: false });
      expect(text).toContain("sample.php");
      expect(text).toContain("AuthController");
      expect(text).toContain("middleware");
    });
  });

  describe("skeleton mode — Swift", { timeout: 30000 }, () => {
    it("should extract class and function signatures", async () => {
      const { text } = await read({ filePath: "sample.swift", mode: "skeleton", cache: false });
      expect(text).toContain("sample.swift");
      expect(text).toContain("FileStore");
      expect(text).toContain("createStore");
    });
  });

  describe("skeleton mode — unsupported language", () => {
    it("should return empty result for JSON (not an error)", async () => {
      const { text } = await read({ filePath: "config.json", mode: "skeleton" });
      expect(text).toContain("No AST support");
      expect(text).not.toContain("Error");
    });

    it("should return empty result for YAML (not an error)", async () => {
      const { text } = await read({ filePath: "data.yaml", mode: "skeleton" });
      expect(text).toContain("No AST support");
    });
  });

  describe("extract mode", () => {
    it("should extract a function by name", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
      });
      expect(text).toContain("createServer");
      expect(text).toContain("ServerConfig");
    });

    it("should extract a class by name", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "class", name: "ToolRegistry" },
      });
      expect(text).toContain("ToolRegistry");
      expect(text).toContain("register");
    });

    it("should extract an interface by name", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "interface", name: "ServerConfig" },
      });
      expect(text).toContain("ServerConfig");
      expect(text).toContain("verbose");
    });

    it("should extract a type by name", async () => {
      // ServerConfig is defined as an interface — "type" target may or may not match
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "type", name: "ServerConfig" },
      });
      // Either finds it (contains ServerConfig) or correctly reports not found
      expect(text.length).toBeGreaterThan(0);
      expect(text).toMatch(/ServerConfig|not found/);
    });

    it("should extract a variable by name", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "variable", name: "VERSION" },
      });
      expect(text).toContain("VERSION");
    });

    it("should return not-found for non-existent element", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "nonExistent" },
      });
      expect(text).toContain("not found");
    });

    it("should require target param in extract mode", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "extract" });
      expect(text).toContain("requires");
    });
  });

  describe("search mode", () => {
    it("should find elements matching query", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "search",
        query: "register",
      });
      expect(text).toContain("register");
    });

    it("should show match count", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "search",
        query: "get",
      });
      expect(text).toMatch(/Matches:\s*\d+/i);
    });

    it("should return no matches for non-existent query", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "search",
        query: "zzznothingzzz",
      });
      expect(text).toContain("No matches");
    });

    it("should require query param in search mode", async () => {
      const { text } = await read({ filePath: "sample.ts", mode: "search" });
      expect(text).toContain("requires");
    });
  });

  describe("line extraction", () => {
    it("should extract specific lines", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        lines: { start: 1, end: 5 },
      });
      expect(text).toContain("import");
    });

    it("should work regardless of mode", async () => {
      const { text, sc } = await read({
        filePath: "sample.ts",
        mode: "skeleton",
        lines: { start: 1, end: 3 },
      });
      // Lines take priority over mode
      expect(sc?.mode).toBe("lines");
      expect(text).toContain("import");
    });
  });

  describe("path security", () => {
    it("should block path traversal", async () => {
      const { text } = await read({ filePath: "../../../etc/passwd" });
      expect(text).toContain("Access denied");
      expect(text).toContain("outside the working directory");
    });

    it("should block sensitive files", async () => {
      // Create a .env file in tmpDir
      const envPath = path.join(tmpDir, ".env");
      await fs.writeFile(envPath, "SECRET=hidden", "utf-8");
      try {
        const { text } = await read({ filePath: ".env" });
        expect(text).toContain("Access denied");
      } finally {
        await fs.rm(envPath, { force: true });
      }
    });

    it("should return error for non-existent file", async () => {
      const { text } = await read({ filePath: "does-not-exist.ts" });
      expect(text).toContain("File not found");
    });
  });

  describe("unsupported language fallback", () => {
    it("should return full file for JSON in non-skeleton mode", async () => {
      const { text, result } = await read({ filePath: "config.json" });
      expect(result.isError).toBeUndefined();
      expect(text).toContain("no AST support");
      expect(text).toContain("test-project");
    });
  });

  describe("format options", () => {
    it("should support markdown format", async () => {
      const { text } = await read({ filePath: "sample.ts", format: "markdown" });
      expect(text).toContain("##");
    });

    it("should default to plain format", async () => {
      const { text } = await read({ filePath: "sample.ts" });
      expect(text).not.toMatch(/^##/m);
    });
  });

  describe("structuredContent", () => {
    it("should return structuredContent with filePath", async () => {
      const { sc } = await read({ filePath: "sample.ts", cache: false });
      expect(sc?.filePath).toBe("sample.ts");
    });

    it("should return structuredContent with language", async () => {
      const { sc } = await read({ filePath: "sample.ts", cache: false });
      expect(sc?.language).toBe("typescript");
    });

    it("should return structuredContent with totalLines", async () => {
      const { sc } = await read({ filePath: "sample.ts", cache: false });
      expect(typeof sc?.totalLines).toBe("number");
    });

    it("should return structuredContent with mode", async () => {
      const { sc } = await read({ filePath: "sample.ts", mode: "skeleton", cache: false });
      expect(sc?.mode).toBe("skeleton");
    });
  });

  describe("language detection", () => {
    it("should detect TypeScript", async () => {
      const { sc } = await read({ filePath: "sample.ts", cache: false });
      expect(sc?.language).toBe("typescript");
    });

    it("should detect JavaScript", async () => {
      const { sc } = await read({ filePath: "sample.js" });
      expect(sc?.language).toBe("javascript");
    });

    it("should accept forced language", async () => {
      const { text } = await read({ filePath: "sample.ts", language: "python" });
      // Forces Python parsing on a TS file — will likely return unexpected results
      // but shouldn't crash
      expect(text).toBeDefined();
    });

    it("should reject invalid forced language", async () => {
      const { text } = await read({ filePath: "sample.ts", language: "cobol" });
      expect(text).toContain("Unsupported language");
    });
  });

  describe("binary file handling", () => {
    it("should handle binary file without crashing", async () => {
      // Create a binary file with null bytes
      const binPath = path.join(tmpDir, "binary.dat");
      const buf = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) buf[i] = i;
      await fs.writeFile(binPath, buf);
      try {
        const { text, result } = await read({ filePath: "binary.dat" });
        // Binary files are read as UTF-8 (garbled) via unsupported language fallback — not rejected
        expect(text.length).toBeGreaterThan(0);
        expect(result.isError).toBeUndefined();
      } finally {
        await fs.rm(binPath, { force: true });
      }
    });
  });

  describe("depth validation", () => {
    it("should reject non-integer depth", async () => {
      await expect(
        read({ filePath: "sample.ts", mode: "skeleton", depth: 1.5 })
      ).rejects.toThrow();
    });

    it("should reject depth outside range", async () => {
      await expect(
        read({ filePath: "sample.ts", mode: "skeleton", depth: 5 })
      ).rejects.toThrow();
    });
  });

  describe("large file handling", { timeout: 30000 }, () => {
    it("should handle large TS file in full mode", async () => {
      const { text, sc } = await read({ filePath: "large.ts", cache: false });
      expect(sc?.totalLines).toBeGreaterThan(1000);
      expect(sc?.language).toBe("typescript");
      expect(text).toContain("processItem0");
    });

    it("should handle large TS file in skeleton mode", async () => {
      const { text } = await read({ filePath: "large.ts", mode: "skeleton", cache: false });
      // Should show token stats with significant savings (200 functions → signatures only)
      expect(text).toMatch(/Tokens:\s*\d+\/\d+/);
      const match = text.match(/(\d+)% saved/);
      expect(match).toBeTruthy();
      expect(parseInt(match![1])).toBeGreaterThan(30);
    });

    it("should include signatures from large file skeleton", async () => {
      const { text } = await read({ filePath: "large.ts", mode: "skeleton", cache: false });
      expect(text).toContain("processItem0");
      expect(text).toContain("processItem199");
      expect(text).toContain("LargeConfig");
    });

    it("should extract a specific function from large file", async () => {
      const { text, sc } = await read({
        filePath: "large.ts",
        mode: "extract",
        target: { type: "function", name: "processItem100" },
      });
      expect(sc?.mode).toBe("extract");
      expect(text).toContain("processItem100");
    });
  });

  // ---------------------------------------------------------------------------
  // US-011: Comprehensive coverage gaps
  // ---------------------------------------------------------------------------

  describe("includeImports flag", () => {
    it("should include related imports by default in extract mode", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
        cache: false,
      });
      // createServer returns Promise<Server>, so the Server import should appear
      expect(text).toContain("Related imports");
    });

    it("should exclude imports when includeImports is false", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
        includeImports: false,
        cache: false,
      });
      expect(text).not.toContain("Related imports");
    });
  });

  describe("includeComments flag", () => {
    it("should include doc comments by default in extract mode", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
        cache: false,
      });
      // Default includeComments is true — JSDoc should be present in extracted content
      expect(text).toContain("Create and start the server");
    });

    it("should accept includeComments: false without error", async () => {
      const { text, result } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
        includeComments: false,
        cache: false,
      });
      expect(result.isError).toBeUndefined();
      expect(text).toContain("createServer");
    });
  });

  describe("markdown format — skeleton mode", () => {
    it("should output markdown heading for skeleton", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "skeleton",
        format: "markdown",
        cache: false,
      });
      expect(text).toContain("##");
      expect(text).toContain("```");
    });
  });

  describe("markdown format — extract mode", () => {
    it("should output markdown heading for extract", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
        format: "markdown",
        cache: false,
      });
      expect(text).toContain("## Extracted:");
      expect(text).toContain("```");
    });
  });

  describe("markdown format — search mode", () => {
    it("should output markdown heading for search results", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "search",
        query: "register",
        format: "markdown",
        cache: false,
      });
      expect(text).toContain("## Search Results:");
      expect(text).toContain("**Matches:**");
    });

    it("should handle markdown format with zero results", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "search",
        query: "zzznothingzzz",
        format: "markdown",
        cache: false,
      });
      expect(text).toContain("## Search Results:");
      expect(text).toContain("No matches found.");
    });
  });

  describe("markdown format — unsupported language fallback", () => {
    it("should wrap content in code fences for unsupported language", async () => {
      const { text } = await read({
        filePath: "config.json",
        format: "markdown",
        cache: false,
      });
      expect(text).toContain("## File:");
      expect(text).toContain("```");
    });
  });

  describe("cache behavior", () => {
    it("should return _(from cache)_ suffix on second call", async () => {
      // Use dedicated cache-test.ts file not touched by other tests
      // First call — populates cache (cache: true)
      const first = await read({
        filePath: "cache-test.ts",
        mode: "skeleton",
        cache: true,
      });
      expect(first.text).not.toContain("_(from cache)_");

      // Second call — should hit cache
      const second = await read({
        filePath: "cache-test.ts",
        mode: "skeleton",
        cache: true,
      });
      expect(second.text).toContain("_(from cache)_");
    });

    it("should bypass cache when cache: false", async () => {
      // cache-test.ts is cached from prior test, but cache: false bypasses
      const { text } = await read({
        filePath: "cache-test.ts",
        mode: "skeleton",
        cache: false,
      });
      expect(text).not.toContain("_(from cache)_");
    });

    it("should include structuredContent.content without cache suffix", async () => {
      // Explicitly populate cache (self-sufficient — no dependency on prior test)
      await read({ filePath: "cache-test.ts", mode: "full", cache: true });
      // Hit the cache
      const { text, sc } = await read({
        filePath: "cache-test.ts",
        mode: "full",
        cache: true,
      });
      expect(text).toContain("_(from cache)_");
      // structuredContent.content should NOT have the cache suffix
      expect(sc?.content).not.toContain("_(from cache)_");
    });
  });

  describe("structuredContent on error paths", () => {
    it("should not have structuredContent when path is blocked", async () => {
      const envPath = path.join(tmpDir, ".env.local");
      await fs.writeFile(envPath, "KEY=value", "utf-8");
      try {
        const { result } = await read({ filePath: ".env.local" });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toBeUndefined();
      } finally {
        await fs.rm(envPath, { force: true });
      }
    });

    it("should not have structuredContent when file not found", async () => {
      const { result } = await read({ filePath: "nonexistent.ts" });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    });

    it("should not have structuredContent when extract target missing", async () => {
      const { result } = await read({ filePath: "sample.ts", mode: "extract" });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    });

    it("should not have structuredContent when search query missing", async () => {
      const { result } = await read({ filePath: "sample.ts", mode: "search" });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    });

    it("should not have structuredContent when element not found", async () => {
      const { result } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "doesNotExist" },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    });
  });

  describe("language aliases", () => {
    it("should accept 'ts' as alias for typescript", async () => {
      const { sc, result } = await read({ filePath: "sample.ts", language: "ts", cache: false });
      expect(result.isError).toBeUndefined();
      expect(sc?.language).toBe("typescript");
    });

    it("should accept 'js' as alias for javascript", async () => {
      const { sc, result } = await read({ filePath: "sample.js", language: "js", cache: false });
      expect(result.isError).toBeUndefined();
      expect(sc?.language).toBe("javascript");
    });

    it("should accept 'py' as alias for python", async () => {
      const { sc, result } = await read({ filePath: "sample.py", language: "py", cache: false });
      expect(result.isError).toBeUndefined();
      expect(sc?.language).toBe("python");
    });

    it("should accept 'golang' as alias for go", async () => {
      const { sc, result } = await read({ filePath: "sample.go", language: "golang", cache: false });
      expect(result.isError).toBeUndefined();
      expect(sc?.language).toBe("go");
    });

    it("should accept 'rs' as alias for rust", async () => {
      const { sc, result } = await read({ filePath: "sample.rs", language: "rs", cache: false });
      expect(result.isError).toBeUndefined();
      expect(sc?.language).toBe("rust");
    });
  });

  describe("lines with out-of-bound values", () => {
    it("should clamp start: 0 to line 1", async () => {
      const { text, sc } = await read({
        filePath: "sample.ts",
        lines: { start: 0, end: 3 },
        cache: false,
      });
      expect(sc?.mode).toBe("lines");
      // Should start from line 1 (clamped)
      expect(text).toContain("import");
    });

    it("should clamp end beyond file length", async () => {
      const { text, sc } = await read({
        filePath: "sample.ts",
        lines: { start: 1, end: 99999 },
        cache: false,
      });
      expect(sc?.mode).toBe("lines");
      // Should include the last line (VERSION)
      expect(text).toContain("VERSION");
    });

    it("should handle start > end by clamping", async () => {
      const { text, sc } = await read({
        filePath: "sample.ts",
        lines: { start: 5, end: 2 },
        cache: false,
      });
      // extractLines clamps: end = Math.max(start, end), so start=5, end=5
      expect(sc?.mode).toBe("lines");
      // Line 5 of sample.ts is "  port?: number;" (inside ServerConfig interface)
      expect(text).toContain("port");
    });
  });

  describe("search mode — non-TS languages", { timeout: 30000 }, () => {
    it("should search in Python files", async () => {
      const { text, result } = await read({
        filePath: "sample.py",
        mode: "search",
        query: "connect",
        cache: false,
      });
      expect(result.isError).toBeUndefined();
      expect(text).toContain("connect");
    });

    it("should search in Go files", async () => {
      const { text, result } = await read({
        filePath: "sample.go",
        mode: "search",
        query: "Server",
        cache: false,
      });
      expect(result.isError).toBeUndefined();
      expect(text).toContain("Server");
    });

    it("should search in Rust files", async () => {
      const { text, result } = await read({
        filePath: "sample.rs",
        mode: "search",
        query: "Config",
        cache: false,
      });
      expect(result.isError).toBeUndefined();
      expect(text).toContain("Config");
    });
  });

  describe("extract mode — non-TS languages", { timeout: 30000 }, () => {
    it("should extract a function from Python", async () => {
      const { text, sc } = await read({
        filePath: "sample.py",
        mode: "extract",
        target: { type: "function", name: "create_connection" },
        cache: false,
      });
      expect(sc?.mode).toBe("extract");
      expect(text).toContain("create_connection");
    });

    it("should extract a class from Python", async () => {
      const { text, sc } = await read({
        filePath: "sample.py",
        mode: "extract",
        target: { type: "class", name: "DatabaseConnection" },
        cache: false,
      });
      expect(sc?.mode).toBe("extract");
      expect(text).toContain("DatabaseConnection");
    });

    it("should extract a function from Go", async () => {
      const { text, sc } = await read({
        filePath: "sample.go",
        mode: "extract",
        target: { type: "function", name: "NewServer" },
        cache: false,
      });
      expect(sc?.mode).toBe("extract");
      expect(text).toContain("NewServer");
    });

    it("should extract a struct from Rust", async () => {
      const { text, sc } = await read({
        filePath: "sample.rs",
        mode: "extract",
        target: { type: "class", name: "Config" },
        cache: false,
      });
      expect(sc?.mode).toBe("extract");
      expect(text).toContain("Config");
    });
  });

  describe("symlink escape protection", () => {
    it("should block symlinks that point outside the working directory", async () => {
      const linkPath = path.join(tmpDir, "escape-link.ts");
      try {
        await fs.symlink("/etc/hostname", linkPath);
      } catch {
        // Symlink creation may fail on some systems (e.g., Windows or restricted environments)
        return;
      }
      try {
        const { text, result } = await read({ filePath: "escape-link.ts" });
        expect(result.isError).toBe(true);
        expect(text).toContain("Access denied");
      } finally {
        await fs.rm(linkPath, { force: true });
      }
    });
  });

  describe("all blocked file patterns", () => {
    const blockedFiles = [
      { name: ".env.production", desc: ".env variant" },
      { name: "server.pem", desc: "PEM private key" },
      { name: "server.key", desc: "key file" },
      { name: "id_rsa", desc: "SSH RSA key" },
      { name: "id_ed25519", desc: "SSH ED25519 key" },
      { name: "credentials.json", desc: "credentials file" },
      { name: "secrets.yaml", desc: "secrets file" },
      { name: "app.keystore", desc: "Java keystore" },
    ];

    for (const { name, desc } of blockedFiles) {
      it(`should block ${desc} (${name})`, async () => {
        const filePath = path.join(tmpDir, name);
        await fs.writeFile(filePath, "sensitive-content", "utf-8");
        try {
          const { text, result } = await read({ filePath: name });
          expect(result.isError).toBe(true);
          expect(text).toContain("Access denied");
        } finally {
          await fs.rm(filePath, { force: true });
        }
      });
    }
  });

  describe("lines mode and structuredContent", () => {
    it("should set structuredContent.mode to 'lines'", async () => {
      const { sc } = await read({
        filePath: "sample.ts",
        lines: { start: 1, end: 5 },
        cache: false,
      });
      expect(sc?.mode).toBe("lines");
      expect(sc?.filePath).toBe("sample.ts");
      expect(sc?.language).toBe("typescript");
    });
  });

  // ---------------------------------------------------------------------------
  // US-011: Additional edge-case coverage
  // ---------------------------------------------------------------------------

  describe("empty file handling", () => {
    it("should handle an empty file without crashing", async () => {
      const { text, result } = await read({ filePath: "empty.ts", cache: false });
      expect(result.isError).toBeUndefined();
      expect(text).toBeDefined();
    });

    it("should report totalLines for empty file", async () => {
      const { sc } = await read({ filePath: "empty.ts", cache: false });
      // fs.readFile returns "" for empty file; "".split("\n") yields [""], so totalLines is 1
      expect(sc?.totalLines).toBe(1);
    });
  });

  describe("method extract target type", () => {
    it("should extract a method from a class", async () => {
      const { text, sc } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "method", name: "register" },
        cache: false,
      });
      expect(sc?.mode).toBe("extract");
      expect(text).toContain("register");
    });
  });

  describe("structuredContent.content in success paths", () => {
    it("should include content string in full mode", async () => {
      const { sc } = await read({ filePath: "sample.ts", mode: "full", cache: false });
      expect(typeof sc?.content).toBe("string");
      expect(sc?.content).toContain("createServer");
    });

    it("should include content string in skeleton mode", async () => {
      const { sc } = await read({ filePath: "sample.ts", mode: "skeleton", cache: false });
      expect(typeof sc?.content).toBe("string");
      expect(sc?.content).toContain("createServer");
    });

    it("should include content string in extract mode", async () => {
      const { sc } = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
        cache: false,
      });
      expect(typeof sc?.content).toBe("string");
      expect(sc?.content).toContain("createServer");
    });

    it("should include content string in search mode", async () => {
      const { sc } = await read({
        filePath: "sample.ts",
        mode: "search",
        query: "register",
        cache: false,
      });
      expect(typeof sc?.content).toBe("string");
      expect(sc?.content).toContain("register");
    });
  });

  describe("markdown format — full mode (explicit)", () => {
    it("should output markdown headings for full mode", async () => {
      const { text } = await read({
        filePath: "sample.ts",
        mode: "full",
        format: "markdown",
        cache: false,
      });
      expect(text).toContain("## File Structure:");
      expect(text).toContain("### Functions");
    });
  });

  describe("includeComments suppression", () => {
    it("should suppress doc comments when includeComments is false", async () => {
      const withComments = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
        includeComments: true,
        cache: false,
      });
      const withoutComments = await read({
        filePath: "sample.ts",
        mode: "extract",
        target: { type: "function", name: "createServer" },
        includeComments: false,
        cache: false,
      });
      // Both should succeed
      expect(withComments.result.isError).toBeUndefined();
      expect(withoutComments.result.isError).toBeUndefined();
      // With comments includes the JSDoc; without should omit or shorten it
      expect(withComments.text).toContain("Create and start the server");
      expect(withComments.text.length).toBeGreaterThanOrEqual(withoutComments.text.length);
    });
  });

  describe("absolute path within cwd", () => {
    it("should accept an absolute path that resolves within the working directory", async () => {
      // Construct an absolute path to the fixture file
      const absPath = path.join(tmpDir, "sample.ts");
      const { sc, result } = await read({ filePath: absPath, cache: false });
      expect(result.isError).toBeUndefined();
      expect(sc?.language).toBe("typescript");
    });
  });

  // ---------------------------------------------------------------------------
  // Output budget cap (US-007)
  // ---------------------------------------------------------------------------

  describe("Output Budget Cap", () => {
    it("should include outputChars, truncated, and elementCount in structuredContent", async () => {
      const { sc, text } = await read({ filePath: "sample.ts", mode: "skeleton", cache: false });
      expect(sc?.outputChars).toBe(text.length);
      expect(sc?.truncated).toBe(false);
      expect(sc?.elementCount).toBeGreaterThan(0);
    });

    it("should not cap lines mode output", async () => {
      const { sc } = await read({
        filePath: "sample.ts",
        lines: { start: 1, end: 50 },
        cache: false,
      });
      expect(sc?.truncated).toBe(false);
      expect(sc?.mode).toBe("lines");
    });

    it("should include outputChars for full mode", async () => {
      const { sc, text } = await read({ filePath: "sample.ts", mode: "full", cache: false });
      expect(sc?.outputChars).toBe(text.length);
      expect(sc?.truncated).toBe(false);
    });

    it("should cap skeleton output for large files under 45K chars", async () => {
      const { sc, text } = await read({ filePath: "huge-cap-test.ts", mode: "skeleton", cache: false });
      expect(text.length).toBeLessThanOrEqual(45_000);
      expect(sc?.outputChars).toBe(text.length);
      // If the skeleton is naturally under 45K, truncated is false — both outcomes are valid
      if (text.length === 45_000 || (sc?.truncated as boolean)) {
        expect(text).toContain("truncated output");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// US-008: compression marker integration
// ---------------------------------------------------------------------------

describe("smart_file_read — DISTILL:COMPRESSED marker", () => {
  const ORIGINAL = process.env.DISTILL_COMPRESSED_MARKERS;

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.DISTILL_COMPRESSED_MARKERS;
    } else {
      process.env.DISTILL_COMPRESSED_MARKERS = ORIGINAL;
    }
  });

  it("does not wrap skeleton output when env var is unset", async () => {
    delete process.env.DISTILL_COMPRESSED_MARKERS;
    const { text } = await read({
      filePath: "sample.ts",
      mode: "skeleton",
      depth: 1,
      cache: false,
    });
    expect(text).not.toContain("[DISTILL:COMPRESSED");
  });

  it("wraps skeleton output when env var is '1' and output < 50% of source", async () => {
    process.env.DISTILL_COMPRESSED_MARKERS = "1";
    const { text } = await read({
      filePath: "sample.ts",
      mode: "skeleton",
      depth: 1,
      cache: false,
    });
    // Fixture sample.ts is large enough and skeleton is concise — should wrap.
    expect(text).toMatch(/^\[DISTILL:COMPRESSED ratio=\d\.\d{2} method=skeleton\]\n/);
    expect(text).toMatch(/\n\[\/DISTILL:COMPRESSED\]$/);
  });

  it("does not wrap full-file mode even when env var is on", async () => {
    process.env.DISTILL_COMPRESSED_MARKERS = "1";
    const { text } = await read({
      filePath: "sample.ts",
      mode: "full",
      cache: false,
    });
    expect(text).not.toContain("[DISTILL:COMPRESSED");
  });
});
