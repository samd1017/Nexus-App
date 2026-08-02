import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const desktopDir = fileURLToPath(new URL("./desktop", import.meta.url));

/**
 * Static SPA build for Tauri — no TanStack Start SSR / Nitro.
 * Output: dist-desktop/ with index.html at root (frontendDist).
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
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { allow: [rootDir] },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-desktop", import.meta.url)),
    emptyOutDir: true,
    target: "esnext",
  },
});
