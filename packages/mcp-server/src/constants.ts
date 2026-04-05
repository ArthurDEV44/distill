/**
 * Shared constants for the MCP server.
 */

/**
 * Maximum output size in characters for tool results.
 *
 * Claude Code persists tool results > 50,000 chars to disk with only a 2KB
 * preview shown to the model. We cap at 45K to stay safely under that threshold
 * (leaving room for structuredContent overhead).
 */
export const MAX_OUTPUT_CHARS = 45_000;
