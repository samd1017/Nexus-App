import { useVaultStore } from "@/lib/vault/store";
import { ConfirmDialog } from "@/components/chrome/ConfirmDialog";

/** Top-level delete confirm — portaled; not clipped by sidebars. */
export function DeleteConfirmHost() {
  const pending = useVaultStore((s) => s.pendingDelete);
  const confirmPendingDelete = useVaultStore((s) => s.confirmPendingDelete);
  const cancelPendingDelete = useVaultStore((s) => s.cancelPendingDelete);

  return (
    <ConfirmDialog
      open={Boolean(pending)}
      title={pending?.kind === "folder" ? "Delete folder?" : "Delete note?"}
      message={
        pending
          ? pending.kind === "folder"
            ? `Delete “${pending.label}” and everything inside it? This cannot be undone.`
            : `Delete “${pending.label}”? This cannot be undone.`
          : ""
      }
      confirmLabel="Delete"
      danger
      onCancel={cancelPendingDelete}
      onConfirm={confirmPendingDelete}
    />
  );
}
