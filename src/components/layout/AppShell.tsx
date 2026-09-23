import { useEffect, useRef, useState } from "react";
import { TitleBar } from "@/components/chrome/TitleBar";
import { KeyboardShortcuts } from "@/components/chrome/KeyboardShortcuts";
import { Toast } from "@/components/chrome/Toast";
import { FirstRunCoach } from "@/components/chrome/FirstRunCoach";
import { ShortcutsSheet } from "@/components/chrome/ShortcutsSheet";
import { DeleteConfirmHost } from "@/components/chrome/DeleteConfirmHost";
import { ConflictStudioHost } from "@/components/conflict/ConflictStudioHost";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Workspace } from "@/components/layout/Workspace";
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
  vaultOpenLocked,
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
import { toggleGraphForViewport } from "@/lib/layout/viewport";
import { cn } from "@/lib/utils";
import { isLargeMemoryVault } from "@/lib/vault/scale-flags";
import { canOpenLocalVaultFolder } from "@/lib/platform";
import {
  CHROME_FSA_WATCH_MAX,
  chromeFsaRefuseBanner,
  chromeFsaWarnMessage,
} from "@/lib/vault/chrome-fsa-cap";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { fillProgressRatio, openProgressTail } from "@/lib/vault/sqlite-fill-progress";

