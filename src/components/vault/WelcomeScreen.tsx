import {
  Cloud,
  FolderOpen,
  HardDrive,
  Network,
  Radio,
  Sparkles,
} from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import {
  CLOUD_SYNC_HINT,
  preferSyncedProvider,
  providerLabel,
  providerSyncHint,
  type CloudProvider,
} from "@/lib/cloud/oauth";
import {
  NexusMark,
  NexusWordmark,
  NEXUS_NAME,
  NEXUS_TAGLINE,
} from "@/components/brand/NexusLogo";

const PROVIDERS: CloudProvider[] = ["dropbox", "google", "onedrive"];

export function WelcomeScreen() {
  const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
  const connecting = useVaultStore((s) => s.connecting);
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const cloudSession = useVaultStore((s) => s.cloudSession);
  const setToast = useVaultStore((s) => s.setToast);
  const refreshCloudSession = useVaultStore((s) => s.refreshCloudSession);

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-auto bg-[var(--bg-deepest)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,200,255,0.14), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 80%, rgba(123,97,255,0.09), transparent 50%)",
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

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.28)] bg-[linear-gradient(145deg,#1a1e28_0%,#0a0c12_55%,#05070c_100%)] shadow-[0_4px_16px_rgba(0,0,0,0.45),0_0_28px_rgba(0,200,255,0.16)]">
            <NexusMark size={36} className="text-[var(--text-primary)]" />
          </div>
          <div className="min-w-0">
            <NexusWordmark size="md" showMark={false} />
            <div className="mt-0.5 text-[12.5px] font-medium tracking-[0.02em] text-[var(--accent)]">
              {NEXUS_TAGLINE}
            </div>
          </div>
        </div>

        <h1 className="mt-6 max-w-xl text-[clamp(1.85rem,4vw,2.65rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--text-primary)]">
          Your second brain, in plain Markdown.
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Local-first. Zero accounts. Real{" "}
          <span className="text-[var(--text-primary)]">.md</span> files Hermes can edit.
          Visual editor, live graph, progressive power.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="primary-btn min-h-11"
            disabled={connecting}
            onClick={() => void openFolderAsVault()}
          >
            <FolderOpen size={16} />
            {connecting ? "Opening…" : "Open folder as vault"}
          </button>
          <button
            type="button"
            className="ghost-btn min-h-11"
            onClick={() => openDemoVault()}
          >
            <Sparkles size={16} className="text-[var(--accent-violet)]" />
            Explore demo vault
          </button>
        </div>

        <p className="mt-3 text-[12.5px] text-[var(--text-muted)]">
          Your vault is a normal folder. No proprietary database. No sign-in.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: <HardDrive size={16} />,
              title: "Local-first",
              body: "Pick any folder. Notes stay on disk as clean Markdown.",
            },
            {
              icon: <Network size={16} />,
              title: "Spatial graph",
              body: "Force-directed map of [[wikilinks]] with glow and physics.",
            },
            {
              icon: <Radio size={16} />,
              title: "Hermes-ready",
              body: "External writes appear within ~1 second via live watch.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="glass-panel rounded-[14px] p-4 transition-[transform,border-color] duration-200 hover:scale-[1.015] hover:border-[rgba(0,200,255,0.22)]"
            >
              <div className="mb-2 text-[var(--accent)]">{f.icon}</div>
              <div className="text-[13.5px] font-semibold tracking-tight">{f.title}</div>
              <p className="mt-1 text-[12.5px] leading-snug text-[var(--text-muted)]">
                {f.body}
              </p>
            </div>
          ))}
        </div>

        <div className="glass-panel mt-8 rounded-[16px] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(123,97,255,0.12)] text-[var(--accent-violet)]">
              <Cloud size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">Cloud via synced folders</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                {CLOUD_SYNC_HINT}
              </p>
              {cloudSession ? (
                <p className="mt-2 text-[12px] text-[var(--success)]">
                  Preference: {cloudSession.label}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      preferSyncedProvider(p);
                      refreshCloudSession();
                      setToast(providerSyncHint(p));
                    }}
                    title={providerSyncHint(p)}
                  >
                    {providerLabel(p)}
                  </button>
                ))}
                <button
                  type="button"
                  className="chip-btn is-active"
                  onClick={() => void openFolderAsVault()}
                >
                  <FolderOpen size={13} />
                  Open synced folder
                </button>
              </div>
            </div>
          </div>
        </div>

        {recentVaults.length > 0 ? (
          <div className="mt-8">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Recent
            </div>
            <div className="flex flex-col gap-1.5">
              {recentVaults.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-[rgba(0,200,255,0.25)] hover:bg-[rgba(0,200,255,0.05)]"
                  onClick={() => {
                    if (r.mode === "demo") openDemoVault();
                    else if (r.mode === "fsa") void reopenRecentVault(r.id);
                    else openDemoVault();
                  }}
                >
                  <HardDrive size={14} className="text-[var(--accent)]" />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{r.name}</div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {r.path} · {r.mode === "fsa" ? "local folder" : r.mode}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-10 text-center text-[11.5px] tracking-wide text-[var(--text-muted)]">
          {NEXUS_NAME} · {NEXUS_TAGLINE}
        </p>
      </div>
    </div>
  );
}
