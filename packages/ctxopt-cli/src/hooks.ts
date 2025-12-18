import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Chemin vers les settings Claude Code
const CLAUDE_DIR = join(homedir(), '.claude');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');

// Hooks ctxopt a ajouter
const CTXOPT_HOOKS = {
  PreToolUse: [
    {
      matcher: 'Read',
      hooks: [
        {
          type: 'command',
          command: `node -e "const ext = process.env.TOOL_INPUT?.match(/\\.(ts|tsx|js|jsx|py|rs|go)$/); if (ext) console.log('[ctxopt] TIP: Consider mcp__ctxopt__smart_file_read for', ext[0], 'files (50-70% savings)');"`,
        },
      ],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Bash',
      hooks: [
        {
          type: 'command',
          command: `node -e "const output = process.env.TOOL_OUTPUT || ''; if (output.length > 5000) { console.log('[ctxopt] TIP: Large output (' + Math.round(output.length/1024) + 'KB). Use mcp__ctxopt__auto_optimize'); }"`,
        },
      ],
    },
  ],
  UserPromptSubmit: [
    {
      hooks: [
        {
          type: 'command',
          command: 'echo "CTXOPT REMINDER: Use MCP tools for token optimization: smart_file_read, auto_optimize, compress_context"',
        },
      ],
    },
  ],
};

/**
 * Lit les settings Claude Code actuels
 */
export function readSettings(): Record<string, unknown> {
  if (!existsSync(SETTINGS_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Ecrit les settings Claude Code
 */
export function writeSettings(settings: Record<string, unknown>): void {
  // Creer le dossier si necessaire
  if (!existsSync(CLAUDE_DIR)) {
    mkdirSync(CLAUDE_DIR, { recursive: true });
  }

  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

/**
 * Verifie si les hooks ctxopt sont deja configures
 */
export function hasCtxoptHooks(): boolean {
  const settings = readSettings();
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;

  if (!hooks) return false;

  // Verifier si au moins un hook ctxopt est present
  const userPromptHooks = hooks.UserPromptSubmit as Array<{ hooks?: Array<{ command?: string }> }> | undefined;
  if (userPromptHooks) {
    return userPromptHooks.some((h) =>
      h.hooks?.some((hh) => hh.command?.includes('CTXOPT'))
    );
  }

  return false;
}

/**
 * Configure les hooks ctxopt dans Claude Code
 */
export function setupHooks(): { success: boolean; message: string } {
  try {
    const settings = readSettings();

    // Initialiser hooks si necessaire
    if (!settings.hooks) {
      settings.hooks = {};
    }

    const hooks = settings.hooks as Record<string, unknown[]>;

    // Merger les hooks (sans ecraser les existants)
    for (const [event, newHooks] of Object.entries(CTXOPT_HOOKS)) {
      if (!hooks[event]) {
        hooks[event] = [];
      }

      // Filtrer les hooks ctxopt existants
      const existingHooks = (hooks[event] as Array<{ hooks?: Array<{ command?: string }> }>)
        .filter((h) => !h.hooks?.some((hh) => hh.command?.includes('ctxopt')));

      // Ajouter les nouveaux hooks
      hooks[event] = [...existingHooks, ...newHooks];
    }

    writeSettings(settings);

    return {
      success: true,
      message: `Hooks configured in ${SETTINGS_FILE}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to configure hooks: ${error}`,
    };
  }
}

/**
 * Supprime les hooks ctxopt de Claude Code
 */
export function removeHooks(): { success: boolean; message: string } {
  try {
    const settings = readSettings();

    if (!settings.hooks) {
      return { success: true, message: 'No hooks to remove' };
    }

    const hooks = settings.hooks as Record<string, unknown[]>;

    // Filtrer les hooks ctxopt
    for (const event of Object.keys(hooks)) {
      hooks[event] = (hooks[event] as Array<{ hooks?: Array<{ command?: string }> }>)
        .filter((h) => !h.hooks?.some((hh) =>
          hh.command?.includes('ctxopt') || hh.command?.includes('CTXOPT')
        ));

      // Supprimer l'evenement s'il est vide
      if (hooks[event].length === 0) {
        delete hooks[event];
      }
    }

    // Supprimer hooks s'il est vide
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }

    writeSettings(settings);

    return {
      success: true,
      message: 'Hooks removed successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to remove hooks: ${error}`,
    };
  }
}

/**
 * Affiche le status des hooks
 */
export function getHooksStatus(): {
  configured: boolean;
  settingsPath: string;
  hookCount: number;
} {
  const settings = readSettings();
  const hooks = settings.hooks as Record<string, unknown[]> | undefined;

  let hookCount = 0;
  if (hooks) {
    for (const event of Object.keys(hooks)) {
      hookCount += (hooks[event] as unknown[]).length;
    }
  }

  return {
    configured: hasCtxoptHooks(),
    settingsPath: SETTINGS_FILE,
    hookCount,
  };
}
