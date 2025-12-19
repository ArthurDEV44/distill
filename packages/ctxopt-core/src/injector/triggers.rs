//! Logique de déclenchement des injections
//!
//! Détermine quand et quoi injecter dans le stdin basé sur
//! le ContentType détecté par le StreamAnalyzer.

use super::templates::{Suggestion, SuggestionType};
use crate::stream::patterns::ContentType;
use std::time::{Duration, Instant};

/// Intervalle minimum entre deux injections (en secondes)
const MIN_INJECTION_INTERVAL_SECS: u64 = 5;

/// Nombre maximum de rappels prompt par session
const MAX_PROMPT_REMINDERS: usize = 3;

/// Contexte d'injection avec état
pub struct ContextInjector {
    /// Dernier timestamp d'injection
    last_injection: Instant,

    /// Intervalle minimum entre injections
    min_interval: Duration,

    /// Compteur de suggestions générées
    suggestions_count: usize,

    /// Compteur de rappels prompt
    prompt_reminder_count: usize,

    /// Suggestions activées
    enabled: bool,

    /// Historique des types injectés (pour éviter répétitions)
    recent_types: Vec<SuggestionType>,
}

impl ContextInjector {
    /// Crée un nouvel injecteur
    pub fn new() -> Self {
        Self {
            // Permet une injection immédiate au démarrage
            last_injection: Instant::now() - Duration::from_secs(60),
            min_interval: Duration::from_secs(MIN_INJECTION_INTERVAL_SECS),
            suggestions_count: 0,
            prompt_reminder_count: 0,
            enabled: true,
            recent_types: Vec::new(),
        }
    }

    /// Crée un injecteur avec intervalle personnalisé (utilisé dans les tests)
    #[allow(dead_code)]
    pub fn with_interval(interval_ms: u64) -> Self {
        let mut injector = Self::new();
        injector.min_interval = Duration::from_millis(interval_ms);
        injector
    }

