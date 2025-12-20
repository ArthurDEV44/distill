//! Context injection via stdin
//!
//! Injecte des suggestions dans le stdin du PTY
//! quand des patterns optimisables sont détectés.

pub(crate) mod templates;
pub(crate) mod triggers;

pub(crate) use triggers::ContextInjector;
