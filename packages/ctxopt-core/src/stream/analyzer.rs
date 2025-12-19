//! Analyseur de flux principal
//!
//! Détecte les patterns dans le flux stdout pour identifier
//! les opportunités d'optimisation de tokens.

use super::buffer::RingBuffer;
use super::patterns::{BuildTool, ContentType, PATTERNS};
use crate::tokens::TokenEstimator;

/// Seuil pour détecter un output volumineux (en caractères)
const LARGE_OUTPUT_THRESHOLD: usize = 5000;

/// Capacité du ring buffer (caractères)
const BUFFER_CAPACITY: usize = 50000;

/// Résultat d'analyse d'un chunk
#[derive(Debug, Clone)]
pub struct AnalysisResult {
    /// Types de contenu détectés
    pub content_types: Vec<ContentType>,

    /// Estimation de tokens pour ce chunk
    pub token_estimate: usize,

    /// Taille totale accumulée
    pub total_size: usize,

    /// Texte nettoyé (sans ANSI)
    pub clean_text: String,
}

/// Analyseur de flux stdout
pub struct StreamAnalyzer {
    /// Buffer pour l'historique
    buffer: RingBuffer,

    /// Estimateur de tokens
    token_estimator: TokenEstimator,

    /// Compteur de tokens total
    total_tokens: usize,

    /// Compteur d'erreurs détectées
    error_count: usize,
}

impl StreamAnalyzer {
    /// Crée un nouvel analyseur
    pub fn new() -> Self {
        Self {
            buffer: RingBuffer::new(BUFFER_CAPACITY),
            token_estimator: TokenEstimator::new(),
            total_tokens: 0,
            error_count: 0,
        }
    }

    /// Analyse un chunk de données et retourne les types détectés
    pub fn analyze(&mut self, chunk: &str) -> AnalysisResult {
        // Nettoyer les ANSI escape codes
        let clean_text = self.strip_ansi(chunk);

        // Ajouter au buffer
        self.buffer.push(&clean_text);

        // Estimer les tokens
        let token_estimate = self.token_estimator.estimate(&clean_text);
        self.total_tokens += token_estimate;

        // Détecter les patterns
        let mut content_types = Vec::new();

        // 1. Détecter les erreurs de build
        if let Some(build_error) = self.detect_build_errors(&clean_text) {
            content_types.push(build_error);
        }

        // 2. Détecter les lectures de fichiers
        if let Some(file_read) = self.detect_file_read(&clean_text) {
            content_types.push(file_read);
        }

        // 3. Détecter les outputs volumineux
        if self.buffer.len() > LARGE_OUTPUT_THRESHOLD {
            content_types.push(ContentType::LargeOutput {
                size: self.buffer.len(),
            });
        }

        // 4. Détecter le prompt ready
        if self.detect_prompt_ready(&clean_text) {
            content_types.push(ContentType::PromptReady);
            // Reset le buffer après un prompt
            self.buffer.clear();
        }

        // Si aucun pattern détecté
        if content_types.is_empty() {
            content_types.push(ContentType::Normal);
        }

        AnalysisResult {
            content_types,
            token_estimate,
            total_size: self.buffer.len(),
            clean_text,
        }
    }

    /// Supprime les codes ANSI escape
    fn strip_ansi(&self, text: &str) -> String {
        PATTERNS.ansi_escape.replace_all(text, "").to_string()
    }

    /// Détecte les erreurs de build
    fn detect_build_errors(&mut self, text: &str) -> Option<ContentType> {
        // TypeScript
        let ts_count = PATTERNS.typescript_error.find_iter(text).count();
        if ts_count > 0 {
            self.error_count += ts_count;
            return Some(ContentType::BuildError {
                error_count: ts_count,
                tool: BuildTool::TypeScript,
            });
        }

        // ESLint
        let eslint_count = PATTERNS.eslint_error.find_iter(text).count();
        if eslint_count > 0 {
            self.error_count += eslint_count;
            return Some(ContentType::BuildError {
                error_count: eslint_count,
                tool: BuildTool::ESLint,
            });
        }

        // Rust
        let rust_count = PATTERNS.rust_error.find_iter(text).count();
        if rust_count > 0 {
            self.error_count += rust_count;
            return Some(ContentType::BuildError {
                error_count: rust_count,
                tool: BuildTool::Rust,
            });
        }

        // Go
        let go_count = PATTERNS.go_error.find_iter(text).count();
        if go_count > 0 {
            self.error_count += go_count;
            return Some(ContentType::BuildError {
                error_count: go_count,
                tool: BuildTool::Go,
            });
        }

        // Python
        let python_count = PATTERNS.python_error.find_iter(text).count();
        if python_count > 0 {
            self.error_count += python_count;
            return Some(ContentType::BuildError {
                error_count: python_count,
                tool: BuildTool::Python,
            });
        }

        // Générique (dernière priorité)
        let generic_count = PATTERNS.generic_error.find_iter(text).count();
        if generic_count > 0 {
            self.error_count += generic_count;
            return Some(ContentType::BuildError {
                error_count: generic_count,
                tool: BuildTool::Generic,
            });
        }

        None
    }

