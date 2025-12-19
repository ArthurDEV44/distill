//! PtyManager implementation
//!
//! Gère le cycle de vie du PTY et la communication avec le process enfant.

use portable_pty::{
    native_pty_system, Child, CommandBuilder, MasterPty, PtySize as PortablePtySize,
};
use std::io::{Read, Write};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Mutex;

// Unix-specific imports for raw mode
#[cfg(unix)]
use nix::sys::termios::{self, InputFlags, LocalFlags, OutputFlags, SetArg, Termios};
#[cfg(unix)]
use std::os::unix::io::{BorrowedFd, RawFd};

/// Erreurs du module PTY
#[derive(Error, Debug)]
#[allow(clippy::enum_variant_names)]
pub enum PtyError {
    #[error("Failed to create PTY: {0}")]
    CreateError(String),

    #[error("Failed to spawn command: {0}")]
    SpawnError(String),

    #[error("Failed to write to PTY: {0}")]
    WriteError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Failed to configure terminal: {0}")]
    TermiosError(String),
}

/// Guard that restores terminal settings on drop
#[cfg(unix)]
pub struct RawModeGuard {
    fd: RawFd,
    original: Termios,
}

#[cfg(unix)]
impl RawModeGuard {
    /// Enter raw mode on the given file descriptor
    /// Returns a guard that will restore the original settings on drop
    pub fn new(fd: RawFd) -> Result<Self, PtyError> {
        // SAFETY: We're borrowing stdin which is valid for the lifetime of this function
        let borrowed_fd = unsafe { BorrowedFd::borrow_raw(fd) };

        let original = termios::tcgetattr(borrowed_fd)
            .map_err(|e| PtyError::TermiosError(format!("tcgetattr failed: {}", e)))?;

        let mut raw = original.clone();

        // Disable echo and canonical mode (cfmakeraw equivalent)
        raw.local_flags.remove(LocalFlags::ECHO); // Don't echo input
        raw.local_flags.remove(LocalFlags::ECHOE); // Don't echo erase
        raw.local_flags.remove(LocalFlags::ECHOK); // Don't echo kill
        raw.local_flags.remove(LocalFlags::ECHONL); // Don't echo newline
        raw.local_flags.remove(LocalFlags::ICANON); // Disable canonical mode
        raw.local_flags.remove(LocalFlags::ISIG); // Don't send signals
        raw.local_flags.remove(LocalFlags::IEXTEN); // Disable extended functions

        // Disable output processing
        raw.output_flags.remove(OutputFlags::OPOST); // Don't post-process output

        // Disable input processing
        raw.input_flags.remove(InputFlags::ICRNL); // Don't convert CR to NL
        raw.input_flags.remove(InputFlags::INLCR); // Don't convert NL to CR
        raw.input_flags.remove(InputFlags::IXON); // Disable XON/XOFF flow control
        raw.input_flags.remove(InputFlags::IXOFF);
        raw.input_flags.remove(InputFlags::IGNBRK);
        raw.input_flags.remove(InputFlags::BRKINT);
        raw.input_flags.remove(InputFlags::PARMRK);
        raw.input_flags.remove(InputFlags::ISTRIP);
        raw.input_flags.remove(InputFlags::INPCK);

        termios::tcsetattr(borrowed_fd, SetArg::TCSANOW, &raw)
            .map_err(|e| PtyError::TermiosError(format!("tcsetattr failed: {}", e)))?;

        Ok(Self { fd, original })
    }
}

#[cfg(unix)]
impl Drop for RawModeGuard {
    fn drop(&mut self) {
        // SAFETY: We're borrowing the fd we stored which should still be valid (stdin)
        let borrowed_fd = unsafe { BorrowedFd::borrow_raw(self.fd) };
        // Restore original terminal settings
        let _ = termios::tcsetattr(borrowed_fd, SetArg::TCSANOW, &self.original);
    }
}

/// Enter raw mode on stdin (Unix only)
/// Returns a guard that will restore settings on drop
#[cfg(unix)]
pub fn enter_raw_mode() -> Result<RawModeGuard, PtyError> {
    RawModeGuard::new(libc::STDIN_FILENO)
}

