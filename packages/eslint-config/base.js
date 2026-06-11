import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import globals from "globals";

/**
 * A shared ESLint configuration for the repository.
 *
 * US-008: `eslint-plugin-only-warn` was removed so rule severities apply as
 * authored — a floating promise or unsafe pattern must be able to FAIL CI, not
 * be silently downgraded to a warning.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    // Packages in this monorepo run on Node (servers, CLIs, build tooling), so
    // Node globals (process, console, URL, …) are always defined.
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
      // Stylistic rule about redundant regex/string escapes. The codebase's
      // parsing regexes intentionally keep readability escapes (e.g. `[\[{]`,
      // `[\/]`); these are not a correctness or safety concern and are NOT the
      // US-008 target (floating/misused promises). Kept visible as a warning.
      "no-useless-escape": "warn",
    },
  },
  {
    ignores: ["dist/**"],
  },
];
