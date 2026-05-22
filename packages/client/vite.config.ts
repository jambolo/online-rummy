import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { codecovVitePlugin } from "@codecov/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env.CI !== undefined,
      bundleName: "online-rummy-client",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
});
