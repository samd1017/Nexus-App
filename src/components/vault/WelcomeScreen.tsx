import {
  Cloud,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Network,
  Radio,
  Sparkles,
  Database,
  AlertTriangle,
  Info,
  Loader2,
  Keyboard,
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
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const openLargeTestVault = useVaultStore((s) => s.openLargeTestVault);
  const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
  const connecting = useVaultStore((s) => s.connecting);
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const folderAccessLost = useVaultStore((s) => s.folderAccessLost);
  const setToast = useVaultStore((s) => s.setToast);
  const [createName, setCreateName] = useState("Nexus Vault");
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const fsaOk = canOpenLocalVaultFolder();
  const desktop = isDesktopShell();

  const topRecent = recentVaults[0] ?? null;
  const hasRecents = recentVaults.length > 0;

  useEffect(() => {
    if (!connecting) setPending(null);
  }, [connecting]);

  const run = (kind: Exclude<PendingAction, null>, fn: () => void) => {
    if (connecting) return;
    setPending(kind);
    fn();
  };

  const openTopRecent = () => {
    if (connecting || !topRecent) return;
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
    if (connecting) return;
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

  const onCreateVault = () => {
    if (connecting) return;
    if (!fsaOk) {
      setToast(
        desktop
          ? "Could not create vault"
          : "Creating a vault needs Chrome or Edge — or the desktop app. Try Explore demo first.",
      );
      return;
    }
    run("create", () => {
      void createNewVault(createName.trim() || "Nexus Vault");
      setShowCreate(false);
    });
  };

  const busy = connecting;
  const busyLabel = pending ? PENDING_LABEL[pending] : "Opening…";

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-auto bg-[var(--bg-deepest)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,200,255,0.08), transparent 55%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col px-6">
        {/* First viewport: brand + headline + one line + CTAs only */}
        <section className="flex min-h-[100dvh] flex-col justify-center py-12 sm:py-16">
          <div
            className="welcome-hero-brand flex flex-col items-start gap-4"
            style={{
              animation: "welcomeFadeUp 520ms ease-out both",
            }}
          >
            <div className="flex items-center gap-4">
              <NexusMark size={56} className="text-[var(--text-primary)]" />
              <div>
                <div
                  className="nexus-wordmark select-none text-[34px] font-semibold leading-none tracking-[-0.03em] text-[var(--text-primary)] sm:text-[40px]"
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
            className="mt-10 text-[22px] font-medium tracking-tight text-[var(--text-secondary)] sm:text-[24px]"
            style={{ animation: "welcomeFadeUp 520ms ease-out 80ms both" }}
          >
            Your notes. Your folder.
          </h1>
          <p
            className="mt-3 max-w-md text-[15px] leading-relaxed text-[var(--text-muted)]"
            style={{ animation: "welcomeFadeUp 520ms ease-out 140ms both" }}
          >
            Local-first Markdown. Zero accounts. Find anything fast.
          </p>

          {!fsaOk && !desktop ? (
            <div className="mt-6 flex flex-wrap items-start gap-3 rounded-[14px] border border-[rgba(0,200,255,0.28)] bg-[rgba(0,200,255,0.07)] px-4 py-3">
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

          {folderAccessLost ? (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[14px] border border-[rgba(255,159,10,0.35)] bg-[rgba(255,159,10,0.08)] px-4 py-3">
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
              className="mt-8 flex items-center gap-3 rounded-[14px] border border-[rgba(0,200,255,0.28)] bg-[rgba(0,200,255,0.07)] px-4 py-3"
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
            className="mt-8 flex flex-wrap gap-3"
            style={{ animation: "welcomeFadeUp 520ms ease-out 200ms both" }}
          >
            {hasRecents && topRecent ? (
              <>
                <button
                  type="button"
                  className="primary-btn min-h-11"
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
                    className="ghost-btn min-h-11"
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
                className="primary-btn min-h-11"
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

            {import.meta.env.DEV ? (
              <button
                type="button"
                className="ghost-btn min-h-11"
                disabled={busy}
                onClick={() => run("large", () => void openLargeTestVault())}
                title="Open the 45,000-note stress vault (in-browser, real app shell)"
              >
                {pending === "large" && busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Database size={16} />
                )}
                {pending === "large" && busy
                  ? "Loading 45k…"
                  : "Open 45k test vault"}
              </button>
            ) : null}

            <button
              type="button"
              className="ghost-btn min-h-11"
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
              className="ghost-btn min-h-11"
              disabled={busy || !fsaOk}
              onClick={() => {
                if (!fsaOk || busy) return;
                setShowCreate((v) => !v);
              }}
              title={!fsaOk ? "Not available in this browser" : undefined}
            >
              <FolderPlus size={16} />
              New vault
            </button>
          </div>

          {showCreate && fsaOk ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-[var(--border)] bg-[rgba(15,15,18,0.9)] p-3">
              <input
                className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-black/30 px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Vault name"
                aria-label="New vault name"
                disabled={busy}
              />
              <button
                type="button"
                className="primary-btn min-h-9"
                disabled={busy || !fsaOk}
                onClick={onCreateVault}
              >
                {pending === "create" && busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Create
              </button>
            </div>
          ) : null}
        </section>

        {/* Below fold: capabilities, privacy, cloud, recents */}
        <section className="pb-16">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: HardDrive,
                title: "Local-first",
                body: "Your folder of Markdown. No account required.",
              },
              {
                icon: Network,
                title: "Spatial graph",
                body: "See how notes link — neighborhood by default.",
              },
              {
                icon: Radio,
                title: "Live on disk",
                body: "Agents and apps write files; Nexus stays in sync.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-[14px] border border-[var(--border)] bg-[rgba(15,15,18,0.72)] p-4"
              >
                <Icon size={16} className="text-[var(--accent)]" />
                <div className="mt-2 text-[13px] font-medium text-[var(--text-primary)]">
                  {title}
                </div>
                <div className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
                  {body}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-10 max-w-lg text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            Privacy: notes stay on your device. Nexus does not upload vault
            contents or require an account for core editing.
          </p>

          <div className="mt-8 rounded-[14px] border border-[var(--border)] bg-[rgba(15,15,18,0.65)] p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
              <Cloud size={15} className="text-[var(--accent)]" />
              Want cloud sync?
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
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
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
