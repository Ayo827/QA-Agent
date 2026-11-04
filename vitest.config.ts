import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // reports/ holds test files the test-generation agent proposes; they are for the target repo, not for us.
    exclude: ["node_modules", "dist", "reports"],
  },
});
