import { useState } from "react";
import {
  ChevronDown,
  FolderOpen,
  HardDrive,
  Radio,
  Sparkles,
} from "lucide-react";
import { useVaultStore } from "@/lib/vault/store";
import { cn } from "@/lib/utils";

export function VaultSwitcher() {
  const vaultName = useVaultStore((s) => s.vaultName);
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const openDemoVault = useVaultStore((s) => s.openDemoVault);
  const openLocalVault = useVaultStore((s) => s.openLocalVault);
  const simulateHermesWrite = useVaultStore((s) => s.simulateHermesWrite);
  const setToast = useVaultStore((s) => s.setToast);
  const [open, setOpen] = useState(false);

  const openFolder = async () => {
    // File System Access API when available; otherwise create named local vault
    const w = window as Window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    };
    if (typeof w.showDirectoryPicker === "function") {
      try {
        const handle = await w.showDirectoryPicker();
        openLocalVault(handle.name || "Local Vault");
        setToast(`Opened vault: ${handle.name}`);
        setOpen(false);
        return;
      } catch {
        /* user cancelled */
        return;
      }
    }
    const name = window.prompt("Vault name", "My Vault");
    if (!name) return;
    openLocalVault(name);
    setToast(`Created local vault: ${name}`);
    setOpen(false);
  };

  return (
    <div className="relative px-3 pt-3">
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
            Plain Markdown folder
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
        <div className="glass-elevated absolute left-3 right-3 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[14px] p-1.5">
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
            onClick={openFolder}
          >
            <FolderOpen size={15} className="text-[var(--accent)]" />
            Open folder as vault…
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
            onClick={() => {
              openDemoVault();
              setOpen(false);
            }}
          >
            <Sparkles size={15} className="text-[var(--accent-violet)]" />
            Open demo vault
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"
            onClick={() => {
              simulateHermesWrite();
              setOpen(false);
            }}
          >
            <Radio size={15} className="text-[var(--success)]" />
            Simulate Hermes write
          </button>

          {recentVaults.length > 0 ? (
            <>
              <div className="mx-2 my-1.5 h-px bg-[var(--border)]" />
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Recent
              </div>
              {recentVaults.slice(0, 5).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="flex w-full flex-col rounded-[10px] px-2.5 py-2 text-left hover:bg-white/[0.05]"
                  onClick={() => {
                    if (r.mode === "demo") openDemoVault();
                    else openLocalVault(r.name);
                    setOpen(false);
                  }}
                >
                  <span className="text-[12.5px] text-[var(--text-primary)]">{r.name}</span>
                  <span className="truncate text-[11px] text-[var(--text-muted)]">{r.path}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
