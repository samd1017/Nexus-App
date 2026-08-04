import { useEffect, useRef, useState } from "react";
import { TitleBar } from "@/components/chrome/TitleBar";
import { KeyboardShortcuts } from "@/components/chrome/KeyboardShortcuts";
import { Toast } from "@/components/chrome/Toast";
import { DeleteConfirmHost } from "@/components/chrome/DeleteConfirmHost";
import { ConflictStudioHost } from "@/components/conflict/ConflictStudioHost";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { EditorPane } from "@/components/editor/EditorPane";
import { RightPanel } from "@/components/right/RightPanel";
import { CommandPalette } from "@/components/search/CommandPalette";
import { WelcomeScreen } from "@/components/vault/WelcomeScreen";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { NexusMark, NEXUS_NAME } from "@/components/brand/NexusLogo";
import {
  getDesktopRoot,
  getFsaRoot,
  setDesktopWatchAck,
  setWatcherAck,
  useVaultStore,
} from "@/lib/vault/store";
import { vaultContentHash, VaultWatcher } from "@/lib/vault/watcher";
import { startDesktopWatch } from "@/lib/vault/tauri-adapter";
import { shouldLazyBodies } from "@/lib/vault/scale-flags";
import { applyPrefsToDom, getPrefs, usePrefsStore } from "@/lib/prefs/preferences";
import {
  getOpenProgress,
  setOpenProgress,
  subscribeOpenProgress,
  type OpenProgress,
} from "@/lib/vault/native-index";
import { bindDesktopMenu } from "@/lib/desktop/menu-bridge";
import { bindWindowState } from "@/lib/desktop/window-state";
import { cn } from "@/lib/utils";

