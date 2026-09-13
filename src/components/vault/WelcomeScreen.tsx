import {
  Cloud,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Network,
  Sparkles,
  Database,
  AlertTriangle,
  Info,
  Loader2,
  Keyboard,
  Highlighter,
  Search,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { CLOUD_SYNC_HINT } from "@/lib/cloud/oauth";
import {
  NexusMark,
  NEXUS_NAME,
  NEXUS_TAGLINE,
} from "@/components/brand/NexusLogo";
import { canOpenLocalVaultFolder, isDesktopShell } from "@/lib/platform";
import { ThemeToggle } from "@/components/chrome/ThemeToggle";
import {
  chromeFsaRefuseChrome,
  chromeFsaRefuseDesktop,
  chromeFsaRefuseLead,
  chromeFsaRefuseTitle,
  chromeFsaWarnMessage,
} from "@/lib/vault/chrome-fsa-cap";

type PendingAction =
  | null
  | "recent"
  | "demo"
  | "large"
  | "folder"
  | "create"
  | "reopen";

const PENDING_LABEL: Record<Exclude<PendingAction, null>, string> = {
  recent: "Opening recent vault…",
  demo: "Opening demo vault…",
  large: "Loading 45,000-note test vault…",
  folder: "Opening folder…",
  create: "Creating vault…",
  reopen: "Re-opening folder…",
};

export function WelcomeScreen() {
  const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
  const createNewVault = useVaultStore((s) => s.createNewVault);
  const createMemoryVault = useVaultStore((s) => s.createMemoryVault);
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const openLargeTestVault = useVaultStore((s) => s.openLargeTestVault);
  const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
  const connecting = useVaultStore((s) => s.connecting);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const folderAccessLost = useVaultStore((s) => s.folderAccessLost);
  const chromeFsaLimit = useVaultStore((s) => s.chromeFsaLimit);
  const setToast = useVaultStore((s) => s.setToast);
  const [createName, setCreateName] = useState("Nexus Vault");
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const fsaOk = canOpenLocalVaultFolder();
  const desktop = isDesktopShell();

  const topRecent = recentVaults[0] ?? null;
  const hasRecents = recentVaults.length > 0;

  useEffect(() => {
    if (!connecting && !indexFillBusy) setPending(null);
  }, [connecting, indexFillBusy]);

  const run = (kind: Exclude<PendingAction, null>, fn: () => void) => {
    if (connecting || indexFillBusy) return;
    setPending(kind);
    fn();
  };

  const openTopRecent = () => {
    if (connecting || indexFillBusy || !topRecent) return;
    run("recent", () => {
      if (topRecent.mode === "demo") openDemoVault();
      else if (
        import.meta.env.DEV &&
        (topRecent.id === "large-test-vault-45k" ||
          topRecent.path?.includes("Large Test Vault"))
      ) {
        void openLargeTestVault();
      } else if (
        topRecent.id === "large-test-vault-45k" ||
        topRecent.path?.includes("Large Test Vault")
      ) {
        setPending(null);
        setToast("Large test vault is only available in development");
      } else void reopenRecentVault(topRecent.id);
    });
  };

  const onOpenFolder = () => {
    if (connecting || indexFillBusy) return;
    if (!fsaOk) {
      setToast(
        desktop
          ? "Could not open folder picker"
          : "Open folder needs Chrome or Edge — or use the desktop app. Explore demo works anywhere.",
      );
      return;
    }
    run("folder", () => {
      void openFolderAsVault();
    });
  };

  const onCreateVault = (onDisk: boolean) => {
    if (connecting || indexFillBusy) return;
    const name = createName.trim() || "Nexus Vault";
    if (onDisk && !fsaOk && !desktop) {
      setToast(
        "Folder create needs Chrome or Edge — created in this browser instead.",
      );
      run("create", () => {
        createMemoryVault(name);
        setShowCreate(false);
      });
      return;
    }
    run("create", () => {
      if (onDisk) void createNewVault(name);
      else createMemoryVault(name);
      setShowCreate(false);
    });
  };

  const busy = connecting || indexFillBusy;
  const busyLabel = pending
    ? PENDING_LABEL[pending]
    : indexFillBusy && !connecting
      ? "Indexing…"
      : "Opening…";

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-auto bg-[var(--bg-deepest)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 90% 55% at 12% -10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 52%), radial-gradient(ellipse 70% 45% at 92% 8%, color-mix(in srgb, var(--accent-violet) 18%, transparent), transparent 50%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--text-primary) 7%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--text-primary) 7%, transparent) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 20%, #000 20%, transparent 75%)",
        }}
      />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-5">
        <ThemeToggle showLabel />
      </div>

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-col px-6">
        <section className="flex min-h-full flex-col justify-center py-14 sm:py-18">
          <div
            className="welcome-hero-brand flex flex-col items-start gap-5"
            style={{ animation: "welcomeFadeUp 520ms ease-out both" }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--fill-subtle)] px-3 py-1 text-[11px] font-medium tracking-wide text-[var(--text-secondary)]">
              <Zap size={12} className="text-[var(--accent)]" />
              Same Markdown folder as your agents
            </div>
            <div className="flex items-center gap-4">
              <NexusMark size={60} className="text-[var(--text-primary)]" />
              <div>
                <div
                  className="nexus-wordmark select-none text-[38px] font-semibold leading-none tracking-[-0.04em] text-[var(--text-primary)] sm:text-[46px]"
                  aria-label="Nexus"
                >
                  Nexus
                </div>
                <div className="mt-2 text-[13px] tracking-wide text-[var(--accent)]">
                  {NEXUS_TAGLINE}
                </div>
              </div>
            </div>
          </div>

          <h1
            className="mt-10 max-w-xl text-[28px] font-semibold leading-[1.15] tracking-tight text-[var(--text-primary)] sm:text-[34px]"
            style={{ animation: "welcomeFadeUp 520ms ease-out 80ms both" }}
          >
            A writing surface that stays fast
            <span className="text-[var(--text-muted)]">
              {" "}
              — Desktop for large vaults.
            </span>
          </h1>
          <p
            className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-[var(--text-secondary)]"
            style={{ animation: "welcomeFadeUp 520ms ease-out 140ms both" }}
          >
            Local-first Markdown. Visual + Source. Live folder sync. Light or dark.
            Zero accounts.
          </p>

          {!fsaOk && !desktop ? (
            <div className="mt-6 flex flex-wrap items-start gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-[var(--accent-dim)] px-4 py-3">
              <Info size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">
                  Folder open isn’t available in this browser.
                </strong>{" "}
                Use Chrome or Edge, install the desktop app for full vaults, or{" "}
                <button
                  type="button"
                  className="text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline"
                  disabled={busy}
                  onClick={() => run("demo", () => openDemoVault())}
                >
                  explore the demo
                </button>{" "}
                (in-browser only).
              </div>
            </div>
          ) : null}

          {chromeFsaLimit?.kind === "warn" ? (
            <div
              className="mt-6 rounded-[14px] border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[var(--warning-dim)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]"
              data-chrome-fsa-limit="warn"
              role="status"
            >
              <strong className="text-[var(--text-primary)]">
                Large folder for Chrome
              </strong>
              <p className="mt-1">{chromeFsaWarnMessage(chromeFsaLimit.notes)}</p>
            </div>
          ) : null}

          {chromeFsaLimit?.kind === "refuse" ? (
            <div
              className="mt-6 rounded-[14px] border border-[color-mix(in_srgb,#ff453a_40%,transparent)] bg-[rgba(255,69,58,0.08)] px-4 py-3 text-[13px] leading-relaxed text-[var(--text-secondary)]"
              data-chrome-fsa-refused
              data-chrome-fsa-desktop-required
              role="alert"
            >
              <strong className="text-[var(--text-primary)]">
                {chromeFsaRefuseTitle(chromeFsaLimit.name)}
              </strong>
              <p className="mt-1" data-chrome-fsa-refuse-lead>
                {chromeFsaRefuseLead(chromeFsaLimit.notes)}
              </p>
              <p className="mt-2" data-chrome-fsa-refuse-desktop>
                {chromeFsaRefuseDesktop()}
              </p>
              <p className="mt-2" data-chrome-fsa-refuse-chrome>
                {chromeFsaRefuseChrome()}
              </p>
            </div>
          ) : null}

          {folderAccessLost ? (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-dim)] px-4 py-3">
              <AlertTriangle
                size={16}
                className="shrink-0 text-[var(--warning,#FF9F0A)]"
              />
              <div className="min-w-0 flex-1 text-[13px] text-[var(--text-secondary)]">
                Folder access lost — click to re-open
              </div>
              <button
                type="button"
                className="primary-btn min-h-9"
                disabled={busy || !fsaOk}
                onClick={() => {
                  if (!fsaOk || busy) return;
                  run("reopen", () => {
                    void openFolderAsVault();
                  });
                }}
              >
                {pending === "reopen" && busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FolderOpen size={14} />
                )}
                {pending === "reopen" && busy ? "Opening…" : "Re-open folder"}
              </button>
            </div>
          ) : null}

          {busy ? (
            <div
              className="mt-8 flex items-center gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-[var(--accent-dim)] px-4 py-3"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2
                size={16}
                className="shrink-0 animate-spin text-[var(--accent)]"
              />
              <div className="min-w-0 flex-1 text-[13px] text-[var(--text-primary)]">
                {busyLabel}
              </div>
            </div>
          ) : null}

          <div
            className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap"
            style={{ animation: "welcomeFadeUp 520ms ease-out 200ms both" }}
          >
            {hasRecents && topRecent ? (
              <>
                <button
                  type="button"
                  className="primary-btn min-h-11 w-full justify-center sm:w-auto"
                  disabled={busy}
                  onClick={openTopRecent}
                >
                  {pending === "recent" && busy ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <HardDrive size={16} />
                  )}
                  {pending === "recent" && busy
                    ? "Opening…"
                    : topRecent.mode === "demo"
                      ? "Continue demo"
                      : `Open ${topRecent.name}`}
                </button>
                {topRecent.mode !== "demo" ? (
                  <button
                    type="button"
                    className="ghost-btn min-h-11 w-full justify-center sm:w-auto"
                    disabled={busy}
                    onClick={() => run("demo", () => openDemoVault())}
                  >
                    <Sparkles size={16} />
                    Explore demo
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                className="primary-btn min-h-11 w-full justify-center sm:w-auto"
                disabled={busy}
                onClick={() => run("demo", () => openDemoVault())}
              >
                {pending === "demo" && busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {pending === "demo" && busy ? "Opening…" : "Explore demo"}
              </button>
            )}

            <button
              type="button"
              className="ghost-btn min-h-11 w-full justify-center sm:w-auto"
              disabled={busy || !fsaOk}
              onClick={onOpenFolder}
              title={!fsaOk ? "Not available in this browser" : undefined}
            >
              {pending === "folder" && busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FolderOpen size={16} />
              )}
              {pending === "folder" && busy ? "Opening…" : "Open folder…"}
            </button>
            <button
              type="button"
              className="ghost-btn min-h-11 w-full justify-center sm:w-auto"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                setShowCreate((v) => !v);
              }}
            >
              <FolderPlus size={16} />
              New vault
            </button>
          </div>

          {showCreate ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <input
                className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Vault name"
                aria-label="New vault name"
                disabled={busy}
              />
              <button
                type="button"
                className="primary-btn min-h-9"
                disabled={busy}
                onClick={() => onCreateVault(false)}
              >
                {pending === "create" && busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Create
              </button>
              {fsaOk || desktop ? (
                <button
                  type="button"
                  className="ghost-btn min-h-9"
                  disabled={busy}
                  onClick={() => onCreateVault(true)}
                >
                  On disk…
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="pb-16">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Highlighter,
                title: "Write",
                body: "Visual editor, callouts, highlights, properties.",
              },
              {
                icon: Search,
                title: "Find",
                body: "Chrome: about 20,000 notes. Desktop: SQLite FTS5 for 100k+.",
              },
              {
                icon: Network,
                title: "See",
                body: "Spatial graph — neighborhood, then the whole vault.",
              },
              {
                icon: Cloud,
                title: "Sync",
                body: "Your folder + live watcher. Dropbox, Drive, iCloud.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-panel)]"
              >
                <Icon size={16} className="text-[var(--accent)]" />
                <div className="mt-2 text-[13.5px] font-semibold text-[var(--text-primary)]">
                  {title}
                </div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                  {body}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[16px] border border-[var(--border)] bg-[var(--fill-subtle)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
            Chrome in the browser: about 20,000 notes. A lifetime
            Obsidian-sized vault (100k–300k) needs Nexus Desktop — same
            markdown folder, SQLite search, no tab discard. We will not open
            25,000+ notes in Chrome.
          </div>

          <p className="mt-8 max-w-lg text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            Privacy: notes stay on your device. Nexus does not upload vault
            contents or require an account for core editing.
          </p>

          {import.meta.env.DEV ? (
            <div className="mt-8 rounded-[14px] border border-dashed border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[var(--fill-subtle)] p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
                <Database size={15} className="text-[var(--accent)]" />
                Developer · scale QA
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                In-browser 45,000-note vault for stress testing. Not shown in
                production builds — also available from the command palette
                (Ctrl+K → “45k”).
              </p>
              <button
                type="button"
                className="ghost-btn mt-3 min-h-9"
                disabled={busy}
                onClick={() => run("large", () => void openLargeTestVault())}
                title="Open the 45,000-note stress vault (in-browser, real app shell)"
              >
                {pending === "large" && busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Database size={14} />
                )}
                {pending === "large" && busy
                  ? "Loading 45k…"
                  : "Open 45k test vault"}
              </button>
            </div>
          ) : null}

          <div className="mt-8 rounded-[14px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
              <Cloud size={15} className="text-[var(--accent)]" />
              Built-in folder sync
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              {CLOUD_SYNC_HINT}
            </p>
            <button
              type="button"
              className="ghost-btn mt-3 min-h-9"
              disabled={busy || !fsaOk}
              onClick={onOpenFolder}
              title={!fsaOk ? "Not available in this browser" : undefined}
            >
              <FolderOpen size={14} />
              Open a synced folder…
            </button>
          </div>

          {hasRecents ? (
            <div className="mt-10">
              <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Recent vaults
              </div>
              <ul className="mt-2 space-y-1">
                {recentVaults
                  .slice(0, 6)
                  .map(
                    (r: {
                      id: string;
                      name: string;
                      path: string;
                      mode: string;
                    }) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          disabled={busy}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--fill-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => {
                            if (busy) return;
                            run("recent", () => {
                              if (r.mode === "demo") openDemoVault();
                              else if (
                                import.meta.env.DEV &&
                                (r.id === "large-test-vault-45k" ||
                                  (r.path &&
                                    r.path.includes("Large Test Vault")))
                              ) {
                                void openLargeTestVault();
                              } else if (
                                r.id === "large-test-vault-45k" ||
                                (r.path && r.path.includes("Large Test Vault"))
                              ) {
                                setPending(null);
                                setToast(
                                  "Large test vault is only available in development",
                                );
                              } else void reopenRecentVault(r.id);
                            });
                          }}
                        >
                          <HardDrive size={14} className="shrink-0 opacity-60" />
                          <span className="truncate font-medium">{r.name}</span>
                          <span className="ml-auto truncate text-[11px] text-[var(--text-muted)]">
                            {r.path}
                          </span>
                        </button>
                      </li>
                    ),
                  )}
              </ul>
            </div>
          ) : null}

          <div className="mt-12 flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
            <span>{NEXUS_NAME} · notes for humans and agents</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              onClick={() =>
                window.dispatchEvent(new Event("nexus:open-shortcuts"))
              }
            >
              <Keyboard size={12} />
              Shortcuts (?)
            </button>
          </div>
        </section>
      </div>

      <style>{`
        @keyframes welcomeFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
