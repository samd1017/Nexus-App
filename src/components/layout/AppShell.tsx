import { useEffect } from "react";
import { TitleBar } from "@/components/chrome/TitleBar";
import { KeyboardShortcuts } from "@/components/chrome/KeyboardShortcuts";
import { Toast } from "@/components/chrome/Toast";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { EditorPane } from "@/components/editor/EditorPane";
import { RightPanel } from "@/components/right/RightPanel";
import { CommandPalette } from "@/components/search/CommandPalette";
import { useVaultStore } from "@/lib/vault/store";
import { vaultContentHash, VaultWatcher } from "@/lib/vault/watcher";

export function AppShell() {
  const bootstrap = useVaultStore((s) => s.bootstrap);
  const ready = useVaultStore((s) => s.ready);
  const vaultId = useVaultStore((s) => s.vaultId);
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Responsive defaults: collapse side panels on small screens
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth;
      if (w < 900) {
        setLeftOpen(false);
        setRightOpen(false);
      } else if (w < 1200) {
        setRightOpen(false);
        setLeftOpen(true);
      } else {
        setLeftOpen(true);
        setRightOpen(true);
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live filesystem watching simulation
  useEffect(() => {
    const watcher = new VaultWatcher();
    watcher.start(
      () => vaultContentHash(useVaultStore.getState().nodes),
      () => {
        /* store-driven UI */
      },
      1000,
    );
    return () => watcher.stop();
  }, [vaultId]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-deepest)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-xl bg-[rgba(0,200,255,0.2)]" />
          <p className="text-[14px] text-[var(--text-secondary)]">Opening vault…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-deepest)] text-[var(--text-primary)]">
      <TitleBar />
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {graphMode !== "fullscreen" ? <LeftSidebar /> : null}
        {graphMode !== "fullscreen" ? <EditorPane /> : null}
        <RightPanel />
      </div>
      <CommandPalette />
      <KeyboardShortcuts />
      <Toast />
    </div>
  );
}
