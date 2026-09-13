import { useCallback, useEffect, useRef, useState } from "react";
import { useVaultStore } from "@/lib/vault/store";
import { normalizeLineEndings } from "@/lib/markdown/purity";
import { registerSourceFlush } from "@/lib/editor/flush";
import { usePrefsStore } from "@/lib/prefs/preferences";
import {
  buildSuggestItems,
  coordsAtTextareaCaret,
  detectOpenWikilinkInText,
  insertWikilinkInSource,
  type WikilinkSuggestItem,
} from "@/lib/editor/wikilink-suggest";
import { dailyNotePath, upgradeSparseDailySkeleton } from "@/lib/vault/templates";
import { WikilinkSuggestMenu } from "./WikilinkSuggestMenu";
import {
  collectPlainMatches,
  registerSourceFindAdapter,
  setFindFocusPane,
  type FindMatch,
} from "@/lib/editor/find-target";
import { registerInsertWikilink } from "@/lib/editor/insert-wikilink";

interface Props {
  noteId: string;
  content: string;
  pane?: "primary" | "secondary";
  /** Immediate source text (no persist debounce) so split preview stays live. */
  onLiveChange?: (text: string) => void;
}

/** True when Focus section still has only empty bullets. */
function hasEmptyFocusBullet(markdown: string): boolean {
  const focusMatch =
    /^##\s+Focus\s*\n([\s\S]*?)(?=^##\s+|\s*$)/m.exec(markdown);
  if (!focusMatch) return false;
  const body = focusMatch[1].trim();
  if (!body) return true;
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return true;
  return lines.every((line) => /^\s*\\?-\s*(\[[ xX]\]\s*)?$/.test(line));
}

/** Caret index after first empty Focus bullet (`- ` or `- [ ] `). */
function emptyFocusCaretIndex(markdown: string): number | null {
  const m = /^##\s+Focus\s*\n/m.exec(markdown);
  if (!m || m.index == null) return null;
  const afterHeading = m.index + m[0].length;
  const rest = markdown.slice(afterHeading);
  const bullet = /^\s*-\s*(\[[ xX]\]\s*)?/m.exec(rest);
  if (!bullet || bullet.index == null) return null;
  return afterHeading + bullet.index + bullet[0].length;
}

/**
 * Source view of the same note. Always seeds from the latest store content so
 * Visual → Source never opens on an empty/stale buffer.
 * Light [[ wikilink suggest (E4) reuses the same note list as Visual.
 *
 * Wave 1: intentional Source edits always save (no fingerprint drop of blank lines).
 */
