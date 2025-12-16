/**
 * Command Normalizer
 *
 * Normalizes shell commands for retry loop detection.
 * Similar commands with different flags or file arguments
 * are normalized to the same base command.
 */

/**
 * Normalize a shell command for comparison.
 * Removes flags, specific file paths, and normalizes whitespace.
 *
 * @example
 * normalizeCommand("npm run build --verbose") // "npm run build"
 * normalizeCommand("bun test src/foo.test.ts") // "bun test"
 * normalizeCommand("tsc --noEmit src/index.ts") // "tsc"
 */
export function normalizeCommand(cmd: string): string {
  return (
    cmd
      // Remove long flags with values (--flag=value or --flag value)
      .replace(/--\w+(?:=\S+)?/g, "")
      // Remove short flags (-v, -f, etc.)
      .replace(/\s-\w+/g, "")
      // Remove specific file paths with extensions
      .replace(/\s+\S+\.(ts|tsx|js|jsx|json|md|css|scss|html|vue|svelte)(?:\s|$)/g, " ")
      // Remove quoted strings (often file paths or arguments)
      .replace(/"[^"]*"|'[^']*'/g, "")
      // Remove path-like arguments (containing /)
      .replace(/\s+\S*\/\S+/g, "")
      // Normalize multiple spaces to single space
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Extract the base command (first word or first two words for npm/bun/yarn/pnpm)
 *
 * @example
 * getBaseCommand("npm run build") // "npm run"
 * getBaseCommand("bun test") // "bun test"
 * getBaseCommand("tsc") // "tsc"
 */
export function getBaseCommand(cmd: string): string {
  const parts = cmd.trim().split(/\s+/);

  // Package manager commands keep their subcommand
  const packageManagers = ["npm", "bun", "yarn", "pnpm", "npx", "bunx"];
  if (packageManagers.includes(parts[0] ?? "")) {
    return parts.slice(0, 2).join(" ");
  }

  return parts[0] ?? cmd;
}

/**
 * Check if two commands are similar (same base operation)
 */
export function areCommandsSimilar(cmd1: string, cmd2: string): boolean {
  return normalizeCommand(cmd1) === normalizeCommand(cmd2);
}

/**
 * Common build/test commands that are often retried
 */
export const COMMON_RETRY_COMMANDS = [
  "npm run build",
  "npm run test",
  "npm run lint",
  "npm run check",
  "bun run build",
  "bun run test",
  "bun test",
  "bun run lint",
  "yarn build",
  "yarn test",
  "yarn lint",
  "pnpm build",
  "pnpm test",
  "pnpm lint",
  "tsc",
  "eslint",
  "prettier",
  "vitest",
  "jest",
  "cargo build",
  "cargo test",
  "go build",
  "go test",
];

/**
 * Check if a command is a common build/test command
 */
export function isCommonRetryCommand(cmd: string): boolean {
  const normalized = normalizeCommand(cmd).toLowerCase();
  return COMMON_RETRY_COMMANDS.some((common) => normalized.startsWith(common.toLowerCase()));
}
