import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    exclude: ["**/*.live.test.ts", "**/node_modules/**", "**/dist/**"],
  },
});
