import { useVaultStore } from "@/lib/vault/store";
import { ConfirmDialog } from "@/components/chrome/ConfirmDialog";

/** Top-level delete confirm — portaled; not clipped by sidebars. */
export function DeleteConfirmHost() {
  const pending = useVaultStore((s) => s.pendingDelete);
  const confirmPendingDelete = useVaultStore((s) => s.confirmPendingDelete);
  const cancelPendingDelete = useVaultStore((s) => s.cancelPendingDelete);
  const mode = useVaultStore((s) => s.mode);
  const disk = mode === "fsa" || mode === "desktop";

  let message = "";
  if (pending) {
    const kept = disk ? "The file stays in Trash" : "It stays in Trash";
    if (pending.kind === "folder") {
      message = `“${pending.label}” leaves the list, along with the notes inside it. They stay in Trash, and you can put them back.`;
    } else {
      message = `“${pending.label}” leaves the list. ${kept}, and you can put it back.`;
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(pending)}
      title="Move to Trash?"
      message={message}
      confirmLabel="Move to Trash"
      danger
      onCancel={cancelPendingDelete}
      onConfirm={confirmPendingDelete}
    />
  );
}
