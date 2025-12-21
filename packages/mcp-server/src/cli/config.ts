/**
 * Configuration Reader
 *
 * Reads ctxopt configuration from ~/.ctxopt/config.json
 * This file is created by the ctxopt CLI wrapper.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";

export interface CtxOptConfig {
  apiKey?: string;
  apiBaseUrl?: string;
}

const CONFIG_DIR = join(homedir(), ".ctxopt");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

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
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
