import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.{test,spec}.ts"],
    // tests/simulations llama a la API real de Simulation Testing de Retell
    // (100 casos, coste real por ejecución) — fuera del run por defecto para
    // no gastar créditos en cada build/PR/deploy. Se ejecuta aparte con
    // `npm run test:simulations` cuando haga falta de verdad.
    exclude: ["node_modules", "dist", "tests/integration/**", "tests/simulations/**"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["node_modules/", "dist/", "frontend/", "tests/"],
    },
    isolate: true,
  },
});
