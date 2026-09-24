/**
 * Desktop (Tauri) SPA entry — no SSR, mounts AppShell directly.
 * Called from boot.ts after the saved page is on screen. The call keeps
 * this mount in the bundle; a bare side-effect import is dropped.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBoundary } from "@/components/chrome/ErrorBoundary";
import "@/styles.css";

export function mountDesktop(): void {
  const el = document.getElementById("root");
  if (!el) throw new Error("Nexus desktop root missing");

  createRoot(el).render(
    <StrictMode>
      <div className="h-dvh min-h-0 overflow-hidden">
        <ErrorBoundary><AppShell /></ErrorBoundary>
      </div>
    </StrictMode>,
  );
}
