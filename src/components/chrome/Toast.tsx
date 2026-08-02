import { useEffect } from "react";
import { useVaultStore } from "@/lib/vault/store";

export function Toast() {
  const toast = useVaultStore((s) => s.toast);
  const setToast = useVaultStore((s) => s.setToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  if (!toast) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[120] -translate-x-1/2">
      <div className="glass-elevated rounded-full px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] shadow-[0_0_24px_rgba(0,200,255,0.15)]">
        {toast}
      </div>
    </div>
  );
}
