#!/usr/bin/env node

import { runServer } from "../dist/server.js";
import { setup, parseSetupArgs } from "../dist/cli/setup.js";
import { doctor } from "../dist/cli/doctor.js";
import { getPackageVersion, COLORS, log } from "../dist/cli/utils.js";

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  const version = getPackageVersion();
  console.log(`
${COLORS.bright}${COLORS.cyan}CtxOpt MCP Server${COLORS.reset} v${version}
Context Engineering Optimizer for Claude Code, Cursor, and Windsurf

${COLORS.bright}Usage:${COLORS.reset}
  ctxopt-mcp <command> [options]

${COLORS.bright}Commands:${COLORS.reset}
  serve             Start the MCP server (stdio mode)
  setup             Configure IDEs to use CtxOpt
  doctor            Check installation and configuration

${COLORS.bright}Setup Options:${COLORS.reset}
  --claude          Configure Claude Code only
  --cursor          Configure Cursor only
  --windsurf        Configure Windsurf only
  --hooks           Install project hooks (enforces MCP tool usage)
  --force, -f       Overwrite existing configuration

${COLORS.bright}Server Options:${COLORS.reset}
  --verbose         Enable verbose logging (shows tool calls, timing, tokens)

${COLORS.bright}Other Options:${COLORS.reset}
  --version, -v     Show version number
  --help, -h        Show this help message

${COLORS.bright}Examples:${COLORS.reset}
  ctxopt-mcp setup                    Auto-detect and configure all IDEs
  ctxopt-mcp setup --claude           Configure Claude Code only
  ctxopt-mcp setup --claude --hooks   Configure Claude Code + install hooks
  ctxopt-mcp setup --hooks            Install hooks only (current project)
  ctxopt-mcp setup --force            Overwrite existing configurations
  ctxopt-mcp doctor                   Verify installation
  ctxopt-mcp serve                    Start MCP server (used by IDE)
  ctxopt-mcp serve --verbose          Start with verbose logging

${COLORS.bright}Documentation:${COLORS.reset}
  https://ctxopt.dev/docs
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
      const config = {
        verbose: args.includes("--verbose"),
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

    default: {
      console.error(`Unknown command: ${command}`);
      console.error('Run "ctxopt-mcp --help" for usage information.');
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
