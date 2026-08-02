import { useVaultStore } from "@/lib/vault/store";
import { formatRelativeTime } from "@/lib/utils";
import { NexusWordmark } from "@/components/brand/NexusLogo";

/** macOS-style window chrome with traffic lights + Nexus branding */
export function TitleBar() {
  const vaultName = useVaultStore((s) => s.vaultName);
  const mode = useVaultStore((s) => s.mode);
  const lastExternalSync = useVaultStore((s) => s.lastExternalSync);
  const vaultId = useVaultStore((s) => s.vaultId);

  return (
    <header className="titlebar-drag relative z-40 flex h-11 shrink-0 items-center border-b border-[var(--border)] bg-[rgba(8,8,10,0.94)] px-3 backdrop-blur-xl">
      <div className="titlebar-no-drag flex items-center gap-2 pl-1">
        <span className="traffic-light bg-[#ff5f57] shadow-[0_0_0_0.5px_rgba(0,0,0,0.35)]" title="Close" />
        <span className="traffic-light bg-[#febc2e] shadow-[0_0_0_0.5px_rgba(0,0,0,0.35)]" title="Minimize" />
        <span className="traffic-light bg-[#28c840] shadow-[0_0_0_0.5px_rgba(0,0,0,0.35)]" title="Zoom" />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <NexusWordmark size="sm" className="text-[var(--text-primary)]" />
          {vaultName ? (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="text-[12.5px] text-[var(--text-secondary)]">{vaultName}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="titlebar-no-drag ml-auto flex items-center gap-2">
        {!vaultId ? (
          <span className="rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]">
            No vault
          </span>
        ) : lastExternalSync ? (
          <span
            className="rounded-full border border-[rgba(48,209,88,0.3)] bg-[rgba(48,209,88,0.1)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)]"
            title={new Date(lastExternalSync).toLocaleString()}
          >
            Live · {formatRelativeTime(lastExternalSync)}
          </span>
        ) : mode === "fsa" ? (
          <span className="rounded-full border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]">
            Watching disk
          </span>
        ) : (
          <span className="rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]">
            Local · offline
          </span>
        )}
      </div>
    </header>
  );
}
