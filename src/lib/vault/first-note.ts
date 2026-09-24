import { useVaultStore } from "@/lib/vault/store";
import { exitGraphForViewport } from "@/lib/layout/viewport";
import { revealFileList } from "@/lib/chrome/reveal-list";
import { scheduleEmptyNoteRename } from "@/lib/chrome/empty-folder-enter";
import { createNoteWhenReady } from "@/lib/vault/create-when-ready";

/** No notes in the open vault, including a large vault still being counted. */
export function vaultHasNoNotes(): boolean {
  const s = useVaultStore.getState();
  if (!s.vaultId) return false;
  if (s.shellCatalog) return s.catalogNoteCount <= 0 && s.rootIds.length === 0;
  for (const id in s.nodes) if (s.nodes[id]?.kind === "note") return false;
  return true;
}

/**
 * The first note, from wherever the reader is: the empty list, the empty
 * editor pane, or the empty folder map. Leaves the fullscreen map so the list
 * and the name field are on screen, waits for the vault to finish opening,
 * then creates Untitled with its name ready and hands the cursor to the body
 * once the name is set.
 */
export function startFirstNote(): void {
  const s = useVaultStore.getState();
  if (s.settings.graphMode === "fullscreen") exitGraphForViewport();
  revealFileList(() => {
    createNoteWhenReady(null, "Untitled", (id) => {
      window.dispatchEvent(new CustomEvent("nexus-created-note", { detail: id }));
      const safe =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(id)
          : id.replace(/["\\]/g, "\\$&");
      scheduleEmptyNoteRename(
        id,
        (noteId) => {
          window.dispatchEvent(new CustomEvent("nexus-rename-node", { detail: noteId }));
        },
        () =>
          Boolean(
            document.querySelector(`[data-testid="tree-rename"][data-rename-for="${safe}"]`),
          ),
      );
    });
  });
}
