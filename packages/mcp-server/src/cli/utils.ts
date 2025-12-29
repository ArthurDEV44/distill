import { homedir, platform } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

export type IDE = "claude" | "cursor" | "windsurf" | "antigravity";

export interface IDEConfig {
  name: string;
  configPath: string;
  configKey: string;
  detected: boolean;
}

export const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

export function log(message: string): void {
  console.log(message);
}

export function success(message: string): void {
  console.log(`${COLORS.green}✓${COLORS.reset} ${message}`);
}

export function warn(message: string): void {
  console.log(`${COLORS.yellow}⚠${COLORS.reset} ${message}`);
}

export function error(message: string): void {
  console.log(`${COLORS.red}✗${COLORS.reset} ${message}`);
}

export function info(message: string): void {
  console.log(`${COLORS.blue}ℹ${COLORS.reset} ${message}`);
}

export function getIDEConfigPaths(): Record<IDE, IDEConfig> {
  const home = homedir();
  const isWindows = platform() === "win32";

  return {
    claude: {
      name: "Claude Code",
      configPath: isWindows
        ? join(home, ".claude.json")
        : join(home, ".claude.json"),
      configKey: "mcpServers",
      detected: false,
    },
    cursor: {
      name: "Cursor",
      configPath: isWindows
        ? join(home, ".cursor", "mcp.json")
        : join(home, ".cursor", "mcp.json"),
      configKey: "mcpServers",
      detected: false,
    },
    windsurf: {
      name: "Windsurf",
      configPath: isWindows
        ? join(home, ".codeium", "windsurf", "mcp_config.json")
        : join(home, ".codeium", "windsurf", "mcp_config.json"),
      configKey: "mcpServers",
      detected: false,
    },
    antigravity: {
      name: "Antigravity",
      configPath: isWindows
        ? join(home, ".gemini", "antigravity", "mcp_config.json")
        : join(home, ".gemini", "antigravity", "mcp_config.json"),
      configKey: "mcpServers",
      detected: false,
    },
  };
}

export function detectInstalledIDEs(): Record<IDE, IDEConfig> {
  const configs = getIDEConfigPaths();

  for (const [key, config] of Object.entries(configs)) {
    const configDir = join(config.configPath, "..");
    config.detected = existsSync(configDir);
  }

  return configs;
}

export function readJSONFile(path: string): Record<string, unknown> | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function writeJSONFile(path: string, data: Record<string, unknown>): boolean {
  try {
    const dir = join(path, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

export function getMCPServerConfig(): Record<string, unknown> {
  return {
    command: "distill-mcp",
    args: ["serve"],
    env: {},
  };
}

export function isDistillConfigured(config: Record<string, unknown> | null): boolean {
  if (!config) return false;
  const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
  return mcpServers?.distill !== undefined;
}

export function getPackageVersion(): string {
  try {
    const pkgPath = join(import.meta.dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}
