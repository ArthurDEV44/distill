//! Templates de suggestions pour chaque type de contenu
//!
//! Génère des messages colorés ANSI pour suggérer les outils MCP
//! en fonction du type de contenu détecté.

use crate::stream::patterns::BuildTool;

/// Type de suggestion
#[derive(Debug, Clone, PartialEq)]
pub enum SuggestionType {
    /// Erreurs de build détectées
    BuildErrors,
    /// Output volumineux
    LargeOutput,
    /// Prompt ready (rappel léger)
    PromptReminder,
    /// Lecture de fichier
    FileRead,
}

/// Suggestion générée
#[derive(Debug, Clone)]
pub struct Suggestion {
    /// Type de suggestion
    pub suggestion_type: SuggestionType,

    /// Message à afficher (pas injecté dans stdin)
    pub display_message: String,
}

impl Suggestion {
    /// Crée une suggestion pour erreurs de build
    pub fn build_errors(error_count: usize, tool: BuildTool) -> Self {
        Self {
            suggestion_type: SuggestionType::BuildErrors,
            display_message: format!(
                "\x1b[33m[ctxopt]\x1b[0m {} {} errors detected. \
                 Use \x1b[36mmcp__ctxopt__auto_optimize\x1b[0m to compress (95%+ savings).",
                error_count,
                tool.as_str()
            ),
        }
    }

    /// Crée une suggestion pour output volumineux
    pub fn large_output(size: usize) -> Self {
        let size_kb = size / 1024;
        Self {
            suggestion_type: SuggestionType::LargeOutput,
            display_message: format!(
                "\x1b[33m[ctxopt]\x1b[0m Large output (~{}KB). \
                 Use \x1b[36mmcp__ctxopt__compress_context\x1b[0m for 40-60% savings.",
                size_kb
            ),
        }
    }

    /// Crée un rappel après prompt ready
    pub fn prompt_reminder() -> Self {
        Self {
            suggestion_type: SuggestionType::PromptReminder,
            display_message:
                "\x1b[90m[ctxopt] MCP tools: smart_file_read, auto_optimize, compress_context\x1b[0m"
                    .to_string(),
        }
    }

    /// Crée une suggestion pour lecture de fichier
    pub fn file_read(file_path: &str) -> Self {
        Self {
            suggestion_type: SuggestionType::FileRead,
            display_message: format!(
                "\x1b[33m[ctxopt]\x1b[0m Reading {}. \
                 Consider \x1b[36mmcp__ctxopt__smart_file_read\x1b[0m for 50-70% savings.",
                file_path
            ),
        }
    }

    /// Formatte le message pour affichage terminal
    pub fn format_for_display(&self) -> String {
        format!("\n{}\n", self.display_message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_errors_suggestion() {
        let suggestion = Suggestion::build_errors(42, BuildTool::TypeScript);
        assert_eq!(suggestion.suggestion_type, SuggestionType::BuildErrors);
        assert!(suggestion.display_message.contains("42"));
        assert!(suggestion.display_message.contains("tsc"));
    }

    #[test]
    fn test_large_output_suggestion() {
        let suggestion = Suggestion::large_output(10240);
        assert_eq!(suggestion.suggestion_type, SuggestionType::LargeOutput);
        assert!(suggestion.display_message.contains("10KB"));
    }

    #[test]
    fn test_prompt_reminder_suggestion() {
        let suggestion = Suggestion::prompt_reminder();
        assert_eq!(suggestion.suggestion_type, SuggestionType::PromptReminder);
        assert!(suggestion.display_message.contains("smart_file_read"));
    }

    #[test]
    fn test_file_read_suggestion() {
        let suggestion = Suggestion::file_read("src/main.ts");
        assert_eq!(suggestion.suggestion_type, SuggestionType::FileRead);
        assert!(suggestion.display_message.contains("src/main.ts"));
    }

    #[test]
    fn test_format_for_display() {
        let suggestion = Suggestion::prompt_reminder();
        let formatted = suggestion.format_for_display();
        assert!(formatted.starts_with('\n'));
        assert!(formatted.ends_with('\n'));
    }
}
