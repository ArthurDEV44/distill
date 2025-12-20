//! PTY management avec portable-pty
//!
//! Ce module gère la création et manipulation des pseudo-terminaux
//! cross-platform (Unix PTY, Windows ConPTY).

pub(crate) mod manager;

// enter_raw_mode doit rester pub car utilisé dans lib.rs #[napi]
pub use manager::enter_raw_mode;
pub(crate) use manager::{PtyManager, PtySize};
#[cfg(test)]
pub(crate) use manager::PtyError;

#[cfg(unix)]
pub(crate) use manager::RawModeGuard;
