/**
 * Open-note tabs for one editor pane.
 * Click replaces the active tab. A note already in the strip is focused.
 * Middle-click and Ctrl/Cmd-click open another tab. Close lands on the
 * neighbor to the right, then the left. The last tab leaves the pane empty.
 */

export type NoteTabList = {
  tabs: string[];
  activeId: string | null;
};

export type NoteOpenGesture = "secondary" | "new" | "replace";

export function tabsEqual(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function openNoteTab(
  tabs: readonly string[],
  activeId: string | null,
  noteId: string,
  mode: "replace" | "new",
): NoteTabList {
  if (!noteId) return { tabs: [...tabs], activeId };
  const existing = tabs.indexOf(noteId);
  if (existing >= 0) return { tabs: tabs as string[], activeId: noteId };
  if (mode === "new" || !activeId || !tabs.includes(activeId)) {
    return { tabs: [...tabs, noteId], activeId: noteId };
  }
  const next = tabs.slice();
  next[tabs.indexOf(activeId)] = noteId;
  return { tabs: next, activeId: noteId };
}

export function closeNoteTab(
  tabs: readonly string[],
  activeId: string | null,
  noteId: string,
): NoteTabList {
  const i = tabs.indexOf(noteId);
  if (i < 0) {
    return {
      tabs: tabs as string[],
      activeId: activeId && tabs.includes(activeId) ? activeId : tabs[0] ?? null,
    };
  }
  const next = tabs.slice();
  next.splice(i, 1);
  if (activeId !== noteId) {
    const still = activeId && next.includes(activeId) ? activeId : next[0] ?? null;
    return { tabs: next, activeId: still };
  }
  const neighbor = next[i] ?? next[i - 1] ?? null;
  return { tabs: next, activeId: neighbor };
}

export function reorderNoteTabs(tabs: readonly string[], fromId: string, toId: string): string[] {
  if (!fromId || !toId || fromId === toId) return tabs as string[];
  const from = tabs.indexOf(fromId);
  const to = tabs.indexOf(toId);
  if (from < 0 || to < 0) return tabs as string[];
  const next = tabs.slice();
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

/** Next or previous tab. One tab stays put. An unknown active id enters at the end. */
export function cycleNoteTab(
  tabs: readonly string[],
  activeId: string | null,
  dir: 1 | -1,
): string | null {
  if (tabs.length === 0) return activeId;
  if (tabs.length === 1) return tabs[0];
  const i = activeId ? tabs.indexOf(activeId) : -1;
  if (i < 0) return dir === 1 ? tabs[0] : tabs[tabs.length - 1];
  return tabs[(i + dir + tabs.length) % tabs.length];
}

/**
 * File-list and wikilink clicks.
 * Alt, or Cmd+Shift, parks the note in the other pane.
 * Middle-click, Cmd-click, and Ctrl-click (Windows/Linux) open a new tab.
 * Ctrl-click on a Mac is the context menu, so it stays a normal open.
 */
export function noteOpenGesture(
  e: {
    altKey?: boolean;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    button?: number;
  },
  platform: { mac: boolean },
): NoteOpenGesture {
  if (e.altKey || (e.metaKey && e.shiftKey)) return "secondary";
  if (e.button === 1) return "new";
  const plainMod = platform.mac
    ? Boolean(e.metaKey && !e.shiftKey && !e.altKey)
    : Boolean((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey);
  if (plainMod) return "new";
  return "replace";
}

function dedupeKeep(tabs: readonly string[], keep: (id: string) => boolean): string[] {
  let changed = false;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of tabs) {
    if (!id || seen.has(id) || !keep(id)) {
      changed = true;
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return changed ? out : (tabs as string[]);
}

/**
 * Make one pane agree with the note that is open.
 * An explicit empty list stays empty. Clearing the active id without editing
 * the list closes that one tab and selects the neighbor. An active id that
 * is not on the strip replaces the current slot. An id with no row yet is
 * kept only while it is the note being opened (paged shell).
 */
export function settlePaneTabs(args: {
  prevTabs: readonly string[];
  prevActive: string | null;
  nextTabs: readonly string[];
  nextActive: string | null;
  tabsTouched: boolean;
  alive: (id: string) => boolean;
}): NoteTabList {
  const source = args.tabsTouched ? args.nextTabs : args.prevTabs;
  const pending = args.nextActive;
  const live = dedupeKeep(source, (id) => args.alive(id) || (pending != null && id === pending));

  if (pending && live.includes(pending)) {
    return { tabs: live, activeId: pending };
  }
  if (pending) {
    const slot = args.prevActive && live.includes(args.prevActive) ? args.prevActive : null;
    return openNoteTab(live, slot, pending, "replace");
  }
  if (args.tabsTouched && args.nextTabs.length === 0) {
    return { tabs: [], activeId: null };
  }
  const prev = args.prevActive;
  if (prev) {
    const i = source.indexOf(prev);
    const rest = live.filter((id) => id !== prev);
    if (i >= 0) {
      const right = source.slice(i + 1).find((id) => rest.includes(id)) ?? null;
      const left = [...source.slice(0, i)].reverse().find((id) => rest.includes(id)) ?? null;
      return { tabs: rest, activeId: right ?? left ?? null };
    }
  }
  if (live.length === 0) return { tabs: [], activeId: null };
  return { tabs: live, activeId: live[0] ?? null };
}