/// No-op on non-Unix platforms
#[cfg(not(unix))]
pub fn enter_raw_mode() -> Result<(), PtyError> {
    Ok(())
}

/// Taille du PTY en lignes/colonnes
#[derive(Debug, Clone, Copy)]
pub struct PtySize {
    pub rows: u16,
    pub cols: u16,
}

impl Default for PtySize {
    fn default() -> Self {
        Self { rows: 24, cols: 80 }
    }
}

impl From<PtySize> for PortablePtySize {
    fn from(size: PtySize) -> Self {
        PortablePtySize {
            rows: size.rows,
            cols: size.cols,
            pixel_width: 0,
            pixel_height: 0,
        }
    }
}

/// Gestionnaire de PTY pour spawner et contrôler Claude Code
pub struct PtyManager {
    /// Handle vers le master PTY
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,

    /// Writer pour envoyer des données au PTY
    writer: Arc<Mutex<Box<dyn Write + Send>>>,

    /// Channel receiver pour les données lues du PTY
    read_rx: Arc<Mutex<tokio::sync::mpsc::Receiver<Vec<u8>>>>,

    /// Child process (Claude Code)
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

impl PtyManager {
    /// Crée un nouveau PTY et spawne la commande spécifiée
    ///
    /// # Arguments
    /// * `command` - Commande à exécuter (ex: "claude")
    /// * `args` - Arguments de la commande
    /// * `size` - Taille du terminal (rows, cols)
    ///
    /// # Example
    /// ```ignore
    /// let pty = PtyManager::new("claude", &[], PtySize::default())?;
    /// ```
    pub fn new(command: &str, args: &[&str], size: PtySize) -> Result<Self, PtyError> {
        // Obtenir le système PTY natif (Unix ou Windows ConPTY)
        let pty_system = native_pty_system();

        // Créer la paire master/slave
        let pair = pty_system
            .openpty(size.into())
            .map_err(|e| PtyError::CreateError(e.to_string()))?;

        // Construire la commande
        let mut cmd = CommandBuilder::new(command);
        for arg in args {
            cmd.arg(*arg);
        }

        // Hériter les variables d'environnement
        for (key, value) in std::env::vars() {
            cmd.env(key, value);
        }

        // Définir le répertoire de travail courant
        if let Ok(cwd) = std::env::current_dir() {
            cmd.cwd(cwd);
        }

        // Spawner le process dans le slave PTY
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::SpawnError(e.to_string()))?;