export function SourceEditor({
  noteId,
  content,
  pane = "primary",
  onLiveChange,
}: Props) {
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const spellCheck = usePrefsStore((s) => s.spellCheck);
  const editorFontSize = usePrefsStore((s) => s.editorFontSize);
  const onLiveChangeRef = useRef(onLiveChange);
  onLiveChangeRef.current = onLiveChange;
  const emitLive = useCallback((text: string) => {
    onLiveChangeRef.current?.(text);
  }, []);

  // Prefer live store value at mount (post-flush), fall back to prop
  const seed = upgradeSparseDailySkeleton(
    useVaultStore.getState().nodes[noteId]?.content ?? content ?? "",
  );

  const [value, setValue] = useState(seed);
  const valueRef = useRef(seed);
  const noteIdRef = useRef(noteId);
  const dirtyRef = useRef(false);
  const lastSavedRef = useRef(seed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const morningFocusedFor = useRef<string | null>(null);

  // Wikilink suggest state
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestFrom, setSuggestFrom] = useState(0);
  const [suggestTo, setSuggestTo] = useState(0);
  const [suggestItems, setSuggestItems] = useState<WikilinkSuggestItem[]>([]);
  const [suggestSelected, setSuggestSelected] = useState(0);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const lineCount = (() => {
    let n = 1;
    for (let i = 0; i < value.length; i++) {
      if (value.charCodeAt(i) === 10) n++;
    }
    return n;
  })();
  const showGutter = lineCount <= 2000;
  const [suggestRect, setSuggestRect] = useState({
    left: 0,
    top: 0,
    bottom: 0,
  });
  const suggestOpenRef = useRef(false);
  const suggestQueryRef = useRef("");
  const suggestItemsRef = useRef<WikilinkSuggestItem[]>([]);
  const suggestSelectedRef = useRef(0);
  const suggestRangeRef = useRef({ from: 0, to: 0 });
  suggestOpenRef.current = suggestOpen;
  suggestQueryRef.current = suggestQuery;
  suggestItemsRef.current = suggestItems;
  suggestSelectedRef.current = suggestSelected;
  suggestRangeRef.current = { from: suggestFrom, to: suggestTo };

  const refreshSuggest = useCallback((text: string, cursor: number) => {
    const open = detectOpenWikilinkInText(text, cursor);
    if (!open) {
      setSuggestOpen(false);
      return;
    }
    const items = buildSuggestItems(
      useVaultStore.getState().nodes,
      open.query,
    );
    setSuggestOpen(true);
    setSuggestQuery(open.query);
    setSuggestFrom(open.from);
    setSuggestTo(open.to);
    setSuggestItems(items);
    setSuggestSelected(0);
    const ta = taRef.current;
    if (ta) {
      setSuggestRect(coordsAtTextareaCaret(ta, open.to));
    }
  }, []);

  const scheduleSave = useCallback(
    (val: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const id = noteIdRef.current;
        const prev = useVaultStore.getState().nodes[id]?.content ?? "";
        // Source: honor intentional whitespace (blank lines, soft spacing)
        const next = normalizeLineEndings(val);
        dirtyRef.current = false;
        if (next !== prev) updateNoteContent(id, next, { source: true });
      }, 200);
    },
    [updateNoteContent],
  );

  const applyValue = useCallback(
    (val: string, cursor?: number) => {
      dirtyRef.current = true;
      setValue(val);
      valueRef.current = val;
      emitLive(val);
      scheduleSave(val);
      if (typeof cursor === "number") {
        requestAnimationFrame(() => {
          const ta = taRef.current;
          if (!ta) return;
          ta.focus();
          ta.setSelectionRange(cursor, cursor);
          refreshSuggest(val, cursor);
        });
      }
    },
    [scheduleSave, refreshSuggest, emitLive],
  );

  const pickSuggest = useCallback(
    (item: WikilinkSuggestItem) => {
      const { from, to } = suggestRangeRef.current;
      const { next, cursor } = insertWikilinkInSource(valueRef.current, {
        from,
        to,
      }, item);
      setSuggestOpen(false);
      applyValue(next, cursor);
    },
    [applyValue],
  );

  const createFromSuggest = useCallback(
    (title: string) => {
      const cleaned = title.trim();
      if (!cleaned) return;
      const state = useVaultStore.getState();
      // Stay on current note — create linked note without activating
      const id = state.createNote(null, cleaned, { activate: false });
      if (!id) return;
      const node = useVaultStore.getState().nodes[id];
      const item: WikilinkSuggestItem = {
        id,
        kind: "note",
        title: cleaned,
        path: node?.path ?? `${cleaned}.md`,
        target: cleaned,
      };
      state.setToast(`Created “${cleaned}”`);
      pickSuggest(item);
    },
    [pickSuggest],
  );

  // Keep in sync with store/prop. Always reseed when noteId changes
  // (previous note was flushed on switch); only guard dirty for same-note updates.
  useEffect(() => {
    const live = upgradeSparseDailySkeleton(
      useVaultStore.getState().nodes[noteId]?.content ?? content ?? "",
    );
    const noteChanged = noteIdRef.current !== noteId;
    if (noteChanged) {
      noteIdRef.current = noteId;
      dirtyRef.current = false;
      lastSavedRef.current = live;
      setValue(live);
      valueRef.current = live;
      emitLive(live);
      setSuggestOpen(false);
      return;
    }
    if (dirtyRef.current) {
      const external = live !== valueRef.current && live !== lastSavedRef.current;
      if (!external) return;
      dirtyRef.current = false;
    }
    if (live === valueRef.current) return;
    setValue(live);
    valueRef.current = live;
    emitLive(live);
  }, [noteId, content, emitLive]);

  // Morning autofocus: today's daily + empty Focus — once per note open
  useEffect(() => {
    if (morningFocusedFor.current === noteId) return;
    const node = useVaultStore.getState().nodes[noteId];
    if (!node || node.kind !== "note") return;
    if (node.path !== dailyNotePath(new Date())) return;
    const body = node.content ?? content ?? valueRef.current;
    if (!hasEmptyFocusBullet(body)) return;
    morningFocusedFor.current = noteId;
    const caret = emptyFocusCaretIndex(body);
    const t = window.setTimeout(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      if (caret != null) {
        ta.setSelectionRange(caret, caret);
      }
    }, 40);
    return () => window.clearTimeout(t);
  }, [noteId, content]);

  useEffect(() => {
    // Capture note id for this registration so cleanup never writes to a newer note
    const boundNoteId = noteId;
    noteIdRef.current = boundNoteId;
    const flushNow = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const id = boundNoteId;
      const val = valueRef.current;
      dirtyRef.current = false;
      const prev = useVaultStore.getState().nodes[id]?.content ?? "";
      const next = normalizeLineEndings(val);
      lastSavedRef.current = next;
      if (next !== prev) updateNoteContent(id, next, { source: true });
    };

    registerSourceFlush(flushNow, pane);
    return () => {
      flushNow();
      registerSourceFlush(null, pane);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [updateNoteContent, noteId, pane]);

  // Find-in-note adapter for Source mode
  useEffect(() => {
    registerSourceFindAdapter({
      findAll: (query) => collectPlainMatches(valueRef.current, query),
      reveal: (match: FindMatch) => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(match.from, match.to);
        const before = ta.value.slice(0, match.from);
        const lines = before.split("\n").length;
        const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 24;
        ta.scrollTop = Math.max(0, (lines - 3) * lineHeight);
      },
      clear: () => {
        /* selection-only */
      },
      replace: (match, text) => {
        const v = valueRef.current;
        const next = v.slice(0, match.from) + text + v.slice(match.to);
        setValue(next);
        valueRef.current = next;
        dirtyRef.current = true;
        emitLive(next);
        scheduleSave(next);
        const ta = taRef.current;
        const caret = match.from + text.length;
        requestAnimationFrame(() => {
          if (!ta) return;
          ta.focus();
          ta.setSelectionRange(caret, caret);
        });
        return true;
      },
      replaceAll: (query, text) => {
        const all = collectPlainMatches(valueRef.current, query);
        if (!all.length) return 0;
        let v = valueRef.current;
        for (let i = all.length - 1; i >= 0; i--) {
          const m = all[i]!;
          v = v.slice(0, m.from) + text + v.slice(m.to);
        }
        setValue(v);
        valueRef.current = v;
        dirtyRef.current = true;
        emitLive(v);
        scheduleSave(v);
        return all.length;
      },
    }, pane);
    return () => registerSourceFindAdapter(null, pane);
  }, [noteId, pane, scheduleSave, emitLive]);

  useEffect(() => {
    return registerInsertWikilink((focusedOnly) => {
      const ta = taRef.current;
      if (!ta) return false;
      if (focusedOnly && document.activeElement !== ta) return false;
      if (
        !focusedOnly &&
        noteIdRef.current !== useVaultStore.getState().activeNoteId
      ) {
        return false;
      }
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      const next = `${ta.value.slice(0, start)}[[${ta.value.slice(end)}`;
      const caret = start + 2;
      setValue(next);
      valueRef.current = next;
      dirtyRef.current = true;
      emitLive(next);
      scheduleSave(next);
      ta.focus();
      requestAnimationFrame(() => {
        ta.setSelectionRange(caret, caret);
        refreshSuggest(next, caret);
      });
      return true;
    });
  }, [noteId, scheduleSave, refreshSuggest, emitLive]);

  return (
    <div
      className="fade-in flex h-full min-h-0 flex-col overflow-hidden px-4 py-3 sm:px-6 sm:py-4 md:px-10 md:py-6"
      data-note-id={noteId}
    >
      <div className="source-editor-shell relative mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-row overflow-hidden">
        {showGutter ? (
          <div
            ref={gutterRef}
            className="source-gutter"
            aria-hidden
            style={{ fontSize: editorFontSize }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={taRef}
          className="source-editor min-h-[50vh] w-full flex-1"
          aria-label="Markdown source"
          value={value}
          spellCheck={spellCheck}
          style={{ fontSize: editorFontSize }}
          onScroll={(e) => {
            if (gutterRef.current) {
              gutterRef.current.scrollTop = e.currentTarget.scrollTop;
            }
          }}
          onChange={(e) => {
            const val = e.target.value;
            const cursor = e.target.selectionStart ?? val.length;
            dirtyRef.current = true;
            setValue(val);
            valueRef.current = val;
            emitLive(val);
            scheduleSave(val);
            refreshSuggest(val, cursor);
          }}
          onKeyUp={(e) => {
            const ta = e.currentTarget;
            refreshSuggest(ta.value, ta.selectionStart ?? 0);
          }}
          onFocus={() => setFindFocusPane(pane)}
          onClick={(e) => {
            const ta = e.currentTarget;
            refreshSuggest(ta.value, ta.selectionStart ?? 0);
          }}
          onKeyDown={(e) => {
            if (!suggestOpenRef.current) return;
            const items = suggestItemsRef.current;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSuggestSelected((i) =>
                items.length ? (i + 1) % items.length : 0,
              );
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSuggestSelected((i) =>
                items.length ? (i - 1 + items.length) % items.length : 0,
              );
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              if (!items.length) {
                const q = suggestQueryRef.current.trim();
                if (q && e.key === "Enter") {
                  e.preventDefault();
                  createFromSuggest(q);
                }
                return;
              }
              e.preventDefault();
              const item = items[suggestSelectedRef.current] ?? items[0];
              if (item) pickSuggest(item);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setSuggestOpen(false);
            }
          }}
        />
        <WikilinkSuggestMenu
          open={suggestOpen}
          items={suggestItems}
          selected={suggestSelected}
          query={suggestQuery}
          rect={suggestRect}
          onSelect={pickSuggest}
          onCreate={createFromSuggest}
          onHover={setSuggestSelected}
          onClose={() => setSuggestOpen(false)}
        />
      </div>
    </div>
  );
}
