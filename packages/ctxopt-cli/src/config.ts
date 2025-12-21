/**
 * Configuration Management
 *
 * Stores and retrieves ctxopt configuration from ~/.ctxopt/config.json
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export interface CtxOptConfig {
  apiKey?: string;
  apiBaseUrl?: string;
}

const CONFIG_DIR = join(homedir(), ".ctxopt");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Read configuration from disk
 */
export function readConfig(): CtxOptConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as CtxOptConfig;
  } catch {
    return {};
  }
}

/**
 * Write configuration to disk
 */
export function writeConfig(config: CtxOptConfig): void {
  // Create directory if it doesn't exist
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  // Write config file with restricted permissions
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

/**
 * Set a configuration value
 */
export function setConfigValue(key: keyof CtxOptConfig, value: string | undefined): void {
  const config = readConfig();
  if (value === undefined) {
    delete config[key];
  } else {
    config[key] = value;
  }
  writeConfig(config);
}

/**
 * Get a configuration value
 */
export function getConfigValue(key: keyof CtxOptConfig): string | undefined {
  const config = readConfig();
  return config[key];
}

/**
 * Display current configuration
 */
export function showConfig(): void {
  const config = readConfig();
  const configPath = getConfigPath();

  console.log("CtxOpt Configuration");
  console.log(`Config file: ${configPath}`);
  console.log("");

  if (Object.keys(config).length === 0) {
    console.log("No configuration set.");
    console.log("");
    console.log("To configure, run:");
    console.log("  ctxopt config set api-key <your-api-key>");
    console.log("  ctxopt config set api-url <api-url>");
    return;
  }

  if (config.apiKey) {
    // Show only prefix for security
    const prefix = config.apiKey.slice(0, 16);
    console.log(`api-key: ${prefix}...`);
  }

  if (config.apiBaseUrl) {
    console.log(`api-url: ${config.apiBaseUrl}`);
  }
}

/**
 * Parse and handle config command
 */
export function handleConfigCommand(args: string[]): void {
  const subcommand = args[0];

  switch (subcommand) {
    case "set": {
      const key = args[1];
      const value = args[2];

      if (!key) {
        console.error("Usage: ctxopt config set <key> <value>");
        console.error("");
        console.error("Available keys:");
        console.error("  api-key    Your CtxOpt API key");
        console.error("  api-url    API base URL (default: https://app.ctxopt.dev/api)");
        process.exit(1);
      }

      if (!value) {
        console.error(`Usage: ctxopt config set ${key} <value>`);
        process.exit(1);
      }

      switch (key) {
        case "api-key":
          setConfigValue("apiKey", value);
          console.log("\x1b[32m✓\x1b[0m API key configured");
          break;
        case "api-url":
          setConfigValue("apiBaseUrl", value);
          console.log(`\x1b[32m✓\x1b[0m API URL set to: ${value}`);
          break;
        default:
          console.error(`Unknown config key: ${key}`);
          console.error("Available keys: api-key, api-url");
          process.exit(1);
      }
      break;
    }

    case "get": {
      const key = args[1];

      if (!key) {
        showConfig();
        return;
      }

      switch (key) {
        case "api-key": {
          const apiKey = getConfigValue("apiKey");
          if (apiKey) {
            const prefix = apiKey.slice(0, 16);
            console.log(`${prefix}...`);
          } else {
            console.log("(not set)");
          }
          break;
        }
        case "api-url": {
          const url = getConfigValue("apiBaseUrl");
          console.log(url ?? "https://app.ctxopt.dev/api (default)");
          break;
        }
        default:
          console.error(`Unknown config key: ${key}`);
          process.exit(1);
      }
      break;
    }

    case "unset":
    case "remove": {
      const key = args[1];

      if (!key) {
        console.error("Usage: ctxopt config unset <key>");
        process.exit(1);
      }

      switch (key) {
        case "api-key":
          setConfigValue("apiKey", undefined);
          console.log("\x1b[32m✓\x1b[0m API key removed");
          break;
        case "api-url":
          setConfigValue("apiBaseUrl", undefined);
          console.log("\x1b[32m✓\x1b[0m API URL reset to default");
          break;
        default:
          console.error(`Unknown config key: ${key}`);
          process.exit(1);
      }
      break;
    }

    case "show":
    case undefined:
      showConfig();
      break;

    default:
      console.error(`Unknown config subcommand: ${subcommand}`);
      console.error("Usage: ctxopt config [show|set|get|unset] ...");
      process.exit(1);
  }
}