        // Obtenir writer et reader du master
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::CreateError(e.to_string()))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::CreateError(e.to_string()))?;

        // Créer un channel pour la communication avec le thread de lecture
        let (read_tx, read_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);

        // Spawner un thread dédié pour la lecture du PTY
        std::thread::spawn(move || {
            let mut buffer = vec![0u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        // EOF - le PTY est fermé
                        break;
                    }
                    Ok(n) => {
                        let data = buffer[..n].to_vec();
                        // Envoyer les données via le channel (ignore si le receiver est fermé)
                        if read_tx.blocking_send(data).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        // Erreur de lecture - logger et continuer ou break selon le type
                        if e.kind() != std::io::ErrorKind::Interrupted {
                            break;
                        }
                    }
                }
            }
        });

        Ok(Self {
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            read_rx: Arc::new(Mutex::new(read_rx)),
            child: Arc::new(Mutex::new(child)),
        })
    }

    /// Lecture asynchrone avec timeout court
    ///
    /// Attend les données pendant un court délai puis retourne.
    pub async fn read_async(&self) -> Result<Vec<u8>, PtyError> {
        let mut rx = self.read_rx.lock().await;

        // Collecter toutes les données disponibles avec un petit timeout
        let mut all_data = Vec::new();

        // D'abord, récupérer tout ce qui est déjà disponible
        while let Ok(data) = rx.try_recv() {
            all_data.extend(data);
        }

        // Si on a déjà des données, les retourner immédiatement
        if !all_data.is_empty() {
            return Ok(all_data);
        }

        // Sinon, attendre un peu pour de nouvelles données (max 10ms)
        match tokio::time::timeout(
            std::time::Duration::from_millis(10),
            rx.recv()
        ).await {
            Ok(Some(data)) => Ok(data),
            Ok(None) => Ok(Vec::new()), // Channel fermé
            Err(_) => Ok(Vec::new()),   // Timeout
        }
    }

    /// Écrit des données dans le PTY (stdin du child)
    pub async fn write(&self, data: &[u8]) -> Result<(), PtyError> {
        let mut writer = self.writer.lock().await;
        writer
            .write_all(data)
            .map_err(|e| PtyError::WriteError(e.to_string()))?;
        writer
            .flush()
            .map_err(|e| PtyError::WriteError(e.to_string()))?;
        Ok(())
    }

    /// Écrit une chaîne de caractères dans le PTY
    pub async fn write_str(&self, data: &str) -> Result<(), PtyError> {
        self.write(data.as_bytes()).await
    }

    /// Vérifie si le child process est toujours en cours d'exécution
    pub async fn is_running(&self) -> bool {
        let mut child = self.child.lock().await;
        // try_wait retourne None si le process tourne encore
        matches!(child.try_wait(), Ok(None))
    }

    /// Attend la fin du child process et retourne le code de sortie
    pub async fn wait(&self) -> Result<u32, PtyError> {
        let mut child = self.child.lock().await;
        let status = child
            .wait()
            .map_err(|e| PtyError::SpawnError(e.to_string()))?;
        Ok(status.exit_code())
    }

    /// Redimensionne le PTY
    pub async fn resize(&self, new_size: PtySize) -> Result<(), PtyError> {
        let master = self.master.lock().await;
        master
            .resize(new_size.into())
            .map_err(|e| PtyError::CreateError(e.to_string()))?;
        Ok(())
    }

    /// Termine le child process
    pub async fn kill(&self) -> Result<(), PtyError> {
        let mut child = self.child.lock().await;
        child
            .kill()
            .map_err(|e| PtyError::SpawnError(e.to_string()))?;
        Ok(())
    }
}

// Tests unitaires
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_pty_spawn_echo() {
        // Spawner un simple echo
        let pty =
            PtyManager::new("echo", &["hello"], PtySize::default()).expect("Failed to create PTY");

        // Attendre un peu pour que le process démarre
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Lire la sortie
        let output = pty.read_async().await.expect("Failed to read");
        let output_str = String::from_utf8_lossy(&output);

        assert!(output_str.contains("hello"));
    }

    #[tokio::test]
    async fn test_pty_write_read() {
        // Spawner cat qui echo l'input
        let pty =
            PtyManager::new("cat", &[], PtySize::default()).expect("Failed to create PTY");

        // Écrire quelque chose
        pty.write_str("test input\n")
            .await
            .expect("Failed to write");

        // Attendre et lire
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let output = pty.read_async().await.expect("Failed to read");
        let output_str = String::from_utf8_lossy(&output);

        assert!(output_str.contains("test input"));

        // Terminer cat
        pty.kill().await.ok();
    }

    #[tokio::test]
    async fn test_pty_is_running() {
        let pty = PtyManager::new("sleep", &["1"], PtySize::default()).expect("Failed to create PTY");

        assert!(pty.is_running().await);

        // Attendre que sleep finisse
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        assert!(!pty.is_running().await);
    }

    #[tokio::test]
    async fn test_pty_size_default() {
        let size = PtySize::default();
        assert_eq!(size.rows, 24);
        assert_eq!(size.cols, 80);
    }

    #[tokio::test]
    async fn test_pty_read_async() {
        let pty =
            PtyManager::new("echo", &["async test"], PtySize::default()).expect("Failed to create PTY");

        // Attendre un peu
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Lire avec read_async
        let output = pty.read_async().await.expect("Failed to read async");
        let output_str = String::from_utf8_lossy(&output);

        assert!(output_str.contains("async test"));
    }
}
