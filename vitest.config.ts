import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      include: ["src/lib/**", "scripts/check-collisions.mjs", "scripts/verify-citations.mjs"],
    },
  },
});
