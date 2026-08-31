import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  HardDrive,
  MoreHorizontal,
  Sparkles,
  X,
  ExternalLink,
} from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { isLargeMemoryVault } from "@/lib/vault/scale-flags";
import {
  formatShortcut,
  isAppleModPlatform,
  isDesktopShell,
} from "@/lib/platform";
import { cn } from "@/lib/utils";

/**
 * Finder-style vault menu:
 * Recents → Open → Create → Reveal → Close
 * Cloud / demo / Hermes are not primary destinations.
 */
export function VaultSwitcher() {
  const vaultId = useVaultStore((s) => s.vaultId);
  const vaultName = useVaultStore((s) => s.vaultName);
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const mode = useVaultStore((s) => s.mode);
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const openLargeTestVault = useVaultStore((s) => s.openLargeTestVault);
  const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
  const createNewVault = useVaultStore((s) => s.createNewVault);
  const revealVaultInFinder = useVaultStore((s) => s.revealVaultInFinder);
  const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
  const closeVault = useVaultStore((s) => s.closeVault);
  const connecting = useVaultStore((s) => s.connecting);

  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("Nexus Vault");
  const rootRef = useRef<HTMLDivElement>(null);
  const desktop = isDesktopShell();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setMoreOpen(false);
        setCreateOpen(false);
      }
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const subtitle =
    mode === "desktop"
      ? vaultPath || "Local folder"
      : mode === "fsa"
        ? "Local folder · live watch"
        : mode === "demo" && vaultId
          ? "Demo · in memory"
          : isLargeMemoryVault(vaultId)
            ? "Test vault · in memory"
            : "Plain Markdown folder";

  const canReveal = Boolean(vaultId && mode === "desktop" && vaultPath);

  const openRecent = (id: string, rMode: string) => {
    if (connecting) return;
    const r = recentVaults.find((x) => x.id === id);
    if (rMode === "demo") openDemoVault();
    else if (
      id === "large-test-vault-45k" ||
      r?.id === "large-test-vault-45k" ||
      (typeof r?.path === "string" && r.path.includes("Large Test Vault"))
    )
      if (import.meta.env.DEV) void openLargeTestVault();
      else useVaultStore.getState().setToast("Large test vault is only available in development");
    else void reopenRecentVault(id);
    setOpen(false);
  };

  const submitCreate = () => {
    if (connecting) return;
    const name = createName.trim() || "Nexus Vault";
    setCreateOpen(false);
    setOpen(false);
    void createNewVault(name);
  };

  return (
    <div className="relative px-3 pt-3" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-[12px] border border-[var(--border)] bg-white/[0.03] px-3 py-2.5 text-left transition-[border-color,background,transform] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:border-[rgba(0,200,255,0.25)] hover:bg-white/[0.05]",
          open && "border-[rgba(0,200,255,0.3)] accent-glow",
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(0,200,255,0.12)] text-[var(--accent)]">
          <HardDrive size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold tracking-tight">
            {vaultName || "Select vault"}
          </div>
          <div className="truncate text-[11px] text-[var(--text-muted)]">
            {connecting ? "Working…" : subtitle}
          </div>
        </div>
        <ChevronDown
          size={15}
          className={cn(
            "shrink-0 text-[var(--text-muted)] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="glass-elevated absolute left-3 right-3 top-[calc(100%+6px)] z-50 max-h-[min(70vh,520px)] overflow-y-auto rounded-[14px] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
          {/* Open Recent */}
          {recentVaults.length > 0 ? (
            <>
              <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Open Recent
              </div>
              {recentVaults.slice(0, 8).map((r: any) => {
                const active = r.id === vaultId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={connecting}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-[10px] px-2.5 py-2 text-left hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40",
                      active && "bg-[rgba(0,200,255,0.08)]",
                    )}
                    onClick={() => openRecent(r.id, r.mode)}
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[var(--accent)]">
                      {active ? <Check size={14} /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-[var(--text-primary)]">
                        {r.name}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--text-muted)]">
                        {r.path}
                      </span>
                    </span>
                  </button>
                );
              })}
              <div className="mx-2 my-1.5 h-px bg-[var(--border)]" />
            </>
          ) : null}

          <MenuRow
            icon={<FolderOpen size={15} className="text-[var(--accent)]" />}
            label="Open…"
            hint={desktop ? formatShortcut("O") : undefined}
            disabled={connecting}
            onClick={() => {
              if (connecting) return;
              void openFolderAsVault();
              setOpen(false);
            }}
          />
          <MenuRow
            icon={<FolderPlus size={15} className="text-[var(--accent)]" />}
            label="New Vault…"
            disabled={connecting}
            onClick={() => {
              if (connecting) return;
              setCreateName("Nexus Vault");
              setCreateOpen(true);
            }}
          />

          {vaultId && mode !== "demo" ? (
            <>
              <div className="mx-2 my-1.5 h-px bg-[var(--border)]" />
              <MenuRow
                icon={
                  <ExternalLink
                    size={15}
                    className={
                      canReveal
                        ? "text-[var(--text-secondary)]"
                        : "text-[var(--text-muted)]"
                    }
                  />
                }
                label={
                  desktop
                    ? isAppleModPlatform()
                      ? "Show in Finder"
                      : "Show in file manager"
                    : "Show vault location"
                }
                disabled={!canReveal && desktop}
                onClick={() => {
                  void revealVaultInFinder();
                  setOpen(false);
                }}
              />
              {!desktop && mode === "fsa" ? (
                <p className="px-2.5 pb-1.5 text-[10.5px] leading-snug text-[var(--text-muted)]">
                  Browser vaults stay in the folder you granted access to.
                </p>
              ) : null}
            </>
          ) : null}

          <div className="mx-2 my-1.5 h-px bg-[var(--border)]" />
          <MenuRow
            icon={<X size={15} />}
            label="Close"
            muted
            disabled={!vaultId || connecting}
            onClick={() => {
              closeVault();
              setOpen(false);
            }}
          />

          <div className="mx-2 my-1.5 h-px bg-[var(--border)]" />
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <MoreHorizontal size={15} />
            More
            <ChevronDown
              size={13}
              className={cn(
                "ml-auto transition-transform",
                moreOpen && "rotate-180",
              )}
            />
          </button>
          {moreOpen ? (
            <div className="mb-0.5 ml-2 border-l border-[var(--border)] pl-1">
              <MenuRow
                icon={
                  <Sparkles
                    size={15}
                    className="text-[var(--accent-violet)]"
                  />
                }
                label="Open demo vault"
                disabled={connecting}
                onClick={() => {
                  if (connecting) return;
                  openDemoVault();
                  setOpen(false);
                  setMoreOpen(false);
                }}
              />
              <p className="px-2.5 py-1.5 text-[10.5px] leading-snug text-[var(--text-muted)]">
                Cloud sync: turn on Dropbox, Drive, or OneDrive desktop sync,
                then use Open… on that folder. Nexus never stores accounts.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Cancel"
            onClick={() => setCreateOpen(false)}
          />
          <div className="glass-elevated relative z-10 w-full max-w-[360px] rounded-[16px] border border-[var(--border)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            <h3 className="text-[15px] font-semibold tracking-tight">
              New Vault
            </h3>
            <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
              Creates a folder of plain Markdown files
              {desktop ? ", then opens it" : " inside a parent folder you pick"}
              .
            </p>
            <label className="mt-4 block text-[12px] font-medium text-[var(--text-secondary)]">
              Name
              <input
                autoFocus
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCreate();
                  }
                  if (e.key === "Escape") setCreateOpen(false);
                }}
                className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none ring-[var(--accent)] focus:ring-1"
                placeholder="Nexus Vault"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={connecting}
                onClick={submitCreate}
              >
                Create…
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  onClick,
  hint,
  muted,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  hint?: string;
  muted?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        muted
          ? "text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]"
          : "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {hint ? (
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {hint}
        </span>
      ) : null}
    </button>
  );
}
