/**
 * CtxOpt Hooks Installation Module
 *
 * Installs Claude Code hooks that enforce MCP tool usage:
 * - PreToolUse: Blocks Read on code files, suggests smart_file_read
 * - PostToolUse: Reminds to use auto_optimize for large Bash outputs
 * - UserPromptSubmit: Injects MCP tool reminders
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { success, warn, info, error, log, COLORS, readJSONFile, writeJSONFile } from "./utils.js";

// ============================================================================
// Hook Script Templates
// ============================================================================

const PRE_READ_CHECK_SCRIPT = `#!/bin/bash
# CtxOpt - PreToolUse Hook for Read
# Blocks Read on code files, suggests smart_file_read instead

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
BASENAME=$(basename "$FILE_PATH")

# Allow configuration files (Read OK)
if echo "$BASENAME" | grep -qiE "^(CLAUDE|README|CHANGELOG|LICENSE)"; then
  exit 0
fi
if echo "$BASENAME" | grep -qiE "\\.(md|json|yaml|yml|toml|ini|config)$"; then
  exit 0
fi
if echo "$BASENAME" | grep -qiE "^(Dockerfile|Makefile|\\.gitignore|\\.env|\\.prettierrc|\\.eslintrc)"; then
  exit 0
fi

# Block source code files - suggest smart_file_read
if echo "$FILE_PATH" | grep -qE "\\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|hpp)$"; then
  echo "BLOCKED: Use mcp__ctxopt__smart_file_read instead of Read for code files." >&2
  echo "This saves 50-70% tokens by extracting only needed functions/classes." >&2
  echo "" >&2
  echo "Example: mcp__ctxopt__smart_file_read filePath=\\"$FILE_PATH\\"" >&2
  echo "With target: mcp__ctxopt__smart_file_read filePath=\\"$FILE_PATH\\" target={\\"type\\":\\"function\\",\\"name\\":\\"myFunc\\"}" >&2
  exit 2
fi

# Allow everything else
exit 0
`;

const POST_BASH_REMIND_SCRIPT = `#!/bin/bash
# CtxOpt - PostToolUse Hook for Bash
# Reminds to use MCP tools for large outputs

INPUT=$(cat)
TOOL_RESPONSE=$(echo "$INPUT" | jq -r '.tool_response // empty')
RESPONSE_SIZE=\${#TOOL_RESPONSE}

# Threshold: 5000 chars ~ 1250 tokens
THRESHOLD=5000

# Skip if output is small
if [ "$RESPONSE_SIZE" -lt "$THRESHOLD" ]; then
  exit 0
fi

# Detect content type and suggest appropriate tool
if echo "$TOOL_RESPONSE" | grep -qiE "(error TS|warning TS|error\\[E|npm ERR|ERROR in|failed|FAILED)"; then
  echo '{"systemMessage": "TIP: Large build output detected. Use mcp__ctxopt__auto_optimize to compress errors (95%+ reduction)."}'
  exit 0
fi

if echo "$TOOL_RESPONSE" | grep -qiE "(\\[INFO\\]|\\[ERROR\\]|\\[WARN\\]|\\[DEBUG\\]|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2})"; then
  echo '{"systemMessage": "TIP: Large log output detected. Use mcp__ctxopt__summarize_logs to compress (80-90% reduction)."}'
  exit 0
fi

# Generic large output
echo '{"systemMessage": "TIP: Large output ('$RESPONSE_SIZE' chars). Consider using mcp__ctxopt__auto_optimize for compression (40-60% reduction)."}'
exit 0
`;

const PROMPT_INJECT_SCRIPT = `#!/bin/bash
# CtxOpt - UserPromptSubmit Hook
# Injects MCP tool reminders at the start of each prompt

cat << 'EOF'
<user-prompt-submit-hook>
CTXOPT REMINDER: Use MCP tools for token optimization:
- Code files: mcp__ctxopt__smart_file_read (Read is BLOCKED for .ts/.js/.py)
- Build/test output: mcp__ctxopt__auto_optimize
- Session stats: mcp__ctxopt__session_stats
</user-prompt-submit-hook>
EOF
exit 0
`;

// ============================================================================
// Hook Configuration
// ============================================================================

interface HookEntry {
  type: "command";
  command: string;
  timeout: number;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface HooksConfig {
  hooks: {
    UserPromptSubmit: HookMatcher[];
    PreToolUse: HookMatcher[];
    PostToolUse: HookMatcher[];
  };
}

function createHooksConfig(): HooksConfig {
  return {
    hooks: {
      UserPromptSubmit: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/prompt-inject.sh"',
              timeout: 2,
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: "Read",
          hooks: [
            {
              type: "command",
              command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-read-check.sh"',
              timeout: 2,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Bash",
          hooks: [
            {
              type: "command",
              command: '"$CLAUDE_PROJECT_DIR/.claude/hooks/post-bash-remind.sh"',
              timeout: 5,
            },
          ],
        },
      ],
    },
  };
}

// ============================================================================
// Installation Functions
// ============================================================================

export interface InstallHooksOptions {
  projectDir?: string;
  force?: boolean;
}

export async function installHooks(options: InstallHooksOptions = {}): Promise<boolean> {
  const projectDir = options.projectDir || process.cwd();
  const force = options.force || false;

  log(`\n${COLORS.bright}Installing CtxOpt hooks...${COLORS.reset}\n`);

  // Check for jq dependency
  info("Checking dependencies...");
  const jqCheck = checkJqInstalled();
  if (!jqCheck) {
    warn("jq is not installed. Hooks require jq for JSON parsing.");
    log(`\nInstall jq:`);
    log(`  ${COLORS.dim}macOS:${COLORS.reset}   brew install jq`);
    log(`  ${COLORS.dim}Ubuntu:${COLORS.reset}  sudo apt install jq`);
    log(`  ${COLORS.dim}Windows:${COLORS.reset} choco install jq`);
    log("");
  }

  // Create directories
  const claudeDir = join(projectDir, ".claude");
  const hooksDir = join(claudeDir, "hooks");

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
    info(`Created ${COLORS.dim}.claude/${COLORS.reset}`);
  }

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
    info(`Created ${COLORS.dim}.claude/hooks/${COLORS.reset}`);
  }

  // Write hook scripts
  const hookFiles: Record<string, string> = {
    "pre-read-check.sh": PRE_READ_CHECK_SCRIPT,
    "post-bash-remind.sh": POST_BASH_REMIND_SCRIPT,
    "prompt-inject.sh": PROMPT_INJECT_SCRIPT,
  };

  let scriptsWritten = 0;
  for (const [filename, content] of Object.entries(hookFiles)) {
    const filepath = join(hooksDir, filename);

    if (existsSync(filepath) && !force) {
      warn(`Skipped ${filename} (already exists, use --force to overwrite)`);
      continue;
    }

    writeFileSync(filepath, content, "utf-8");
    chmodSync(filepath, 0o755); // Make executable
    success(`Created ${COLORS.dim}.claude/hooks/${COLORS.reset}${filename}`);
    scriptsWritten++;
  }

  // Update settings.local.json
  const settingsPath = join(claudeDir, "settings.local.json");
  let settingsUpdated = false;

  try {
    let existingSettings: Record<string, unknown> = {};

    if (existsSync(settingsPath)) {
      existingSettings = (await readJSONFile(settingsPath)) || {};
    }

    const hooksConfig = createHooksConfig();

    // Merge hooks config with existing settings
    const newSettings = {
      ...existingSettings,
      hooks: {
        ...(existingSettings.hooks as Record<string, unknown> || {}),
        ...hooksConfig.hooks,
      },
    };

    await writeJSONFile(settingsPath, newSettings);
    success(`Updated ${COLORS.dim}.claude/${COLORS.reset}settings.local.json`);
    settingsUpdated = true;
  } catch (err) {
    error(`Failed to update settings.local.json: ${err}`);
  }

  // Summary
  log("\n" + "─".repeat(50));

  if (scriptsWritten > 0 || settingsUpdated) {
    success("Hooks installed successfully!");
    log(`\n${COLORS.dim}What the hooks do:${COLORS.reset}`);
    log(`  • ${COLORS.yellow}PreToolUse[Read]${COLORS.reset}     Blocks Read on .ts/.js/.py files`);
    log(`  • ${COLORS.yellow}PostToolUse[Bash]${COLORS.reset}    Suggests compression for large outputs`);
    log(`  • ${COLORS.yellow}UserPromptSubmit${COLORS.reset}     Reminds to use MCP tools`);
    log(`\n${COLORS.dim}Token savings:${COLORS.reset}`);
    log(`  • smart_file_read:  50-70% reduction vs Read`);
    log(`  • auto_optimize:    95%+ reduction on build errors`);
    log(`  • summarize_logs:   80-90% reduction on logs\n`);
    return true;
  } else {
    warn("No changes made. Use --force to overwrite existing files.");
    return false;
  }
}

function checkJqInstalled(): boolean {
  try {
    const { execSync } = require("child_process");
    execSync("jq --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
