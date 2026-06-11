import tseslint from "typescript-eslint";
import { config as baseConfig } from "./base.js";

/**
 * Type-aware ESLint config factory (US-008).
 *
 * Layers `recommendedTypeChecked` on top of the shared base and pins
 * `no-floating-promises` / `no-misused-promises` to `error`, so the defect
 * classes `tsc` cannot catch fail CI. `recommendedTypeChecked` is used over
 * `strictTypeChecked` to keep the initial error sweep tractable in one session;
 * strict's stylistic rules (no-unnecessary-condition, prefer-nullish-coalescing,
 * …) are a separate ratchet.
 *
 * Lives in the shared eslint-config package (which owns the `typescript-eslint`
 * dependency) rather than in each consumer, but is a FACTORY so the consumer
 * supplies its own `tsconfigRootDir` — type-aware linting must resolve the
 * consuming package's tsconfig, not this package's. Scoped to `src/**` so root
 * config files (eslint.config.mjs, vitest.config.ts) need not be in a TS project.
 *
 * @param {{ tsconfigRootDir: string, project?: string }} opts
 * @returns {import("eslint").Linter.Config[]}
 */
export function typeCheckedConfig({ tsconfigRootDir, project = "./tsconfig.eslint.json" }) {
  return tseslint.config(
    ...baseConfig,
    {
      files: ["src/**/*.ts"],
      extends: [...tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        parserOptions: { project, tsconfigRootDir },
      },
      rules: {
        // MANDATORY (US-008): the defect classes the audit flagged as
        // "tsc lets them through" — these MUST fail CI.
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",

        // Incremental-adoption ratchet: `recommendedTypeChecked` surfaces ~200
        // findings, most at unavoidable `any` boundaries (tree-sitter, QuickJS,
        // js-tiktoken, JSON.parse) or pre-existing style. They are kept VISIBLE
        // as warnings (not silently off) so CI stays green today while the
        // backlog is burned down and re-promoted to `error` over time. New code
        // still sees the warning. This is the PRD US-008 fallback (logged).
        "@typescript-eslint/no-unsafe-argument": "warn",
        "@typescript-eslint/no-unsafe-assignment": "warn",
        "@typescript-eslint/no-unsafe-member-access": "warn",
        "@typescript-eslint/no-unsafe-call": "warn",
        "@typescript-eslint/no-unsafe-return": "warn",
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/require-await": "warn",
        "@typescript-eslint/no-unnecessary-type-assertion": "warn",
        "@typescript-eslint/unbound-method": "warn",
        "@typescript-eslint/await-thenable": "warn",
        "@typescript-eslint/restrict-template-expressions": "warn",
        "@typescript-eslint/no-redundant-type-constituents": "warn",
        "@typescript-eslint/no-base-to-string": "warn",
        "@typescript-eslint/only-throw-error": "warn",
        "@typescript-eslint/no-require-imports": "warn",
        "@typescript-eslint/no-unused-vars": "warn",
      },
    },
    {
      ignores: ["dist/**"],
    },
  );
}
