import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@boicontrol/core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url)) },
  },
  test: { include: ["test/**/*.test.ts"], testTimeout: 20_000, fileParallelism: false },
});
