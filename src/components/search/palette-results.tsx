import { useMemo, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { Command } from "cmdk";
import {
  FileText,
  FolderOpen,
  Bookmark,
  History,
  Hash,
  Unlink,
  RotateCcw,
  CircleHelp,
  FilePlus,
  Search,
  X,
} from "lucide-react";
import { usePrefsStore } from "@/lib/prefs/preferences";
import { useVaultStore } from "@/lib/vault/store";
import { presentLinkContext } from "@/lib/markdown/wikilinks";
import { cn } from "@/lib/utils";
import type { SearchHit } from "@/lib/vault/types";
import type { VaultBrokenLink } from "@/lib/vault/broken-links";
import type { TrashEntry } from "@/lib/vault/trash";
import { trackCommand } from "@/lib/vault/session-recents";
import { highlightParts } from "@/lib/search/snippets";
import {
  isNoteHeadSearchLive,
  MEMORY_SEARCH_CAP_NOTE,
  searchEmptyStateMessage,
  getSearchIndexState,
} from "@/lib/vault/sqlite-fill-progress";
import { describeSearchEngine } from "@/lib/search/search-backend";
import { buildAskAnswer } from "@/lib/search/ask-notes";
import { revealSearchedFolder } from "@/components/search/palette-search";
import { BROWSER_SHELL_DB } from "@/lib/vault/shell-catalog";

const GROUP_HEADING =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]";

const ITEM_CLASS =
  "cmdk-item flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] aria-selected:text-[var(--text-primary)]";

const MATCH_TYPE_LABEL: Record<string, string> = {
  title: "Title",
  content: "In note",
  path: "Path",
  tag: "Tag",
};


function HighlightedText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const parts = useMemo(
    () => highlightParts(text, query),
    [text, query],
  );
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.match ? (
          <mark
            key={i}
            className="rounded-[2px] bg-[color-mix(in_srgb,var(--accent)_28%,transparent)] px-0.5 text-[var(--text-primary)]"
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

const ASK_STARTERS = [
  { q: "ask: how do agents share this vault", label: "How do agents share this vault?" },
  { q: "ask: what is a wikilink", label: "What is a wikilink?" },
  { q: "ask: where are daily notes", label: "Where are daily notes?" },
];

const ASK_OPS = [
  { fill: "ask: path:Systems ", label: "path:Systems" },
  { fill: "ask: folder:Research ", label: "folder:Research" },
  { fill: "ask: #agents ", label: "#agents" },
  { fill: "ask: -welcome ", label: "−welcome" },
];

export type ActionDef = {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  run: () => void;
};

export function ActionGroup({
  heading,
  actions,
  onRun,
}: {
  heading: string;
  actions: ActionDef[];
  onRun?: (a: ActionDef) => void;
}) {
  return (
    <Command.Group heading={heading} className={cn(GROUP_HEADING, "mt-1")}>
      {actions.map((a) => (
        <Command.Item
          key={a.id}
          value={`${heading}-${a.id}-${a.label}`}
          onSelect={() => (onRun ? onRun(a) : a.run())}
          className={ITEM_CLASS}
        >
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
            {a.icon}
          </span>
          <span className="flex-1">{a.label}</span>
          {a.shortcut ? (
            <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              {a.shortcut}
            </kbd>
          ) : null}
        </Command.Item>
      ))}
    </Command.Group>
  );
}

export function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
        {keys}
      </kbd>
      <span>{label}</span>
    </span>
  );
}


type Store = ReturnType<typeof useVaultStore.getState>;
type Prefs = ReturnType<typeof usePrefsStore.getState>;

