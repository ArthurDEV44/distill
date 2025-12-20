//! Stream analysis pour détecter les patterns
//!
//! Analyse le stdout du PTY pour identifier:
//! - Erreurs de build
//! - Lectures de fichiers
//! - Outputs volumineux
//! - Prompts ready

pub(crate) mod analyzer;
pub(crate) mod buffer;
pub(crate) mod patterns;

pub(crate) use analyzer::StreamAnalyzer;
pub(crate) use patterns::PATTERNS;