    /// Détecte les lectures de fichiers
    fn detect_file_read(&self, text: &str) -> Option<ContentType> {
        if let Some(captures) = PATTERNS.file_read.captures(text) {
            if let Some(file_match) = captures.get(4) {
                return Some(ContentType::FileRead {
                    file_path: file_match.as_str().to_string(),
                });
            }
        }
        None
    }

    /// Détecte si le prompt est prêt
    fn detect_prompt_ready(&self, text: &str) -> bool {
        // Vérifier les derniers caractères du buffer
        let last_chars = self.buffer.last_n(50);
        PATTERNS.prompt_ready.is_match(&last_chars) || PATTERNS.prompt_ready.is_match(text)
    }

    /// Retourne le total de tokens estimés
    pub fn total_tokens(&self) -> usize {
        self.total_tokens
    }

    /// Retourne le total d'erreurs détectées
    pub fn total_errors(&self) -> usize {
        self.error_count
    }

    /// Retourne la taille actuelle du buffer (utilisé dans les tests)
    #[allow(dead_code)]
    pub fn buffer_size(&self) -> usize {
        self.buffer.len()
    }

    /// Reset les compteurs
    pub fn reset(&mut self) {
        self.buffer.clear();
        self.total_tokens = 0;
        self.error_count = 0;
    }
}

impl Default for StreamAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_typescript_error() {
        let mut analyzer = StreamAnalyzer::new();
        let result = analyzer.analyze("error TS2304: Cannot find name 'foo'");

        assert!(result.content_types.iter().any(|ct| matches!(
            ct,
            ContentType::BuildError {
                tool: BuildTool::TypeScript,
                ..
            }
        )));
    }

    #[test]
    fn test_detect_rust_error() {
        let mut analyzer = StreamAnalyzer::new();
        let result = analyzer.analyze("error[E0425]: cannot find value `foo`");

        assert!(result.content_types.iter().any(|ct| matches!(
            ct,
            ContentType::BuildError {
                tool: BuildTool::Rust,
                ..
            }
        )));
    }

    #[test]
    fn test_detect_python_error() {
        let mut analyzer = StreamAnalyzer::new();
        let result = analyzer.analyze("NameError: name 'foo' is not defined");

        assert!(result.content_types.iter().any(|ct| matches!(
            ct,
            ContentType::BuildError {
                tool: BuildTool::Python,
                ..
            }
        )));
    }

    #[test]
    fn test_detect_go_error() {
        let mut analyzer = StreamAnalyzer::new();
        let result = analyzer.analyze("undefined: foo");

        assert!(result.content_types.iter().any(|ct| matches!(
            ct,
            ContentType::BuildError {
                tool: BuildTool::Go,
                ..
            }
        )));
    }

    #[test]
    fn test_detect_file_read() {
        let mut analyzer = StreamAnalyzer::new();
        let result = analyzer.analyze("Reading file: src/main.ts");

        assert!(
            result
                .content_types
                .iter()
                .any(|ct| matches!(ct, ContentType::FileRead { .. }))
        );
    }

    #[test]
    fn test_detect_large_output() {
        let mut analyzer = StreamAnalyzer::new();

        // Générer un output volumineux
        let large_text = "x".repeat(6000);
        let result = analyzer.analyze(&large_text);

        assert!(
            result
                .content_types
                .iter()
                .any(|ct| matches!(ct, ContentType::LargeOutput { .. }))
        );
    }

    #[test]
    fn test_detect_prompt_ready() {
        let mut analyzer = StreamAnalyzer::new();
        let result = analyzer.analyze("some output ❯");

        assert!(
            result
                .content_types
                .iter()
                .any(|ct| matches!(ct, ContentType::PromptReady))
        );
    }

    #[test]
    fn test_strip_ansi() {
        let analyzer = StreamAnalyzer::new();
        let text_with_ansi = "\x1b[31mError\x1b[0m: something failed";
        let clean = analyzer.strip_ansi(text_with_ansi);

        assert_eq!(clean, "Error: something failed");
    }

    #[test]
    fn test_normal_content() {
        let mut analyzer = StreamAnalyzer::new();
        let result = analyzer.analyze("just some normal text");

        assert!(
            result
                .content_types
                .iter()
                .any(|ct| matches!(ct, ContentType::Normal))
        );
    }

    #[test]
    fn test_multiple_errors_count() {
        let mut analyzer = StreamAnalyzer::new();
        let text = "error TS2304: foo\nerror TS2304: bar\nerror TS2304: baz";
        let result = analyzer.analyze(text);

        if let Some(ContentType::BuildError { error_count, .. }) =
            result.content_types.iter().find(|ct| {
                matches!(
                    ct,
                    ContentType::BuildError {
                        tool: BuildTool::TypeScript,
                        ..
                    }
                )
            })
        {
            assert_eq!(*error_count, 3);
        } else {
            panic!("Expected TypeScript build error");
        }
    }

    #[test]
    fn test_total_tokens() {
        let mut analyzer = StreamAnalyzer::new();
        analyzer.analyze("hello world");
        analyzer.analyze("more text");

        assert!(analyzer.total_tokens() > 0);
    }

    #[test]
    fn test_reset() {
        let mut analyzer = StreamAnalyzer::new();
        analyzer.analyze("error TS2304: foo");
        analyzer.reset();

        assert_eq!(analyzer.total_tokens(), 0);
        assert_eq!(analyzer.total_errors(), 0);
        assert_eq!(analyzer.buffer_size(), 0);
    }
}
