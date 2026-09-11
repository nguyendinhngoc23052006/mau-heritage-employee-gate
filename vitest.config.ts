import { defineConfig } from "vitest/config";

export default defineConfig({
  // `__BUILD_SHA__` is injected by vite.config.ts at build time. Vitest uses
  // this config instead, so the define has to be declared here too or every
  // test touching an error path dies on "__BUILD_SHA__ is not defined".
  define: {
    __BUILD_SHA__: JSON.stringify("test"),
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
