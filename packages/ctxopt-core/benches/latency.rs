//! Performance benchmarks for ctxopt-core
//!
//! Run with: cargo bench --features bench

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use ctxopt_core::stream::{StreamAnalyzer, PATTERNS};
use ctxopt_core::tokens::TokenEstimator;

// ============================================================================
// Token Estimation Benchmarks
// ============================================================================

fn bench_token_estimation(c: &mut Criterion) {
    let estimator = TokenEstimator::new();

    let small = "Hello, world!";
    let medium = include_str!("fixtures/medium.txt");
    let large = include_str!("fixtures/large.txt");

    let mut group = c.benchmark_group("token_estimation");

    group.bench_with_input(BenchmarkId::new("estimate", "small"), small, |b, text| {
        b.iter(|| estimator.estimate(black_box(text)));
    });

    group.bench_with_input(BenchmarkId::new("estimate", "medium"), medium, |b, text| {
        b.iter(|| estimator.estimate(black_box(text)));
    });

    group.bench_with_input(BenchmarkId::new("estimate", "large"), large, |b, text| {
        b.iter(|| estimator.estimate(black_box(text)));
    });

    group.finish();
}

// ============================================================================
// ANSI Stripping Benchmarks
// ============================================================================

fn bench_strip_ansi(c: &mut Criterion) {
    let ansi_text = include_str!("fixtures/ansi_output.txt");
    let ansi_repeated = ansi_text.repeat(100);

    let mut group = c.benchmark_group("strip_ansi");

    group.bench_function("small", |b| {
        b.iter(|| {
            black_box(
                PATTERNS
                    .ansi_escape
                    .replace_all(black_box(ansi_text), "")
                    .to_string(),
            )
        });
    });

    group.bench_function("large", |b| {
        b.iter(|| {
            black_box(
                PATTERNS
                    .ansi_escape
                    .replace_all(black_box(&ansi_repeated), "")
                    .to_string(),
            )
        });
    });

    group.finish();
}

// ============================================================================
// Pattern Detection Benchmarks
// ============================================================================

fn bench_pattern_detection(c: &mut Criterion) {
    let ts_errors = include_str!("fixtures/typescript_errors.txt");
    let rust_errors = include_str!("fixtures/rust_errors.txt");
    let mixed_output = include_str!("fixtures/mixed_output.txt");
    let large_output = include_str!("fixtures/large.txt");

    let mut group = c.benchmark_group("pattern_detection");

    // TypeScript pattern detection
    group.bench_function("typescript_errors", |b| {
        b.iter(|| {
            black_box(
                PATTERNS
                    .typescript_error
                    .find_iter(black_box(ts_errors))
                    .count(),
            )
        });
    });

    // Rust pattern detection
    group.bench_function("rust_errors", |b| {
        b.iter(|| {
            black_box(
                PATTERNS
                    .rust_error
                    .find_iter(black_box(rust_errors))
                    .count(),
            )
        });
    });

    // ESLint pattern detection
    group.bench_function("eslint_errors", |b| {
        b.iter(|| {
            black_box(
                PATTERNS
                    .eslint_error
                    .find_iter(black_box(mixed_output))
                    .count(),
            )
        });
    });

    // Webpack pattern detection
    group.bench_function("webpack_errors", |b| {
        b.iter(|| {
            black_box(
                PATTERNS
                    .webpack_error
                    .find_iter(black_box(mixed_output))
                    .count(),
            )
        });
    });

    // Prompt ready detection
    group.bench_function("prompt_ready", |b| {
        b.iter(|| black_box(PATTERNS.prompt_ready.is_match(black_box(mixed_output))));
    });

    // File read detection
    group.bench_function("file_read", |b| {
        b.iter(|| {
            black_box(
                PATTERNS
                    .file_read
                    .find_iter(black_box(mixed_output))
                    .count(),
            )
        });
    });

    // Generic error detection on large output
    group.bench_function("generic_error_large", |b| {
        b.iter(|| {
            black_box(
                PATTERNS
                    .generic_error
                    .find_iter(black_box(large_output))
                    .count(),
            )
        });
    });

    group.finish();
}

// ============================================================================
// Stream Analyzer Benchmarks
// ============================================================================

fn bench_stream_analyzer(c: &mut Criterion) {
    let ts_errors = include_str!("fixtures/typescript_errors.txt");
    let rust_errors = include_str!("fixtures/rust_errors.txt");
    let mixed_output = include_str!("fixtures/mixed_output.txt");
    let large_output = include_str!("fixtures/large.txt");
    let ansi_output = include_str!("fixtures/ansi_output.txt");

    let mut group = c.benchmark_group("stream_analyzer");

    // Analyze TypeScript errors
    group.bench_function("analyze_typescript", |b| {
        b.iter(|| {
            let mut analyzer = StreamAnalyzer::new();
            black_box(analyzer.analyze(black_box(ts_errors)))
        });
    });

    // Analyze Rust errors
    group.bench_function("analyze_rust", |b| {
        b.iter(|| {
            let mut analyzer = StreamAnalyzer::new();
            black_box(analyzer.analyze(black_box(rust_errors)))
        });
    });

    // Analyze mixed output
    group.bench_function("analyze_mixed", |b| {
        b.iter(|| {
            let mut analyzer = StreamAnalyzer::new();
            black_box(analyzer.analyze(black_box(mixed_output)))
        });
    });

    // Analyze large output
    group.bench_function("analyze_large", |b| {
        b.iter(|| {
            let mut analyzer = StreamAnalyzer::new();
            black_box(analyzer.analyze(black_box(large_output)))
        });
    });

    // Analyze ANSI output (tests stripping + analysis)
    group.bench_function("analyze_ansi", |b| {
        b.iter(|| {
            let mut analyzer = StreamAnalyzer::new();
            black_box(analyzer.analyze(black_box(ansi_output)))
        });
    });

    group.finish();
}

// ============================================================================
// Full Pipeline Benchmark
// ============================================================================

fn bench_full_pipeline(c: &mut Criterion) {
    let mixed_output = include_str!("fixtures/mixed_output.txt");

    c.bench_function("full_pipeline", |b| {
        b.iter(|| {
            // Simulate multiple chunks being analyzed
            let mut analyzer = StreamAnalyzer::new();

            // Split into chunks and analyze each
            for chunk in mixed_output.as_bytes().chunks(1024) {
                let text = std::str::from_utf8(chunk).unwrap_or("");
                let _ = analyzer.analyze(black_box(text));
            }

            black_box(analyzer)
        });
    });
}

criterion_group!(
    benches,
    bench_token_estimation,
    bench_strip_ansi,
    bench_pattern_detection,
    bench_stream_analyzer,
    bench_full_pipeline,
);
criterion_main!(benches);
