import path from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    alias: {
      "@prisma/client/runtime/client": path.resolve(
        __dirname,
        "node_modules/@prisma/client/runtime/client.js",
      ),
    },
  },
  test: {
    include: ["test/**/*.e2e-spec.ts"],
    globals: false,
    environment: "node",
    root: "./",
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});
