//! Benchmarks de latence

use criterion::{criterion_group, criterion_main, Criterion, black_box};

// Note: Ces benchmarks testent les fonctions de parsing de patterns
// Les benchmarks PTY reels necessitent des tests d'integration

fn bench_strip_ansi(c: &mut Criterion) {
    let ansi_regex = regex::Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap();
    let with_ansi = "\x1b[31mError\x1b[0m: ".repeat(1000);

    c.bench_function("strip_ansi_1000", |b| {
        b.iter(|| {
            black_box(ansi_regex.replace_all(&with_ansi, "").to_string())
        })
    });
}

fn bench_pattern_matching(c: &mut Criterion) {
    let ts_error = regex::Regex::new(r"error TS\d+:").unwrap();
    let rust_error = regex::Regex::new(r"error\[E\d+\]:").unwrap();
    let eslint_error = regex::Regex::new(r"\d+:\d+\s+error\s+").unwrap();

    let sample = r#"
src/index.ts:10:5 - error TS2304: Cannot find name 'foo'.
src/index.ts:15:10 - error TS2339: Property 'bar' does not exist.
src/index.ts:20:1 - error TS2322: Type mismatch.
error[E0425]: cannot find value `foo` in this scope
error[E0308]: mismatched types
  5:10  error  'x' is not defined  no-undef
  10:1  error  Unexpected console  no-console
"#.repeat(10);

    c.bench_function("detect_typescript_errors", |b| {
        b.iter(|| {
            black_box(ts_error.find_iter(&sample).count())
        })
    });

    c.bench_function("detect_rust_errors", |b| {
        b.iter(|| {
            black_box(rust_error.find_iter(&sample).count())
        })
    });

    c.bench_function("detect_eslint_errors", |b| {
        b.iter(|| {
            black_box(eslint_error.find_iter(&sample).count())
        })
    });
}

fn bench_token_estimation(c: &mut Criterion) {
    let text = "Hello, this is a sample text for token estimation. ".repeat(100);

    c.bench_function("estimate_tokens_5000_chars", |b| {
        b.iter(|| {
            // Simple estimation: ~4 chars per token
            black_box(text.len() / 4)
        })
    });
}

criterion_group!(benches, bench_strip_ansi, bench_pattern_matching, bench_token_estimation);
criterion_main!(benches);
