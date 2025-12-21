#!/usr/bin/env node

import { runServer } from "../dist/server.js";
import { setup, parseSetupArgs } from "../dist/cli/setup.js";
import { doctor } from "../dist/cli/doctor.js";
import { getPackageVersion, COLORS, log } from "../dist/cli/utils.js";
import { readConfig } from "../dist/cli/config.js";

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
  --api-key=KEY     Your CtxOpt API key (optional, enables cloud sync)
  --api-url=URL     Custom API URL (default: https://app.ctxopt.dev/api)
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
  ctxopt-mcp serve --api-key=ctx_xxx  Start with cloud sync enabled

${COLORS.bright}Quick Install:${COLORS.reset}
  curl -fsSL https://ctxopt.dev/install.sh | bash

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
      // Read config file as base (can be overridden by CLI args)
      const fileConfig = readConfig();

      const config = {
        apiKey: fileConfig.apiKey,
        apiBaseUrl: fileConfig.apiBaseUrl ?? "https://app.ctxopt.dev/api",
        verbose: false,
      };

      // CLI arguments override config file
      for (const arg of args.slice(1)) {
        if (arg.startsWith("--api-key=")) {
          config.apiKey = arg.split("=")[1];
        } else if (arg.startsWith("--api-url=")) {
          config.apiBaseUrl = arg.split("=")[1];
        } else if (arg === "--verbose") {
          config.verbose = true;
        }
      }

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
      // Legacy support: if no command, try to run server
      if (command?.startsWith("--")) {
        // Read config file as base
        const fileConfig = readConfig();

        const config = {
          apiKey: fileConfig.apiKey,
          apiBaseUrl: fileConfig.apiBaseUrl ?? "https://app.ctxopt.dev/api",
          verbose: false,
        };

        // CLI arguments override config file
        for (const arg of args) {
          if (arg.startsWith("--api-key=")) {
            config.apiKey = arg.split("=")[1];
          } else if (arg.startsWith("--api-url=")) {
            config.apiBaseUrl = arg.split("=")[1];
          } else if (arg === "--verbose") {
            config.verbose = true;
          }
        }

        await runServer(config);
      } else {
        console.error(`Unknown command: ${command}`);
        console.error('Run "ctxopt-mcp --help" for usage information.');
        process.exit(1);
      }
    }
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