    /// Active/désactive les suggestions
    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
    }

    /// Retourne si les suggestions sont activées (utilisé dans les tests)
    #[allow(dead_code)]
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Vérifie si une injection est autorisée (throttling)
    fn can_inject(&self) -> bool {
        self.enabled && self.last_injection.elapsed() >= self.min_interval
    }

    /// Vérifie si ce type a été récemment suggéré (3 derniers)
    fn was_recently_suggested(&self, suggestion_type: &SuggestionType) -> bool {
        self.recent_types
            .iter()
            .rev()
            .take(3)
            .any(|t| t == suggestion_type)
    }

    /// Évalue si une injection doit être faite pour le ContentType donné
    pub fn should_inject(&self, content_type: &ContentType) -> bool {
        if !self.can_inject() {
            return false;
        }

        match content_type {
            ContentType::BuildError { error_count, .. } => {
                // Injecter si plus de 3 erreurs et pas récemment suggéré
                *error_count >= 3 && !self.was_recently_suggested(&SuggestionType::BuildErrors)
            }
            ContentType::LargeOutput { size } => {
                // Injecter si > 10KB et pas récemment suggéré
                *size > 10000 && !self.was_recently_suggested(&SuggestionType::LargeOutput)
            }
            ContentType::FileRead { file_path } => {
                // Injecter seulement si c'est un fichier code et pas récemment suggéré
                Self::is_code_file(file_path)
                    && !self.was_recently_suggested(&SuggestionType::FileRead)
            }
            ContentType::PromptReady => {
                // Limiter les rappels prompt à MAX_PROMPT_REMINDERS par session
                self.prompt_reminder_count < MAX_PROMPT_REMINDERS
            }
            ContentType::Normal => false,
        }
    }

    /// Génère une suggestion pour le ContentType donné
    pub fn generate_suggestion(&mut self, content_type: &ContentType) -> Option<Suggestion> {
        if !self.should_inject(content_type) {
            return None;
        }

        let suggestion = match content_type {
            ContentType::BuildError { error_count, tool } => {
                Some(Suggestion::build_errors(*error_count, *tool))
            }
            ContentType::LargeOutput { size } => Some(Suggestion::large_output(*size)),
            ContentType::FileRead { file_path } => {
                // Seulement pour les fichiers code
                if Self::is_code_file(file_path) {
                    Some(Suggestion::file_read(file_path))
                } else {
                    None
                }
            }
            ContentType::PromptReady => {
                self.prompt_reminder_count += 1;
                Some(Suggestion::prompt_reminder())
            }
            ContentType::Normal => None,
        };

        if let Some(ref s) = suggestion {
            self.last_injection = Instant::now();
            self.suggestions_count += 1;
            self.recent_types.push(s.suggestion_type.clone());

            // Garder seulement les 10 derniers types
            if self.recent_types.len() > 10 {
                self.recent_types.remove(0);
            }
        }

        suggestion
    }

    /// Vérifie si le fichier est un fichier code
    pub fn is_code_file(path: &str) -> bool {
        let code_extensions = [
            ".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
            ".cs", ".rb", ".php", ".swift", ".kt", ".scala", ".ex", ".exs",
        ];
        code_extensions.iter().any(|ext| path.ends_with(ext))
    }

    /// Retourne le nombre total de suggestions générées
    pub fn total_suggestions(&self) -> usize {
        self.suggestions_count
    }

    /// Retourne le nombre de prompt reminders utilisés (utilisé dans les tests)
    #[allow(dead_code)]
    pub fn prompt_reminders_used(&self) -> usize {
        self.prompt_reminder_count
    }

    /// Reset les compteurs (nouvelle session)
    pub fn reset(&mut self) {
        self.suggestions_count = 0;
        self.prompt_reminder_count = 0;
        self.recent_types.clear();
        self.last_injection = Instant::now() - Duration::from_secs(60);
    }

    /// Retourne le temps restant avant prochaine injection possible (en ms, utilisé dans les tests)
    #[allow(dead_code)]
    pub fn time_until_next_injection(&self) -> u64 {
        let elapsed = self.last_injection.elapsed();
        if elapsed >= self.min_interval {
            0
        } else {
            (self.min_interval - elapsed).as_millis() as u64
        }
    }
}

