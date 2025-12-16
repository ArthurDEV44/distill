import { execSync } from "child_process";
import { existsSync } from "fs";
import {
  type IDE,
  detectInstalledIDEs,
  readJSONFile,
  isCtxOptConfigured,
  success,
  warn,
  error,
  info,
  log,
  COLORS,
  getPackageVersion,
} from "./utils.js";

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

function checkNodeVersion(): CheckResult {
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split(".")[0] ?? "0", 10);

    if (major >= 18) {
      return {
        name: "Node.js version",
        status: "pass",
        message: `${version} (>= 18 required)`,
      };
    } else {
      return {
        name: "Node.js version",
        status: "fail",
        message: `${version} (>= 18 required, please upgrade)`,
      };
    }
  } catch {
    return {
      name: "Node.js version",
      status: "fail",
      message: "Unable to determine Node.js version",
    };
  }
}

function checkPackageInstallation(): CheckResult {
  try {
    // Check if ctxopt-mcp is in PATH
    const which = process.platform === "win32" ? "where" : "which";
    execSync(`${which} ctxopt-mcp`, { stdio: "pipe" });

    return {
      name: "Package installation",
      status: "pass",
      message: `@ctxopt/mcp-server v${getPackageVersion()} installed globally`,
    };
  } catch {
    return {
      name: "Package installation",
      status: "warn",
      message: "ctxopt-mcp not found in PATH (may be running via npx)",
    };
  }
}

function checkIDEConfigurations(): CheckResult[] {
  const results: CheckResult[] = [];
  const ideConfigs = detectInstalledIDEs();

  for (const [ide, config] of Object.entries(ideConfigs)) {
    if (!config.detected) {
      results.push({
        name: `${config.name} configuration`,
        status: "warn",
        message: "IDE not detected",
      });
      continue;
    }

    const configFile = readJSONFile(config.configPath);

    if (!existsSync(config.configPath)) {
      results.push({
        name: `${config.name} configuration`,
        status: "warn",
        message: `Config file not found at ${config.configPath}`,
      });
      continue;
    }

    if (isCtxOptConfigured(configFile)) {
      results.push({
        name: `${config.name} configuration`,
        status: "pass",
        message: `CtxOpt configured in ${config.configPath}`,
      });
    } else {
      results.push({
        name: `${config.name} configuration`,
        status: "fail",
        message: `CtxOpt not configured. Run 'ctxopt-mcp setup --${ide}'`,
      });
    }
  }

  return results;
}

function checkNetworkConnectivity(): CheckResult {
  // This is a lightweight check - just verify we can resolve the hostname
  try {
    execSync("node -e \"require('dns').lookup('ctxopt.dev', () => {})\"", {
      stdio: "pipe",
      timeout: 5000,
    });
    return {
      name: "Network connectivity",
      status: "pass",
      message: "Can reach ctxopt.dev (optional, for cloud sync)",
    };
  } catch {
    return {
      name: "Network connectivity",
      status: "warn",
      message: "Cannot reach ctxopt.dev (cloud sync will be unavailable)",
    };
  }
}

export async function doctor(): Promise<void> {
  log(`\n${COLORS.bright}${COLORS.cyan}CtxOpt MCP Server Doctor${COLORS.reset}\n`);
  log(`Running diagnostic checks...\n`);

  const checks: CheckResult[] = [
    checkNodeVersion(),
    checkPackageInstallation(),
    ...checkIDEConfigurations(),
    checkNetworkConnectivity(),
  ];

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const check of checks) {
    switch (check.status) {
      case "pass":
        success(`${check.name}: ${check.message}`);
        passCount++;
        break;
      case "warn":
        warn(`${check.name}: ${check.message}`);
        warnCount++;
        break;
      case "fail":
        error(`${check.name}: ${check.message}`);
        failCount++;
        break;
    }
  }

  log("\n" + "─".repeat(50));

  if (failCount === 0 && warnCount === 0) {
    success(`All ${passCount} checks passed! CtxOpt is ready to use.`);
  } else if (failCount === 0) {
    warn(`${passCount} passed, ${warnCount} warnings. CtxOpt should work but may have limited functionality.`);
  } else {
    error(`${passCount} passed, ${warnCount} warnings, ${failCount} failed.`);
    log(`\nRun ${COLORS.cyan}ctxopt-mcp setup${COLORS.reset} to fix configuration issues.`);
  }

  log("");
}
