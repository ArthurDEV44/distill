//! Définition des patterns et types de contenu détectés
//!
//! Patterns regex compilés une seule fois avec once_cell::Lazy
//! pour détecter les différents types de contenu dans le stream.

use once_cell::sync::Lazy;
use regex::Regex;

/// Types de contenu détectés dans le flux
#[derive(Debug, Clone, PartialEq)]
pub enum ContentType {
    /// Erreurs de build détectées
    BuildError {
        /// Nombre d'erreurs détectées
        error_count: usize,
        /// Type de build tool (tsc, eslint, cargo, go, python)
        tool: BuildTool,
    },

    /// Lecture de fichier détectée
    FileRead {
        /// Chemin du fichier lu
        file_path: String,
    },

    /// Output volumineux (> threshold)
    LargeOutput {
        /// Taille en caractères
        size: usize,
    },

    /// Claude est prêt pour une entrée
    PromptReady,

    /// Contenu normal (pas de pattern détecté)
    Normal,
}

/// Outils de build reconnus
#[derive(Debug, Clone, PartialEq, Copy)]
pub enum BuildTool {
    TypeScript, // tsc, ts-node
    ESLint,     // eslint
    Rust,       // cargo, rustc
    Go,         // go build
    Python,     // python, pytest
    #[allow(dead_code)] // TODO: implement webpack pattern detection (O05)
    Webpack,    // webpack
    #[allow(dead_code)] // TODO: implement vite pattern detection (O05)
    Vite,       // vite
    Generic,    // autre
}

impl BuildTool {
    pub fn as_str(&self) -> &'static str {
        match self {
            BuildTool::TypeScript => "tsc",
            BuildTool::ESLint => "eslint",
            BuildTool::Rust => "cargo",
            BuildTool::Go => "go",
            BuildTool::Python => "python",
            BuildTool::Webpack => "webpack",
            BuildTool::Vite => "vite",
            BuildTool::Generic => "generic",
        }
    }
}

/// Patterns regex compilés une seule fois
pub static PATTERNS: Lazy<Patterns> = Lazy::new(Patterns::new);

/// Structure contenant tous les patterns regex pré-compilés
pub struct Patterns {
    /// Erreurs TypeScript: TS2304, TS7006, etc.
    pub typescript_error: Regex,

    /// Erreurs ESLint
    pub eslint_error: Regex,

    /// Erreurs Rust/Cargo
    pub rust_error: Regex,

    /// Erreurs Go
    pub go_error: Regex,

    /// Erreurs Python
    pub python_error: Regex,

    /// Pattern générique d'erreur
    pub generic_error: Regex,

    /// Lecture de fichier (Read tool, file_path)
    pub file_read: Regex,

    /// Prompt ready (❯, >, $)
    pub prompt_ready: Regex,

    /// ANSI escape codes (pour stripping)
    pub ansi_escape: Regex,
}

impl Patterns {
    pub fn new() -> Self {
        Self {
            // TypeScript: error TS2304: Cannot find name 'foo'
            typescript_error: Regex::new(
                r"(?i)error\s+TS\d{4}:|Cannot find (name|module)|has no exported member",
            )
            .unwrap(),

            // ESLint: error  'foo' is not defined  no-undef
            eslint_error: Regex::new(r"(?i)\d+:\d+\s+(error|warning)\s+.+\s+\S+/\S+").unwrap(),

            // Rust: error[E0425]: cannot find value `foo`
            rust_error: Regex::new(r"(?i)error\[E\d{4}\]:|cannot find (value|type|crate)").unwrap(),

            // Go: undefined: foo
            go_error: Regex::new(r"(?i)undefined:|cannot find package|syntax error").unwrap(),

            // Python: NameError, ImportError, SyntaxError
            python_error: Regex::new(
                r"(?i)(NameError|ImportError|SyntaxError|ModuleNotFoundError|TypeError):",
            )
            .unwrap(),

            // Générique: error, failed, cannot
            generic_error: Regex::new(
                r"(?i)(^|\s)(error|failed|cannot|unexpected|compilation failed)(\s|:)",
            )
            .unwrap(),

            // File read patterns
            file_read: Regex::new(
                r#"(?i)(Read(ing)?(\s+file)?|file_path)[:\s]+["']?([^\s"']+\.(ts|js|tsx|jsx|py|rs|go|java|c|cpp|h|hpp|md|json|yaml|yml|toml))["']?"#,
            )
            .unwrap(),

            // Prompt ready (fin de ligne avec prompt shell)
            prompt_ready: Regex::new(r"(❯|>\s*$|\$\s*$|claude\s*>\s*$)").unwrap(),

            // ANSI escape sequences
            ansi_escape: Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07").unwrap(),
        }
    }
}

impl Default for Patterns {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_typescript_pattern() {
        assert!(PATTERNS
            .typescript_error
            .is_match("error TS2304: Cannot find name 'foo'"));
        assert!(PATTERNS
            .typescript_error
            .is_match("Cannot find module 'react'"));
        assert!(PATTERNS
            .typescript_error
            .is_match("has no exported member 'useState'"));
    }

    #[test]
    fn test_rust_pattern() {
        assert!(PATTERNS
            .rust_error
            .is_match("error[E0425]: cannot find value `foo`"));
        assert!(PATTERNS.rust_error.is_match("cannot find type `MyType`"));
        assert!(PATTERNS.rust_error.is_match("cannot find crate `serde`"));
    }

    #[test]
    fn test_python_pattern() {
        assert!(PATTERNS
            .python_error
            .is_match("NameError: name 'foo' is not defined"));
        assert!(PATTERNS
            .python_error
            .is_match("ImportError: No module named 'requests'"));
        assert!(PATTERNS
            .python_error
            .is_match("SyntaxError: invalid syntax"));
    }

    #[test]
    fn test_go_pattern() {
        assert!(PATTERNS.go_error.is_match("undefined: foo"));
        assert!(PATTERNS
            .go_error
            .is_match("cannot find package \"fmt\""));
        assert!(PATTERNS.go_error.is_match("syntax error: unexpected"));
    }

    #[test]
    fn test_file_read_pattern() {
        let caps = PATTERNS.file_read.captures("Reading file: src/main.ts");
        assert!(caps.is_some());
        let caps = caps.unwrap();
        assert_eq!(caps.get(4).unwrap().as_str(), "src/main.ts");
    }

    #[test]
    fn test_prompt_ready_pattern() {
        assert!(PATTERNS.prompt_ready.is_match("❯"));
        assert!(PATTERNS.prompt_ready.is_match("some output >"));
        assert!(PATTERNS.prompt_ready.is_match("user@host:~$"));
    }

    #[test]
    fn test_ansi_escape_pattern() {
        let text = "\x1b[31mError\x1b[0m: something failed";
        let clean = PATTERNS.ansi_escape.replace_all(text, "");
        assert_eq!(clean, "Error: something failed");
    }

    #[test]
    fn test_build_tool_as_str() {
        assert_eq!(BuildTool::TypeScript.as_str(), "tsc");
        assert_eq!(BuildTool::Rust.as_str(), "cargo");
        assert_eq!(BuildTool::Python.as_str(), "python");
    }
}
