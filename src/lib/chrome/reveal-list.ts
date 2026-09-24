import { useVaultStore } from "@/lib/vault/store";

const TREE = "[data-file-tree]";

/**
 * Open the left list if it is collapsed, then run once the tree is mounted.
 * A collapsed list has no tree in the DOM, so Esc, first-run, and folder
 * jumps would otherwise land nowhere. Returns a cancel.
 */
export function revealFileList(
  run: (tree: HTMLElement) => void,
  budgetMs = 1500,
): () => void {
  if (typeof document === "undefined") return () => {};
  const now = document.querySelector<HTMLElement>(TREE);
  if (now) {
    run(now);
    return () => {};
  }
  const st = useVaultStore.getState();
  if (!st.settings.leftOpen) st.setLeftOpen(true);
  let done = false;
  let raf = 0;
  let timer = 0;
  const started = Date.now();
  const tick = () => {
    if (done) return;
    const tree = document.querySelector<HTMLElement>(TREE);
    if (tree) {
      done = true;
      run(tree);
      return;
    }
    if (Date.now() - started > budgetMs) {
      done = true;
      return;
    }
    raf = window.requestAnimationFrame(() => {
      timer = window.setTimeout(tick, 16);
    });
  };
  tick();
  return () => {
    done = true;
    window.cancelAnimationFrame(raf);
    window.clearTimeout(timer);
  };
}

let pendingFolder: string | null = null;

/** The tree takes a folder asked for before its listener was attached. */
export function takePendingFolderReveal(): string | null {
  const id = pendingFolder;
  pendingFolder = null;
  return id;
}

/** Ask the tree to show a folder, expand its parents, and focus its row. */
export function revealFolderInList(folderId: string): void {
  pendingFolder = folderId;
  revealFileList(() => {
    window.dispatchEvent(
      new CustomEvent("nexus-reveal-folder", { detail: folderId }),
    );
  });
}
