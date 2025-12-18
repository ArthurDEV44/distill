#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::sync::Arc;
use tokio::sync::Mutex;

mod config;
mod injector;
mod pty;
mod stream;
mod tokens;

use config::Config;
use injector::ContextInjector;
use pty::{PtyManager, PtySize};
use stream::StreamAnalyzer;
use tokens::TokenEstimator;

/// Version du module natif
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Point d'entrée pour tests
#[napi]
pub fn ping() -> String {
    "pong".to_string()
}

/// Résultat d'une lecture du PTY
#[napi(object)]
#[derive(Clone)]
pub struct ReadResult {
    /// Output brut du PTY (nettoyé des codes ANSI)
    pub output: String,

    /// Suggestions générées (si applicable)
    pub suggestions: Vec<String>,

    /// Estimation de tokens pour cet output
    pub token_estimate: u32,

    /// Types de contenu détectés
    pub detected_types: Vec<String>,

    /// Taille totale accumulée dans le buffer
    pub total_size: u32,
}

/// Statistiques de session
#[napi(object)]
#[derive(Clone)]
pub struct SessionStats {
    /// Tokens totaux estimés
    pub total_tokens: u32,

    /// Nombre total de suggestions affichées
    pub total_suggestions: u32,

    /// Nombre d'erreurs de build détectées
    pub total_build_errors: u32,

    /// Temps écoulé en millisecondes
    pub elapsed_ms: u32,
}

/// Session PTY principale exposée à Node.js
#[napi]
pub struct CtxOptSession {
    /// Gestionnaire PTY
    pty: Arc<Mutex<PtyManager>>,

    /// Analyseur de flux
    analyzer: Arc<Mutex<StreamAnalyzer>>,

    /// Injecteur de contexte
    injector: Arc<Mutex<ContextInjector>>,

    /// Configuration
    config: Config,

    /// Timestamp de démarrage
    started_at: std::time::Instant,
}

#[napi]
impl CtxOptSession {
    /// Crée une nouvelle session PTY pour Claude Code
    ///
    /// # Arguments
    /// * `rows` - Nombre de lignes du terminal (défaut: 24)
    /// * `cols` - Nombre de colonnes du terminal (défaut: 80)
    /// * `command` - Commande à exécuter (défaut: "claude")
    #[napi(constructor)]
    pub fn new(rows: Option<u32>, cols: Option<u32>, command: Option<String>) -> Result<Self> {
        let size = PtySize {
            rows: rows.unwrap_or(24) as u16,
            cols: cols.unwrap_or(80) as u16,
        };

        let cmd = command.unwrap_or_else(|| "claude".to_string());

        let pty = PtyManager::new(&cmd, &[], size)
            .map_err(|e| Error::from_reason(format!("Failed to create PTY: {}", e)))?;

        Ok(Self {
            pty: Arc::new(Mutex::new(pty)),
            analyzer: Arc::new(Mutex::new(StreamAnalyzer::new())),
            injector: Arc::new(Mutex::new(ContextInjector::new())),
            config: Config::default(),
            started_at: std::time::Instant::now(),
        })
    }

    /// Crée une session avec configuration personnalisée
    #[napi(factory)]
    pub fn with_config(
        rows: Option<u32>,
        cols: Option<u32>,
        command: Option<String>,
        injection_interval_ms: Option<u32>,
        suggestions_enabled: Option<bool>,
    ) -> Result<Self> {
        let mut session = Self::new(rows, cols, command)?;

        if let Some(interval) = injection_interval_ms {
            session.config.injection_interval_ms = interval as u64;
        }

        if let Some(enabled) = suggestions_enabled {
            session.config.suggestions_enabled = enabled;
        }

        Ok(session)
    }

