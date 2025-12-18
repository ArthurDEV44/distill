# CtxOpt PTY Wrapper - Liste des Tâches

> **Objectif**: Wrapper terminal en Rust pour Claude Code avec optimisation automatique des tokens
> **Approche**: Binaire Rust + napi-rs distribué via NPM avec packages platform-specific
> **Référence**: [terminal-wrapper-audit.md](../terminal-wrapper-audit.md)

---

## Architecture Globale

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER TERMINAL                                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ctxopt CLI (Node.js)                            │
│  • Entry point: `npx @ctxopt/cli` ou `ctxopt`                        │
│  • Platform detection → charge le bon binary natif                   │
│  • Gestion config ~/.ctxopt/config.toml                              │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ctxopt-core (Rust Native Module)                   │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      PTY Manager                               │  │
│  │  • portable-pty 0.9 (Unix/Windows ConPTY)                      │  │
│  │  • Spawn claude comme child process                            │  │
│  │  • Master/Slave PTY pair                                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Stream Analyzer                             │  │
│  │  • Tokio async runtime pour I/O                                │  │
│  │  • Patterns regex: erreurs build, fichiers, prompts            │  │
│  │  • Ring buffer pour historique output                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   Context Injector                             │  │
│  │  • Throttling (5s min entre injections)                        │  │
│  │  • Templates de suggestions MCP tools                          │  │
│  │  • Écriture stdin PTY quand idle                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Token Estimator                             │  │
│  │  • claude-tokenizer crate                                      │  │
│  │  • Stats temps réel affichées                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Claude Code CLI                                │
│  • Exécuté dans le PTY (pense être dans terminal normal)            │
│  • Aucune modification nécessaire                                    │
│  • Hooks pre-configurés par ctxopt                                   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        API Anthropic                                 │
│  • HTTPS + SSE (inchangé)                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Project Setup (Priorité Critique)

- [x] [P00 - Project Setup](./P00-project-setup.md) - Structure Rust + napi-rs + monorepo packages

## Phase 1: PTY Core (Priorité Haute)

- [x] [P01 - PTY Core](./P01-pty-core.md) - PtyManager avec portable-pty, spawn/read/write
- [x] [P02 - Stream Analyzer](./P02-stream-analyzer.md) - Analyse patterns stdout, ContentType enum
- [x] [P03 - Context Injector](./P03-context-injector.md) - Injection suggestions via stdin

## Phase 2: Node.js Integration

- [x] [P04 - NAPI Bindings](./P04-napi-bindings.md) - Bindings Rust → Node.js avec napi-rs
- [x] [P05 - NPM Distribution](./P05-npm-distribution.md) - CI/CD GitHub Actions, packages platform-specific
- [ ] [P06 - CLI Wrapper](./P06-cli-wrapper.md) - Entry point TypeScript, pipe stdin/stdout

## Phase 3: Integration & Polish

- [ ] [P07 - Hooks Integration](./P07-hooks-integration.md) - Auto-config hooks Claude Code
- [ ] [P08 - Testing & Polish](./P08-testing-polish.md) - Tests cross-platform, métriques

---

## Dépendances entre Tâches

```
P00 ──► P01 ──► P02 ──► P03
         │              │
         └──► P04 ◄─────┘
               │
               ▼
              P05 ──► P06 ──► P07 ──► P08
```

**Légende**:
- P00 bloque tout (setup projet)
- P01-P03 peuvent être parallélisés après P00
- P04 requiert P01 et P03
- P05-P08 sont séquentiels

---

## Stack Technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Runtime Rust | Tokio | 1.x |
| PTY | portable-pty | 0.9.0 |
| Bindings Node | napi-rs | 2.x |
| Token counting | claude-tokenizer | latest |
| Regex | regex | 1.x |
| Serialization | serde + serde_json | 1.x |
| Error handling | anyhow + thiserror | 1.x |
| CLI TypeScript | Commander.js | 12.x |

---

## Plateformes Cibles

