import { useVaultStore } from "@/lib/vault/store";

/**
 * Create a note now, or as soon as the vault finishes opening. A key pressed
 * the moment a new vault appears would otherwise be dropped with "Vault is
 * still opening". Gives up after `budgetMs`.
 */
export function createNoteWhenReady(
  parentId: string | null,
  title: string,
  then: (id: string) => void,
  budgetMs = 6000,
): void {
  const st = useVaultStore.getState();
  if (!st.connecting) {
    const id = st.createNote(parentId, title);
    if (id) then(id);
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    unsub();
    window.clearTimeout(timer);
  };
  const unsub = useVaultStore.subscribe((s) => {
    if (s.connecting || done) return;
    finish();
    const id = useVaultStore.getState().createNote(parentId, title);
    if (id) then(id);
  });
  const timer = window.setTimeout(finish, budgetMs);
}
