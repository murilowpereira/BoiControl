import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@boicontrol/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.ts"],
    testTimeout: 20_000,
    fileParallelism: false,
    // As recusas esperadas das regras poluem o log; só mostramos o resto.
    onConsoleLog: (log) => !/PERMISSION_DENIED|evaluation error|false for '/.test(log),
  },
});
