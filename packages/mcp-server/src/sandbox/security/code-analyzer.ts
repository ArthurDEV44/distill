/**
 * Code Analyzer
 *
 * Static analysis of code before execution to block dangerous patterns.
 */

import type { CodeAnalysis } from "../types.js";

/**
 * Dangerous patterns that are blocked in sandbox code
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Code execution
  { pattern: /\beval\s*\(/, reason: "eval() is not allowed" },
  { pattern: /\bFunction\s*\(/, reason: "Function constructor is not allowed" },
  { pattern: /new\s+Function\s*\(/, reason: "new Function() is not allowed" },

  // Module system
  { pattern: /\brequire\s*\(/, reason: "require() is not allowed" },
  { pattern: /\bimport\s*\(/, reason: "dynamic import() is not allowed" },
  { pattern: /import\.meta/, reason: "import.meta is not allowed" },

  // Node.js globals
  { pattern: /\bprocess\b/, reason: "process is not allowed" },
  { pattern: /\bglobal\b/, reason: "global is not allowed" },
  { pattern: /\bglobalThis\b/, reason: "globalThis is not allowed" },
  { pattern: /\b__dirname\b/, reason: "__dirname is not allowed" },
  { pattern: /\b__filename\b/, reason: "__filename is not allowed" },
  { pattern: /\bBuffer\b/, reason: "Buffer is not allowed" },

  // Prototype pollution & sandbox-escape chains.
  // Rejects `.constructor(`, `.constructor[`, `.constructor.`, bare reads like
  // `Array.prototype.constructor`, and bracket-string access such as
  // `obj["constructor"]` — mitigates the canonical
  // `this.constructor.constructor("return process")()` escape chain (see
  // SandboxJS GHSA-jjpw-65fv-8g48). Conservative: a few legitimate reads of
  // `.constructor` are refused. QuickJS containment is the final defence for
  // fully-obfuscated variants that avoid the literal substring.
  { pattern: /__proto__/, reason: "__proto__ is not allowed" },
  { pattern: /\.constructor\b/, reason: "blocked: constructor-chain access is not allowed" },
  { pattern: /\[\s*(['"`])constructor\1\s*\]/, reason: "blocked: constructor-chain access is not allowed" },
  { pattern: /\.prototype\s*\[/, reason: "prototype access is not allowed" },

  // Keyword-reconstruction & reflection APIs.
  // `String.fromCharCode(...)` is the canonical obfuscation vector from
  // CVE-2025-68613 (n8n sandbox escape): rebuilding `process`/`constructor`
  // byte-by-byte to evade the literal-substring patterns above. The specific
  // `Reflect.ownKeys` / `Reflect.get` entries below also match the broader
  // `\bReflect\b` pattern — redundant by design (two reasons surface, making
  // the blocked-pattern log easier to triage). Conservative: legitimate use
  // of `String.fromCharCode(65)` as a utility is refused. QuickJS WASM is
  // the final containment for fully-obfuscated variants.
  { pattern: /\bString\.fromCharCode\s*\(/, reason: "String.fromCharCode is not allowed (keyword reconstruction vector)" },
  { pattern: /\bReflect\.ownKeys\s*\(/, reason: "Reflect.ownKeys is not allowed" },
  { pattern: /\bReflect\.get\s*\(/, reason: "Reflect.get is not allowed" },
  { pattern: /\bReflect\b/, reason: "Reflect is not allowed" },
  { pattern: /\bProxy\b/, reason: "Proxy is not allowed" },

  // Unsafe operations
  { pattern: /\bsetTimeout\s*\(/, reason: "setTimeout is not allowed (use await)" },
  { pattern: /\bsetInterval\s*\(/, reason: "setInterval is not allowed" },
  { pattern: /\bsetImmediate\s*\(/, reason: "setImmediate is not allowed" },

  // File system escape attempts
  { pattern: /file:\/\//, reason: "file:// URLs are not allowed" },
  { pattern: /\.\.\/\.\.\//, reason: "path traversal is not allowed" },

  // Infinite loops (hang server in legacy mode; consume CPU until timeout in QuickJS mode)
  { pattern: /while\s*\(\s*true\s*\)/, reason: "infinite loop detected (while(true))" },
  { pattern: /for\s*\(\s*;\s*;\s*\)/, reason: "infinite loop detected (for(;;))" },
];

/**
 * Warning patterns (not blocked, but flagged)
 */
const WARNING_PATTERNS: Array<{ pattern: RegExp; warning: string }> = [
  { pattern: /\.repeat\s*\(\s*\d{6,}\s*\)/, warning: "large string repeat" },
];

/**
 * Analyze code for security issues
 */
export function analyzeCode(code: string): CodeAnalysis {
  const blockedPatterns: string[] = [];
  const warnings: string[] = [];

  // Check blocked patterns
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      blockedPatterns.push(reason);
    }
  }

  // Check warning patterns
  for (const { pattern, warning } of WARNING_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(warning);
    }
  }

  return {
    safe: blockedPatterns.length === 0,
    warnings,
    blockedPatterns,
  };
}

/**
 * Escape regex metacharacters so arbitrary strings can be safely embedded in
 * a `new RegExp(...)`. Without this, a `workingDir` like `/tmp/my+project`
 * would either fail to compile or match unintended substrings — both leak
 * host-path info back through the error message `sanitizeError` is supposed
 * to strip.
 */
function escapeForRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitize error messages to remove host paths
 */
export function sanitizeError(error: Error, workingDir: string): string {
  let message = error.message || "Unknown error";

  // Remove absolute paths
  message = message.replace(new RegExp(escapeForRegExp(workingDir), "g"), "<workdir>");
  message = message.replace(/\/home\/[^/]+/g, "<home>");
  message = message.replace(/C:\\Users\\[^\\]+/gi, "<home>");

  // Remove stack traces with host info
  if (error.stack) {
    const firstLine = message.split("\n")[0];
    return firstLine || message;
  }

  return message;
}
