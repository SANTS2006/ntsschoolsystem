import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

// The site is served from the same origin as the school app, so its built files live under /site-assets/ (the app owns
// /assets/) and nothing here can collide with the app's own files.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  build: {
    assetsDir: "site-assets",
    sourcemap: false,
    cssCodeSplit: false,
    // Fonts are small latin subsets; inlining them would bloat the HTML-linked CSS.
    assetsInlineLimit: 0,
  },
  server: {
    port: Number(process.env.PORT ?? 5180),
    proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:8000", changeOrigin: true } },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], globals: false },
});
