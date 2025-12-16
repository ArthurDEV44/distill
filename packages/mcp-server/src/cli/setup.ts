import {
  type IDE,
  type IDEConfig,
  detectInstalledIDEs,
  readJSONFile,
  writeJSONFile,
  getMCPServerConfig,
  isCtxOptConfigured,
  success,
  warn,
  error,
  info,
  log,
  COLORS,
} from "./utils.js";

interface SetupOptions {
  claude?: boolean;
  cursor?: boolean;
  windsurf?: boolean;
  force?: boolean;
}

function configureIDE(ide: IDE, config: IDEConfig, force: boolean): boolean {
  log(`\nConfiguring ${COLORS.bright}${config.name}${COLORS.reset}...`);

  const existingConfig = readJSONFile(config.configPath) || {};

  if (isCtxOptConfigured(existingConfig) && !force) {
    warn(`CtxOpt already configured in ${config.name}. Use --force to overwrite.`);
    return true;
  }

  const mcpServers = (existingConfig.mcpServers as Record<string, unknown>) || {};
  mcpServers.ctxopt = getMCPServerConfig();
  existingConfig.mcpServers = mcpServers;

  if (writeJSONFile(config.configPath, existingConfig)) {
    success(`Configured ${config.name} at ${config.configPath}`);
    return true;
  } else {
    error(`Failed to write config to ${config.configPath}`);
    return false;
  }
}

export async function setup(options: SetupOptions = {}): Promise<void> {
  log(`\n${COLORS.bright}${COLORS.cyan}CtxOpt MCP Server Setup${COLORS.reset}\n`);

  const ideConfigs = detectInstalledIDEs();
  const specificIDEs = options.claude || options.cursor || options.windsurf;

  const idesToConfigure: IDE[] = [];

  if (specificIDEs) {
    if (options.claude) idesToConfigure.push("claude");
    if (options.cursor) idesToConfigure.push("cursor");
    if (options.windsurf) idesToConfigure.push("windsurf");
  } else {
    // Auto-detect installed IDEs
    for (const [ide, config] of Object.entries(ideConfigs)) {
      if (config.detected) {
        idesToConfigure.push(ide as IDE);
      }
    }
  }

  if (idesToConfigure.length === 0) {
    warn("No supported IDEs detected.");
    log("\nSupported IDEs:");
    log("  • Claude Code");
    log("  • Cursor");
    log("  • Windsurf");
    log("\nYou can manually configure by running:");
    log("  ctxopt-mcp setup --claude");
    log("  ctxopt-mcp setup --cursor");
    log("  ctxopt-mcp setup --windsurf");
    return;
  }

  info(`Detected IDEs: ${idesToConfigure.map((ide) => ideConfigs[ide].name).join(", ")}`);

  let successCount = 0;
  let failCount = 0;

  for (const ide of idesToConfigure) {
    const result = configureIDE(ide, ideConfigs[ide], options.force || false);
    if (result) {
      successCount++;
    } else {
      failCount++;
    }
  }

  log("\n" + "─".repeat(50));

  if (successCount > 0 && failCount === 0) {
    success(`Setup complete! Configured ${successCount} IDE(s).`);
  } else if (successCount > 0) {
    warn(`Partially complete. ${successCount} succeeded, ${failCount} failed.`);
  } else {
    error("Setup failed. No IDEs were configured.");
  }

  log(`\n${COLORS.dim}Next steps:${COLORS.reset}`);
  log("  1. Restart your IDE to load the MCP server");
  log("  2. Run 'ctxopt-mcp doctor' to verify the installation");
  log(`  3. Visit ${COLORS.cyan}https://ctxopt.dev/docs${COLORS.reset} for documentation\n`);
}

export function parseSetupArgs(args: string[]): SetupOptions {
  const options: SetupOptions = {};

  for (const arg of args) {
    switch (arg) {
      case "--claude":
        options.claude = true;
        break;
      case "--cursor":
        options.cursor = true;
        break;
      case "--windsurf":
        options.windsurf = true;
        break;
      case "--force":
      case "-f":
        options.force = true;
        break;
    }
  }

  return options;
}
