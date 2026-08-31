import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/integration/**/*.{test,spec}.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Los tests de integración comparten un único Postgres/Redis reales
    // (los de docker-compose) y cada uno resetea el estado antes de correr;
    // en paralelo se pisarían entre sí.
    fileParallelism: false,
    isolate: true,
  },
});
