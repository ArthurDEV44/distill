/**
 * Distill Hooks Installation Module
 *
 * Installs Claude Code hooks that suggest MCP tool usage:
 * - PreToolUse: Suggests smart_file_read for code files (non-blocking for Edit compatibility)
 * - PostToolUse: Reminds to use auto_optimize for large Bash outputs
 * - UserPromptSubmit: Injects MCP tool reminders
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from "fs";
import { join } from "path";
import { success, warn, info, error, log, COLORS, readJSONFile, writeJSONFile } from "./utils.js";

// ============================================================================
// CLAUDE.md Content
// ============================================================================

const CLAUDE_MD_SECTION_START = "## Directives d'utilisation des outils MCP";
const CLAUDE_MD_SECTION_END = "<!-- END DISTILL -->";

const CLAUDE_MD_CONTENT = `## Directives d'utilisation des outils MCP

Utilisez les outils Distill MCP pour des opérations économes en tokens :

### Règle 1 : Lecture intelligente de fichiers

Lors de la lecture de fichiers source pour **exploration ou compréhension** :

\`\`\`
mcp__distill__smart_file_read filePath="path/to/file.ts"
\`\`\`

**Quand utiliser Read natif à la place :**
- Avant d'éditer un fichier (Edit nécessite Read d'abord)
- Fichiers de configuration : \`.json\`, \`.yaml\`, \`.toml\`, \`.md\`, \`.env\`

### Règle 2 : Compresser les sorties volumineuses

Après les commandes Bash qui produisent une sortie volumineuse (>500 caractères) :

\`\`\`
mcp__distill__auto_optimize content="<collez la sortie volumineuse>"
\`\`\`

### Règle 3 : SDK d'exécution de code pour les opérations complexes

Pour les opérations multi-étapes, utilisez \`code_execute\` au lieu de plusieurs appels d'outils (**98% d'économie de tokens**) :

\`\`\`
mcp__distill__code_execute code="<code typescript>"
\`\`\`

**API du SDK (\`ctx\`) :**

*Compression :*
- \`ctx.compress.auto(content, hint?)\` - Détection auto et compression
- \`ctx.compress.logs(logs)\` - Résumer les logs
- \`ctx.compress.diff(diff)\` - Compresser les git diff
- \`ctx.compress.semantic(content, ratio?)\` - Compression TF-IDF

*Code :*
- \`ctx.code.parse(content, lang)\` - Parser en structure AST
- \`ctx.code.extract(content, lang, {type, name})\` - Extraire un élément
- \`ctx.code.skeleton(content, lang)\` - Obtenir les signatures uniquement

*Fichiers :*
- \`ctx.files.read(path)\` - Lire le contenu d'un fichier
- \`ctx.files.exists(path)\` - Vérifier si un fichier existe
- \`ctx.files.glob(pattern)\` - Trouver des fichiers par pattern

*Git :*
- \`ctx.git.diff(ref?)\` - Obtenir le diff git
- \`ctx.git.log(limit?)\` - Historique des commits
- \`ctx.git.status()\` - Statut du repo
- \`ctx.git.branch()\` - Info sur les branches
- \`ctx.git.blame(file, line?)\` - Git blame d'un fichier

*Recherche :*
- \`ctx.search.grep(pattern, glob?)\` - Rechercher un pattern dans les fichiers
- \`ctx.search.symbols(query, glob?)\` - Rechercher des symboles (fonctions, classes)
- \`ctx.search.files(pattern)\` - Rechercher des fichiers par pattern
- \`ctx.search.references(symbol, glob?)\` - Trouver les références d'un symbole

*Analyse :*
- \`ctx.analyze.dependencies(file)\` - Analyser les imports/exports
- \`ctx.analyze.callGraph(fn, file, depth?)\` - Construire le graphe d'appels
- \`ctx.analyze.exports(file)\` - Obtenir les exports d'un fichier
- \`ctx.analyze.structure(dir?, depth?)\` - Structure du répertoire avec analyse

*Utilitaires :*
- \`ctx.utils.countTokens(text)\` - Compter les tokens
- \`ctx.utils.detectType(content)\` - Détecter le type de contenu
- \`ctx.utils.detectLanguage(path)\` - Détecter le langage depuis le chemin

**Exemples :**

\`\`\`typescript
// Obtenir les squelettes de tous les fichiers TypeScript
const files = ctx.files.glob("src/**/*.ts").slice(0, 5);
return files.map(f => ({
  file: f,
  skeleton: ctx.code.skeleton(ctx.files.read(f), "typescript")
}));

