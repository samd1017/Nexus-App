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
        ? `Move “${pending.label}” and its contents to Trash (.trash)? You can restore files from Pulse or ${recoverWhere}.`
        : `Move “${pending.label}” and its notes to Trash? Undo from the toast, the sidebar Trash list, ⌘K → trash, or Pulse → Recently deleted.`;
    } else {
      message =
        "Move to Trash? Undo from the toast, sidebar Trash, or ⌘K → trash.";
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(pending)}
      title={pending?.kind === "folder" ? "Delete folder?" : "Delete note?"}
      message={message}
      confirmLabel="Move to Trash"
      danger
      onCancel={cancelPendingDelete}
      onConfirm={confirmPendingDelete}
    />
  );
}
