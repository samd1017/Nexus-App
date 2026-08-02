import { useVaultStore } from "@/lib/vault/store";

/** macOS-style window chrome (visual) with traffic lights + drag region */
export function TitleBar() {
  const vaultName = useVaultStore((s) => s.vaultName);
  const lastExternalSync = useVaultStore((s) => s.lastExternalSync);

  return (
    <header className="titlebar-drag relative z-40 flex h-11 shrink-0 items-center border-b border-[var(--border)] bg-[rgba(10,10,12,0.92)] px-3 backdrop-blur-xl">
      <div className="titlebar-no-drag flex items-center gap-2 pl-1">
        <span className="traffic-light bg-[#ff5f57]" title="Close" />
        <span className="traffic-light bg-[#febc2e]" title="Minimize" />
        <span className="traffic-light bg-[#28c840]" title="Zoom" />
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
            Note App
          </span>
          {vaultName ? (
            <>
              <span className="text-[var(--text-muted)]">·</span>
              <span className="text-[12.5px] text-[var(--text-secondary)]">{vaultName}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="titlebar-no-drag ml-auto flex items-center gap-2">
        {lastExternalSync ? (
          <span className="rounded-full border border-[rgba(48,209,88,0.3)] bg-[rgba(48,209,88,0.1)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)]">
            Live sync
          </span>
        ) : (
          <span className="rounded-full border border-[var(--border)] bg-white/[0.03] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
            Local vault
          </span>
        )}
      </div>
    </header>
  );
}