// Compresser et analyser les logs
const logs = ctx.files.read("server.log");
return ctx.compress.logs(logs);

// Extraire une fonction spécifique
const content = ctx.files.read("src/api.ts");
return ctx.code.extract(content, "typescript", { type: "function", name: "handleRequest" });
\`\`\`

### Référence rapide

| Action | Utiliser |
|--------|----------|
| Lire du code pour exploration | \`mcp__distill__smart_file_read filePath="file.ts"\` |
| Obtenir une fonction/classe | \`mcp__distill__smart_file_read filePath="file.ts" target={"type":"function","name":"myFunc"}\` |
| Compresser les erreurs de build | \`mcp__distill__auto_optimize content="..."\` |
| Résumer les logs | \`mcp__distill__auto_optimize content="..." strategy="logs"\` |
| Opérations multi-étapes | \`mcp__distill__code_execute code="return ctx.files.glob('src/**/*.ts')"\` |
| Avant d'éditer | Utiliser l'outil natif \`Read\` |

<!-- END DISTILL -->`;

// ============================================================================
// Hook Script Templates
// ============================================================================

const PRE_READ_CHECK_SCRIPT = `#!/bin/bash
# Distill - PreToolUse Hook for Read
# Suggests smart_file_read for code files (non-blocking to allow Edit to work)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
BASENAME=$(basename "$FILE_PATH")

# Skip suggestion for configuration files
if echo "$BASENAME" | grep -qiE "^(CLAUDE|README|CHANGELOG|LICENSE)"; then
  exit 0
fi
if echo "$BASENAME" | grep -qiE "\\.(md|json|yaml|yml|toml|ini|config)$"; then
  exit 0
fi
if echo "$BASENAME" | grep -qiE "^(Dockerfile|Makefile|\\.gitignore|\\.env|\\.prettierrc|\\.eslintrc)"; then
  exit 0
fi

# Suggest smart_file_read for source code files (non-blocking)
if echo "$FILE_PATH" | grep -qE "\\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|hpp)$"; then
  # Use systemMessage to suggest without blocking (allows Edit to work)
  cat << EOF
{"systemMessage": "TIP: Consider using mcp__distill__smart_file_read for '\$BASENAME' to save 50-70% tokens. Example: mcp__distill__smart_file_read filePath=\\"\$FILE_PATH\\" target={\\"type\\":\\"function\\",\\"name\\":\\"myFunc\\"}"}
EOF
  exit 0
fi

# Allow everything else
exit 0
`;

const POST_BASH_REMIND_SCRIPT = `#!/bin/bash
# Distill - PostToolUse Hook for Bash
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
  echo '{"systemMessage": "TIP: Large build output detected. Use mcp__distill__auto_optimize to compress errors (95%+ reduction)."}'
  exit 0
fi

if echo "$TOOL_RESPONSE" | grep -qiE "(\\[INFO\\]|\\[ERROR\\]|\\[WARN\\]|\\[DEBUG\\]|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2})"; then
  echo '{"systemMessage": "TIP: Large log output detected. Use mcp__distill__auto_optimize with strategy=logs to compress (80-90% reduction)."}'
  exit 0
fi

# Generic large output
echo '{"systemMessage": "TIP: Large output ('$RESPONSE_SIZE' chars). Consider using mcp__distill__auto_optimize for compression (40-60% reduction)."}'
exit 0
`;

