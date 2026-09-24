import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const desktopDir = fileURLToPath(new URL("./desktop", import.meta.url));
const host = process.env.TAURI_DEV_HOST;

/**
 * Static SPA for Tauri — no TanStack Start SSR / Nitro.
 * Dev: tauri.conf beforeDevCommand → npm run dev:desktop
 * Prod: dist-desktop/ as frontendDist
 */
export default defineConfig({
  plugins: [tailwindcss(), viteReact()],
  clearScreen: false,
  base: "./",
  root: desktopDir,
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  optimizeDeps: {
    // Let the document out before the app graph is crawled. The saved-page
    // script paints from local storage and must not wait on that crawl.
    holdUntilCrawlEnd: false,
  },
  server: {
    // Tauri expects a fixed port; bind all interfaces so the webview can reach it.
    host: host || "0.0.0.0",
    port: 8080,
    strictPort: true,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: [rootDir] },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-desktop", import.meta.url)),
    emptyOutDir: true,
    // WKWebView on modern macOS is Chromium-adjacent enough for es2022+
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
