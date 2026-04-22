/**
 * MCP prompt registry for Distill (US-012 / US-013).
 *
 * Three zero-argument prompts are exposed via `prompts/list`, which Claude
 * Code maps to `/mcp__distill-mcp__<name>` slash commands (see CLAUDE.md
 * appendix row #8 → `claude-code/services/mcp/client.ts:2043-2060`).
 *
 * Extracted from `src/server.ts` so the registry + lookup logic can be
 * unit-tested in isolation (US-013 AC). The wire-level handlers remain
 * inline in `server.ts` per the PRD recommendation.
 */

export interface PromptDefinition {
  /** Stable identifier — becomes `mcp__distill-mcp__<name>` in Claude Code. */
  readonly name: string;
  /** Short human-readable description surfaced in the slash-command menu. */
  readonly description: string;
  /** The user-role message body returned by `prompts/get`. */
  readonly guidance: string;
}

/**
 * The 3-prompt registry. Frozen at module load to prevent accidental
 * mutation by future in-tree callers.
 */
export const PROMPTS: readonly PromptDefinition[] = Object.freeze([
  Object.freeze({
    name: "compress-session",
    description:
      "Survey recent tool results and compress verbose output with auto_optimize before it contributes to autocompact.",
    guidance:
      "Survey recent tool results in the session, identify those with >500 chars of raw output, and call `auto_optimize` on each to compress before it contributes to autocompact.",
  }),
  Object.freeze({
    name: "analyze-tokens",
    description:
      "Estimate current session token usage and identify the largest contributions.",
    guidance:
      "Estimate current session token usage: (1) list all messages with their approximate token weights via `roughTokenCountEstimation = length/4`, (2) identify the top 3 largest contributions, (3) suggest which can be compressed via `auto_optimize` or `smart_file_read` refactoring.",
  }),
  Object.freeze({
    name: "forget-large-results",
    description:
      "Identify tool results persisted to disk by Claude Code (>25K tokens) and propose re-compression paths.",
    guidance:
      "Identify tool results currently persisted to disk by Claude Code (those >25K tokens, per `claude-code/utils/mcpValidation.ts:16`), list their paths, and propose which can be safely re-compressed via `auto_optimize` to reduce context bloat.",
  }),
]) as readonly PromptDefinition[];

/**
 * Exact-match, case-sensitive lookup. Returns undefined for unknown names,
 * empty strings, and trivially wrong cases (callers format the MCP error
 * themselves so we don't bake in MCP-SDK coupling here).
 */
export function findPrompt(name: string): PromptDefinition | undefined {
  return PROMPTS.find((p) => p.name === name);
}

/**
 * Shape of each item in the `prompts/list` response. `arguments: []` is
 * intentional — all 3 prompts are zero-argument (US-012 AC2).
 */
export interface PromptListEntry {
  name: string;
  description: string;
  arguments: never[];
}

export function listPromptsMetadata(): PromptListEntry[] {
  return PROMPTS.map((p) => ({
    name: p.name,
    description: p.description,
    arguments: [],
  }));
}

/**
 * Build the `GetPromptResult.messages` payload for a single prompt. Always
 * returns exactly one user-role text message (US-012 AC3-5).
 */
export function buildPromptMessage(prompt: PromptDefinition): {
  role: "user";
  content: { type: "text"; text: string };
}[] {
  return [
    {
      role: "user",
      content: { type: "text", text: prompt.guidance },
    },
  ];
}