const PROMPT_INJECT_SCRIPT = `#!/bin/bash
# Distill - UserPromptSubmit Hook
# Injects MCP tool reminders at the start of each prompt

cat << 'EOF'
<user-prompt-submit-hook>
DISTILL REMINDER: Use MCP tools for token optimization:
- Code files: mcp__distill__smart_file_read (50-70% savings vs Read)
- Build/test output: mcp__distill__auto_optimize (95%+ reduction)
- Multi-step ops: mcp__distill__code_execute (98% savings via SDK)
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

  log(`\n${COLORS.bright}Installing Distill hooks...${COLORS.reset}\n`);

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
    log(`  • ${COLORS.yellow}PreToolUse[Read]${COLORS.reset}     Suggests smart_file_read for code files`);
    log(`  • ${COLORS.yellow}PostToolUse[Bash]${COLORS.reset}    Suggests compression for large outputs`);
    log(`  • ${COLORS.yellow}UserPromptSubmit${COLORS.reset}     Reminds to use MCP tools`);
    log(`\n${COLORS.dim}Token savings:${COLORS.reset}`);
    log(`  • smart_file_read:  50-70% reduction vs Read`);
    log(`  • auto_optimize:    95%+ reduction on build errors`);
    log(`  • auto_optimize:    80-90% reduction on logs\n`);
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

// ============================================================================
// CLAUDE.md Update Function
// ============================================================================

export interface UpdateClaudeMdOptions {
  projectDir?: string;
  force?: boolean;
}

/**
 * Updates CLAUDE.md with Distill MCP directives.
 * Returns true if updated, false if CLAUDE.md doesn't exist.
 */
export function updateClaudeMd(options: UpdateClaudeMdOptions = {}): boolean {
  const projectDir = options.projectDir || process.cwd();
  const force = options.force || false;
  const claudeMdPath = join(projectDir, "CLAUDE.md");

  // Check if CLAUDE.md exists
  if (!existsSync(claudeMdPath)) {
    warn("CLAUDE.md not found.");
    log(`\n${COLORS.dim}To create CLAUDE.md, run in Claude Code:${COLORS.reset}`);
    log(`  ${COLORS.cyan}/init${COLORS.reset}`);
    log(`\nThen run setup again to add Distill directives.\n`);
    return false;
  }

  // Read existing content
  let content: string;
  try {
    content = readFileSync(claudeMdPath, "utf-8");
  } catch (err) {
    error(`Failed to read CLAUDE.md: ${err}`);
    return false;
  }

  // Check if Distill section already exists
  const sectionStartIndex = content.indexOf(CLAUDE_MD_SECTION_START);
  const sectionEndIndex = content.indexOf(CLAUDE_MD_SECTION_END);

  let newContent: string;

  if (sectionStartIndex !== -1 && sectionEndIndex !== -1) {
    // Section exists - replace it
    if (!force) {
      info("Distill directives already present in CLAUDE.md. Use --force to update.");
      return true;
    }
    // Replace existing section
    const beforeSection = content.substring(0, sectionStartIndex).trimEnd();
    const afterSection = content.substring(sectionEndIndex + CLAUDE_MD_SECTION_END.length).trimStart();
    newContent = beforeSection + "\n\n" + CLAUDE_MD_CONTENT + (afterSection ? "\n\n" + afterSection : "\n");
  } else if (sectionStartIndex !== -1) {
    // Partial section (start found but no end marker) - warn and skip
    warn("Found partial Distill section in CLAUDE.md without end marker.");
    log(`Add ${COLORS.dim}${CLAUDE_MD_SECTION_END}${COLORS.reset} at the end of the section, then run setup again.`);
    return false;
  } else {
    // No section exists - append
    newContent = content.trimEnd() + "\n\n" + CLAUDE_MD_CONTENT + "\n";
  }

  // Write updated content
  try {
    writeFileSync(claudeMdPath, newContent, "utf-8");
    success("Updated CLAUDE.md with Distill directives");
    return true;
  } catch (err) {
    error(`Failed to write CLAUDE.md: ${err}`);
    return false;
  }
}