function OpenProgressBanner({ progress }: { progress: OpenProgress }) {
  if (
    progress.phase !== "walking" &&
    progress.phase !== "indexing" &&
    progress.phase !== "error" &&
    progress.phase !== "ready"
  ) {
    return null;
  }
  // Brief ready flash then hide via phase returning idle (caller sets idle)
  if (progress.phase === "ready" && !progress.message) return null;
  const isError = progress.phase === "error";
  const hasTotalHint =
    progress.totalHint != null && progress.totalHint > 0;
  const ratio = hasTotalHint
    ? Math.min(1, progress.scanned / progress.totalHint!)
    : null;
  const valueNow =
    hasTotalHint && !isError && progress.phase !== "ready"
      ? Math.round(ratio! * 100)
      : undefined;

  const dismissError = () => {
    setOpenProgress({
      phase: "idle",
      scanned: 0,
      totalHint: null,
      message: "",
    });
  };

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col border-b px-3 py-1.5 text-[12px]",
        isError
          ? "border-[rgba(255,69,58,0.3)] bg-[rgba(255,69,58,0.08)] text-[var(--danger)]"
          : "border-[var(--border)] bg-[rgba(0,200,255,0.06)] text-[var(--text-secondary)]",
      )}
      data-open-progress={progress.phase}
      role={valueNow != null ? "progressbar" : "status"}
      aria-valuenow={valueNow}
      aria-valuemin={valueNow != null ? 0 : undefined}
      aria-valuemax={valueNow != null ? 100 : undefined}
      aria-busy={!isError && progress.phase !== "ready" ? true : undefined}
    >
      <div className="flex items-center gap-2">
        {!isError ? (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
        ) : null}
        <span className="min-w-0 flex-1">
          {progress.message || (isError ? "Open failed" : "Opening vault…")}
        </span>
        {progress.scanned > 0 ? (
          <span className="text-[var(--text-muted)]">
            · {progress.scanned.toLocaleString()} items
            {ratio != null ? ` · ${Math.round(ratio * 100)}%` : ""}
          </span>
        ) : null}
        {isError ? (
          <button
            type="button"
            className="ghost-btn ml-auto shrink-0 px-2 py-0.5 text-[11px]"
            onClick={dismissError}
          >
            Dismiss
          </button>
        ) : null}
      </div>
      {ratio != null && !isError && progress.phase !== "ready" ? (
        <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

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
  const [openProgress, setOpenProgressUi] = useState<OpenProgress>(() =>
    getOpenProgress(),
  );

  useEffect(() => {
    return subscribeOpenProgress(setOpenProgressUi);
  }, []);

  useEffect(() => {
    applyPrefsToDom(getPrefs());
    void bootstrap();
  }, [bootstrap]);

  // Wave A: warn before tab close when unsaved disk notes exist
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const dirty = useVaultStore.getState().dirtyNoteIds;
      const mode = useVaultStore.getState().mode;
      if (dirty.length === 0) return;
      if (mode !== "fsa" && mode !== "desktop" && mode !== "local") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Wave S7: persist main window size (desktop only)
  useEffect(() => {
    let un: (() => void) | undefined;
    void bindWindowState().then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  // Native Tauri menu → store actions
  useEffect(() => {
    let un: (() => void) | undefined;
    void bindDesktopMenu({
      openVault: () => {
        if (useVaultStore.getState().connecting) return;
        void useVaultStore.getState().openFolderAsVault();
      },
      closeVault: () => useVaultStore.getState().closeVault(),
      settings: () => usePrefsStore.getState().setSettingsOpen(true),
      search: () => useVaultStore.getState().setCommandOpen(true),
      save: () => {
        void useVaultStore.getState().flushDirty();
      },
      newNote: () => {
        useVaultStore.getState().createNote(null, "Untitled");
      },
      toggleGraph: () => useVaultStore.getState().toggleGraphFullscreen(),
      toggleSource: () => useVaultStore.getState().toggleEditorMode(),
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  // Responsive panels: close overlays on vault open and when shrinking below tablet.
  useEffect(() => {
    if (!vaultId) return;
    const apply = () => {
      if (window.innerWidth < 900) {
        setLeftOpen(false);
        setRightOpen(false);
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId]);

  // Live vault watching
  useEffect(() => {
    const watcher = new VaultWatcher();
    watcherRef.current = watcher;
    let desktopStop: (() => void) | null = null;

    if (mode === "fsa" && getFsaRoot()) {
      const dir = getFsaRoot()!;
      setWatcherAck((d: any) => watcher.acknowledgeWrite(d));

      setDesktopWatchAck(null);
      void watcher.startFsa(dir, (ev) => {
        if (ev.scan) {
          applyExternalSnapshot(ev.scan.nodes, ev.scan.rootIds);
        }
      });
    } else if (mode === "desktop" && getDesktopRoot()) {
      const root = getDesktopRoot()!;
      setWatcherAck(null);
      const handle = startDesktopWatch(
        root,
        (scan) => {
          applyExternalSnapshot(scan.nodes, scan.rootIds);
        },
        900,
        { metaOnly: shouldLazyBodies("desktop") },
      );
      setDesktopWatchAck(() => handle.acknowledge());
      desktopStop = handle.stop;
    } else if (vaultId) {
      setWatcherAck(null);
      setDesktopWatchAck(null);
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
      setDesktopWatchAck(null);
      desktopStop?.();
      watcher.stop();
      watcherRef.current = null;
    };
  }, [vaultId, mode, applyExternalSnapshot]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-deepest)]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] shadow-[0_0_28px_rgba(0,200,255,0.15)]">
            <NexusMark size={28} className="text-[var(--text-primary)]" />
          </div>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Starting {NEXUS_NAME}…
          </p>
        </div>
      </div>
    );
  }

  if (!vaultId) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-deepest)]">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <TitleBar />
        <OpenProgressBanner progress={openProgress} />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 outline-none">
          <WelcomeScreen />
        </main>
        <Toast />
        <CommandPalette />
        <SettingsPanel />
        <DeleteConfirmHost />
        <ConflictStudioHost />
        <KeyboardShortcuts />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-deepest)] text-[var(--text-primary)]">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <TitleBar />
      <OpenProgressBanner progress={openProgress} />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden outline-none"
      >
        {graphMode !== "fullscreen" ? <LeftSidebar /> : null}
        {graphMode !== "fullscreen" ? <EditorPane /> : null}
        <RightPanel />
      </main>
      <Toast />
      <CommandPalette />
      <SettingsPanel />
      <DeleteConfirmHost />
      <ConflictStudioHost />
      <KeyboardShortcuts />
    </div>
  );
}
