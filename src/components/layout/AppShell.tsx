import { useEffect, useRef } from "react";
import { TitleBar } from "@/components/chrome/TitleBar";
import { KeyboardShortcuts } from "@/components/chrome/KeyboardShortcuts";
import { Toast } from "@/components/chrome/Toast";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { EditorPane } from "@/components/editor/EditorPane";
import { RightPanel } from "@/components/right/RightPanel";
import { CommandPalette } from "@/components/search/CommandPalette";
import { WelcomeScreen } from "@/components/vault/WelcomeScreen";
import {
  getFsaRoot,
  setWatcherAck,
  useVaultStore,
} from "@/lib/vault/store";
import { vaultContentHash, VaultWatcher } from "@/lib/vault/watcher";

export function AppShell() {
  const bootstrap = useVaultStore((s) => s.bootstrap);
  const ready = useVaultStore((s) => s.ready);
  const vaultId = useVaultStore((s) => s.vaultId);
  const mode = useVaultStore((s) => s.mode);
  const graphMode = useVaultStore((s) => s.settings.graphMode);
  const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
  const setRightOpen = useVaultStore((s) => s.setRightOpen);
  const applyExternalSnapshot = useVaultStore((s) => s.applyExternalSnapshot);
  const watcherRef = useRef<VaultWatcher | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Responsive side panels — only set defaults when vault opens / width crosses bands
  useEffect(() => {
    if (!vaultId) return;
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
    // only when vault opens, not every resize (avoids fighting user toggles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId]);

  // Live filesystem watching — FSA real disk, else memory hash
  useEffect(() => {
    const watcher = new VaultWatcher();
    watcherRef.current = watcher;

    if (mode === "fsa" && getFsaRoot()) {
      const dir = getFsaRoot()!;
      setWatcherAck((d) => watcher.acknowledgeWrite(d));
      void watcher.startFsa(dir, (ev) => {
        if (ev.scan) {
          applyExternalSnapshot(ev.scan.nodes, ev.scan.rootIds);
        }
      });
    } else if (vaultId) {
      setWatcherAck(null);
      watcher.start(
        () => vaultContentHash(useVaultStore.getState().nodes),
        () => {
          /* zustand drives UI */
        },
        1000,
      );
    }

    return () => {
      setWatcherAck(null);
      watcher.stop();
      watcherRef.current = null;
    };
  }, [vaultId, mode, applyExternalSnapshot]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-deepest)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-xl bg-[rgba(0,200,255,0.2)]" />
          <p className="text-[14px] text-[var(--text-secondary)]">Starting Note App…</p>
        </div>
      </div>
    );
  }

  if (!vaultId) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-deepest)]">
        <TitleBar />
        <div className="min-h-0 flex-1">
          <WelcomeScreen />
        </div>
        <Toast />
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