function OpenProgressBanner() {
  // Subscribe here — not in AppShell — so 400ms fill ticks do not
  // re-render the tree / editor / 3D graph while FTS is filling.
  const [progress, setProgress] = useState<OpenProgress>(() => getOpenProgress());
  useEffect(() => subscribeOpenProgress(setProgress), []);

  // Auto-dismiss ready flash so the banner doesn't stick forever
  useEffect(() => {
    if (progress.phase !== "ready") return;
    // This Ready is the open page. Leave it up while the rest of the
    // folder is still being listed, so it is not mistaken for a flash.
    if (progress.message.includes("titles and open notes")) return;
    const t = window.setTimeout(() => {
      const cur = getOpenProgress();
      if (cur.phase === "ready") {
        setOpenProgress({
          phase: "idle",
          scanned: 0,
          totalHint: null,
          message: "",
        });
      }
    }, 1400);
    return () => window.clearTimeout(t);
  }, [progress.phase, progress.scanned, progress.message]);

  if (
    progress.phase !== "walking" &&
    progress.phase !== "indexing" &&
    progress.phase !== "error" &&
    progress.phase !== "ready"
  ) {
    return null;
  }

  const isReady = progress.phase === "ready";
  const isError = progress.phase === "error";
  const ratio =
    isError || isReady
      ? null
      : fillProgressRatio(progress.scanned, progress.totalHint);
  const valueNow =
    ratio != null ? Math.round(ratio * 100) : undefined;

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
          : isReady
            ? "border-[rgba(48,209,88,0.28)] bg-[rgba(48,209,88,0.08)] text-[var(--success)]"
            : "border-[var(--border)] bg-[rgba(0,200,255,0.06)] text-[var(--text-secondary)]",
      )}
      data-open-progress={progress.phase}
      role={valueNow != null ? "progressbar" : "status"}
      aria-valuenow={valueNow}
      aria-valuemin={valueNow != null ? 0 : undefined}
      aria-valuemax={valueNow != null ? 100 : undefined}
      aria-busy={!isError && !isReady ? true : undefined}
    >
      <div className="flex items-center gap-2">
        {!isError ? (
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              isReady
                ? "bg-[var(--success)]"
                : "animate-pulse bg-[var(--accent)]",
            )}
          />
        ) : null}
        <span className="min-w-0 flex-1">
          {progress.message ||
            (isError ? "Open failed" : isReady ? "Ready" : "Opening vault…")}
        </span>
        {progress.scanned > 0 ? (
          <span className={isReady ? "text-[var(--success)]/80" : "text-[var(--text-muted)]"}>
            {openProgressTail(progress.phase, progress.scanned, progress.totalHint)}
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

function ChromeFsaLimitBanner() {
  const limit = useVaultStore((s) => s.chromeFsaLimit);
  if (!limit) return null;
  const refuse = limit.kind === "refuse";
  return (
    <div
      className={
        refuse
          ? "flex shrink-0 items-center gap-2 border-b border-[rgba(255,69,58,0.35)] bg-[rgba(255,69,58,0.1)] px-3 py-1.5 text-[12px] text-[var(--text-primary)]"
          : "flex shrink-0 items-center gap-2 border-b border-[rgba(255,159,10,0.35)] bg-[rgba(255,159,10,0.12)] px-3 py-2 text-[12px] leading-snug text-[var(--warning)]"
      }
      data-chrome-fsa-limit={limit.kind}
      role={refuse ? "alert" : "status"}
    >
      <span className="min-w-0 flex-1">
        {refuse
          ? chromeFsaRefuseBanner(limit.notes, limit.name)
          : chromeFsaWarnMessage(limit.notes)}
      </span>
    </div>
  );
}

function LargeVaultOverlayBanner({ vaultId }: { vaultId: string | null }) {
  if (!isLargeMemoryVault(vaultId)) return null;
  const openFolder = () => {
    if (vaultOpenLocked()) return;
    if (!canOpenLocalVaultFolder()) {
      useVaultStore
        .getState()
        .setToast(
          "Open a folder in Chrome, Edge, or the desktop app for notes that live as files.",
        );
      return;
    }
    void useVaultStore.getState().openFolderAsVault();
  };
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-[rgba(255,159,10,0.22)] bg-[rgba(255,159,10,0.07)] px-3 py-1 text-[11px] text-[var(--warning)]"
      data-large-vault-overlay
      role="status"
    >
      <span className="min-w-0 flex-1">
        In-browser test vault — new notes and edits stay in this browser, not as
        files. Open a folder for a real vault that survives across machines.
      </span>
      <button
        type="button"
        className="ghost-btn shrink-0 px-2 py-0.5 text-[11px]"
        data-large-vault-open-folder
        onClick={openFolder}
      >
        Open a folder
      </button>
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
  useEffect(() => {
    applyPrefsToDom(getPrefs());
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyPrefsToDom(getPrefs());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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
        void useVaultStore.getState().openFolderAsVault();
      },
      openDemo: () => {
        useVaultStore.getState().openDemoVault();
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
      toggleGraph: () => toggleGraphForViewport(),
      toggleSource: () => useVaultStore.getState().toggleEditorMode(),
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  // Dev-only: VITE_OPEN_VAULT=/absolute/folder opens that vault on desktop
  // startup, skipping the native folder picker.
  useEffect(() => {
    const path = import.meta.env.VITE_OPEN_VAULT;
    if (!import.meta.env.DEV || typeof path !== "string" || !path.trim()) return;
    const soak = (
      window as unknown as {
        __NEXUS_SOAK__?: {
          openDesktop: (abs: string) => Promise<unknown>;
        };
      }
    ).__NEXUS_SOAK__;
    if (!soak) return;
    void soak
      .openDesktop(path.trim())
      .then(() => {
        useVaultStore.getState().setGraphMode("fullscreen");
      })
      .catch(() => {
        /* picker-less open is best-effort in dev */
      });
  }, []);

  // Responsive panels: auto-close on narrow vault open + when crossing below tablet width
  useEffect(() => {
    if (!vaultId) return;
    let wasNarrow = window.innerWidth < 900;
    if (wasNarrow) {
      setLeftOpen(false);
      setRightOpen(false);
      if (window.innerWidth < 640) {
        const st = useVaultStore.getState();
        if (st.settings.graphMode === "panel") st.setGraphMode("hidden");
      }
    }
    const onResize = () => {
      const narrow = window.innerWidth < 900;
      if (narrow && !wasNarrow) {
        setLeftOpen(false);
        setRightOpen(false);
        if (window.innerWidth < 640) {
          const st = useVaultStore.getState();
          if (st.settings.graphMode === "panel") st.setGraphMode("hidden");
        }
      }
      wasNarrow = narrow;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId]);

  // Live vault watching
  useEffect(() => {
    const watcher = new VaultWatcher();
    watcherRef.current = watcher;
    let desktopStop: (() => void) | null = null;

    if (mode === "fsa" && getFsaRoot()) {
      const dir = getFsaRoot()!;
      const shellNow = useVaultStore.getState();
      let notes = shellNow.shellCatalog ? shellNow.catalogNoteCount : 0;
      if (!shellNow.shellCatalog) {
        try {
          notes = ensureVaultIndex(shellNow.nodes).noteCount;
        } catch {
          /* ignore */
        }
      }
      if (shellNow.shellCatalog) {
        // One path at a time. A signature poll would copy the folder back into the tab.
        setWatcherAck(null);
        setDesktopWatchAck(null);
        void watcher.startFsaShell(
          dir,
          (paths) => {
            if (!paths.length) return;
            useVaultStore.getState().refreshShellPaths(paths);
          },
          () => {
            const live = useVaultStore.getState();
            const paths = [""];
            for (const id of live.expandedFolders) {
              const node = live.nodes[id];
              if (node?.kind === "folder" && node.path) paths.push(node.path);
            }
            return paths;
          },
        );
      } else if (notes >= CHROME_FSA_WATCH_MAX) {
        // Signature poll + FileSystemObserver re-walked 20k–100k files and
        // discarded Chrome while opening notes 8–12.
        setWatcherAck(null);
        setDesktopWatchAck(null);
      } else {
        setWatcherAck((d: any) => watcher.acknowledgeWrite(d));
        setDesktopWatchAck(null);
        void watcher.startFsa(dir, (ev) => {
          if (ev.scan) {
            applyExternalSnapshot(ev.scan.nodes, ev.scan.rootIds);
          }
        });
      }
    } else if (mode === "desktop" && getDesktopRoot()) {
      const root = getDesktopRoot()!;
      setWatcherAck(null);
      const shellWindow = useVaultStore.getState().shellCatalog;
      const handle = startDesktopWatch(
        root,
        (scan) => {
          if (useVaultStore.getState().shellCatalog) return;
          applyExternalSnapshot(scan.nodes, scan.rootIds);
        },
        900,
        shellWindow
          ? {
              metaOnly: true,
              shellWindow: true,
              onPaths: (paths) => useVaultStore.getState().refreshShellPaths(paths),
            }
          : { metaOnly: shouldLazyBodies("desktop") },
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
        <OpenProgressBanner />
        <ChromeFsaLimitBanner />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 outline-none">
          <WelcomeScreen />
        </main>
        <Toast />
        <CommandPalette />
        <SettingsPanel />
        <DeleteConfirmHost />
        <ConflictStudioHost />
        <ShortcutsSheet />
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
      <OpenProgressBanner />
      <LargeVaultOverlayBanner vaultId={vaultId} />
      <ChromeFsaLimitBanner />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden outline-none"
      >
        {graphMode !== "fullscreen" ? <LeftSidebar /> : null}
        {graphMode !== "fullscreen" ? <Workspace /> : null}
        <RightPanel />
      </main>
      {graphMode !== "fullscreen" ? <MobileBottomNav /> : null}
      <Toast />
      <CommandPalette />
      <SettingsPanel />
      <DeleteConfirmHost />
      <ConflictStudioHost />
      <FirstRunCoach />
      <ShortcutsSheet />
      <KeyboardShortcuts />
    </div>
  );
}
