//! Tests pour StreamAnalyzer

use crate::stream::{StreamAnalyzer, ContentType};
use crate::stream::patterns::BuildTool;

#[test]
fn test_detect_typescript_errors() {
    let mut analyzer = StreamAnalyzer::new();

    let typescript_output = r#"
src/index.ts:10:5 - error TS2304: Cannot find name 'foo'.
src/index.ts:15:10 - error TS2339: Property 'bar' does not exist on type 'string'.
src/index.ts:20:1 - error TS2322: Type 'number' is not assignable to type 'string'.
    "#;

    let result = analyzer.analyze(typescript_output);

    let has_build_error = result.content_types.iter().any(|ct| {
        matches!(ct, ContentType::BuildError { tool: BuildTool::TypeScript, .. })
    });

    assert!(has_build_error, "Should detect TypeScript errors");
}

#[test]
fn test_detect_rust_errors() {
    let mut analyzer = StreamAnalyzer::new();

    let rust_output = r#"
error[E0425]: cannot find value `foo` in this scope
  --> src/main.rs:10:5
   |
10 |     foo;
   |     ^^^ not found in this scope

error[E0308]: mismatched types
  --> src/main.rs:15:5
   |
15 |     let x: i32 = "hello";
   |            ---   ^^^^^^^ expected `i32`, found `&str`

error: aborting due to 2 previous errors
    "#;

    let result = analyzer.analyze(rust_output);

    let has_build_error = result.content_types.iter().any(|ct| {
        matches!(ct, ContentType::BuildError { tool: BuildTool::Rust, .. })
    });

    assert!(has_build_error, "Should detect Rust errors");
}

#[test]
fn test_detect_eslint_errors() {
    let mut analyzer = StreamAnalyzer::new();

    let eslint_output = r#"
/src/index.ts
  10:5  error  'foo' is not defined  no-undef
  15:1  error  Unexpected console statement  no-console
  20:3  warning  'bar' is defined but never used  @typescript-eslint/no-unused-vars

3 problems (2 errors, 1 warning)
    "#;

    let result = analyzer.analyze(eslint_output);

    let has_build_error = result.content_types.iter().any(|ct| {
        matches!(ct, ContentType::BuildError { tool: BuildTool::ESLint, .. })
    });

    assert!(has_build_error, "Should detect ESLint errors");
}

#[test]
fn test_detect_large_output() {
    let mut analyzer = StreamAnalyzer::new();

    // Generer un output volumineux (> 5KB)
    let large = "x".repeat(10000);
    let result = analyzer.analyze(&large);

    let has_large_output = result.content_types.iter().any(|ct| {
        matches!(ct, ContentType::LargeOutput { .. })
    });

    assert!(has_large_output, "Should detect large output");
}

#[test]
fn test_detect_file_read() {
    let mut analyzer = StreamAnalyzer::new();

    let file_read = "Reading file: src/main.ts\n```typescript\nconst x = 1;\n```";
    let result = analyzer.analyze(file_read);

    let has_file_read = result.content_types.iter().any(|ct| {
        matches!(ct, ContentType::FileRead { .. })
    });

    assert!(has_file_read, "Should detect file read");
}

#[test]
fn test_strip_ansi_codes() {
    let analyzer = StreamAnalyzer::new();

    let with_ansi = "\x1b[31mError:\x1b[0m Something failed";
    let clean = analyzer.strip_ansi(with_ansi);

    assert_eq!(clean, "Error: Something failed");
    assert!(!clean.contains("\x1b"), "Should not contain ANSI codes");
}

#[test]
fn test_strip_ansi_complex() {
    let analyzer = StreamAnalyzer::new();

    let complex = "\x1b[1;31;40mBold Red on Black\x1b[0m \x1b[4mUnderline\x1b[24m";
    let clean = analyzer.strip_ansi(complex);

    assert_eq!(clean, "Bold Red on Black Underline");
}

#[test]
fn test_token_estimation() {
    let mut analyzer = StreamAnalyzer::new();

    let text = "Hello, this is a test message with some content.";
    let result = analyzer.analyze(text);

    // ~4 chars per token, text is ~50 chars
    assert!(result.token_estimate > 5 && result.token_estimate < 30,
        "Token estimate should be reasonable: {}", result.token_estimate);
}

#[test]
fn test_empty_input() {
    let mut analyzer = StreamAnalyzer::new();
    let result = analyzer.analyze("");

    assert!(result.content_types.is_empty() || result.token_estimate == 0);
}

#[test]
fn test_buffer_accumulation() {
    let mut analyzer = StreamAnalyzer::new();

    // Analyser plusieurs chunks
    analyzer.analyze("chunk1 ");
    analyzer.analyze("chunk2 ");
    let result = analyzer.analyze("chunk3");

    // Le buffer devrait accumuler
    assert!(result.total_size > 0);
}
