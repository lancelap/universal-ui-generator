import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/**/*.test.ts",
      "extensions/**/*.test.ts",
      "packages/**/*.test.ts",
    ],
    exclude: ["**/*.live.test.ts", "**/node_modules/**", "**/dist/**"],
    testTimeout: 30_000,
  },
});
