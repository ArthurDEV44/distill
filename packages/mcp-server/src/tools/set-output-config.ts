/**
 * Set Output Config Tool
 *
 * Configure global output format and verbosity settings.
 * Affects all tool outputs in the session.
 */

import { z } from "zod";

import type { ToolDefinition } from "./registry.js";
import {
  getOutputConfig,
  setOutputConfig,
  resetOutputConfig,
  type VerbosityLevel,
  type OutputMode,
  type OutputConfig,
} from "../config/output-config.js";

export const setOutputConfigSchema = {
  type: "object" as const,
  properties: {
    action: {
      type: "string",
      enum: ["get", "set", "reset"],
      description: "Action: get current config, set new values, or reset to defaults",
    },
    verbosity: {
      type: "string",
      enum: ["minimal", "normal", "detailed"],
      description: "Verbosity level for output",
    },
    mode: {
      type: "string",
      enum: ["structured", "prose", "toon"],
      description: "Output format mode",
    },
    useToon: {
      type: "boolean",
      description: "Use TOON format when applicable",
    },
    includeStats: {
      type: "boolean",
      description: "Include statistics in output",
    },
  },
  required: [],
};

const inputSchema = z.object({
  action: z.enum(["get", "set", "reset"]).optional().default("set"),
  verbosity: z.enum(["minimal", "normal", "detailed"]).optional(),
  mode: z.enum(["structured", "prose", "toon"]).optional(),
  useToon: z.boolean().optional(),
  includeStats: z.boolean().optional(),
});

/**
 * Format config for display
 */
function formatConfig(config: OutputConfig): string {
  const lines: string[] = [];

  lines.push("[Output Config]");
  lines.push(`verbosity: ${config.verbosity}`);
  lines.push(`mode: ${config.mode}`);
  lines.push(`useToon: ${config.useToon}`);
  lines.push(`includeStats: ${config.includeStats}`);

  return lines.join("\n");
}

/**
 * Execute output config tool
 */
async function executeSetOutputConfig(
  args: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const input = inputSchema.parse(args);

  switch (input.action) {
    case "get": {
      const config = getOutputConfig();
      return {
        content: [{ type: "text", text: formatConfig(config) }],
      };
    }

    case "reset": {
      resetOutputConfig();
      const config = getOutputConfig();
      return {
        content: [
          {
            type: "text",
            text: `Output config reset to defaults.\n\n${formatConfig(config)}`,
          },
        ],
      };
    }

    case "set":
    default: {
      // Build update object from provided values
      const update: Partial<OutputConfig> = {};

      if (input.verbosity !== undefined) {
        update.verbosity = input.verbosity as VerbosityLevel;
      }
      if (input.mode !== undefined) {
        update.mode = input.mode as OutputMode;
      }
      if (input.useToon !== undefined) {
        update.useToon = input.useToon;
      }
      if (input.includeStats !== undefined) {
        update.includeStats = input.includeStats;
      }

      // Apply updates if any
      if (Object.keys(update).length > 0) {
        setOutputConfig(update);
      }

      const config = getOutputConfig();
      const changedFields = Object.keys(update);
      const changeMsg =
        changedFields.length > 0
          ? `Updated: ${changedFields.join(", ")}`
          : "No changes (provide verbosity, mode, useToon, or includeStats)";

      return {
        content: [
          {
            type: "text",
            text: `${changeMsg}\n\n${formatConfig(config)}`,
          },
        ],
      };
    }
  }
}

export const setOutputConfigTool: ToolDefinition = {
  name: "set_output_config",
  description:
    "Configure global output format. Set verbosity (minimal/normal/detailed), mode (structured/prose/toon), and stats inclusion.",
  inputSchema: setOutputConfigSchema,
  execute: executeSetOutputConfig,
};
