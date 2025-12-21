#!/usr/bin/env node

import { program } from 'commander';
import { CtxOptSession, enterRawMode, exitRawMode } from '@ctxopt/core';
import { setupHooks, removeHooks, getHooksStatus, hasCtxoptHooks } from './hooks';
import { handleConfigCommand, readConfig } from './config';

// Version depuis package.json
const VERSION = '0.1.0';

// Options CLI
interface CliOptions {
  suggestions: boolean;
  verbose: boolean;
  command: string;
}

// Configuration du CLI principal
program
  .name('ctxopt')
  .description('Terminal wrapper for Claude Code with automatic token optimization')
  .version(VERSION)
  .option('--no-suggestions', 'Disable optimization suggestions')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('-c, --command <cmd>', 'Command to run (default: claude)', 'claude')
  .action(async (options: CliOptions) => {
    await runWrapper(options);
  });

// Commande setup
program
  .command('setup')
  .description('Configure Claude Code hooks for ctxopt')
  .option('-f, --force', 'Force setup even if already configured')
  .action((options: { force?: boolean }) => {
    if (hasCtxoptHooks() && !options.force) {
      console.log('Hooks already configured. Use --force to reconfigure.');
      return;
    }

    const result = setupHooks();
    if (result.success) {
      console.log('\x1b[32m✓\x1b[0m ' + result.message);
      console.log('');
      console.log('Hooks configured:');
      console.log('  • PreToolUse: Suggests smart_file_read for code files');
      console.log('  • PostToolUse: Suggests auto_optimize for large outputs');
      console.log('  • UserPromptSubmit: Reminder of available tools');
    } else {
      console.error('\x1b[31m✗\x1b[0m ' + result.message);
      process.exit(1);
    }
  });

// Commande uninstall
program
  .command('uninstall')
  .description('Remove ctxopt hooks from Claude Code')
  .action(() => {
    const result = removeHooks();
    if (result.success) {
      console.log('\x1b[32m✓\x1b[0m ' + result.message);
    } else {
      console.error('\x1b[31m✗\x1b[0m ' + result.message);
      process.exit(1);
    }
  });

// Commande status
program
  .command('status')
  .description('Show ctxopt hooks status')
  .action(() => {
    const status = getHooksStatus();
    console.log('Hooks Status:');
    console.log(`  • Configured: ${status.configured ? '\x1b[32mYes\x1b[0m' : '\x1b[33mNo\x1b[0m'}`);
    console.log(`  • Settings file: ${status.settingsPath}`);
    console.log(`  • Total hooks: ${status.hookCount}`);
  });

// Commande config
program
  .command('config')
  .description('Manage ctxopt configuration')
  .argument('[subcommand]', 'Subcommand: show, set, get, unset')
  .argument('[key]', 'Config key: api-key, api-url')
  .argument('[value]', 'Value to set')
  .allowUnknownOption()
  .action((subcommand?: string, key?: string, value?: string) => {
    const args = [subcommand, key, value].filter((a): a is string => a !== undefined);
    handleConfigCommand(args);
  });

