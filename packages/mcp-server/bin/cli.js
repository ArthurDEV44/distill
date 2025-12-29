#!/usr/bin/env node

import { runServer } from "../dist/server.js";
import { setup, parseSetupArgs } from "../dist/cli/setup.js";
import { doctor } from "../dist/cli/doctor.js";
import { runAnalyze } from "../dist/cli/analyze.js";
import { getPackageVersion, COLORS, log } from "../dist/cli/utils.js";

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  const version = getPackageVersion();
  console.log(`
${COLORS.bright}${COLORS.cyan}Distill MCP Server${COLORS.reset} v${version}
Extract the essence. Compress the context. Save tokens.

${COLORS.bright}Usage:${COLORS.reset}
  distill-mcp <command> [options]

${COLORS.bright}Commands:${COLORS.reset}
  serve             Start the MCP server (stdio mode)
  setup             Configure IDEs to use Distill
  doctor            Check installation and configuration
  analyze           Analyze files for token usage

${COLORS.bright}Setup Options:${COLORS.reset}
  --claude          Configure Claude Code only
  --cursor          Configure Cursor only
  --windsurf        Configure Windsurf only
  --antigravity     Configure Antigravity only
  --hooks           Install project hooks (enforces MCP tool usage)
  --force, -f       Overwrite existing configuration

${COLORS.bright}Server Options:${COLORS.reset}
  --lazy            Enable lazy mode (95% token savings, only 2 meta-tools)
  --mode <mode>     Loading mode: lazy|core|all (default: core)
  --verbose         Enable verbose logging (shows tool calls, timing, tokens)

${COLORS.bright}Analyze Options:${COLORS.reset}
  --patterns, -p    Glob patterns to match (default: **/*.{ts,tsx,js,jsx,py,go,rs})
  --threshold, -t   Token threshold for warnings (default: 2000)
  --json, -j        Output as JSON
  --output, -o      Write report to file

${COLORS.bright}Other Options:${COLORS.reset}
  --version, -v     Show version number
  --help, -h        Show this help message

${COLORS.bright}Examples:${COLORS.reset}
  distill-mcp setup                    Interactive setup wizard
  distill-mcp setup --claude           Configure Claude Code only
  distill-mcp setup --antigravity      Configure Antigravity only
  distill-mcp setup --claude --hooks   Configure Claude Code + install hooks
  distill-mcp setup --hooks            Install hooks only (current project)
  distill-mcp setup --force            Overwrite existing configurations
  distill-mcp doctor                   Verify installation
  distill-mcp serve                    Start MCP server (used by IDE)
  distill-mcp serve --lazy             Start with lazy mode (95% savings)
  distill-mcp serve --verbose          Start with verbose logging
  distill-mcp analyze                  Analyze token usage in codebase
  distill-mcp analyze -t 5000 --json   Custom threshold, JSON output

${COLORS.bright}Documentation:${COLORS.reset}
  https://distill.dev/docs
`);
}

function showVersion() {
  console.log(getPackageVersion());
}

async function main() {
  // Handle version flag anywhere
  if (args.includes("--version") || args.includes("-v")) {
    showVersion();
    process.exit(0);
  }

  // Handle help flag anywhere
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    showHelp();
    process.exit(0);
  }

  switch (command) {
    case "serve": {
      // Parse mode option
      let mode = "core";
      const modeIndex = args.indexOf("--mode");
      if (modeIndex !== -1 && args[modeIndex + 1]) {
        mode = args[modeIndex + 1];
      } else if (args.includes("--lazy")) {
        mode = "lazy";
      } else if (args.includes("--all")) {
        mode = "all";
      }

      const config = {
        verbose: args.includes("--verbose"),
        mode,
      };

      await runServer(config);
      break;
    }

    case "setup": {
      const options = parseSetupArgs(args.slice(1));
      await setup(options);
      break;
    }

    case "doctor": {
      await doctor();
      break;
    }

    case "analyze": {
      await runAnalyze(args.slice(1));
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      console.error('Run "distill-mcp --help" for usage information.');
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
