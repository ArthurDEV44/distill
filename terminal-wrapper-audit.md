# Audit: CtxOpt Terminal Environment Wrapper

## Executive Summary

Ce document analyse la faisabilité de créer un **environnement terminal wrapper** pour Claude Code, une alternative au système MCP actuel. L'objectif est d'optimiser nativement la consommation de tokens en encapsulant l'exécution de Claude Code plutôt qu'en utilisant des outils MCP optionnels.

**Concept principal**: Au lieu de `claude`, l'utilisateur exécute `ctxopt` qui lance Claude Code dans un environnement contrôlé où l'optimisation des tokens est **automatique et transparente**.

---

## 1. Problématique Actuelle du MCP

### Limitations identifiées

| Problème | Impact |
|----------|--------|
| **Appels optionnels** | Les outils MCP doivent être explicitement appelés par Claude |
| **Dépendance au modèle** | Claude "oublie" parfois d'utiliser les outils MCP |
| **Hooks limités** | Les hooks ne peuvent qu'ajouter du contexte, pas modifier les requêtes |
| **Pas d'interception** | Impossible d'intercepter/modifier les réponses API |

### Comportement actuel
```
User → Claude Code CLI → API Anthropic
         ↓
    MCP Tools (optionnels, appelés par Claude)
```

### Comportement souhaité
```
User → CtxOpt Wrapper → Claude Code CLI → [Interception] → API Anthropic
                                              ↓
                              Optimisation automatique des tokens
```

---

## 2. Architecture de Claude Code (Recherche)

### Stack technique
- **Runtime**: Bun
- **UI**: TypeScript, React, Ink (TUI), Yoga
- **Communication API**: SSE (Server-Sent Events) via HTTPS
- **Storage**: `~/.claude/projects/` pour l'historique

### Philosophie de conception
> "Claude Code is just a lightweight shell on top of the Claude model"
> — [How Claude Code is built](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)

### Implications pour le wrapper
- Claude Code est un **processus Node.js/Bun** standard
- Communication API via **HTTPS avec SSE** (pas WebSocket)
- Possible d'intercepter via PTY ou proxy HTTP

---

## 3. Approches Techniques Possibles

### 3.1 PTY Wrapper (Recommandé)

**Concept**: Exécuter Claude Code dans un pseudo-terminal contrôlé.

```
ctxopt (Rust binary)
   ↓
PTY (portable-pty)
   ↓
claude (child process)
   ↓
stdin/stdout interceptés
```

**Avantages**:
- Contrôle total sur stdin/stdout
- Cross-platform (portable-pty supporte Windows/Linux/macOS)
- Pas besoin de modifier Claude Code
- Peut injecter des commandes/contexte

**Limitations**:
- Ne peut pas intercepter les requêtes HTTP directement
- Optimisation limitée au niveau terminal (pas API)

