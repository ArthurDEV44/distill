//! Lock contention benchmarks for ctxopt-core
//!
//! Compares Mutex vs RwLock performance under different contention scenarios.
//! Run with: cargo bench --features bench -- lock_contention

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use std::sync::Arc;
use tokio::runtime::Runtime;
use tokio::sync::{Mutex, RwLock};

// ============================================================================
// Lock Contention Benchmarks
// ============================================================================

/// Simulates read-heavy workload with Mutex
async fn mutex_read_heavy(data: Arc<Mutex<Vec<u8>>>, iterations: usize) {
    for _ in 0..iterations {
        let guard = data.lock().await;
        let _ = guard.len();
        drop(guard);
    }
}

/// Simulates read-heavy workload with RwLock
async fn rwlock_read_heavy(data: Arc<RwLock<Vec<u8>>>, iterations: usize) {
    for _ in 0..iterations {
        let guard = data.read().await;
        let _ = guard.len();
        drop(guard);
    }
}

/// Simulates mixed read/write workload with Mutex
async fn mutex_mixed(data: Arc<Mutex<Vec<u8>>>, reads: usize, writes: usize) {
    for i in 0..(reads + writes) {
        if i % (reads / writes.max(1) + 1) == 0 {
            // Write operation
            let mut guard = data.lock().await;
            guard.push(0);
            drop(guard);
        } else {
            // Read operation
            let guard = data.lock().await;
            let _ = guard.len();
            drop(guard);
        }
    }
}

/// Simulates mixed read/write workload with RwLock
async fn rwlock_mixed(data: Arc<RwLock<Vec<u8>>>, reads: usize, writes: usize) {
    for i in 0..(reads + writes) {
        if i % (reads / writes.max(1) + 1) == 0 {
            // Write operation
            let mut guard = data.write().await;
            guard.push(0);
            drop(guard);
        } else {
            // Read operation
            let guard = data.read().await;
            let _ = guard.len();
            drop(guard);
        }
    }
}

fn bench_lock_contention(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let data_size = 10_000;
    let iterations_per_reader = 100;

    let mut group = c.benchmark_group("lock_contention");

    // Test with different numbers of concurrent readers
    for num_readers in [1, 4, 8, 16] {
        // Mutex benchmark - read heavy
        group.bench_with_input(
            BenchmarkId::new("mutex_read_heavy", num_readers),
            &num_readers,
            |b, &num_readers| {
                let data = Arc::new(Mutex::new(vec![0u8; data_size]));
                b.to_async(&rt).iter(|| async {
                    let mut handles = Vec::new();
                    for _ in 0..num_readers {
                        let d = Arc::clone(&data);
                        handles.push(tokio::spawn(mutex_read_heavy(d, iterations_per_reader)));
                    }
                    for h in handles {
                        h.await.unwrap();
                    }
                });
            },
        );

        // RwLock benchmark - read heavy
        group.bench_with_input(
            BenchmarkId::new("rwlock_read_heavy", num_readers),
            &num_readers,
            |b, &num_readers| {
                let data = Arc::new(RwLock::new(vec![0u8; data_size]));
                b.to_async(&rt).iter(|| async {
                    let mut handles = Vec::new();
                    for _ in 0..num_readers {
                        let d = Arc::clone(&data);
                        handles.push(tokio::spawn(rwlock_read_heavy(d, iterations_per_reader)));
                    }
                    for h in handles {
                        h.await.unwrap();
                    }
                });
            },
        );
    }

    group.finish();
}

fn bench_mixed_workload(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();
    let data_size = 10_000;

    let mut group = c.benchmark_group("mixed_workload");

    // Test different read/write ratios
    for (reads, writes) in [(90, 10), (70, 30), (50, 50)] {
        let ratio_name = format!("{}r_{}w", reads, writes);

        // Mutex benchmark - mixed workload
        group.bench_function(format!("mutex_{ratio_name}"), |b| {
            let data = Arc::new(Mutex::new(vec![0u8; data_size]));
            b.to_async(&rt).iter(|| {
                let d = Arc::clone(&data);
                async move { mutex_mixed(d, reads, writes).await }
            });
        });

        // RwLock benchmark - mixed workload
        group.bench_function(format!("rwlock_{ratio_name}"), |b| {
            let data = Arc::new(RwLock::new(vec![0u8; data_size]));
            b.to_async(&rt).iter(|| {
                let d = Arc::clone(&data);
                async move { rwlock_mixed(d, reads, writes).await }
            });
        });
    }

    group.finish();
}

fn bench_single_thread_overhead(c: &mut Criterion) {
    let rt = Runtime::new().unwrap();

    let mut group = c.benchmark_group("single_thread_overhead");

    // Measure baseline lock acquisition overhead (no contention)
    group.bench_function("mutex_acquire_release", |b| {
        let data = Arc::new(Mutex::new(0u64));
        b.to_async(&rt).iter(|| {
            let d = Arc::clone(&data);
            async move {
                let guard = d.lock().await;
                let _ = *guard;
                drop(guard);
            }
        });
    });

    group.bench_function("rwlock_read_acquire_release", |b| {
        let data = Arc::new(RwLock::new(0u64));
        b.to_async(&rt).iter(|| {
            let d = Arc::clone(&data);
            async move {
                let guard = d.read().await;
                let _ = *guard;
                drop(guard);
            }
        });
    });

    group.bench_function("rwlock_write_acquire_release", |b| {
        let data = Arc::new(RwLock::new(0u64));
        b.to_async(&rt).iter(|| {
            let d = Arc::clone(&data);
            async move {
                let guard = d.write().await;
                let _ = *guard;
                drop(guard);
            }
        });
    });

    group.finish();
}

criterion_group!(
    lock_benches,
    bench_lock_contention,
    bench_mixed_workload,
    bench_single_thread_overhead,
);
criterion_main!(lock_benches);