impl Default for ContextInjector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stream::patterns::BuildTool;

    #[test]
    fn test_should_inject_build_errors() {
        let injector = ContextInjector::new();

        // Moins de 3 erreurs: pas d'injection
        assert!(!injector.should_inject(&ContentType::BuildError {
            error_count: 2,
            tool: BuildTool::TypeScript,
        }));

        // 3+ erreurs: injection
        assert!(injector.should_inject(&ContentType::BuildError {
            error_count: 5,
            tool: BuildTool::TypeScript,
        }));
    }

    #[test]
    fn test_should_inject_large_output() {
        let injector = ContextInjector::new();

        // Petit output: pas d'injection
        assert!(!injector.should_inject(&ContentType::LargeOutput { size: 5000 }));

        // Grand output: injection
        assert!(injector.should_inject(&ContentType::LargeOutput { size: 15000 }));
    }

    #[test]
    fn test_should_inject_file_read() {
        let injector = ContextInjector::new();

        // Fichier code: injection
        assert!(injector.should_inject(&ContentType::FileRead {
            file_path: "src/main.ts".to_string(),
        }));

        // Fichier non-code: pas d'injection
        assert!(!injector.should_inject(&ContentType::FileRead {
            file_path: "README.md".to_string(),
        }));
    }

    #[test]
    fn test_throttling() {
        let mut injector = ContextInjector::with_interval(100); // 100ms pour test

        let content = ContentType::BuildError {
            error_count: 10,
            tool: BuildTool::Rust,
        };

        // Première injection OK
        assert!(injector.generate_suggestion(&content).is_some());

        // Deuxième immédiate: bloquée par throttle
        assert!(injector.generate_suggestion(&content).is_none());

        // Après attente: bloquée par recent_types
        std::thread::sleep(Duration::from_millis(150));
        assert!(injector.generate_suggestion(&content).is_none());

        // Différent type après attente: OK
        let other_content = ContentType::LargeOutput { size: 50000 };
        assert!(injector.generate_suggestion(&other_content).is_some());
    }

    #[test]
    fn test_recent_types_blocking() {
        let mut injector = ContextInjector::with_interval(10); // 10ms pour test rapide

        let content = ContentType::BuildError {
            error_count: 10,
            tool: BuildTool::TypeScript,
        };

        // Première injection OK
        assert!(injector.generate_suggestion(&content).is_some());
        std::thread::sleep(Duration::from_millis(20));

        // Même type: bloqué par recent_types
        assert!(injector.generate_suggestion(&content).is_none());

        // Type différent: OK
        let large = ContentType::LargeOutput { size: 20000 };
        assert!(injector.generate_suggestion(&large).is_some());
    }

    #[test]
    fn test_is_code_file() {
        assert!(ContextInjector::is_code_file("src/main.ts"));
        assert!(ContextInjector::is_code_file("app.py"));
        assert!(ContextInjector::is_code_file("lib.rs"));
        assert!(ContextInjector::is_code_file("main.go"));
        assert!(ContextInjector::is_code_file("App.java"));
        assert!(!ContextInjector::is_code_file("README.md"));
        assert!(!ContextInjector::is_code_file("config.json"));
        assert!(!ContextInjector::is_code_file("package.yaml"));
    }

    #[test]
    fn test_prompt_reminder_limit() {
        let mut injector = ContextInjector::with_interval(10);

        // Les 3 premiers OK
        for i in 0..3 {
            // Reset throttle pour test
            injector.last_injection = Instant::now() - Duration::from_secs(60);
            let suggestion = injector.generate_suggestion(&ContentType::PromptReady);
            assert!(suggestion.is_some(), "Reminder {} should be allowed", i + 1);
        }

        // Le 4ème bloqué
        injector.last_injection = Instant::now() - Duration::from_secs(60);
        assert!(injector
            .generate_suggestion(&ContentType::PromptReady)
            .is_none());
        assert_eq!(injector.prompt_reminders_used(), 3);
    }

    #[test]
    fn test_set_enabled() {
        let mut injector = ContextInjector::new();
        assert!(injector.is_enabled());

        injector.set_enabled(false);
        assert!(!injector.is_enabled());

        // Avec disabled, should_inject retourne toujours false
        assert!(!injector.should_inject(&ContentType::BuildError {
            error_count: 100,
            tool: BuildTool::TypeScript,
        }));
    }

    #[test]
    fn test_reset() {
        let mut injector = ContextInjector::with_interval(10);

        // Générer quelques suggestions
        injector.generate_suggestion(&ContentType::PromptReady);
        injector.last_injection = Instant::now() - Duration::from_secs(60);
        injector.generate_suggestion(&ContentType::LargeOutput { size: 20000 });

        assert!(injector.total_suggestions() > 0);
        assert!(injector.prompt_reminders_used() > 0);

        // Reset
        injector.reset();

        assert_eq!(injector.total_suggestions(), 0);
        assert_eq!(injector.prompt_reminders_used(), 0);
    }

    #[test]
    fn test_time_until_next_injection() {
        let mut injector = ContextInjector::with_interval(1000); // 1 seconde

        // Au démarrage, peut injecter immédiatement
        assert_eq!(injector.time_until_next_injection(), 0);

        // Après injection
        injector.last_injection = Instant::now();
        let time_until = injector.time_until_next_injection();
        assert!(time_until > 0);
        assert!(time_until <= 1000);
    }

    #[test]
    fn test_normal_content_never_injects() {
        let injector = ContextInjector::new();
        assert!(!injector.should_inject(&ContentType::Normal));
    }
}
