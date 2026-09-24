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

// The folder being revealed, and whether Enter was pressed before it landed.
// On a large vault, or with the list collapsed, the reveal can take a moment;
// an Enter in that gap belongs to the folder, not to whatever still has focus.
type RevealInFlight = { id: string; until: number; enter: boolean };
let inFlight: RevealInFlight | null = null;

/** The folder a reveal is still landing on, if any. */
export function revealInFlight(): string | null {
  if (!inFlight) return null;
  if (Date.now() > inFlight.until) {
    inFlight = null;
    return null;
  }
  return inFlight.id;
}

/** Hold an Enter for the folder being revealed. Returns false if none is. */
export function queueRevealEnter(): boolean {
  if (!revealInFlight() || !inFlight) return false;
  inFlight.enter = true;
  return true;
}

/** The reveal of `id` has landed. True when an Enter was held for it. */
export function finishReveal(id: string): boolean {
  if (!inFlight || inFlight.id !== id) return false;
  const enter = inFlight.enter && Date.now() <= inFlight.until;
  inFlight = null;
  return enter;
}

const SETTLE_WAIT_MS = 1500;

/**
 * Ask the tree to show a folder, expand its parents, and focus its row.
 * `settle` is work that decides whether the folder is empty (a check on
 * disk); the row lands after it, or after a short wait, and an Enter pressed
 * meanwhile is held for the folder.
 */
export function revealFolderInList(
  folderId: string,
  opts?: { settle?: Promise<unknown> },
): void {
  pendingFolder = folderId;
  const extra = opts?.settle ? SETTLE_WAIT_MS : 0;
  inFlight = { id: folderId, until: Date.now() + 3000 + extra, enter: false };
  // Search is a modal field: left open, it would take the next Enter.
  const st = useVaultStore.getState();
  if (st.commandOpen) st.setCommandOpen(false);
  const land = () => {
    revealFileList(() => {
      window.dispatchEvent(
        new CustomEvent("nexus-reveal-folder", { detail: folderId }),
      );
    });
  };
  if (!opts?.settle) {
    land();
    return;
  }
  let landed = false;
  const once = () => {
    if (landed) return;
    landed = true;
    land();
  };
  opts.settle.then(once, once);
  window.setTimeout(once, SETTLE_WAIT_MS);
}
