import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * Note App is local-first — no database bootstrap.
 * Template PGLite hook is intentionally gated off so startup never depends on auth/DB.
 */
function localFirstNoDbPlugin(): Plugin {
  return {
    name: "noteapp:local-first-no-db",
    apply: "serve",
    async configureServer() {
      /* no-op: zero accounts, zero hosted DB */
    },
  };
}

/**
 * Auth popup disabled for core product. Local-first vault needs no sign-in.
 * Keeps the path from falling through to a blank SPA if something hits /auth/popup.
 */
function authDisabledPlugin(): Plugin {
  return {
    name: "noteapp:auth-disabled",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url ?? "").split("?", 1)[0] ?? "";
        if (pathOnly !== "/auth/popup" && !pathOnly.startsWith("/api/auth")) {
          next();
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            error: "auth_disabled",
            message: "Note App is local-first. No accounts required.",
          }),
        );
      });
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// Keep `nitro` gated to `build` (the Vercel deploy target).
export default defineConfig(({ command }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    localFirstNoDbPlugin(),
    authDisabledPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" ? [nitro({ preset: "vercel" })] : []),
    viteReact(),
  ],
}));
