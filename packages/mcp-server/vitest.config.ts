import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/**/types.ts",
      ],
      // Floors ratcheted by v0.9.2 US-011 to current baseline − 1pt buffer.
      // Measured baseline (2026-04-21 post-v0.9.1): 71.80 / 57.58 / 71.93 / 70.99.
      // v0.9.2 floors: 70 / 56 / 70 / 69. Long-term v1.0 targets: 75 / 70 / 75 / 75.
      thresholds: {
        lines: 70,
        branches: 56,
        functions: 70,
        statements: 69,
      },
    },
    testTimeout: 30000, // Tree-sitter initialization can be slow
    server: {
      deps: {
        inline: ["zod"],
      },
    },
  },
});