| Plateforme | Target Rust | Package NPM |
|------------|-------------|-------------|
| macOS Intel | x86_64-apple-darwin | @ctxopt/cli-darwin-x64 |
| macOS ARM | aarch64-apple-darwin | @ctxopt/cli-darwin-arm64 |
| Linux x64 | x86_64-unknown-linux-gnu | @ctxopt/cli-linux-x64-gnu |
| Linux ARM | aarch64-unknown-linux-gnu | @ctxopt/cli-linux-arm64-gnu |
| Windows x64 | x86_64-pc-windows-msvc | @ctxopt/cli-win32-x64-msvc |
| Windows ARM | aarch64-pc-windows-msvc | @ctxopt/cli-win32-arm64-msvc |

---

## Structure Monorepo

```
packages/
├── ctxopt-cli/                    # Package NPM principal
│   ├── src/
│   │   └── index.ts               # Entry point CLI
│   ├── bin/
│   │   └── ctxopt                 # Shebang script
│   └── package.json
│
├── ctxopt-core/                   # Binaire Rust (napi-rs)
│   ├── src/
│   │   ├── lib.rs                 # Exports napi
│   │   ├── pty/
│   │   │   ├── mod.rs             # PTY abstraction
│   │   │   └── manager.rs         # PtyManager impl
│   │   ├── stream/
│   │   │   ├── mod.rs             # Stream processing
│   │   │   ├── analyzer.rs        # Pattern detection
│   │   │   └── buffer.rs          # Ring buffer
│   │   ├── injector/
│   │   │   ├── mod.rs             # Context injection
│   │   │   ├── triggers.rs        # Quand injecter
│   │   │   └── templates.rs       # Messages templates
│   │   ├── tokens/
│   │   │   └── estimator.rs       # Token counting
│   │   └── config/
│   │       └── mod.rs             # Configuration
│   ├── Cargo.toml
│   └── build.rs                   # napi build
│
└── ctxopt-cli-[platform]/         # Packages platform-specific (6x)
    ├── package.json
    └── ctxopt-core.[platform].node
```

---

## Commandes Dev

```bash
# Setup initial
cd packages/ctxopt-core
cargo build                        # Build Rust debug
cargo test                         # Tests unitaires

# Build napi
bun install
bun run build                      # Build release + bindings

# Test local
cd packages/ctxopt-cli
bun link                           # Lier globalement
ctxopt --help                      # Tester CLI

# CI local (act)
act -j build                       # Simuler GitHub Actions
```

---

## Métriques de Succès

| Métrique | Objectif | Mesure |
|----------|----------|--------|
| Overhead latence | < 5ms | Benchmark stdin→stdout |
| Memory footprint | < 50MB resident | heaptrack |
| Token savings affichés | ±10% précision | Comparer facture API |
| Cross-platform | 100% feature parity | CI tests 6 plateformes |
| Suggestions acceptées | > 30% | Analytics opt-in |
| Installation | < 30s | Timer install script |

---

## Ressources

### Documentation Officielle
- [portable-pty docs](https://docs.rs/portable-pty/latest/portable_pty/)
- [napi-rs Getting Started](https://napi.rs/docs/introduction/getting-started)
- [napi-rs Cross-build](https://napi.rs/docs/cross-build)
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)

### Exemples de Référence
- [get-pty-output](https://www.npmjs.com/package/get-pty-output) - NPM + napi-rs PTY
- [Sentry CLI publishing](https://sentry.engineering/blog/publishing-binaries-on-npm) - Strategy NPM binaires
- [SWC Node bindings](https://deepwiki.com/swc-project/swc/7.2-node.js-bindings) - napi-rs production

### Crates Rust
- [portable-pty](https://crates.io/crates/portable-pty) - PTY cross-platform (wezterm)
- [claude-tokenizer](https://crates.io/crates/claude-tokenizer) - Token counting Claude
- [napi](https://crates.io/crates/napi) - Node-API bindings
