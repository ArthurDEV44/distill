//! PTY management avec portable-pty
//!
//! Ce module gère la création et manipulation des pseudo-terminaux
//! cross-platform (Unix PTY, Windows ConPTY).

pub mod manager;

pub use manager::{enter_raw_mode, PtyManager, PtySize};

#[cfg(unix)]
pub use manager::RawModeGuard;
