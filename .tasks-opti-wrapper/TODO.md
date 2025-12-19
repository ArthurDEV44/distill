# CtxOpt Wrapper Rust - Optimisation & Refactoring

> **Objectif**: Optimiser, refactorer et nettoyer le code Rust du module `ctxopt-core`
> **Approche**: Cleanup progressif sans casser l'API NAPI existante
> **Référence**: Analyse cargo check (17 warnings), best practices Rust 2025

---

## Architecture Actuelle

```
packages/ctxopt-core/src/
├── lib.rs                 (374 lignes) - Bindings NAPI & CtxOptSession
├── config/
│   └── mod.rs            (36 lignes)  - Configuration session
├── pty/
│   ├── mod.rs            (12 lignes)  - Module exports
│   └── manager.rs        (443 lignes) - Gestion PTY & raw mode
├── stream/
│   ├── mod.rs            (16 lignes)  - Module exports
│   ├── analyzer.rs       (395 lignes) - Détection patterns & tokens
│   ├── patterns.rs       (228 lignes) - Regex content detection
│   └── buffer.rs         (135 lignes) - Ring buffer historique
├── injector/
│   ├── mod.rs            (11 lignes)  - Module exports
│   ├── triggers.rs       (373 lignes) - Logique suggestions
│   └── templates.rs      (167 lignes) - Templates messages
├── tokens/
│   ├── mod.rs            (9 lignes)   - Module exports
│   └── estimator.rs      (64 lignes)  - Token estimation
└── tests/                             - Tests unitaires
```

**Total: ~2,300 lignes de code Rust + 500+ lignes de tests**

---

## Phase 0: Dead Code Cleanup (Priorité: Critique)

- [x] [O00 - Dead Code Cleanup](./O00-dead-code-cleanup.md) - Supprimer code mort, résoudre 17 warnings

---

## Phase 1: Error Handling Modernization (Priorité: Moyenne)

- [ ] [O01 - Error Handling](./O01-error-handling.md) - Améliorer la gestion d'erreurs avec thiserror

---

## Phase 2: Concurrency Optimization (Priorité: Haute)

- [ ] [O02 - Lock Optimization](./O02-lock-optimization.md) - Optimiser Arc<Mutex<T>> pattern

---

## Phase 3: API Surface Cleanup (Priorité: Moyenne)

- [ ] [O03 - API Cleanup](./O03-api-cleanup.md) - Nettoyer les exports de modules

---

## Phase 4: Clippy Pedantic (Priorité: Basse)

- [ ] [O04 - Clippy Strict](./O04-clippy-strict.md) - Activer lints stricts pour code idiomatique

---

## Phase 5: Feature Completion or Removal (Priorité: Basse)

- [ ] [O05 - Feature Audit](./O05-feature-audit.md) - Compléter ou supprimer features incomplètes

---

## Phase 6: Performance Benchmarks (Priorité: Basse)

- [ ] [O06 - Benchmarks](./O06-benchmarks.md) - Ajouter benchmarks pour mesurer les optimisations

---

## Dépendances entre Tâches

```
O00 ──────────────────────────────────────►
 │
 ├──► O01 (Error Handling)
 │
 ├──► O02 (Lock Optimization)
 │
 └──► O03 (API Cleanup)
                │
                ▼
              O04 (Clippy Strict)
                │
                ▼
              O05 (Feature Audit)
                │
                ▼
              O06 (Benchmarks)
```

**O00 est bloquant** - doit être fait en premier pour avoir une base propre.
O01, O02, O03 peuvent être parallélisés après O00.

---

## Stack & Outils

| Outil | Usage |
|-------|-------|
| `cargo clippy` | Linting strict |
| `cargo fix` | Auto-fix warnings |
| `cargo fmt` | Formatage code |
| `cargo test` | Régression tests |
| `criterion` | Benchmarks |
| `cargo flamegraph` | Profiling |
| `tokio::sync::RwLock` | Remplacement Mutex |

---

## Métriques de Succès

| Métrique | Avant | Objectif |
|----------|-------|----------|
| Warnings cargo | 17 | 0 |
| Dead code | ~200 lignes | 0 |
| Lock contentions | Non mesuré | Baseline établie |
| Clippy pedantic | Non activé | Activé sans warnings |
| Documentation | Partielle | 100% API publique |

---

## Ressources

### Best Practices Rust 2025
- [Rust Error Handling Guide 2025](https://markaicode.com/rust-error-handling-2025-guide/)
- [Rust Async Best Practices](https://medium.com/@FAANG/rust-async-in-2025-mastering-performance-and-safety-at-scale-cf8049d6b19f)
- [Arc<Mutex<T>> Alternatives](https://markaicode.com/rust-memory-management-2025/)

### NAPI-RS
- [NAPI-RS Best Practices](https://blog.logrocket.com/building-nodejs-modules-rust-napi-rs/)
- [NAPI-RS Documentation](https://napi.rs/)

### Tooling
- [Cargo Clippy Usage](https://doc.rust-lang.org/clippy/usage.html)
- [Criterion Benchmarks](https://bheisler.github.io/criterion.rs/book/)