// Main function
async function runWrapper(options: CliOptions): Promise<void> {
  // Auto-setup hooks si pas configures
  if (!hasCtxoptHooks()) {
    console.error('[ctxopt] First run detected. Setting up Claude Code hooks...');
    const result = setupHooks();
    if (result.success) {
      console.error('[ctxopt] \x1b[32m✓\x1b[0m Hooks configured');
    } else {
      console.error('[ctxopt] \x1b[33m⚠\x1b[0m Could not configure hooks: ' + result.message);
    }
    console.error('');
  }

  const { rows, columns } = getTerminalSize();

  if (options.verbose) {
    console.error(`[ctxopt] Starting with terminal size: ${rows}x${columns}`);
    console.error(`[ctxopt] Command: ${options.command}`);
    console.error(`[ctxopt] Suggestions: ${options.suggestions ? 'enabled' : 'disabled'}`);
  }

  // Creer la session
  let session: CtxOptSession;
  try {
    session = CtxOptSession.withConfig(
      rows,
      columns,
      options.command,
      5000, // injection interval ms
      options.suggestions
    );
  } catch (error) {
    console.error(`[ctxopt] Failed to start: ${error}`);
    process.exit(1);
  }

  // Configurer stdin en raw mode (utilise termios natif sur Unix)
  // Cette configuration désactive ECHO et le mode canonique pour un passthrough propre
  if (process.stdin.isTTY) {
    // Utiliser le raw mode natif Rust qui configure termios correctement
    const rawModeEnabled = enterRawMode();
    if (options.verbose && rawModeEnabled) {
      console.error('[ctxopt] Native raw mode enabled (termios configured)');
    }
    // Fallback sur Node.js si le raw mode natif échoue
    if (!rawModeEnabled) {
      process.stdin.setRawMode(true);
      if (options.verbose) {
        console.error('[ctxopt] Using Node.js raw mode fallback');
      }
    }
  }
  process.stdin.resume();

  // Pipe stdin vers PTY
  process.stdin.on('data', async (data: Buffer) => {
    try {
      await session.writeBytes(data);
    } catch (error) {
      if (options.verbose) {
        console.error(`[ctxopt] Write error: ${error}`);
      }
    }
  });

  // Handler SIGWINCH (resize terminal)
  process.on('SIGWINCH', async () => {
    const { rows: newRows, columns: newCols } = getTerminalSize();
    try {
      await session.resize(newRows, newCols);
      if (options.verbose) {
        console.error(`[ctxopt] Resized to ${newRows}x${newCols}`);
      }
    } catch (error) {
      if (options.verbose) {
        console.error(`[ctxopt] Resize error: ${error}`);
      }
    }
  });

  // Handler SIGINT (Ctrl+C) - forward to PTY
  process.on('SIGINT', async () => {
    try {
      await session.write('\x03'); // Ctrl+C
    } catch {
      // Ignore errors during shutdown
    }
  });

  // Read loop
  try {
    await readLoop(session, options.verbose);
  } catch (error) {
    if (options.verbose) {
      console.error(`[ctxopt] Error: ${error}`);
    }
  }

  // Cleanup et affichage stats
  await cleanup(session, options.verbose);
}

// Boucle de lecture principale
async function readLoop(session: CtxOptSession, verbose: boolean): Promise<void> {
  while (await session.isRunning()) {
    try {
      const result = await session.read();

      // Afficher l'output original
      if (result.output) {
        process.stdout.write(result.output);
      }

      // Afficher les suggestions (sur stderr pour ne pas polluer stdout)
      for (const suggestion of result.suggestions) {
        process.stderr.write(suggestion);
      }

      // Pas de sleep - le read a déjà un timeout de 50ms
      // Cela permet une meilleure réactivité
    } catch (error) {
      if (verbose) {
        console.error(`[ctxopt] Read error: ${error}`);
      }
      break;
    }
  }
}

// Cleanup et affichage stats
async function cleanup(session: CtxOptSession, verbose: boolean): Promise<void> {
  // Restaurer stdin (exit raw mode natif + Node.js fallback)
  exitRawMode(); // Restaure les settings termios originaux
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();

  // Attendre le process
  let exitCode = 0;
  try {
    exitCode = await session.wait();
  } catch {
    // Ignore
  }

  // Afficher les stats
  try {
    const stats = await session.stats();
    console.error('');
    console.error('\x1b[90m─────────────────────────────────────────\x1b[0m');
    console.error(`\x1b[36m[ctxopt]\x1b[0m Session stats:`);
    console.error(`  • Tokens estimated: ${formatNumber(stats.totalTokens)}`);
    console.error(`  • Suggestions shown: ${stats.totalSuggestions}`);
    console.error(`  • Build errors detected: ${stats.totalBuildErrors}`);
    console.error(`  • Duration: ${formatDuration(stats.elapsedMs)}`);
    console.error('\x1b[90m─────────────────────────────────────────\x1b[0m');
  } catch {
    // Stats non disponibles
  }

  process.exit(exitCode);
}

// Helpers
function getTerminalSize(): { rows: number; columns: number } {
  return {
    rows: process.stdout.rows || 24,
    columns: process.stdout.columns || 80,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

// Run
program.parse();
