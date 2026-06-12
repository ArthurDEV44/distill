/**
 * QuickJS WASM loader — single memoized instance.
 *
 * Loading the QuickJS WASM module via `loadQuickJs(variant)` calls
 * `newQuickJSWASMModuleFromVariant`, which re-instantiates the entire WASM
 * runtime. That work is expensive (~50-200ms + GC pressure) and must happen
 * at most once per process. Both execution paths — the production
 * `createDisposableSandbox` (disposables.ts) and the test-only
 * `createQuickJSRuntime` (runtime.ts) — share this single memoized loader so
 * neither re-instantiates the module per call.
 *
 * @module
 */

import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { loadQuickJs } from "@sebastianwessel/quickjs";

// Singleton: the loaded QuickJS runtime (expensive to instantiate).
let quickJSLoader: ReturnType<typeof loadQuickJs> | null = null;

/**
 * Get or lazily create the memoized QuickJS loader.
 *
 * The `as unknown as` cast reconciles a dependency-typing gap only: under
 * NodeNext resolution the `@jitl/…` default import is typed as the module
 * namespace, which no longer overlaps the variant type `@sebastianwessel/quickjs`
 * expects. The loaded WASM variant value is byte-for-byte unchanged — this does
 * NOT alter the isolation boundary.
 */
export function getQuickJSLoader(): ReturnType<typeof loadQuickJs> {
  if (!quickJSLoader) {
    quickJSLoader = loadQuickJs(
      variant as unknown as Parameters<typeof loadQuickJs>[0]
    );
  }
  return quickJSLoader;
}
