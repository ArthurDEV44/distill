import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/ast/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
    testTimeout: 30000, // Tree-sitter initialization can be slow
  },
});
