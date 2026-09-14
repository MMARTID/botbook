import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // Llama a la API real de Simulation Testing de Retell (100 casos, coste
    // real por ejecución) — nunca se ejecuta con `npm run test`, solo a
    // propósito con `npm run test:simulations`.
    include: ["tests/simulations/**/*.{test,spec}.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    isolate: true,
  },
});