**Technologies**:
- [portable-pty](https://crates.io/crates/portable-pty) - PTY cross-platform en Rust
- [napi-rs](https://napi.rs/) - Bindings Rust → Node.js
- [get-pty-output](https://www.npmjs.com/package/get-pty-output) - NPM package existant

### 3.2 Transparent Proxy HTTP

**Concept**: Intercepter les requêtes HTTPS vers l'API Anthropic.

```
ctxopt
   ↓
Configure HTTP_PROXY, HTTPS_PROXY
   ↓
claude (utilise le proxy)
   ↓
Proxy mitmproxy/custom
   ↓
Modification des requêtes/réponses
   ↓
api.anthropic.com
```

**Avantages**:
- Interception complète des requêtes API
- Peut modifier les prompts avant envoi
- Peut compresser les réponses
- Contrôle total sur les tokens

**Limitations**:
- Nécessite gestion des certificats TLS (complexe)
- mitmproxy n'est pas facilement embeddable
- Problèmes de confiance/sécurité
- Claude Code pourrait refuser le certificat

**Technologies**:
- [mitmproxy](https://mitmproxy.org/) - Proxy HTTP transparent
- Variables d'environnement: `HTTP_PROXY`, `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`

### 3.3 Hybrid: PTY + API Monkey-Patching

**Concept**: Wrapper PTY qui injecte du code pour intercepter les appels API.

```
ctxopt
   ↓
PTY wrapper
   ↓
Injection via NODE_OPTIONS="--require=./interceptor.js"
   ↓
claude
   ↓
fetch/http interceptés en mémoire
```

**Avantages**:
- Pas besoin de proxy externe
- Interception au niveau process
- Pas de problème TLS

**Limitations**:
- Fragile (dépend de l'implémentation interne)
- Peut casser avec les updates de Claude Code
- Complexe à maintenir
- Potentiellement bloqué par Bun

### 3.4 Fork/Patch de Claude Code

**Concept**: Maintenir un fork modifié de Claude Code.

**Avantages**:
- Contrôle total

**Limitations**:
- Non viable: Claude Code est propriétaire
- Pas de repo public
- Maintenance impossible

---

## 4. Analyse des Rate Limits Anthropic

### Structure actuelle
| Métrique | Description |
|----------|-------------|
| RPM | Requests per minute |
| ITPM | Input tokens per minute |
| OTPM | Output tokens per minute |

### Optimisations possibles

1. **Réduction ITPM** (input):
   - Compresser les prompts avant envoi
   - Déduplication du contexte
   - Cache intelligent des fichiers lus

2. **Réduction OTPM** (output):
   - Limité car on ne contrôle pas la génération
   - Possible de tronquer les réponses trop longues

3. **Cache de prompts**:
   > "Prompt cache read tokens no longer count against your ITPM limit"
   > — [Anthropic Rate Limits](https://docs.claude.com/en/api/rate-limits)

---

## 5. Distribution NPM de Binaires Rust

### Stratégie recommandée: Platform-specific packages

```
@ctxopt/cli              (base package)
@ctxopt/cli-darwin-x64   (macOS Intel)
@ctxopt/cli-darwin-arm64 (macOS M1/M2)
@ctxopt/cli-linux-x64    (Linux x64)
@ctxopt/cli-linux-arm64  (Linux ARM)
@ctxopt/cli-win32-x64    (Windows x64)
```

### Outils de build
- [napi-rs](https://napi.rs/) - Framework pour addons Node.js natifs
- [cargo-dist](https://github.com/axodotdev/cargo-dist) - Distribution de binaires Rust
- GitHub Actions pour CI/CD multi-platform

### Pattern de publication
```javascript
// @ctxopt/cli/package.json
{
  "optionalDependencies": {
    "@ctxopt/cli-darwin-x64": "1.0.0",
    "@ctxopt/cli-darwin-arm64": "1.0.0",
    "@ctxopt/cli-linux-x64": "1.0.0",
    // ...
  }
}
```

Référence: [Sentry CLI publishing strategy](https://sentry.engineering/blog/publishing-binaries-on-npm)

---

## 6. Comparaison des Approches

| Critère | PTY Wrapper | HTTP Proxy | Hybrid | Fork |
|---------|-------------|------------|--------|------|
| **Complexité** | Moyenne | Haute | Très haute | Impossible |
| **Fiabilité** | Haute | Moyenne | Basse | N/A |
| **Interception API** | Non | Oui | Oui | N/A |
| **Cross-platform** | Oui | Oui | Partiel | N/A |
| **Maintenance** | Facile | Moyenne | Difficile | N/A |
| **User experience** | Excellente | Moyenne | Bonne | N/A |
| **Sécurité** | Haute | Basse (TLS) | Moyenne | N/A |

---

## 7. Approche Recommandée: PTY + Context Injection

### Concept final

Créer un wrapper PTY en Rust qui:

1. **Lance Claude Code dans un PTY**
2. **Intercepte stdout** pour analyser les patterns (fichiers lus, erreurs build)
3. **Injecte du contexte** via stdin quand pertinent
4. **Utilise les hooks existants** pour maximiser l'optimisation
5. **Configure automatiquement** les settings Claude Code

### Fonctionnalités réalisables

| Fonctionnalité | Méthode | Impact tokens |
|----------------|---------|---------------|
| Auto-injection smart_file_read | Hook UserPromptSubmit | -50% lecture fichiers |
| Compression output build | Analyse stdout + injection | -95% erreurs |
| Résumé auto des logs | Analyse stdout + injection | -80% logs |
| Cache context local | Storage + injection | Variable |
| Stats temps réel | Analyse stdout | Visibility |

### Limitations acceptées

- **Pas d'interception API directe** (trop complexe/fragile)
- **Optimisation "assistée"** plutôt que "forcée"
- **Dépend de la coopération du modèle**

---

## 8. Architecture Technique Proposée

### Structure du package

```
packages/
├── ctxopt-cli/              # Package NPM principal
│   ├── src/
│   │   └── index.ts         # Point d'entrée JS
│   └── package.json
│
├── ctxopt-core/             # Binaire Rust
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── pty.rs           # PTY management
│   │   ├── analyzer.rs      # Output analysis
│   │   ├── injector.rs      # Context injection
│   │   └── config.rs        # Settings management
│   ├── Cargo.toml
│   └── build.rs
│
└── ctxopt-bindings/         # napi-rs bindings
    └── ...
```

### Dépendances Rust clés

```toml
[dependencies]
portable-pty = "0.9"         # PTY cross-platform
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
regex = "1"                  # Pattern matching
napi = "2"                   # Node bindings
napi-derive = "2"
```

### Flow d'exécution

```
1. User: ctxopt
   ↓
2. Load config (~/.ctxopt/config.toml)
   ↓
3. Setup hooks (copy to ~/.claude/settings/hooks)
   ↓
4. Create PTY
   ↓
5. Spawn: claude --profile ctxopt
   ↓
6. Loop:
   ├── Read stdout → Analyze patterns
   ├── Detect optimizable content
   ├── Inject suggestions via stdin (when idle)
   └── Display to user
   ↓
7. On exit: Show stats
```

---

## 9. Risques et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Claude Code change l'API interne | Haute | Moyen | Tests automatisés, fallback gracieux |
| PTY bugs cross-platform | Moyenne | Haut | Utiliser portable-pty mature |
| User confusion | Moyenne | Moyen | Documentation claire, mode verbose |
| Performance overhead | Basse | Faible | Rust natif, async I/O |
| Rate limit bypass non-fonctionnel | Haute | Haut | Gérer les attentes, focus sur UX |

---

## 10. Estimation Effort

### Phase 1: POC (2-3 semaines de dev)
- [ ] Setup projet Rust + napi-rs
- [ ] PTY wrapper basique
- [ ] Build multi-platform CI
- [ ] Publication NPM test

### Phase 2: Core Features (3-4 semaines)
- [ ] Analyseur de patterns stdout
- [ ] Système d'injection de contexte
- [ ] Intégration hooks Claude Code
- [ ] Config management

### Phase 3: Polish (2 semaines)
- [ ] Stats et reporting
- [ ] Documentation
- [ ] Tests cross-platform
- [ ] Release publique

---

## 11. Questions Ouvertes

1. **Niveau d'interception souhaité?**
   - Terminal seulement (PTY) vs API (proxy)

2. **Comportement si Claude Code update?**
   - Fallback gracieux vs bloquer

3. **Monétisation/SaaS?**
   - Stats cloud vs local-only

4. **Support Windows prioritaire?**
   - Affecte la complexité PTY

---

## 12. Conclusion

### Recommandation

L'approche **PTY Wrapper en Rust** est la plus viable:

- **Faisable** avec les technologies existantes
- **Maintenable** car n'intercepte pas les internals
- **Utile** malgré les limitations (pas d'interception API)
- **Distribuable** via NPM avec binaires précompilés

### Limitation majeure

Sans interception API, l'optimisation reste **assistée** et non **forcée**. Le wrapper peut suggérer et injecter du contexte, mais ne peut pas:
- Modifier les requêtes API avant envoi
- Compresser les prompts automatiquement
- Garantir une réduction de tokens

### Alternative à considérer

Si l'interception API est critique, la seule option réaliste serait de:
1. Contacter Anthropic pour un partenariat
2. Proposer l'intégration de ctxopt dans Claude Code nativement
3. Créer une extension officielle via leur programme de plugins

---

## 13. Deep Dive: PTY + Rust + napi-rs (Architecture Détaillée)

### 13.1 Vue d'ensemble du système

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER TERMINAL                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ctxopt CLI (Node.js)                        │
│  • Entry point: `npx ctxopt` ou `ctxopt`                        │
│  • Config loading                                                │
│  • Platform detection → charge le bon binary natif              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ctxopt-core (Rust Native Module)               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    PTY Manager                            │   │
│  │  • portable-pty (Unix) / ConPTY (Windows)                 │   │
│  │  • Crée master/slave PTY pair                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Stream Processor                        │   │
│  │  • Tokio async runtime                                    │   │
│  │  • Intercepte stdout du child process                     │   │
│  │  • Analyse patterns (erreurs build, fichiers, etc.)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   Context Injector                        │   │
│  │  • Détecte moments propices pour injection                │   │
│  │  • Écrit suggestions via stdin du PTY                     │   │
│  │  • Throttling pour éviter spam                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Claude Code CLI                             │
│  • Exécuté comme child process dans le PTY                      │
│  • Pense être dans un terminal normal                           │
│  • Aucune modification nécessaire                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Anthropic                              │
│  • HTTPS + SSE (inchangé)                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Structure du projet Rust

```
packages/ctxopt-core/
├── Cargo.toml
├── src/
│   ├── lib.rs              # Exports napi
│   ├── pty/
│   │   ├── mod.rs          # PTY abstraction
│   │   ├── unix.rs         # Unix PTY (portable-pty)
│   │   └── windows.rs      # Windows ConPTY
│   ├── stream/
│   │   ├── mod.rs          # Stream processing
│   │   ├── analyzer.rs     # Pattern detection
│   │   └── buffer.rs       # Ring buffer pour output
│   ├── injector/
│   │   ├── mod.rs          # Context injection logic
│   │   ├── triggers.rs     # Quand injecter
│   │   └── templates.rs    # Templates de messages
│   ├── config/
│   │   ├── mod.rs          # Configuration
│   │   └── hooks.rs        # Claude Code hooks setup
│   └── stats/
│       ├── mod.rs          # Session statistics
│       └── tokens.rs       # Token estimation
└── build.rs                # napi build script
```

### 13.3 Cargo.toml complet

```toml
[package]
name = "ctxopt-core"
version = "0.1.0"
edition = "2021"
license = "MIT"

[lib]
crate-type = ["cdylib"]

[dependencies]
# NAPI bindings
napi = { version = "2", default-features = false, features = ["napi8", "async", "serde-json"] }
napi-derive = "2"

# PTY cross-platform
portable-pty = "0.9"

# Async runtime
tokio = { version = "1", features = ["full", "sync", "io-util", "time"] }

# Pattern matching
regex = "1"
lazy_static = "1"

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Error handling
anyhow = "1"
thiserror = "1"

# Logging
tracing = "0.1"
tracing-subscriber = "0.3"

# Token estimation (approximatif)
tiktoken-rs = "0.5"

[build-dependencies]
napi-build = "2"

[profile.release]
lto = true
opt-level = "z"
strip = true
```

### 13.4 Code Rust: PTY Manager

```rust
// src/pty/mod.rs
use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtySystem, MasterPty, Child};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::Result;

pub struct PtyManager {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
}

impl PtyManager {
    pub fn new(command: &str, args: &[&str], rows: u16, cols: u16) -> Result<Self> {
        let pty_system = native_pty_system();

        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(command);
        for arg in args {
            cmd.arg(*arg);
        }

        // Inherit environment variables
        for (key, value) in std::env::vars() {
            cmd.env(key, value);
        }

        let child = pair.slave.spawn_command(cmd)?;
        let writer = pair.master.take_writer()?;

        Ok(Self {
            master: Arc::new(Mutex::new(pair.master)),
            child: Arc::new(Mutex::new(child)),
            writer: Arc::new(Mutex::new(writer)),
        })
    }

    pub async fn read_output(&self) -> Result<Vec<u8>> {
        let master = self.master.lock().await;
        let mut reader = master.try_clone_reader()?;
        let mut buffer = vec![0u8; 4096];
        let n = reader.read(&mut buffer)?;
        buffer.truncate(n);
        Ok(buffer)
    }

    pub async fn write_input(&self, data: &[u8]) -> Result<()> {
        let mut writer = self.writer.lock().await;
        writer.write_all(data)?;
        writer.flush()?;
        Ok(())
    }

    pub async fn is_running(&self) -> bool {
        let mut child = self.child.lock().await;
        child.try_wait().ok().flatten().is_none()
    }

    pub async fn wait(&self) -> Result<u32> {
        let mut child = self.child.lock().await;
        let status = child.wait()?;
        Ok(status.exit_code())
    }
}
```

### 13.5 Code Rust: Stream Analyzer

```rust
// src/stream/analyzer.rs
use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    // Patterns pour détecter les différents types de contenu
    static ref BUILD_ERROR: Regex = Regex::new(
        r"(?i)(error|failed|cannot find|unexpected|compilation failed)"
    ).unwrap();

    static ref FILE_READ: Regex = Regex::new(
        r"(?i)(reading file|Read tool|file_path.*\.(?:ts|js|py|rs|go))"
    ).unwrap();

    static ref LARGE_OUTPUT: Regex = Regex::new(
        r"(?s).{5000,}"  // Output > 5000 chars
    ).unwrap();

    static ref PROMPT_READY: Regex = Regex::new(
        r"(❯|>|\$)\s*$"  // Shell prompt patterns
    ).unwrap();
}

#[derive(Debug, Clone)]
pub enum ContentType {
    BuildError { error_count: usize },
    FileRead { file_path: String },
    LargeOutput { size: usize },
    PromptReady,
    Normal,
}

pub struct StreamAnalyzer {
    buffer: String,
    token_estimate: usize,
}

impl StreamAnalyzer {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            token_estimate: 0,
        }
    }

    pub fn analyze(&mut self, chunk: &str) -> Vec<ContentType> {
        self.buffer.push_str(chunk);
        self.token_estimate += estimate_tokens(chunk);

        let mut detected = Vec::new();

        if BUILD_ERROR.is_match(chunk) {
            let count = BUILD_ERROR.find_iter(&self.buffer).count();
            detected.push(ContentType::BuildError { error_count: count });
        }

        if FILE_READ.is_match(chunk) {
            if let Some(caps) = FILE_READ.captures(chunk) {
                detected.push(ContentType::FileRead {
                    file_path: caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default()
                });
            }
        }

        if self.buffer.len() > 5000 {
            detected.push(ContentType::LargeOutput { size: self.buffer.len() });
        }

        if PROMPT_READY.is_match(chunk) {
            detected.push(ContentType::PromptReady);
            self.buffer.clear(); // Reset after prompt
        }

        if detected.is_empty() {
            detected.push(ContentType::Normal);
        }

        detected
    }

    pub fn get_token_estimate(&self) -> usize {
        self.token_estimate
    }
}

fn estimate_tokens(text: &str) -> usize {
    // Approximation: ~4 caractères par token en moyenne
    text.len() / 4
}
```

### 13.6 Code Rust: Context Injector

```rust
// src/injector/mod.rs
use crate::stream::analyzer::ContentType;
use std::time::{Duration, Instant};

pub struct ContextInjector {
    last_injection: Instant,
    min_interval: Duration,
    suggestions_count: usize,
}

impl ContextInjector {
    pub fn new() -> Self {
        Self {
            last_injection: Instant::now() - Duration::from_secs(60),
            min_interval: Duration::from_secs(5), // Throttle: 5s minimum entre injections
            suggestions_count: 0,
        }
    }

    pub fn should_inject(&self, content_type: &ContentType) -> bool {
        if self.last_injection.elapsed() < self.min_interval {
            return false;
        }

        matches!(
            content_type,
            ContentType::BuildError { .. } |
            ContentType::LargeOutput { .. } |
            ContentType::PromptReady
        )
    }

    pub fn generate_suggestion(&mut self, content_type: &ContentType) -> Option<String> {
        if !self.should_inject(content_type) {
            return None;
        }

        self.last_injection = Instant::now();
        self.suggestions_count += 1;

        let suggestion = match content_type {
            ContentType::BuildError { error_count } => {
                format!(
                    "\n[ctxopt] {} build errors detected. Consider using `mcp__ctxopt__auto_optimize` to compress.\n",
                    error_count
                )
            }
            ContentType::LargeOutput { size } => {
                format!(
                    "\n[ctxopt] Large output ({} chars). Use `mcp__ctxopt__compress_context` for 40-60% savings.\n",
                    size
                )
            }
            ContentType::PromptReady => {
                // Injecte un rappel léger après chaque prompt
                String::from("\n[ctxopt] MCP tools available: smart_file_read, auto_optimize, compress_context\n")
            }
            _ => return None,
        };

        Some(suggestion)
    }
}
```

### 13.7 NAPI Bindings (lib.rs)

```rust
// src/lib.rs
#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use tokio::runtime::Runtime;
use std::sync::Arc;

mod pty;
mod stream;
mod injector;
mod config;
mod stats;

use pty::PtyManager;
use stream::analyzer::StreamAnalyzer;
use injector::ContextInjector;

#[napi]
pub struct CtxOptSession {
    pty: Arc<PtyManager>,
    analyzer: StreamAnalyzer,
    injector: ContextInjector,
    runtime: Runtime,
}

#[napi]
impl CtxOptSession {
    #[napi(constructor)]
    pub fn new(rows: Option<u16>, cols: Option<u16>) -> Result<Self> {
        let runtime = Runtime::new().map_err(|e| Error::from_reason(e.to_string()))?;

        let pty = runtime.block_on(async {
            PtyManager::new(
                "claude",
                &[],
                rows.unwrap_or(24),
                cols.unwrap_or(80),
            )
        }).map_err(|e| Error::from_reason(e.to_string()))?;

        Ok(Self {
            pty: Arc::new(pty),
            analyzer: StreamAnalyzer::new(),
            injector: ContextInjector::new(),
            runtime,
        })
    }

    #[napi]
    pub fn write(&self, data: String) -> Result<()> {
        let pty = self.pty.clone();
        self.runtime.block_on(async move {
            pty.write_input(data.as_bytes()).await
        }).map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn read(&mut self) -> Result<ReadResult> {
        let pty = self.pty.clone();
        let output = self.runtime.block_on(async move {
            pty.read_output().await
        }).map_err(|e| Error::from_reason(e.to_string()))?;

        let text = String::from_utf8_lossy(&output).to_string();
        let content_types = self.analyzer.analyze(&text);

        // Générer des suggestions si approprié
        let suggestions: Vec<String> = content_types
            .iter()
            .filter_map(|ct| self.injector.generate_suggestion(ct))
            .collect();

        Ok(ReadResult {
            output: text,
            suggestions,
            token_estimate: self.analyzer.get_token_estimate() as u32,
        })
    }

    #[napi]
    pub fn is_running(&self) -> Result<bool> {
        let pty = self.pty.clone();
        self.runtime.block_on(async move {
            Ok(pty.is_running().await)
        })
    }

    #[napi]
    pub fn wait(&self) -> Result<u32> {
        let pty = self.pty.clone();
        self.runtime.block_on(async move {
            pty.wait().await
        }).map_err(|e| Error::from_reason(e.to_string()))
    }
}

#[napi(object)]
pub struct ReadResult {
    pub output: String,
    pub suggestions: Vec<String>,
    pub token_estimate: u32,
}
```

### 13.8 Package NPM Principal

```javascript
// packages/ctxopt-cli/src/index.ts
import { CtxOptSession } from '@ctxopt/core';
import * as readline from 'readline';

async function main() {
  const session = new CtxOptSession(
    process.stdout.rows || 24,
    process.stdout.columns || 80
  );

  // Pipe user input to PTY
  process.stdin.setRawMode(true);
  process.stdin.on('data', (data) => {
    session.write(data.toString());
  });

  // Read PTY output and display
  const readLoop = async () => {
    while (session.isRunning()) {
      const result = session.read();

      // Display output
      process.stdout.write(result.output);

      // Display suggestions (styled)
      for (const suggestion of result.suggestions) {
        process.stdout.write('\x1b[33m' + suggestion + '\x1b[0m');
      }

      await sleep(10); // Small delay to prevent busy loop
    }
  };

  readLoop().catch(console.error);

  // Wait for exit
  const exitCode = session.wait();
  process.exit(exitCode);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();
```

### 13.9 Structure des Packages NPM

```
@ctxopt/cli                     # Main package
├── package.json
├── bin/ctxopt                  # CLI entry
├── src/index.ts
└── optionalDependencies:
    ├── @ctxopt/core-darwin-x64
    ├── @ctxopt/core-darwin-arm64
    ├── @ctxopt/core-linux-x64-gnu
    ├── @ctxopt/core-linux-arm64-gnu
    ├── @ctxopt/core-win32-x64-msvc
    └── @ctxopt/core-win32-arm64-msvc

@ctxopt/core-darwin-x64         # Platform-specific binaries
├── package.json
├── ctxopt-core.darwin-x64.node
└── index.js

# etc. pour chaque plateforme
```

### 13.10 GitHub Actions CI/CD

```yaml
# .github/workflows/build.yml
name: Build

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
          - os: ubuntu-latest
            target: aarch64-unknown-linux-gnu
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: windows-latest
            target: aarch64-pc-windows-msvc

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Install dependencies
        run: bun install

      - name: Build native module
        run: |
          cd packages/ctxopt-core
          bun run build --target ${{ matrix.target }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: bindings-${{ matrix.target }}
          path: packages/ctxopt-core/*.node

  publish:
    needs: build
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Publish packages
        run: |
          bun run publish-packages
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 13.11 Limitations et Contournements

| Limitation | Impact | Contournement |
|------------|--------|---------------|
| stdin async bloquant | Peut bloquer le read loop | Thread dédié pour stdin |
| ConPTY Windows quirks | Comportement différent Linux | Tests spécifiques Windows |
| ANSI escape sequences | Parsing complexe | Utiliser `strip-ansi` ou parser minimal |
| Token estimation | Approximatif sans accès API | Utiliser tiktoken-rs pour meilleure estimation |
| Claude Code updates | Peut casser les patterns | Patterns regex flexibles + fallback |

### 13.12 Métriques de succès

| Métrique | Objectif | Mesure |
|----------|----------|--------|
| Overhead latence | < 5ms | Benchmark stdin→stdout |
| Token savings affichés | Accurate ±10% | Comparer avec facture API |
| Cross-platform | 100% feature parity | CI tests |
| Memory footprint | < 50MB resident | Profile avec heaptrack |
| Suggestions accepted | > 30% | Analytics (opt-in) |

---

## Sources

### Architecture & Concepts
- [How Claude Code is built](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built) - Architecture interne
- [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices) - Patterns recommandés
- [Anthropic Streaming API](https://docs.anthropic.com/en/docs/build-with-claude/streaming) - SSE streaming
- [Anthropic Rate Limits](https://docs.claude.com/en/api/rate-limits) - Limites API et token bucket
- [Claude Code Hooks](https://code.claude.com/docs/en/hooks) - Système de hooks

### Rust & PTY
- [portable-pty docs](https://docs.rs/portable-pty/latest/portable_pty/) - API documentation
- [portable-pty crate](https://crates.io/crates/portable-pty) - PTY cross-platform Rust (wezterm)
- [ConPtySystem Windows](https://docs.rs/portable-pty/latest/i686-pc-windows-msvc/portable_pty/win/conpty/struct.ConPtySystem.html) - Windows ConPTY
- [Linux TTY/PTY Async Rust](https://developerlife.com/2024/08/20/tty-linux-async-rust/) - Tutorial complet
- [tokio-pty-process-stream](https://docs.rs/tokio-pty-process-stream/latest/tokio_pty_process_stream/) - Async PTY

### napi-rs & Distribution NPM
- [napi-rs Getting Started](https://napi.rs/docs/introduction/getting-started) - Documentation officielle
- [napi-rs Cross-build](https://napi.rs/docs/cross-build) - Multi-platform builds
- [get-pty-output](https://www.npmjs.com/package/get-pty-output) - Exemple NPM PTY avec napi-rs
- [Sentry CLI npm publishing](https://sentry.engineering/blog/publishing-binaries-on-npm) - Strategy de distribution
- [Packaging Rust for NPM](https://blog.orhun.dev/packaging-rust-for-npm/) - Guide complet

### Interception & Proxy (Référence)
- [mitmproxy](https://mitmproxy.org/) - Proxy HTTP transparent
- [Proxying CLI Tools](https://blog.ropnop.com/proxying-cli-tools/) - Techniques d'interception
- [HTTP Toolkit Docker](https://httptoolkit.com/docs/guides/docker/) - Environment variables method
