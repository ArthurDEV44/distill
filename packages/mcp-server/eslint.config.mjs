import { typeCheckedConfig } from "@repo/eslint-config/base-type-checked";

/**
 * mcp-server lints with the shared type-aware config (US-008). Type-aware rules
 * are scoped to `src/**` and resolve this package's `tsconfig.eslint.json` (a
 * lint-only project that includes test files). The Next.js app keeps the
 * non-type-checked base — apps/web type-aware adoption is a separate PRD.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default typeCheckedConfig({ tsconfigRootDir: import.meta.dirname });
