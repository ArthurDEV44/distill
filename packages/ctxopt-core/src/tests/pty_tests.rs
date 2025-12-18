//! Tests pour PtyManager

use crate::pty::{PtyManager, PtySize};

#[tokio::test]
async fn test_pty_spawn_and_read() {
    let pty = PtyManager::new("echo", &["hello world"], PtySize::default())
        .expect("Failed to create PTY");

    // Attendre que le process demarre
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    let output = pty.read().await.expect("Failed to read");
    let text = String::from_utf8_lossy(&output);

    assert!(text.contains("hello") || text.contains("world"),
        "Expected 'hello world', got: {}", text);
}

#[tokio::test]
async fn test_pty_write_and_read() {
    let pty = PtyManager::new("cat", &[], PtySize::default())
        .expect("Failed to create PTY");

    // Ecrire dans stdin
    pty.write_str("test input\n").await.expect("Failed to write");

    // Attendre et lire
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    let output = pty.read().await.expect("Failed to read");
    let text = String::from_utf8_lossy(&output);

    assert!(text.contains("test input"), "Expected 'test input', got: {}", text);

    // Cleanup
    pty.kill().await.ok();
}

#[tokio::test]
async fn test_pty_is_running() {
    let pty = PtyManager::new("sleep", &["0.5"], PtySize::default())
        .expect("Failed to create PTY");

    assert!(pty.is_running().await, "Process should be running");

    // Attendre la fin
    tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;

    assert!(!pty.is_running().await, "Process should have exited");
}

#[tokio::test]
async fn test_pty_resize() {
    let pty = PtyManager::new("cat", &[], PtySize::default())
        .expect("Failed to create PTY");

    let result = pty.resize(PtySize { rows: 40, cols: 120 }).await;
    assert!(result.is_ok(), "Resize should succeed");

    pty.kill().await.ok();
}

#[tokio::test]
async fn test_pty_wait_exit_code_success() {
    let pty = PtyManager::new("true", &[], PtySize::default())
        .expect("Failed to create PTY");

    let code = pty.wait().await.expect("Wait failed");
    assert_eq!(code, 0, "Exit code should be 0");
}

#[tokio::test]
async fn test_pty_wait_exit_code_failure() {
    let pty = PtyManager::new("false", &[], PtySize::default())
        .expect("Failed to create PTY");

    let code = pty.wait().await.expect("Wait failed");
    assert_eq!(code, 1, "Exit code should be 1");
}

#[test]
fn test_pty_size_default() {
    let size = PtySize::default();
    assert_eq!(size.rows, 24);
    assert_eq!(size.cols, 80);
}
