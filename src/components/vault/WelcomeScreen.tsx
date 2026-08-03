import {
  Cloud,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Network,
  Radio,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { CLOUD_SYNC_HINT } from "@/lib/cloud/oauth";
import {
  NexusMark,
  NexusWordmark,
  NEXUS_NAME,
  NEXUS_TAGLINE,
} from "@/components/brand/NexusLogo";
import { isDesktopShell } from "@/lib/platform";

export function WelcomeScreen() {
  const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
  const createNewVault = useVaultStore((s) => s.createNewVault);
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
  const connecting = useVaultStore((s) => s.connecting);
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const [createName, setCreateName] = useState("Nexus Vault");
  const [showCreate, setShowCreate] = useState(false);

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

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col px-6 py-12 sm:py-16">
        <div className="flex items-center gap-3">
          <NexusMark size={40} className="text-[var(--text-primary)]" />
          <div>
            <NexusWordmark size="lg" showMark={false} />
            <div className="text-[12.5px] text-[var(--accent)]">{NEXUS_TAGLINE}</div>
          </div>
        </div>

        <h1 className="mt-8 text-[28px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[32px]">
          Your notes. Your folder.
        </h1>
        <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Local-first. Zero accounts. Real{" "}
          <span className="text-[var(--text-primary)]">.md</span> files Hermes can
          edit. Visual editor, live graph, progressive power.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="primary-btn min-h-11"
            disabled={connecting}
            onClick={() => void openFolderAsVault()}
          >
            <FolderOpen size={16} />
            {connecting ? "Opening…" : "Open folder…"}
          </button>
          <button
            type="button"
            className="ghost-btn min-h-11"
            disabled={connecting}
            onClick={() => setShowCreate(true)}
          >
            <FolderPlus size={16} />
            New vault…
          </button>
          <button
            type="button"
            className="ghost-btn min-h-11"
            onClick={() => openDemoVault()}
          >
            <Sparkles size={16} className="text-[var(--accent-violet)]" />
            Explore demo
          </button>
        </div>

        <p className="mt-3 text-[12.5px] text-[var(--text-muted)]">
          {isDesktopShell()
            ? "Desktop: native folder picker · real .md files on disk · zero accounts."
            : "Your vault is a normal folder. No proprietary database. No sign-in."}
        </p>

        {showCreate ? (
          <div className="glass-panel mt-6 rounded-[16px] p-4">
            <div className="text-[13px] font-semibold">Create a new vault</div>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              Name the vault, then choose the parent folder. Nexus creates the
              folder and a Welcome note.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="min-w-[180px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]"
                placeholder="Nexus Vault"
              />
              <button
                type="button"
                className="primary-btn"
                disabled={connecting}
                onClick={() => {
                  void createNewVault(createName.trim() || "Nexus Vault");
                  setShowCreate(false);
                }}
              >
                Create…
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

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
              <div className="text-[13.5px] font-semibold tracking-tight">
                {f.title}
              </div>
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
              <div className="text-[14px] font-semibold">
                Want cloud sync?
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                {CLOUD_SYNC_HINT}
              </p>
              <button
                type="button"
                className="chip-btn is-active mt-3"
                onClick={() => void openFolderAsVault()}
              >
                <FolderOpen size={13} />
                Open a synced folder…
              </button>
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
                    else void reopenRecentVault(r.id);
                  }}
                >
                  <HardDrive size={14} className="text-[var(--accent)]" />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">
                      {r.name}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {r.path}
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