    /// Lit les données disponibles du PTY
    ///
    /// Retourne l'output, les suggestions générées et les statistiques.
    #[napi]
    pub async fn read(&self) -> Result<ReadResult> {
        let pty = self.pty.lock().await;
        let output_bytes = pty
            .read_async()
            .await
            .map_err(|e| Error::from_reason(format!("Read error: {}", e)))?;

        // Conversion en string
        let output = String::from_utf8_lossy(&output_bytes).to_string();

        if output.is_empty() {
            return Ok(ReadResult {
                output: String::new(),
                suggestions: Vec::new(),
                token_estimate: 0,
                detected_types: vec!["empty".to_string()],
                total_size: 0,
            });
        }

        // Analyse
        let mut analyzer = self.analyzer.lock().await;
        let analysis = analyzer.analyze(&output);

        // Génération de suggestions
        let mut suggestions = Vec::new();
        let mut injector = self.injector.lock().await;

        if self.config.suggestions_enabled {
            for content_type in &analysis.content_types {
                if let Some(suggestion) = injector.generate_suggestion(content_type) {
                    suggestions.push(suggestion.format_for_display());
                }
            }
        }

        // Types détectés en string
        let detected_types: Vec<String> = analysis
            .content_types
            .iter()
            .map(|ct| format!("{:?}", ct))
            .collect();

        Ok(ReadResult {
            output: analysis.clean_text,
            suggestions,
            token_estimate: analysis.token_estimate as u32,
            detected_types,
            total_size: analysis.total_size as u32,
        })
    }

    /// Écrit des données dans le PTY (stdin de Claude)
    #[napi]
    pub async fn write(&self, data: String) -> Result<()> {
        let pty = self.pty.lock().await;
        pty.write_str(&data)
            .await
            .map_err(|e| Error::from_reason(format!("Write error: {}", e)))
    }

    /// Écrit des bytes bruts dans le PTY
    #[napi]
    pub async fn write_bytes(&self, data: Buffer) -> Result<()> {
        let pty = self.pty.lock().await;
        pty.write(&data)
            .await
            .map_err(|e| Error::from_reason(format!("Write error: {}", e)))
    }

    /// Vérifie si le process est toujours en cours d'exécution
    #[napi]
    pub async fn is_running(&self) -> bool {
        let pty = self.pty.lock().await;
        pty.is_running().await
    }

    /// Attend la fin du process et retourne le code de sortie
    #[napi]
    pub async fn wait(&self) -> Result<u32> {
        let pty = self.pty.lock().await;
        pty.wait()
            .await
            .map_err(|e| Error::from_reason(format!("Wait error: {}", e)))
    }

    /// Redimensionne le PTY
    #[napi]
    pub async fn resize(&self, rows: u32, cols: u32) -> Result<()> {
        let pty = self.pty.lock().await;
        pty.resize(PtySize {
            rows: rows as u16,
            cols: cols as u16,
        })
        .await
        .map_err(|e| Error::from_reason(format!("Resize error: {}", e)))
    }

    /// Termine le process
    #[napi]
    pub async fn kill(&self) -> Result<()> {
        let pty = self.pty.lock().await;
        pty.kill()
            .await
            .map_err(|e| Error::from_reason(format!("Kill error: {}", e)))
    }

    /// Retourne les statistiques de session
    #[napi]
    pub async fn stats(&self) -> SessionStats {
        let analyzer = self.analyzer.lock().await;
        let injector = self.injector.lock().await;

        SessionStats {
            total_tokens: analyzer.total_tokens() as u32,
            total_suggestions: injector.total_suggestions() as u32,
            total_build_errors: analyzer.total_errors() as u32,
            elapsed_ms: self.started_at.elapsed().as_millis() as u32,
        }
    }

    /// Active/désactive les suggestions
    #[napi]
    pub async fn set_suggestions_enabled(&self, enabled: bool) {
        let mut injector = self.injector.lock().await;
        injector.set_enabled(enabled);
    }

    /// Reset les compteurs de session
    #[napi]
    pub async fn reset_stats(&self) {
        let mut analyzer = self.analyzer.lock().await;
        let mut injector = self.injector.lock().await;
        analyzer.reset();
        injector.reset();
    }
}

/// Utilitaires exposés à Node.js
#[napi]
pub mod utils {
    use super::*;

    /// Estime le nombre de tokens pour un texte
    #[napi]
    pub fn estimate_tokens(text: String) -> u32 {
        TokenEstimator::new().estimate(&text) as u32
    }

    /// Vérifie si un fichier est un fichier code
    #[napi]
    pub fn is_code_file(path: String) -> bool {
        ContextInjector::is_code_file(&path)
    }

    /// Retire les codes ANSI d'un texte
    #[napi]
    pub fn strip_ansi(text: String) -> String {
        stream::PATTERNS.ansi_escape.replace_all(&text, "").to_string()
    }
}
