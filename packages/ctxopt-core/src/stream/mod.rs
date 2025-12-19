//! Stream analysis pour détecter les patterns
//!
//! Analyse le stdout du PTY pour identifier:
//! - Erreurs de build
//! - Lectures de fichiers
//! - Outputs volumineux
//! - Prompts ready

pub mod analyzer;
pub mod buffer;
pub mod patterns;

pub use analyzer::StreamAnalyzer;
pub use patterns::PATTERNS;
