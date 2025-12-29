import * as p from "@clack/prompts";
import {
  type IDE,
  type IDEConfig,
  detectInstalledIDEs,
  readJSONFile,
  writeJSONFile,
  getMCPServerConfig,
  isDistillConfigured,
  success,
  warn,
  error,
  info,
  log,
  COLORS,
} from "./utils.js";
import { installHooks } from "./hooks.js";

export interface SetupOptions {
  claude?: boolean;
  cursor?: boolean;
  windsurf?: boolean;
  antigravity?: boolean;
  force?: boolean;
  hooks?: boolean;
}

function configureIDE(ide: IDE, config: IDEConfig, force: boolean): boolean {
  const existingConfig = readJSONFile(config.configPath) || {};

  if (isDistillConfigured(existingConfig) && !force) {
    return true; // Already configured, not an error
  }

  const mcpServers = (existingConfig.mcpServers as Record<string, unknown>) || {};
  mcpServers.distill = getMCPServerConfig();
  existingConfig.mcpServers = mcpServers;

  if (writeJSONFile(config.configPath, existingConfig)) {
    return true;
  } else {
    return false;
  }
}

async function setupInteractive(): Promise<void> {
  p.intro(`${COLORS.cyan}Distill MCP Server Setup${COLORS.reset}`);

  const ideConfigs = detectInstalledIDEs();

  // Build options with detected status
  const options = [
    {
      value: "claude" as IDE,
      label: "Claude Code",
      hint: ideConfigs.claude.detected ? "detected" : "Anthropic",
    },
    {
      value: "cursor" as IDE,
      label: "Cursor",
      hint: ideConfigs.cursor.detected ? "detected" : "Anysphere",
    },
    {
      value: "windsurf" as IDE,
      label: "Windsurf",
      hint: ideConfigs.windsurf.detected ? "detected" : "Codeium",
    },
    {
      value: "antigravity" as IDE,
      label: "Antigravity",
      hint: ideConfigs.antigravity.detected ? "detected" : "Google",
    },
  ];

  // Pre-select detected IDEs
  const initialValues = (Object.entries(ideConfigs) as [IDE, IDEConfig][])
    .filter(([_, config]) => config.detected)
    .map(([ide]) => ide);

  const selectedIDEs = await p.multiselect({
    message: "Select IDEs to configure:",
    options,
    initialValues,
    required: true,
  });

  if (p.isCancel(selectedIDEs)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const s = p.spinner();
  s.start("Configuring IDEs...");

  let successCount = 0;
  let failCount = 0;
  const configuredIDEs: string[] = [];

  for (const ide of selectedIDEs) {
    const result = configureIDE(ide, ideConfigs[ide], false);
    if (result) {
      successCount++;
      configuredIDEs.push(ideConfigs[ide].name);
    } else {
      failCount++;
    }
  }

  if (failCount > 0) {
    s.stop(`Configured ${successCount} IDE(s), ${failCount} failed`);
  } else {
    s.stop(`Configured: ${configuredIDEs.join(", ")}`);
  }

  // Ask about hooks if Claude Code was selected
  if (selectedIDEs.includes("claude")) {
    const shouldInstallHooks = await p.confirm({
      message: "Install Claude Code hooks? (recommended for optimal MCP usage)",
      initialValue: true,
    });

    if (p.isCancel(shouldInstallHooks)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (shouldInstallHooks) {
      const hookSpinner = p.spinner();
      hookSpinner.start("Installing hooks...");
      await installHooks({ force: false });
      hookSpinner.stop("Hooks installed");
    }
  }

  p.outro("Setup complete! Restart your IDEs to load Distill.");

  log(`\n${COLORS.dim}Next steps:${COLORS.reset}`);
  log("  1. Restart your IDE to load the MCP server");
  log("  2. Run 'distill-mcp doctor' to verify the installation");
  log(`  3. Visit ${COLORS.cyan}https://distill.dev/docs${COLORS.reset} for documentation\n`);
}

async function setupNonInteractive(options: SetupOptions): Promise<void> {
  log(`\n${COLORS.bright}${COLORS.cyan}Distill MCP Server Setup${COLORS.reset}\n`);

  const ideConfigs = detectInstalledIDEs();
  const hooksOnly = options.hooks && !options.claude && !options.cursor && !options.windsurf && !options.antigravity;

  // If --hooks only (no IDE specified), just install hooks
  if (hooksOnly) {
    await installHooks({ force: options.force });
    return;
  }

  const idesToConfigure: IDE[] = [];

  if (options.claude) idesToConfigure.push("claude");
  if (options.cursor) idesToConfigure.push("cursor");
  if (options.windsurf) idesToConfigure.push("windsurf");
  if (options.antigravity) idesToConfigure.push("antigravity");

  if (idesToConfigure.length === 0 && !options.hooks) {
    warn("No IDEs specified.");
    log("\nUse flags to specify IDEs:");
    log("  distill-mcp setup --claude");
    log("  distill-mcp setup --cursor");
    log("  distill-mcp setup --windsurf");
    log("  distill-mcp setup --antigravity");
    log("\nOr run without flags for interactive mode:");
    log("  distill-mcp setup");
    return;
  }

  info(`Configuring: ${idesToConfigure.map((ide) => ideConfigs[ide].name).join(", ")}`);

  let successCount = 0;
  let failCount = 0;

  for (const ide of idesToConfigure) {
    log(`\nConfiguring ${COLORS.bright}${ideConfigs[ide].name}${COLORS.reset}...`);

    const existingConfig = readJSONFile(ideConfigs[ide].configPath) || {};

    if (isDistillConfigured(existingConfig) && !options.force) {
      warn(`Distill already configured in ${ideConfigs[ide].name}. Use --force to overwrite.`);
      successCount++;
      continue;
    }

    const result = configureIDE(ide, ideConfigs[ide], options.force || false);
    if (result) {
      success(`Configured ${ideConfigs[ide].name} at ${ideConfigs[ide].configPath}`);
      successCount++;
    } else {
      error(`Failed to write config to ${ideConfigs[ide].configPath}`);
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

  // Install hooks if requested
  if (options.hooks) {
    await installHooks({ force: options.force });
  }

  log(`\n${COLORS.dim}Next steps:${COLORS.reset}`);
  log("  1. Restart your IDE to load the MCP server");
  log("  2. Run 'distill-mcp doctor' to verify the installation");
  log(`  3. Visit ${COLORS.cyan}https://distill.dev/docs${COLORS.reset} for documentation\n`);
}

export async function setup(options: SetupOptions = {}): Promise<void> {
  const hasFlags =
    options.claude || options.cursor || options.windsurf || options.antigravity || options.hooks;

  if (hasFlags) {
    // Non-interactive mode when flags are provided
    await setupNonInteractive(options);
  } else {
    // Interactive mode when no flags
    await setupInteractive();
  }
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
      case "--antigravity":
        options.antigravity = true;
        break;
      case "--force":
      case "-f":
        options.force = true;
        break;
      case "--hooks":
        options.hooks = true;
        break;
    }
  }

  return options;
}
