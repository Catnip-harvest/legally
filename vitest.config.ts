import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The first local MiniLM load can include an ~90 MB model download.
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
