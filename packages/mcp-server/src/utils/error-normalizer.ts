/**
 * Error Normalizer
 *
 * Normalizes error lines to create consistent signatures for deduplication.
 * Removes variable parts (file paths, line numbers, values) while preserving
 * the error pattern.
 */

export interface ErrorParts {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  raw: string;
}

/**
 * Normalize an error line by replacing variable parts with placeholders.
 * This creates a consistent signature for grouping similar errors.
 */
export function normalizeErrorLine(line: string): string {
  return (
    line
      // Remove file paths (Unix and Windows)
      .replace(/[A-Za-z]:\\[\w\-\\\.]+\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)/gi, "<FILE>")
      .replace(/\/[\w\-\.\/]+\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)/g, "<FILE>")
      // Remove relative paths
      .replace(/\.\.?\/[\w\-\.\/]+\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|h|hpp)/g, "<FILE>")
      // Remove line:column patterns
      .replace(/:\d+:\d+/g, ":<LINE>")
      .replace(/\(\d+,\s*\d+\)/g, "(<LINE>)")
      .replace(/\[\d+,\s*\d+\]/g, "[<LINE>]")
      .replace(/line\s+\d+/gi, "line <LINE>")
      .replace(/col(?:umn)?\s+\d+/gi, "col <LINE>")
      // Remove quoted values (but preserve the quotes for structure)
      .replace(/'[^']*'/g, "'<VALUE>'")
      .replace(/"[^"]*"/g, '"<VALUE>"')
      .replace(/`[^`]*`/g, "`<VALUE>`")
      // Remove timestamps
      .replace(/\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:?\d{2}|Z)?/g, "<TIMESTAMP>")
      .replace(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/g, "<TIMESTAMP>")
      // Remove numeric IDs and hashes
      .replace(/\b[0-9a-f]{32,}\b/gi, "<HASH>")
      .replace(/\b\d{5,}\b/g, "<ID>")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Common error patterns for different tools
 */
const ERROR_PATTERNS = [
  // TypeScript: src/file.ts(12,5): error TS2304: Cannot find name 'foo'.
  {
    name: "typescript",
    regex: /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+(TS\d+):\s*(.+)$/,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      file: match[1] ?? "",
      line: parseInt(match[2] ?? "0", 10),
      column: parseInt(match[3] ?? "0", 10),
      code: match[5] ?? "",
      message: match[6] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // ESLint: src/file.ts:12:5 - error rule-name: Message
  {
    name: "eslint",
    regex: /^(.+?):(\d+):(\d+)\s*-?\s*(error|warning|info)\s+([a-z\-@\/]+):\s*(.+)$/i,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      file: match[1] ?? "",
      line: parseInt(match[2] ?? "0", 10),
      column: parseInt(match[3] ?? "0", 10),
      code: match[5] ?? "",
      message: match[6] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // GCC/Clang: file.c:12:5: error: message
  {
    name: "gcc",
    regex: /^(.+?):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      file: match[1] ?? "",
      line: parseInt(match[2] ?? "0", 10),
      column: parseInt(match[3] ?? "0", 10),
      code: match[4] ?? "",
      message: match[5] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // Python: File "file.py", line 12, in function
  {
    name: "python",
    regex: /^File "(.+?)", line (\d+)(?:, in .+)?$/,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      file: match[1] ?? "",
      line: parseInt(match[2] ?? "0", 10),
      message: match[0] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // Python error: ErrorType: message
  {
    name: "python-error",
    regex: /^([A-Z][a-zA-Z]+Error):\s*(.+)$/,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      code: match[1] ?? "",
      message: match[2] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // Go: file.go:12:5: message
  {
    name: "go",
    regex: /^(.+?\.go):(\d+):(\d+):\s*(.+)$/,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      file: match[1] ?? "",
      line: parseInt(match[2] ?? "0", 10),
      column: parseInt(match[3] ?? "0", 10),
      message: match[4] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // Rust: error[E0425]: cannot find value `x` in this scope
  {
    name: "rust",
    regex: /^(error|warning)\[(E\d+)\]:\s*(.+)$/,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      code: match[2] ?? "",
      message: match[3] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // Rust location: --> file.rs:12:5
  {
    name: "rust-location",
    regex: /^\s*-->\s*(.+?):(\d+):(\d+)$/,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      file: match[1] ?? "",
      line: parseInt(match[2] ?? "0", 10),
      column: parseInt(match[3] ?? "0", 10),
      message: match[0] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // Generic: [ERROR] message or ERROR: message
  {
    name: "generic-bracket",
    regex: /^\[(ERROR|WARN(?:ING)?|INFO)\]\s*(.+)$/i,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      code: (match[1] ?? "").toUpperCase(),
      message: match[2] ?? "",
      raw: match[0] ?? "",
    }),
  },
  // Generic colon format
  {
    name: "generic-colon",
    regex: /^(ERROR|WARN(?:ING)?|FATAL):\s*(.+)$/i,
    extract: (match: RegExpMatchArray): ErrorParts => ({
      code: (match[1] ?? "").toUpperCase(),
      message: match[2] ?? "",
      raw: match[0] ?? "",
    }),
  },
];

/**
 * Extract structured parts from an error line.
 * Returns null if the line doesn't match any known error pattern.
 */
export function extractErrorParts(line: string): ErrorParts | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  for (const pattern of ERROR_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      return pattern.extract(match);
    }
  }

  // If no pattern matches but line looks like an error
  if (isLikelyError(trimmed)) {
    return {
      message: trimmed,
      raw: trimmed,
    };
  }

  return null;
}

/**
 * Check if a line is likely an error message
 */
export function isLikelyError(line: string): boolean {
  const errorIndicators = [
    /\berror\b/i,
    /\bfailed\b/i,
    /\bfailure\b/i,
    /\bexception\b/i,
    /\bcannot\b/i,
    /\bunable\b/i,
    /\binvalid\b/i,
    /\bunexpected\b/i,
    /\bmissing\b/i,
    /\bundefined\b/i,
    /\bnot found\b/i,
    /\bdoes not exist\b/i,
    /\bnot defined\b/i,
    /\btype mismatch\b/i,
    /\bsyntax error\b/i,
    /^\s*\^+\s*$/, // Error pointer line (^^^)
  ];

  return errorIndicators.some((pattern) => pattern.test(line));
}

/**
 * Create a signature from error parts for grouping.
 * The signature represents the "type" of error, ignoring location.
 */
export function createSignature(parts: ErrorParts): string {
  const components: string[] = [];

  if (parts.code) {
    components.push(parts.code);
  }

  // Normalize the message
  const normalizedMessage = normalizeErrorLine(parts.message);
  components.push(normalizedMessage);

  return components.join(": ");
}

/**
 * Extract file location from error parts
 */
export function formatLocation(parts: ErrorParts): string {
  if (!parts.file) return "";

  let location = parts.file;
  if (parts.line !== undefined) {
    location += `:${parts.line}`;
    if (parts.column !== undefined) {
      location += `:${parts.column}`;
    }
  }
  return location;
}
