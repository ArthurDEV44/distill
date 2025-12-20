//! Module de tests

// PTY tests only run when not in bench mode (PTY module is excluded)
#[cfg(all(test, not(feature = "bench")))]
mod pty_tests;

#[cfg(test)]
mod stream_tests;

#[cfg(test)]
mod injector_tests;
