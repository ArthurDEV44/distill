//! Context injection via stdin
//!
//! Injecte des suggestions dans le stdin du PTY
//! quand des patterns optimisables sont détectés.

pub mod templates;
pub mod triggers;

pub use triggers::ContextInjector;
