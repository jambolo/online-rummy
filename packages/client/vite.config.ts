import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { codecovVitePlugin } from "@codecov/vite-plugin";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CI !== undefined,
      bundleName: "online-rummy-client",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
  resolve: {
    alias: {
      // Point directly to source so shared changes don't require a rebuild.
      "@online-rummy/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
});
