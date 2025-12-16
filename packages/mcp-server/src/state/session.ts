/**
 * Session State Management
 *
 * Maintains in-memory state for the duration of an MCP session.
 * State persists as long as the process runs and resets on IDE restart.
 */

export interface CommandEntry {
  id: string;
  command: string;
  toolName: string;
  timestamp: Date;
  tokensIn: number;
  tokensOut: number;
  tokensSaved: number;
  wasFiltered: boolean;
  durationMs: number;
  // Retry loop detection fields
  normalizedCommand?: string;
  outputHash?: string;
  exitCode?: number;
}

export interface ErrorEntry {
  hash: string;
  message: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  locations: string[];
}

export interface RetryPattern {
  command: string;
  count: number;
  firstAttempt: Date;
  lastAttempt: Date;
  wasWarned: boolean;
}

export interface ProjectInfo {
  rootPath: string;
  name: string;
  type: "node" | "python" | "rust" | "go" | "unknown";
  packageManager?: "npm" | "yarn" | "pnpm" | "bun";
  hasTypeScript: boolean;
  detectedAt: Date;
}

export interface SessionState {
  // Session metadata
  sessionId: string;
  startedAt: Date;

  // Project info
  project: ProjectInfo | null;

  // Command history for pattern detection
  commandHistory: CommandEntry[];

  // Token counters
  tokensUsed: number;
  tokensSaved: number;

  // Error cache for deduplication
  errorCache: Map<string, ErrorEntry>;

  // Retry patterns detected
  retryPatterns: Map<string, RetryPattern>;

  // Configuration
  verbose: boolean;
  apiKey?: string;
  apiBaseUrl: string;
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createSessionState(config: {
  verbose?: boolean;
  apiKey?: string;
  apiBaseUrl?: string;
}): SessionState {
  return {
    sessionId: generateSessionId(),
    startedAt: new Date(),
    project: null,
    commandHistory: [],
    tokensUsed: 0,
    tokensSaved: 0,
    errorCache: new Map(),
    retryPatterns: new Map(),
    verbose: config.verbose ?? false,
    apiKey: config.apiKey,
    apiBaseUrl: config.apiBaseUrl ?? "https://app.ctxopt.dev/api",
  };
}

export function addCommand(state: SessionState, entry: Omit<CommandEntry, "id">): CommandEntry {
  const command: CommandEntry = {
    ...entry,
    id: generateCommandId(),
  };
  state.commandHistory.push(command);
  state.tokensUsed += entry.tokensIn + entry.tokensOut;
  state.tokensSaved += entry.tokensSaved;
  return command;
}

export function getRecentCommands(state: SessionState, count: number = 10): CommandEntry[] {
  return state.commandHistory.slice(-count);
}

export function addError(state: SessionState, hash: string, message: string, location?: string): ErrorEntry {
  const existing = state.errorCache.get(hash);

  if (existing) {
    existing.count++;
    existing.lastSeen = new Date();
    if (location && !existing.locations.includes(location)) {
      existing.locations.push(location);
    }
    return existing;
  }

  const entry: ErrorEntry = {
    hash,
    message,
    count: 1,
    firstSeen: new Date(),
    lastSeen: new Date(),
    locations: location ? [location] : [],
  };
  state.errorCache.set(hash, entry);
  return entry;
}

export function checkRetryPattern(state: SessionState, command: string): RetryPattern | null {
  const existing = state.retryPatterns.get(command);

  if (existing) {
    existing.count++;
    existing.lastAttempt = new Date();

    // Return pattern if repeated 3+ times
    if (existing.count >= 3) {
      return existing;
    }
    return null;
  }

  // Create new pattern tracking
  const pattern: RetryPattern = {
    command,
    count: 1,
    firstAttempt: new Date(),
    lastAttempt: new Date(),
    wasWarned: false,
  };
  state.retryPatterns.set(command, pattern);
  return null;
}

export function markRetryWarned(state: SessionState, command: string): void {
  const pattern = state.retryPatterns.get(command);
  if (pattern) {
    pattern.wasWarned = true;
  }
}

export function getSessionStats(state: SessionState): {
  sessionId: string;
  duration: number;
  commandCount: number;
  tokensUsed: number;
  tokensSaved: number;
  savingsPercent: number;
  uniqueErrors: number;
  retryPatterns: number;
} {
  const duration = Date.now() - state.startedAt.getTime();
  const totalTokens = state.tokensUsed + state.tokensSaved;
  const savingsPercent = totalTokens > 0 ? (state.tokensSaved / totalTokens) * 100 : 0;

  return {
    sessionId: state.sessionId,
    duration,
    commandCount: state.commandHistory.length,
    tokensUsed: state.tokensUsed,
    tokensSaved: state.tokensSaved,
    savingsPercent: Math.round(savingsPercent * 10) / 10,
    uniqueErrors: state.errorCache.size,
    retryPatterns: Array.from(state.retryPatterns.values()).filter((p) => p.count >= 3).length,
  };
}

export function setProject(state: SessionState, project: ProjectInfo): void {
  state.project = project;
}

export function clearErrorCache(state: SessionState): void {
  state.errorCache.clear();
}

export function clearRetryPatterns(state: SessionState): void {
  state.retryPatterns.clear();
}

/**
 * Get commands matching a normalized command within a time window
 */
export function getCommandsByNormalized(
  state: SessionState,
  normalizedCommand: string,
  windowMs: number = 5 * 60 * 1000 // Default: 5 minutes
): CommandEntry[] {
  const cutoff = Date.now() - windowMs;
  return state.commandHistory.filter(
    (entry) =>
      entry.normalizedCommand === normalizedCommand && entry.timestamp.getTime() > cutoff
  );
}

/**
 * Get commands with matching output hash within a time window
 */
export function getCommandsByOutputHash(
  state: SessionState,
  outputHash: string,
  windowMs: number = 5 * 60 * 1000
): CommandEntry[] {
  const cutoff = Date.now() - windowMs;
  return state.commandHistory.filter(
    (entry) => entry.outputHash === outputHash && entry.timestamp.getTime() > cutoff
  );
}
