/**
 * Desktop (Tauri) SPA entry — no SSR, mounts AppShell directly.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "@/components/layout/AppShell";
import "@/styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("Nexus desktop root missing");

createRoot(el).render(
  <StrictMode>
    <div className="h-dvh min-h-0 overflow-hidden">
      <AppShell />
    </div>
  </StrictMode>,
);