export function PaletteResults({
  q,
  isAskMode,
  isCommandMode,
  isTagBrowse,
  exactTagQuery,
  hits,
  nodes,
  showCreateNote,
  searchText,
  createFromQuery,
  createNote,
  setCommandOpen,
  askAnswer,
  setQuery,
  setActiveNote,
  savedSearches,
  isEmptyQuery,
  raw,
  hasPathFolderOp,
  hasOr,
  setToast,
  recentCommands,
  runTracked,
  tags,
  emptyStatus,
  memoryCapped,
  notesHeading,
  titleSearchLive,
  searchEngine,
  searchIndexState,
  shellCatalog,
  shellDbPath,
  noteSearchFailed,
  noteSearchPending,
  inputRef,
  memoryPartial,
  query,
  folderHits,
  wantsDeleted,
  trashItems,
  restoreTrash,
  wantsOrphans,
  orphans,
  wantsBroken,
  brokenLinks,
  brokenCreateTargets,
  showAllActions,
  emptyTopActions,
  setRecentTick,
  createActions,
  navigateActions,
  noteOps,
  vaultActions,
}: {
  q: string;
  isAskMode: boolean;
  isCommandMode: boolean;
  isTagBrowse: boolean;
  exactTagQuery: RegExpExecArray | null;
  hits: SearchHit[];
  nodes: Store["nodes"];
  showCreateNote: boolean;
  searchText: string;
  createFromQuery: () => void;
  createNote: Store["createNote"];
  setCommandOpen: Store["setCommandOpen"];
  askAnswer: ReturnType<typeof buildAskAnswer> | null;
  setQuery: Dispatch<SetStateAction<string>>;
  setActiveNote: Store["setActiveNote"];
  savedSearches: Prefs["savedSearches"];
  isEmptyQuery: boolean;
  raw: string;
  hasPathFolderOp: boolean;
  hasOr: boolean;
  setToast: Store["setToast"];
  recentCommands: ActionDef[];
  runTracked: (action: ActionDef) => void;
  tags: { tag: string; count: number; noteIds: string[] }[];
  emptyStatus: string;
  memoryCapped: boolean;
  notesHeading: string;
  titleSearchLive: boolean;
  searchEngine: ReturnType<typeof describeSearchEngine>;
  searchIndexState: ReturnType<typeof getSearchIndexState>;
  shellCatalog: Store["shellCatalog"];
  shellDbPath: Store["shellDbPath"];
  noteSearchFailed: boolean;
  noteSearchPending: boolean;
  inputRef: { current: HTMLInputElement | null };
  memoryPartial: boolean;
  query: string;
  folderHits: { id: string; name: string; path: string }[];
  wantsDeleted: boolean;
  trashItems: TrashEntry[];
  restoreTrash: Store["restoreTrash"];
  wantsOrphans: boolean;
  orphans: { id: string; title: string; path: string }[];
  wantsBroken: boolean;
  brokenLinks: VaultBrokenLink[];
  brokenCreateTargets: string[];
  showAllActions: boolean;
  emptyTopActions: ActionDef[];
  setRecentTick: Dispatch<SetStateAction<number>>;
  createActions: ActionDef[];
  navigateActions: ActionDef[];
  noteOps: ActionDef[];
  vaultActions: ActionDef[];
}) {
  return (
    <>
          {q && !isAskMode && !isCommandMode && !isTagBrowse && !(exactTagQuery && hits.length > 1) && hits.length === 0 ? null : (
          <Command.Empty className="px-3 py-8 text-center">
            <div className="text-[13px] text-[var(--text-muted)]">
              {Object.keys(nodes).length === 0
                ? "No notes yet — create one or open a vault"
                : "No matching results"}
            </div>
            {showCreateNote ? (
              <button
                type="button"
                className="mt-3 text-[12.5px] text-[var(--accent)] hover:underline"
                onClick={() => {
                  createNote(null, searchText || q || "Untitled");
                  setCommandOpen(false);
                }}
              >
                Create note: {searchText || q || "Untitled"}
              </button>
            ) : null}
          </Command.Empty>
          )}

          {askAnswer ? (
            <Command.Group heading="Ask your notes · local" className={GROUP_HEADING}>
              <div className="mb-1 rounded-[10px] border border-[var(--border)] bg-white/[0.02] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                <p>{askAnswer.summary}</p>
                <p className="mt-1.5 text-[10.5px] text-[var(--text-muted)]">
                  Extractive citations from this vault's on-device index.
                </p>
              </div>
              {askAnswer.citations.length === 0 ? (
                <>
                  <div className="mb-1 flex flex-wrap gap-1 px-1 py-1">
                    {ASK_OPS.map((op) => (
                      <button
                        key={op.label}
                        type="button"
                        className="rounded-full border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        onClick={() => setQuery(op.fill)}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                  {ASK_STARTERS.map((s) => (
                    <Command.Item
                      key={s.q}
                      value={s.q}
                      onSelect={() => setQuery(s.q)}
                      className={ITEM_CLASS}
                    >
                      <CircleHelp size={15} className="shrink-0 text-[var(--accent)]" />
                      <span>{s.label}</span>
                    </Command.Item>
                  ))}
                </>
              ) : (
                askAnswer.citations.map((c) => (
                  <Command.Item
                    key={`ask-${c.noteId}-${c.snippet.slice(0, 24)}`}
                    value={`ask-${c.noteId}-${c.title}`}
                    onSelect={() => {
                      setActiveNote(c.noteId, { heading: c.heading });
                      setCommandOpen(false);
                    }}
                    className={cn(ITEM_CLASS, "items-start")}
                  >
                    <FileText size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--text-primary)]">
                        {c.title}
                        {c.heading ? (
                          <span className="font-normal text-[var(--text-muted)]">
                            {" "}
                            #{c.heading}
                          </span>
                        ) : null}
                      </div>
                      <div className="line-clamp-2 text-[11.5px] text-[var(--text-muted)]">
                        <HighlightedText text={c.snippet} query={askAnswer.question} />
                      </div>
                    </div>
                  </Command.Item>
                ))
              )}
            </Command.Group>
          ) : null}

          {savedSearches.length > 0 && (isEmptyQuery || /^save/i.test(raw) || raw === "/") ? (
            <Command.Group heading="Saved searches" className={GROUP_HEADING}>
              {savedSearches.map((s) => (
                <Command.Item
                  key={s.id}
                  value={`saved-${s.id}-${s.name}-${s.query}`}
                  onSelect={() => setQuery(s.query)}
                  className={ITEM_CLASS}
                >
                  <Bookmark size={15} className="shrink-0 text-[var(--accent)]" />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="max-w-[40%] truncate font-mono text-[10px] text-[var(--text-muted)]">
                    {s.query}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      usePrefsStore.getState().updatePrefs({
                        savedSearches: savedSearches.filter((x) => x.id !== s.id),
                      });
                    }}
                    aria-label={`Delete saved search ${s.name}`}
                  >
                    <X size={12} />
                  </button>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {!isCommandMode && searchText && (hasPathFolderOp || hasOr) ? (
            <Command.Group heading="Search" className={GROUP_HEADING}>
              <Command.Item
                value={`save-search-${raw}`}
                onSelect={() => {
                  const name = window.prompt("Name this search", raw) || raw;
                  usePrefsStore.getState().updatePrefs({
                    savedSearches: [
                      {
                        id: `s_${Date.now().toString(36)}`,
                        name: name.trim() || raw,
                        query: raw,
                      },
                      ...savedSearches.filter((s) => s.query !== raw),
                    ].slice(0, 24),
                  });
                  setToast("Search saved");
                }}
                className={ITEM_CLASS}
              >
                <Bookmark size={15} className="shrink-0 text-[var(--accent)]" />
                <span className="flex-1">Save this search</span>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{raw}</span>
              </Command.Item>
            </Command.Group>
          ) : null}

          {isEmptyQuery && recentCommands.length > 0 ? (
            <Command.Group heading="Recent commands" className={GROUP_HEADING}>
              {recentCommands.map((a) => (
                <Command.Item
                  key={`recent-${a.id}`}
                  value={`recent-${a.id}-${a.label}`}
                  onSelect={() => runTracked(a)}
                  className={ITEM_CLASS}
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                    <History size={14} />
                  </span>
                  <span className="flex-1">{a.label}</span>
                  {a.shortcut ? (
                    <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                      {a.shortcut}
                    </kbd>
                  ) : null}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {isTagBrowse && tags.length > 0 && !exactTagQuery ? (
            <Command.Group heading="Tags" className={GROUP_HEADING}>
              {tags.map((t) => (
                <Command.Item
                  key={t.tag}
                  value={`tag-${t.tag}`}
                  onSelect={() => {
                    if (t.noteIds.length === 1) {
                      setActiveNote(t.noteIds[0]);
                      setCommandOpen(false);
                    } else {
                      setQuery(`#${t.tag}`);
                    }
                  }}
                  className={ITEM_CLASS}
                >
                  <Hash size={15} className="shrink-0 text-[var(--accent)]" />
                  <span className="flex-1 font-medium text-[var(--text-primary)]">
                    #{t.tag}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {t.count} note{t.count === 1 ? "" : "s"}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {exactTagQuery && hits.length > 1 ? (
            <Command.Group
              heading={`Tagged #${exactTagQuery[1].toLowerCase()}`}
              className={GROUP_HEADING}
            >
              {hits.map((h) => (
                <Command.Item
                  key={h.noteId}
                  value={`tag-note-${h.noteId}-${h.title}`}
                  onSelect={() => {
                    setActiveNote(h.noteId);
                    setCommandOpen(false);
                  }}
                  className={cn(ITEM_CLASS, "items-start")}
                >
                  <FileText
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      {h.title}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                      {h.path}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {q && !isAskMode && !isCommandMode && !isTagBrowse && !(exactTagQuery && hits.length > 1) && hits.length === 0 ? (
            <div
              role="status"
              aria-live="polite"
              data-search-status={emptyStatus}
              data-testid={emptyStatus === "miss" ? "search-miss" : undefined}
              className="px-3 py-3 text-[13px] leading-snug text-[var(--text-secondary)]"
            >
              {memoryCapped ? (
                <div
                  className="pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]"
                  data-testid="search-engine-heading"
                >
                  {notesHeading}
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Search size={15} className="shrink-0 text-[var(--text-muted)]" />
                <span>
                  {searchEmptyStateMessage({
                    titleSearchLive:
                      titleSearchLive || searchEngine.id !== "sqlite-fts5-bm25",
                    headsReady:
                      isNoteHeadSearchLive(searchIndexState) ||
                      searchEngine.id !== "sqlite-fts5-bm25",
                    catalogSearch: Boolean(
                      shellCatalog && shellDbPath && shellDbPath !== BROWSER_SHELL_DB,
                    ),
                    failed: searchIndexState === "error" || noteSearchFailed,
                    pending: noteSearchPending,
                    memoryCapped,
                  })}
                </span>
              </div>
            </div>
          ) : null}

          {emptyStatus === "miss" && showCreateNote && hits.length === 0 ? (
            <div
              className="nexus-miss-actions flex flex-wrap items-center gap-2 px-3 pb-3"
              data-testid="search-miss-actions"
            >
              <button
                type="button"
                onClick={createFromQuery}
              >
                Create “{(searchText || q).trim().slice(0, 48)}”
                <kbd className="ml-1.5 rounded border border-[var(--border)] px-1 font-mono text-[10px] opacity-80">Enter</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                Clear search
              </button>
            </div>
          ) : null}

          {memoryPartial &&
          q &&
          !isAskMode &&
          !isCommandMode &&
          !isTagBrowse &&
          !(exactTagQuery && hits.length > 1) ? (
            <div
              className="px-3 pb-1 pt-2 text-[12px] leading-snug text-[var(--text-muted)]"
              data-testid="search-memory-cap"
            >
              {MEMORY_SEARCH_CAP_NOTE}
            </div>
          ) : null}

          {q && !isAskMode && !isCommandMode && !isTagBrowse && !(exactTagQuery && hits.length > 1) && hits.length > 0 ? (
            <Command.Group
              heading={notesHeading}
              className={cn(GROUP_HEADING, tags.length > 0 && "mt-1")}
            >
              {hits.map((h) => (
                <Command.Item
                  key={h.noteId}
                  value={`note-${h.noteId}-${h.title}`}
                  data-testid="search-note-hit"
                  data-note-id={h.noteId}
                  onSelect={() => {
                    setActiveNote(h.noteId);
                    setCommandOpen(false);
                  }}
                  className={cn(ITEM_CLASS, "items-start")}
                >
                  <FileText
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      <HighlightedText text={h.title} query={query} />
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {h.path}
                    </div>
                    {h.snippet && h.snippet !== h.path ? (
                      <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-secondary)]">
                        <HighlightedText text={presentLinkContext(h.snippet)} query={query} />
                      </div>
                    ) : null}
                  </div>
                  <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-wide text-[var(--text-muted)] bg-[color-mix(in_srgb,var(--text-muted)_12%,transparent)]">
                    {MATCH_TYPE_LABEL[String(h.matchType)] ??
                      String(h.matchType)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {folderHits.length > 0 ? (
            <Command.Group heading="Folders" className={cn(GROUP_HEADING, "mt-1")}>
              {folderHits.map((f) => (
                <Command.Item
                  key={`folder-${f.id}`}
                  value={`folder-${f.id}-${f.name}`}
                  data-testid="search-folder-hit"
                  data-folder-id={f.id}
                  onSelect={() => {
                    setCommandOpen(false);
                    revealSearchedFolder(f.id);
                  }}
                  className={ITEM_CLASS}
                >
                  <FolderOpen size={15} className="shrink-0 text-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      <HighlightedText text={f.name} query={query} />
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {f.path}
                    </div>
                  </div>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">
                    Show in list
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {wantsDeleted ? (
            <Command.Group
              heading="Recently deleted"
              className={cn(GROUP_HEADING, "mt-1")}
            >
              {trashItems.length === 0 ? (
                <div
                  role="status"
                  data-search-empty="trash"
                  className="px-3 py-2.5 text-[13px] text-[var(--text-muted)]"
                >
                  Trash is empty
                </div>
              ) : null}
              {trashItems.map((t) => (
                <Command.Item
                  key={t.trashPath}
                  value={`trash-${t.trashPath}-${t.name}`}
                  onSelect={() => {
                    void restoreTrash(t.trashPath);
                    setCommandOpen(false);
                  }}
                  className={ITEM_CLASS}
                >
                  <RotateCcw size={15} className="shrink-0 text-[var(--accent)]" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      Restore {t.name.replace(/\.md$/i, "")}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-muted)]">
                      {t.originalPath}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {wantsOrphans ? (
            <Command.Group
              heading="Orphan notes"
              className={cn(GROUP_HEADING, "mt-1")}
            >
              {orphans.length === 0 ? (
                <div
                  role="status"
                  data-search-empty="orphans"
                  className="px-3 py-2.5 text-[13px] text-[var(--text-muted)]"
                >
                  No orphan notes
                </div>
              ) : null}
              {orphans.map((o) => (
                <Command.Item
                  key={o.id}
                  value={`orphan-${o.id}-${o.title}`}
                  onSelect={() => {
                    setActiveNote(o.id);
                    setCommandOpen(false);
                  }}
                  className={cn(ITEM_CLASS, "items-start")}
                >
                  <Unlink
                    size={15}
                    className="mt-0.5 shrink-0 text-[var(--text-muted)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">
                      {o.title}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                      {o.path}
                    </div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {wantsBroken ? (
            <Command.Group
              heading="Broken links"
              className={cn(GROUP_HEADING, "mt-1")}
            >
              {brokenLinks.length === 0 ? (
                <div
                  role="status"
                  data-search-empty="broken"
                  className="px-3 py-2.5 text-[13px] text-[var(--text-muted)]"
                >
                  No broken links in this vault
                </div>
              ) : (
                brokenLinks.map((bl, i) => (
                  <Command.Item
                    key={`${bl.noteId}-${bl.target}-${i}`}
                    value={`broken-${bl.noteId}-${bl.target}`}
                    onSelect={() => {
                      setActiveNote(bl.noteId);
                      setCommandOpen(false);
                    }}
                    className={cn(ITEM_CLASS, "items-start")}
                  >
                    <Unlink
                      size={15}
                      className="mt-0.5 shrink-0 text-[var(--warning)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--text-primary)]">
                        [[{bl.target}]]
                      </div>
                      <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                        in {bl.noteTitle} · {bl.notePath}
                      </div>
                    </div>
                  </Command.Item>
                ))
              )}
            </Command.Group>
          ) : null}

          {wantsBroken && brokenCreateTargets.length > 0 ? (
            <Command.Group
              heading="Create missing"
              className={cn(GROUP_HEADING, "mt-1")}
            >
              {brokenCreateTargets.map((target) => (
                <Command.Item
                  key={`create-broken-${target}`}
                  value={`create-broken-${target}`}
                  onSelect={() => {
                    createNote(null, target);
                    setToast(`Created “${target}”`);
                    setCommandOpen(false);
                  }}
                  className={ITEM_CLASS}
                >
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                    <FilePlus size={15} />
                  </span>
                  <span className="flex-1">
                    Create:{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {target}
                    </span>
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {!showAllActions ? (
            <>
              {emptyTopActions.length > 0 ? (
                <ActionGroup
                  heading="Commands"
                  actions={emptyTopActions}
                  onRun={(a) => {
                    trackCommand(a.id);
                    setRecentTick((t) => t + 1);
                    a.run();
                  }}
                />
              ) : null}
            </>
          ) : (
            <>
              {createActions.length > 0 || (showCreateNote && emptyStatus !== "miss") ? (
                <Command.Group
                  heading="Create"
                  className={cn(GROUP_HEADING, "mt-1")}
                >
                  {showCreateNote && emptyStatus !== "miss" ? (
                    <Command.Item
                      value={`create-note-${searchText || q}`}
                      data-testid="search-create-note"
                      onSelect={() => {
                        createNote(null, searchText || q || "Untitled");
                        setCommandOpen(false);
                      }}
                      className={ITEM_CLASS}
                    >
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                        <FilePlus size={15} />
                      </span>
                      <span className="flex-1">
                        Create note:{" "}
                        <span className="font-medium text-[var(--text-primary)]">
                          {searchText || q}
                        </span>
                      </span>
                    </Command.Item>
                  ) : null}
                  {createActions.map((a) => (
                    <Command.Item
                      key={a.id}
                      value={`Create-${a.id}-${a.label}`}
                      onSelect={() => {
                        trackCommand(a.id);
                        setRecentTick((t) => t + 1);
                        a.run();
                      }}
                      className={ITEM_CLASS}
                    >
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]">
                        {a.icon}
                      </span>
                      <span className="flex-1">{a.label}</span>
                      {a.shortcut ? (
                        <kbd className="rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                          {a.shortcut}
                        </kbd>
                      ) : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {navigateActions.length > 0 ? (
                <ActionGroup
                  heading="Navigate"
                  actions={navigateActions}
                  onRun={(a) => {
                    trackCommand(a.id);
                    setRecentTick((t) => t + 1);
                    a.run();
                  }}
                />
              ) : null}
              {noteOps.length > 0 ? (
                <ActionGroup
                  heading="Note"
                  actions={noteOps}
                  onRun={(a) => {
                    trackCommand(a.id);
                    setRecentTick((t) => t + 1);
                    a.run();
                  }}
                />
              ) : null}
              {vaultActions.length > 0 ? (
                <ActionGroup
                  heading="Vault"
                  actions={vaultActions}
                  onRun={(a) => {
                    trackCommand(a.id);
                    setRecentTick((t) => t + 1);
                    a.run();
                  }}
                />
              ) : null}
            </>
          )}
    </>
  );
}
