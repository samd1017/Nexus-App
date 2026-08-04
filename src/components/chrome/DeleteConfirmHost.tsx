import { useVaultStore } from "@/lib/vault/store";
import { ConfirmDialog } from "@/components/chrome/ConfirmDialog";
import { isAppleModPlatform } from "@/lib/platform";

/** Top-level delete confirm — portaled; not clipped by sidebars. */
export function DeleteConfirmHost() {
  const pending = useVaultStore((s) => s.pendingDelete);
  const confirmPendingDelete = useVaultStore((s) => s.confirmPendingDelete);
  const cancelPendingDelete = useVaultStore((s) => s.cancelPendingDelete);
  const mode = useVaultStore((s) => s.mode);
  const disk = mode === "fsa" || mode === "desktop";
  const recoverWhere = isAppleModPlatform()
    ? "Finder"
    : "your file manager";

  let message = "";
  if (pending) {
    if (pending.kind === "folder") {
      message = disk
        ? `Move “${pending.label}” and its contents to Trash (.trash)? You can restore files from there in ${recoverWhere}.`
        : `Delete “${pending.label}” and everything inside it? This cannot be undone.`;
    } else {
      message = disk
        ? `Move to Trash? You can restore from the Pulse panel (Recently deleted).`
        : `Delete “${pending.label}”? This cannot be undone.`;
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(pending)}
      title={pending?.kind === "folder" ? "Delete folder?" : "Delete note?"}
      message={message}
      confirmLabel={disk ? "Move to Trash" : "Delete"}
      danger
      onCancel={cancelPendingDelete}
      onConfirm={confirmPendingDelete}
    />
  );
}
