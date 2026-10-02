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
/**
 * The classic saved-page script paints first. Module tags are held as metas
 * until that script has laid the page out, so the app graph is not fetched
 * in front of it.
 */
function bootAfterSavedPage() {
  return {
    name: "boot-after-saved-page",
    transformIndexHtml: {
      order: "post" as const,
      handler(html: string) {
        const scriptRe = /<script\b([^>]*)>\s*<\/script>/gi;
        const metas: string[] = [];
        const next = html.replace(scriptRe, (full, attrs: string) => {
          if (!/\btype="module"/.test(attrs)) return full;
          const src = /\bsrc="([^"]+)"/.exec(attrs);
          if (!src) return full;
          metas.push(`<meta name="nexus-boot-src" content="${src[1]}">`);
          return "";
        });
        if (!metas.length) return html;
        const head = next.indexOf("</head>");
        if (head < 0) return html;
        return next.slice(0, head) + metas.join("") + next.slice(head);
      },
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), viteReact(), bootAfterSavedPage()],
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
    // The first document is the saved page. Do not advertise the app graph
    // ahead of that classic script.
    modulePreload: false,
    // WKWebView on modern macOS is Chromium-adjacent enough for es2022+
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
