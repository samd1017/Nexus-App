import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { setBasesOpen, subscribeVaultBaseRequest, takeVaultBaseRequest } from "@/lib/vault/bases-session";
import {
  basesPropertiesReading,
  buildNoteTable,
  filterNoteRows,
  filterRowsByRelation,
  formulaColumnId,
  formulaKey,
  formulaStatusLine,
  MAX_BASE_VIEWS,
  MAX_FORMULA_COLUMNS,
  MAX_SUMMARY_FORMULAS,
  basesViewId,
  customSummary,
  customSummaryName,
  noteTableTitle,
  defaultBasesSession,
  parseBasesSession,
  rankLinkChoices,
  sortNoteRows,
  summaryFormulaNameProblem,
  withNoteRelation,
  type BasesFormula,
  type BasesSession,
  type BasesSummaryFormula,
  type BasesViewConfig,
  type FormulaCell,
  type NoteTableRow,
  type SummaryChoice,
} from "@/lib/vault/note-table";
import { groupNoteRows, summarize, summaryKindsFor, summaryLabel, type NoteGroup } from "@/lib/vault/bases-groups";
import { BASE_EXPORT_FILE, exportBaseFile } from "@/lib/vault/bases-file";
import { LIVE_BASE_BACKUP, LIVE_BASE_FILE, readLiveBase, sameBasesSession, type LiveBase } from "@/lib/vault/bases-live";
import { sentence, type LiveCheck, type LiveOpen, type LiveSave } from "@/lib/vault/bases-live-sync";
import { liveBasesSync, storageForVaultBase } from "@/lib/vault/bases-live-storage";
import type { LiveStorage } from "@/lib/vault/bases-live-sync";
import { listVaultBaseFiles, readVaultBaseText, type VaultBaseEntry } from "@/lib/vault/vault-bases";
import { writeNoteFile } from "@/lib/vault/fs-adapter";
import { writeDesktopNote } from "@/lib/vault/tauri-adapter";
import {
  FORMULA_EXAMPLES,
  FORMULA_FUNCTION_GROUPS,
  SUMMARY_FORMULA_EXAMPLES,
  compileSummaryFormula,
} from "@/lib/vault/note-formula";
import { getDurableIndex } from "@/lib/vault/durable-index";
import { getDesktopRoot, getFsaRoot, useVaultStore } from "@/lib/vault/store";
import {
  scheduleFillSafeHydrate,
  shouldSkipBackgroundBodyHydrate,
} from "@/lib/vault/fill-interaction";
import { cn } from "@/lib/utils";

const VIEW_KEY = "nexus-bases-view";

function readSession(): BasesSession {
  try {
    return parseBasesSession(sessionStorage.getItem(VIEW_KEY));
  } catch {
    return parseBasesSession(null);
  }
}

type BaseUndo = {
  session: BasesSession;
  label: string;
  kind: "import" | "external";
  base?: LiveBase | null;
  /** Set when Undo must point saves back at the file that was live before. */
  storage?: LiveStorage;
  /** `null` is the home live file. Omitted means the active file stays. */
  livePath?: string | null;
};

type BaseNotice = {
  title: string;
  lines: string[];
  tone: "ok" | "error";
  undo: BaseUndo | null;
  blocked?: { replaceable: boolean };
};

export function NoteTable() {
  const vaultId = useVaultStore((s) => s.vaultId);
  const vaultMode = useVaultStore((s) => s.mode);
  const nodes = useVaultStore((s) => s.nodes);
  const setActiveNote = useVaultStore((s) => s.setActiveNote);
  const ensureNoteBody = useVaultStore((s) => s.ensureNoteBody);
  const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
  const indexFillBusy = useVaultStore((s) => s.indexFillBusy);
  const [session, setSession] = useState<BasesSession>(readSession);
  const [relationQuery, setRelationQuery] = useState("");
  const [relationName, setRelationName] = useState("related");
  const [linking, setLinking] = useState<{ rowId: string; key: string } | null>(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [formulaHelp, setFormulaHelp] = useState(false);
  const [focusFormulaId, setFocusFormulaId] = useState<string | null>(null);
  const [summaryPanel, setSummaryPanel] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState<{ at: number; name: string } | null>(null);
  const [focusSummaryAt, setFocusSummaryAt] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [baseNotice, setBaseNotice] = useState<BaseNotice | null>(null);
  const [vaultBasesOpen, setVaultBasesOpen] = useState(false);
  const [vaultBases, setVaultBases] = useState<VaultBaseEntry[] | null>(null);
  /** Vault path of the open `.base`, or null while the home live file is active. */
  const [livePath, setLivePath] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<"ok" | "failed" | "blocked">("ok");
  const baseInput = useRef<HTMLInputElement>(null);
  const [hydratingProps, setHydratingProps] = useState(false);
  const [bodyEpoch, setBodyEpoch] = useState(0);
  const ready = useRef(false);
  const live = useMemo(() => liveBasesSync(), [vaultId]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const keysRef = useRef<string[]>([]);
  const pendingSave = useRef(false);
  const persistTimer = useRef<number | null>(null);
  const saveFailed = useRef(false);
  const triedPropertyIds = useRef(new Set<string>());
  const view = session.views.find((item) => item.id === session.activeId) ?? session.views[0];

  const patchView = (partial: Partial<BasesViewConfig>) => {
    setSession((prev) => ({
      ...prev,
      views: prev.views.map((item) => (item.id === prev.activeId ? { ...item, ...partial } : item)),
    }));
  };

  const liveName = () => live?.sync.storage.name ?? LIVE_BASE_FILE;
  const keepMine = (session: BasesSession): BaseUndo => ({ session, label: "Keep my version", kind: "external" });

  const onSaved = (attempted: BasesSession) => (result: LiveSave) => {
    if (result.kind === "saved" || result.kind === "unchanged") {
      saveFailed.current = false;
      setLiveState("ok");
    } else if (result.kind === "blocked") {
      setLiveState("blocked");
    } else if (result.kind === "failed") {
      console.error(`[nexus] could not write ${liveName()}: ${result.message}`);
      if (!saveFailed.current) useVaultStore.getState().setToast(`Couldn't save views to ${liveName()}. Nexus keeps trying.`);
      saveFailed.current = true;
      setLiveState("failed");
    } else if (result.kind === "conflict") {
      setLiveState("ok");
      setSession(result.session);
      setBaseNotice({
        title: `${sentence(liveName())} changed outside Nexus before your last change saved, so Nexus loaded the file.`,
        lines: result.notes,
        tone: "ok",
        undo: keepMine(attempted),
      });
    }
  };

  const persist = (next: BasesSession) => {
    if (!live) return;
    void live.sync.save(next, keysRef.current).then(onSaved(next));
  };

  const cancelPendingSave = () => {
    if (persistTimer.current != null) window.clearTimeout(persistTimer.current);
    persistTimer.current = null;
    pendingSave.current = false;
  };

  const blockedNotice = (reason: string, replaceable: boolean): BaseNotice => ({
    title: `${reason.replace(/[.:\s]*$/, ".")} Nexus won't save views until it can.`,
    lines: replaceable
      ? [
          `Fix the file and press Retry, or replace it with the views shown here; the unreadable file is copied to ${
            live?.onDisk ? LIVE_BASE_BACKUP : "browser storage"
          } first.`,
        ]
      : [],
    tone: "error",
    undo: null,
    blocked: { replaceable },
  });

  const onChecked = (result: LiveCheck) => {
    if (result.kind === "blocked") {
      setLiveState("blocked");
      setBaseNotice(blockedNotice(result.reason, result.replaceable));
    } else if (result.kind === "missing") {
      setLiveState("ok");
      setBaseNotice({
        title: `${sentence(liveName())} was deleted outside Nexus. Nexus writes it again on your next change.`,
        lines: [],
        tone: "ok",
        undo: null,
      });
    } else if (result.kind === "changed") {
      setLiveState("ok");
      const previous = sessionRef.current;
      if (sameBasesSession(result.session, previous)) {
        if (result.wasBlocked) setBaseNotice(null);
        return;
      }
      setSession(result.session);
      setBaseNotice({
        title: result.wasBlocked
          ? `${sentence(liveName())} can be read again, so Nexus loaded it.`
          : `${sentence(liveName())} changed outside Nexus, so Nexus loaded it.`,
        lines: result.notes,
        tone: "ok",
        undo: keepMine(previous),
      });
    }
  };

  const onOpened = (result: LiveOpen) => {
    const backup = live?.sync.storage.legacyWhere ?? "";
    if (result.kind === "new") {
      setSession(defaultBasesSession());
    } else if (result.kind === "legacy-unreadable") {
      setSession(defaultBasesSession());
      setBaseNotice({
        title: `${sentence(backup)} could not be read, so Nexus started with default views and left it alone.`,
        lines: [],
        tone: "error",
        undo: null,
      });
    } else if (result.kind === "blocked") {
      setLiveState("blocked");
      setBaseNotice(blockedNotice(result.reason, result.replaceable));
    } else if (result.kind === "loaded") {
      setSession(result.session);
      if (result.notes.length) {
        setBaseNotice({
          title: `${sentence(liveName())} was edited outside Nexus; some of it shows differently here.`,
          lines: result.notes,
          tone: "ok",
          undo: null,
        });
      }
    } else {
      setSession(result.session);
      const where = live?.onDisk ? `${LIVE_BASE_FILE} at the vault root` : "a .base kept in browser storage";
      const title =
        result.from === "legacy"
          ? `Your views now live in ${where}. ${sentence(backup)} was left as a backup; Nexus no longer reads it.`
          : result.usedLegacy
            ? `${LIVE_BASE_FILE} was an export from an older Nexus. It now holds your live views from ${backup}, which was left as a backup.`
            : `${LIVE_BASE_FILE} was an export from an older Nexus. Nexus now saves your views to it directly.`;
      setBaseNotice({
        title: result.saveError ? `${title} Saving it failed (${result.saveError}); Nexus tries again on your next change.` : title,
        lines: result.notes,
        tone: result.saveError ? "error" : "ok",
        undo: result.undo ? { session: result.undo, label: "Use the export's views", kind: "external" } : null,
      });
    }
  };

  useEffect(() => {
    let cancel = false;
    ready.current = false;
    saveFailed.current = false;
    setLiveState("ok");
    setLivePath(live && live.sync.storage !== live.sync.home ? (live.sync.storage.path ?? null) : null);
    if (!live) {
      ready.current = true;
      return;
    }
    void live.sync.open().then((result) => {
      if (cancel) return;
      live.sync.seen();
      onOpened(result);
      ready.current = true;
    });
    return () => {
      cancel = true;
    };
  }, [live]);

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
    if (!ready.current || !live) return;
    pendingSave.current = true;
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      pendingSave.current = false;
      persist(session);
    }, 400);
    return () => {
      if (persistTimer.current != null) window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
    };
  }, [session, live]);

  useEffect(
    () => () => {
      if (live && ready.current && pendingSave.current) {
        pendingSave.current = false;
        void live.sync.save(sessionRef.current, keysRef.current);
      }
    },
    [live],
  );

  useEffect(() => {
    if (!live) return;
    let busy = false;
    const tick = () => {
      if (busy || !ready.current || document.visibilityState === "hidden") return;
      busy = true;
      void live.sync
        .check()
        .then((result) => {
          onChecked(result);
          if (saveFailed.current && result.kind === "same") persist(sessionRef.current);
        })
        .finally(() => {
          busy = false;
        });
    };
    const timer = window.setInterval(tick, 2000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[role='dialog'], [data-nexus-confirm]")) return;
      if (linking) {
        e.preventDefault();
        e.stopPropagation();
        setLinking(null);
        setLinkQuery("");
        return;
      }
      if (formulaHelp) {
        e.preventDefault();
        setFormulaHelp(false);
        return;
      }
      if (summaryPanel) {
        e.preventDefault();
        setSummaryPanel(false);
        setSummaryDraft(null);
        return;
      }
      e.preventDefault();
      setBasesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linking, formulaHelp, summaryPanel]);

  const sources = useMemo(
    () =>
      Object.values(nodes)
        .filter((n) => n.kind === "note")
        .map((n) => {
          const meta = getDurableIndex()?.getNoteMeta(n.id);
          const inMemory = vaultMode === "demo" || vaultMode === "local";
          return {
            id: n.id,
            path: n.path,
            name: n.name,
            content: n.content,
            mtime: n.mtime,
            size: typeof n.content === "string" ? undefined : (n.size ?? meta?.size),
            ctime: n.ctime || meta?.ctime || (inMemory ? n.mtime : 0) || undefined,
          };
        }),
    [nodes, bodyEpoch, vaultMode],
  );

  useEffect(() => {
    triedPropertyIds.current = new Set();
  }, [vaultId]);

  const built = useMemo(
    () => buildNoteTable(sources, view.folder, view.formulas),
    [sources, view.folder, view.formulas],
  );
  keysRef.current = built.keys;
  const shown = useMemo(() => {
    const relations = view.relations ?? [];
    const filtered = filterRowsByRelation(filterNoteRows(built.rows, view.query), relationQuery, relations.length ? relations : built.keys);
    return sortNoteRows(filtered, view.column, view.dir);
  }, [built.rows, built.keys, view.query, view.column, view.dir, view.relations, relationQuery]);

  const visibleMissingIds = useMemo(() => {
    const ids: string[] = [];
    for (const row of shown) {
      const node = nodes[row.id];
      if (!node || node.kind !== "note" || node.content !== undefined) continue;
      ids.push(row.id);
    }
    return ids;
  }, [shown, nodes]);
  useEffect(() => {
    const pending = visibleMissingIds.filter((id) => !triedPropertyIds.current.has(id));
    if (!pending.length) {
      setHydratingProps(false);
      return;
    }
    let cancel = false;
    const run = () => {
      if (shouldSkipBackgroundBodyHydrate({ fillBusy: useVaultStore.getState().indexFillBusy })) return;
      for (const id of pending) triedPropertyIds.current.add(id);
      setHydratingProps(true);
      void Promise.all(pending.map((id) => ensureNoteBody(id))).finally(() => {
        if (cancel) return;
        setHydratingProps(false);
        setBodyEpoch((n) => n + 1);
      });
    };
    if (shouldSkipBackgroundBodyHydrate({ fillBusy: indexFillBusy })) {
      return scheduleFillSafeHydrate(run);
    }
    run();
    return () => {
      cancel = true;
    };
  }, [visibleMissingIds, indexFillBusy, ensureNoteBody]);

  const readingProperties = basesPropertiesReading(visibleMissingIds.length, hydratingProps);

  const sortBy = (column: string) => {
    patchView({
      column,
      dir: view.column === column && view.dir === "asc" ? "desc" : "asc",
    });
  };

  const saveView = () => {
    const columns = built.keys;
    setSession((prev) => {
      const current = prev.views.find((item) => item.id === prev.activeId) ?? prev.views[0];
      const next: BasesSession = {
        ...prev,
        activeId: "saved",
        views: prev.views.map((item) =>
          item.id === "saved"
            ? {
                ...item,
                query: current.query,
                folder: current.folder,
                column: current.column,
                dir: current.dir,
                formulas: current.formulas.map((f) => ({ ...f })),
                columns,
                relations: current.relations ?? [],
                layout: current.layout === "cards" ? "cards" : "table",
                groupBy: current.groupBy ? { ...current.groupBy } : null,
                summaries: { ...current.summaries },
              }
            : item,
        ),
      };
      return next;
    });
  };

  const addView = () => {
    setSession((prev) => {
      if (prev.views.length >= MAX_BASE_VIEWS) return prev;
      const current = prev.views.find((item) => item.id === prev.activeId) ?? prev.views[0];
      const names = new Set(prev.views.map((item) => item.name));
      let name = `${current.name} copy`;
      for (let n = 2; names.has(name); n += 1) name = `${current.name} copy ${n}`;
      const added: BasesViewConfig = {
        ...current,
        id: basesViewId(prev.views.length),
        name,
        formulas: current.formulas.map((f) => ({ ...f })),
        columns: [...current.columns],
        relations: [...(current.relations ?? [])],
        groupBy: current.groupBy ? { ...current.groupBy } : null,
        summaries: { ...current.summaries },
      };
      return { ...prev, activeId: added.id, views: [...prev.views, added] };
    });
  };

  const relations = view.relations ?? [];
  const propKeys = view.columns.length
    ? view.columns.filter((key) => built.keys.includes(key) || relations.includes(key))
    : built.keys;
  const shownKeys = [...new Set([...(propKeys.length ? propKeys : built.keys), ...relations])];
  const layout = view.layout === "cards" ? "cards" : "table";
  const openNote = (id: string) => {
    setActiveNote(id);
    setBasesOpen(false);
  };

  const formulaLinks = (cell: FormulaCell) =>
    (cell.links ?? []).map((link, index) => (
      <Fragment key={`${link.id ?? link.title}-${index}`}>
        {index ? ", " : null}
        {link.id ? (
          <button
            type="button"
            className="text-[var(--accent)] hover:underline"
            data-testid="bases-formula-link"
            data-note-id={link.id}
            onClick={(e) => {
              e.stopPropagation();
              openNote(link.id as string);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.stopPropagation();
            }}
          >
            {link.title}
          </button>
        ) : (
          <span data-testid="bases-formula-link-missing" title="No note with this name">
            {link.title}
          </span>
        )}
      </Fragment>
    ));

  const addRelationField = () => {
    const key = relationName.trim();
    if (!/^[A-Za-z_][\w-]*$/.test(key)) return;
    if (relations.includes(key)) return;
    patchView({ relations: [...relations, key], columns: [...new Set([...(view.columns.length ? view.columns : built.keys), key])] });
  };

  const linkChoices = useMemo(
    () => (linking ? rankLinkChoices(sources, linkQuery) : []),
    [linking, sources, linkQuery],
  );

  const linkNote = async (rowId: string, key: string, title: string) => {
    const node = useVaultStore.getState().nodes[rowId];
    if (!node || node.kind !== "note") return;
    const loaded = node.content !== undefined ? node.content : await ensureNoteBody(rowId);
    if (typeof loaded !== "string") return;
    const next = withNoteRelation(loaded, key, title);
    updateNoteContent(rowId, next, { source: true });
    setBodyEpoch((n) => n + 1);
    setLinking(null);
    setLinkQuery("");
  };

  const confirmTopLink = () => {
    const top = linkChoices[0];
    if (!linking || !top) return;
    void linkNote(linking.rowId, linking.key, noteTableTitle(top.name || top.path));
  };

  const columns = [
    ["name", "Name"],
    ["folder", "Folder"],
    ["path", "Path"],
    ...shownKeys.map((key) => [key, key] as [string, string]),
    ...view.formulas.map((f) => [formulaColumnId(f.id), f.name || "Formula"] as [string, string]),
  ];
  const groupChoices = [
    ...columns.filter(([id]) => id !== "name" && id !== "path"),
    ...(view.groupBy && !columns.some(([id]) => id === view.groupBy?.column) ? [[view.groupBy.column, view.groupBy.column] as [string, string]] : []),
  ];
  const statusById = new Map(built.formulaStatus.map((status) => [status.id, status]));
  const failureLine = formulaStatusLine(built.formulaStatus);
  const columnLabel = (id: string) => columns.find(([column]) => column === id)?.[1] ?? id;
  const groups = useMemo(() => (view.groupBy ? groupNoteRows(shown, view.groupBy) : null), [shown, view.groupBy]);
  const groupColumn = view.groupBy?.column ?? null;
  useEffect(() => {
    setCollapsed(new Set());
  }, [groupColumn, view.id]);
  const summaryEntries = Object.entries(view.summaries).filter(([id]) => columns.some(([column]) => column === id));
  const summaryFormulas = session.summaryFormulas;
  const setSummary = (column: string, kind: SummaryChoice | null) => {
    const { [column]: _old, ...rest } = view.summaries;
    patchView({ summaries: kind ? { ...rest, [column]: kind } : rest });
  };
  const summaryCell = (rows: NoteTableRow[], column: string) => {
    const kind = view.summaries[column];
    if (!kind) return null;
    const result = summarize(rows, column, kind, summaryFormulas);
    return (
      <span
        data-testid="bases-summary-value"
        data-column={column}
        data-summary={kind}
        data-summary-error={result.error ? "true" : undefined}
        title={result.detail}
      >
        <span className="text-[var(--text-muted)]">{summaryLabel(kind)}</span>{" "}
        <span className={cn("font-medium", result.error ? "text-[var(--danger)]" : "text-[var(--text)]")}>{result.text}</span>
      </span>
    );
  };
  const summaryLine = (rows: NoteTableRow[]) =>
    summaryEntries
      .map(([column, kind]) => {
        const custom = customSummaryName(kind);
        const label = custom ?? summaryLabel(kind).toLowerCase();
        return `${columnLabel(column)} ${label} ${summarize(rows, column, kind, summaryFormulas).text}`;
      })
      .join(" · ");

  /** Every view's summaries with `from` renamed to `to`, or dropped when `to` is null. */
  const withSummaryRef = (views: BasesViewConfig[], from: string, to: string | null): BasesViewConfig[] =>
    views.map((item) => {
      const old = customSummary(from);
      if (!Object.values(item.summaries).includes(old)) return item;
      const summaries: Record<string, SummaryChoice> = {};
      for (const [column, choice] of Object.entries(item.summaries)) {
        if (choice !== old) summaries[column] = choice;
        else if (to !== null) summaries[column] = customSummary(to);
      }
      return { ...item, summaries };
    });
  const addSummaryFormula = (expr = "", name = "") => {
    if (summaryFormulas.length >= MAX_SUMMARY_FORMULAS) return;
    const names = summaryFormulas.map((f) => f.name);
    let label = name.trim() || "Summary";
    for (let n = 2; summaryFormulaNameProblem(label, names); n += 1) label = `${name.trim() || "Summary"} ${n}`;
    setSession((prev) => ({ ...prev, summaryFormulas: [...prev.summaryFormulas, { name: label, expr }] }));
    setSummaryPanel(true);
    setFocusSummaryAt(summaryFormulas.length);
  };
  const patchSummaryExpr = (at: number, expr: string) => {
    setSession((prev) => ({
      ...prev,
      summaryFormulas: prev.summaryFormulas.map((f, i) => (i === at ? { ...f, expr } : f)),
    }));
  };
  const commitSummaryName = () => {
    if (!summaryDraft) return;
    const { at, name } = summaryDraft;
    const formula = summaryFormulas[at];
    if (!formula) {
      setSummaryDraft(null);
      return;
    }
    const others = summaryFormulas.filter((_, i) => i !== at).map((f) => f.name);
    if (summaryFormulaNameProblem(name, others)) return;
    const next = name.trim();
    setSummaryDraft(null);
    if (next === formula.name) return;
    setSession((prev) => ({
      ...prev,
      views: withSummaryRef(prev.views, formula.name, next),
      summaryFormulas: prev.summaryFormulas.map((f, i) => (i === at ? { ...f, name: next } : f)),
    }));
  };
  const removeSummaryFormula = (at: number) => {
    const formula = summaryFormulas[at];
    if (!formula) return;
    setSummaryDraft(null);
    setSession((prev) => ({
      ...prev,
      views: withSummaryRef(prev.views, formula.name, null),
      summaryFormulas: prev.summaryFormulas.filter((_, i) => i !== at),
    }));
  };
  const summaryUses = (name: string): number =>
    session.views.reduce((n, item) => n + Object.values(item.summaries).filter((choice) => choice === customSummary(name)).length, 0);
  const groupHeader = (group: NoteGroup) => {
    const open = !collapsed.has(group.key);
    return (
      <button
        type="button"
        aria-expanded={open}
        className="flex min-h-8 items-center gap-1 text-left text-[12px] font-semibold hover:text-[var(--accent)]"
        data-testid="bases-group-toggle"
        onClick={() =>
          setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(group.key)) next.delete(group.key);
            else next.add(group.key);
            return next;
          })
        }
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span className="text-[var(--text-muted)]">{columnLabel(groupColumn ?? "")}:</span>
        <span data-testid="bases-group-label">{group.label}</span>
        <span className="font-normal text-[var(--text-muted)]" data-testid="bases-group-count">
          · {group.rows.length} note{group.rows.length === 1 ? "" : "s"}
        </span>
      </button>
    );
  };

  const patchFormula = (id: string, partial: Partial<BasesFormula>) => {
    patchView({ formulas: view.formulas.map((f) => (f.id === id ? { ...f, ...partial } : f)) });
  };
  const addFormula = (expr = "", name = "") => {
    if (view.formulas.length >= MAX_FORMULA_COLUMNS) return;
    const label = name.trim() || (view.formulas.length ? `Formula ${view.formulas.length + 1}` : "Formula");
    const id = formulaKey(label, view.formulas.map((f) => f.id));
    patchView({ formulas: [...view.formulas, { id, name: label, expr }] });
    setFocusFormulaId(id);
  };
  const removeFormula = (id: string) => {
    const column = formulaColumnId(id);
    const { [column]: _dropped, ...summaries } = view.summaries;
    patchView({
      formulas: view.formulas.filter((f) => f.id !== id),
      summaries,
      ...(view.groupBy?.column === column ? { groupBy: null } : {}),
      ...(view.column === column ? { column: "name", dir: "asc" as const } : {}),
    });
  };
  const applyExample = (expr: string, name: string) => {
    const last = view.formulas[view.formulas.length - 1];
    if (last && !last.expr.trim()) {
      patchFormula(last.id, { expr, name: /^Formula( \d+)?$/.test(last.name) ? name : last.name });
      setFocusFormulaId(last.id);
    } else {
      addFormula(expr, name);
    }
  };

  useEffect(() => {
    if (!focusFormulaId) return;
    document.querySelector<HTMLInputElement>(`[data-testid="bases-formula"][data-formula-id="${focusFormulaId}"]`)?.focus();
    setFocusFormulaId(null);
  }, [focusFormulaId, view.formulas]);

  useEffect(() => {
    if (focusSummaryAt === null) return;
    document.querySelector<HTMLInputElement>(`[data-testid="bases-summary-formula"][data-at="${focusSummaryAt}"]`)?.focus();
    setFocusSummaryAt(null);
  }, [focusSummaryAt, session.summaryFormulas]);

  const applyBaseText = (name: string, text: string) => {
    if (text.length > 1024 * 1024) {
      setBaseNotice({
        title: `${name} is larger than 1 MB, so it was not imported.`,
        lines: [],
        tone: "error",
        undo: null,
      });
      return;
    }
    const result = readLiveBase(text, name);
    if (!result.ok) {
      setBaseNotice({ title: result.error, lines: [], tone: "error", undo: null });
      return;
    }
    const previous = session;
    const previousBase = live?.sync.template() ?? null;
    live?.sync.adopt({ text, session: result.session });
    setSession(result.session);
    const active = livePath ?? (live?.onDisk ? LIVE_BASE_FILE : live ? "browser storage" : null);
    setBaseNotice({
      title: active ? `Imported ${name}. Edits save to ${active}.` : `Imported ${name}.`,
      lines: result.notes.length ? result.notes : ["Every view, column, formula, filter, and sort carried over."],
      tone: "ok",
      undo: { session: previous, base: previousBase, label: "Undo import", kind: "import" },
    });
  };

  const importBase = async (file: File) => {
    if (file.size > 1024 * 1024) {
      setBaseNotice({ title: `${file.name} is larger than 1 MB, so it was not imported.`, lines: [], tone: "error", undo: null });
      return;
    }
    applyBaseText(file.name, await file.text());
  };

  const showVaultBases = async () => {
    setVaultBasesOpen(true);
    setVaultBases(null);
    try {
      setVaultBases(await listVaultBaseFiles());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setVaultBases([]);
      setBaseNotice({ title: `Couldn't list .base files: ${message}`, lines: [], tone: "error", undo: null });
    }
  };

  const openVaultBase = async (file: VaultBaseEntry) => {
    if (!live) {
      setBaseNotice({ title: "Open a vault before opening a .base file.", lines: [], tone: "error", undo: null });
      return;
    }
    const clean = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const next = clean === LIVE_BASE_FILE ? live.sync.home : storageForVaultBase(clean);
    if (!next) {
      setBaseNotice({ title: `Couldn't open ${file.name}: no vault is open.`, lines: [], tone: "error", undo: null });
      return;
    }
    if (live.sync.storage.path === clean) {
      setVaultBasesOpen(false);
      setBaseNotice({
        title: `${file.name} is already the file these views save to.`,
        lines: [],
        tone: "ok",
        undo: null,
      });
      return;
    }
    let text: string;
    try {
      text = await readVaultBaseText(clean);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBaseNotice({ title: `Couldn't open ${file.name}: ${message}`, lines: [], tone: "error", undo: null });
      return;
    }
    if (text.length > 1024 * 1024) {
      setBaseNotice({ title: `${file.name} is larger than 1 MB, so it was not opened.`, lines: [], tone: "error", undo: null });
      return;
    }
    const parsed = readLiveBase(text, next.name);
    if (!parsed.ok) {
      setBaseNotice({ title: parsed.error, lines: [], tone: "error", undo: null });
      return;
    }
    cancelPendingSave();
    const flushed = await live.sync.save(sessionRef.current, keysRef.current);
    if (flushed.kind === "failed" || flushed.kind === "blocked") {
      setBaseNotice({
        title: flushed.kind === "failed" ? flushed.message : flushed.reason,
        lines: ["Nexus left the open file as it is."],
        tone: "error",
        undo: null,
      });
      return;
    }
    const previousSession = flushed.kind === "conflict" ? flushed.session : sessionRef.current;
    const previousStorage = live.sync.storage;
    const previousBase = live.sync.template();
    const previousPath = live.sync.storage === live.sync.home ? null : (live.sync.storage.path ?? null);
    await live.sync.retarget(next, text);
    setLivePath(next === live.sync.home ? null : clean);
    setSession(parsed.session);
    setVaultBasesOpen(false);
    const lines = parsed.notes.length ? [...parsed.notes] : ["Every view, column, formula, filter, and sort carried over."];
    if (flushed.kind === "conflict") lines.push("The file you left had changed outside Nexus. Undo open returns to that version.");
    setBaseNotice({
      title: `Opened ${file.name}. Edits save to ${clean}.`,
      lines,
      tone: "ok",
      undo: {
        session: previousSession,
        base: previousBase,
        storage: previousStorage,
        livePath: previousPath,
        label: "Undo open",
        kind: "import",
      },
    });
  };

  useEffect(() => {
    const openPicker = () => {
      if (takeVaultBaseRequest()) void showVaultBases();
    };
    openPicker();
    return subscribeVaultBaseRequest(openPicker);
  }, []);

  const replaceLive = () => {
    if (!live) return;
    void live.sync.replace(sessionRef.current, keysRef.current).then((result) => {
      if (result.kind === "saved") {
        setLiveState("ok");
        setBaseNotice({
          title: `Replaced ${liveName()} with these views.`,
          lines: [`The unreadable file was copied to ${live.onDisk ? LIVE_BASE_BACKUP : "browser storage"}.`],
          tone: "ok",
          undo: null,
        });
      } else if (result.kind === "failed") {
        setBaseNotice({ title: result.message, lines: [], tone: "error", undo: null, blocked: { replaceable: true } });
      } else {
        onSaved(sessionRef.current)(result);
      }
    });
  };

  const exportBase = async () => {
    const { text, notes } = exportBaseFile(session, built.keys);
    const desktop = getDesktopRoot();
    const fsa = desktop ? null : getFsaRoot();
    try {
      if (desktop) await writeDesktopNote(desktop, BASE_EXPORT_FILE, text);
      else if (fsa) await writeNoteFile(fsa, BASE_EXPORT_FILE, text);
      else {
        const url = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = BASE_EXPORT_FILE;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setBaseNotice({
        title:
            desktop || fsa
            ? `Exported a copy to ${BASE_EXPORT_FILE}. Nexus keeps saving your views to ${livePath ?? LIVE_BASE_FILE}.`
            : livePath
              ? `Downloaded ${BASE_EXPORT_FILE}. Nexus keeps saving your views to ${livePath}.`
              : `Downloaded ${BASE_EXPORT_FILE}.`,
        lines: notes,
        tone: "ok",
        undo: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBaseNotice({ title: `Couldn't export ${BASE_EXPORT_FILE}: ${message}`, lines: [], tone: "error", undo: null });
    }
  };

  const renderCard = (row: NoteTableRow) => (
    <div
      key={row.id}
      role="button"
      tabIndex={0}
      data-testid="bases-card"
      data-note-id={row.id}
      data-path={row.path}
      className="flex cursor-pointer flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-solid)] p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      onClick={() => openNote(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          openNote(row.id);
        }
      }}
    >
      <h3 className="text-[14px] font-semibold">{row.name}</h3>
      <p className="truncate text-[11px] text-[var(--text-muted)]">{row.folder || row.path}</p>
      {shownKeys.map((key) => {
        const links = row.links[key] || [];
        return (
          <div key={key} data-prop={key} className="flex flex-wrap items-center gap-1 text-[12px]">
            <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{key}</span>
            {links.length
              ? links.map((link) => {
                  if (!link.id) return <span key={link.title}>{link.title}</span>;
                  const noteId = link.id;
                  return (
                    <button
                      key={noteId}
                      type="button"
                      className="text-[var(--accent)] hover:underline"
                      data-testid="bases-relation"
                      data-note-id={noteId}
                      onClick={(e) => {
                        e.stopPropagation();
                        openNote(noteId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.stopPropagation();
                      }}
                    >
                      {link.title}
                    </button>
                  );
                })
              : relations.includes(key)
                ? null
                : (
                  <span>{row.props[key] || "—"}</span>
                )}
            {relations.includes(key) ? (
              <button
                type="button"
                className="inline-flex min-h-9 min-w-[4.5rem] items-center justify-center rounded-md border border-[var(--border)] px-3 text-[13px]"
                data-testid="bases-link-note"
                data-row-id={row.id}
                data-relation={key}
                onClick={(e) => {
                  e.stopPropagation();
                  setLinking({ rowId: row.id, key });
                  setLinkQuery("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.stopPropagation();
                }}
              >
                Link
              </button>
            ) : null}
          </div>
        );
      })}
      {view.formulas.map((f) => {
        const cell = row.formulas[f.id];
        if (!cell) return null;
        return (
          <p
            key={f.id}
            className="truncate text-[12px] text-[var(--text-muted)]"
            data-testid="bases-card-formula"
            data-formula-id={f.id}
            data-formula-error={cell.error ?? undefined}
            title={cell.error ?? cell.value}
          >
            <span className="text-[10px] uppercase tracking-wide">{f.name || "Formula"}</span>{" "}
            {cell.error ? (
              <span className="text-[var(--danger)]" data-testid="bases-formula-error">
                ⚠ {cell.error}
              </span>
            ) : (
              <span className="text-[var(--text)]">{cell.links?.length ? formulaLinks(cell) : cell.value || "—"}</span>
            )}
          </p>
        );
      })}
    </div>
  );

  const renderRow = (row: NoteTableRow) => (
      <tr
        key={row.id}
        data-testid="bases-row"
        data-note-id={row.id}
        data-path={row.path}
        className="border-b border-[var(--border)] hover:bg-white/[0.04]"
      >
        <td className="max-w-[16rem] truncate px-2 py-1.5 font-medium">
          <button
            type="button"
            className="max-w-full truncate text-left hover:text-[var(--accent)]"
            data-testid="bases-open-note"
            onClick={() => {
              setActiveNote(row.id);
              setBasesOpen(false);
            }}
          >
            {row.name}
          </button>
        </td>
        <td className="max-w-[12rem] truncate px-2 py-1.5 text-[var(--text-muted)]">{row.folder || "—"}</td>
        <td className="max-w-[18rem] truncate px-2 py-1.5 text-[var(--text-muted)]">{row.path}</td>
        {shownKeys.map((key) => {
          const links = row.links[key] || [];
          return (
            <td key={key} className="max-w-[16rem] truncate px-2 py-1.5" data-prop={key}>
              {links.length
                ? links.map((link) =>
                    link.id ? (
                      <button
                        key={link.id}
                        type="button"
                        className="mr-1 text-[var(--accent)] hover:underline"
                        data-testid="bases-relation"
                        data-note-id={link.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveNote(link.id);
                          setBasesOpen(false);
                        }}
                      >
                        {link.title}
                      </button>
                    ) : (
                      <span key={link.title}>{link.title}</span>
                    ),
                  )
                : relations.includes(key)
                  ? null
                  : row.props[key] || ""}
              {relations.includes(key) ? (
                <button
                  type="button"
                  className="ml-1 inline-flex min-h-9 min-w-[4.5rem] items-center justify-center rounded-md border border-[var(--border)] px-3 text-[13px] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  data-testid="bases-link-note"
                  data-row-id={row.id}
                  data-relation={key}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLinking({ rowId: row.id, key });
                    setLinkQuery("");
                  }}
                >
                  Link
                </button>
              ) : null}
            </td>
          );
        })}
        {view.formulas.map((f) => {
          const cell = row.formulas[f.id];
          return (
            <td
              key={f.id}
              className="max-w-[16rem] truncate px-2 py-1.5"
              data-formula={cell?.value ?? ""}
              data-formula-id={f.id}
              data-formula-error={cell?.error ?? undefined}
              title={cell?.error ?? cell?.value}
            >
              {cell?.error ? (
                <span className="text-[var(--danger)]" data-testid="bases-formula-error">
                  ⚠ {cell.error}
                </span>
              ) : cell?.links?.length ? (
                formulaLinks(cell)
              ) : (
                cell?.value
              )}
            </td>
          );
        })}
      </tr>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg)]" data-testid="bases-table">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Bases</p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-disclosure" data-live-path={livePath ?? ""}>
            Built-in table and cards with views, formula columns with list, regex, and link functions, group-by, summary rows with summary formulas, and typed note links.{" "}
            {livePath
              ? `Views live in ${livePath}. Nexus saves edits to that file and reloads it when it changes.`
              : live?.onDisk
                ? `Views live in ${LIVE_BASE_FILE} at the vault root, an Obsidian .base file Nexus saves to and reloads when it changes.`
                : "Views live in a .base kept in browser storage for this vault."}{" "}
            Not Obsidian Bases — link.asFile() opens that note, and link.linksTo() checks its links. Some Obsidian functions are missing (Formula help lists what works). asFile().name, .path, .properties, .size, .ctime, and .mtime read that note.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {session.views.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn("chip-btn", session.activeId === item.id && "is-active")}
              data-testid="bases-view"
              data-view={item.id}
              aria-pressed={session.activeId === item.id}
              title={item.name}
              onClick={() => setSession((prev) => ({ ...prev, activeId: item.id }))}
            >
              {item.name}
            </button>
          ))}
          <button type="button" className="chip-btn" data-testid="bases-save-view" onClick={saveView}>
            Save view
          </button>
          <button
            type="button"
            className="chip-btn"
            data-testid="bases-add-view"
            disabled={session.views.length >= MAX_BASE_VIEWS}
            title={
              session.views.length >= MAX_BASE_VIEWS
                ? `Up to ${MAX_BASE_VIEWS} views; the rest stay in the file`
                : "Add a view with this view's filters, columns, and formulas"
            }
            onClick={addView}
          >
            + View
          </button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Layout">
          <button
            type="button"
            className={cn("chip-btn", layout === "table" && "is-active")}
            data-testid="bases-layout-table"
            aria-pressed={layout === "table"}
            onClick={() => patchView({ layout: "table" })}
          >
            Table
          </button>
          <button
            type="button"
            className={cn("chip-btn", layout === "cards" && "is-active")}
            data-testid="bases-layout-cards"
            aria-pressed={layout === "cards"}
            onClick={() => patchView({ layout: "cards" })}
          >
            Cards
          </button>
        </div>
        <input
          value={view.query}
          onChange={(e) => patchView({ query: e.target.value })}
          placeholder="Filter title or property…"
          className="nexus-field h-8 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-filter"
        />
        <input
          value={view.folder}
          onChange={(e) => patchView({ folder: e.target.value })}
          placeholder="Folder"
          className="nexus-field h-8 w-28 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-folder"
        />
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-add-formula"
          disabled={view.formulas.length >= MAX_FORMULA_COLUMNS}
          title={`Up to ${MAX_FORMULA_COLUMNS} formula columns per view`}
          onClick={() => addFormula()}
        >
          + Formula
        </button>
        <label className="flex items-center gap-1 text-[12px]">
          <span className="text-[var(--text-muted)]">Group</span>
          <select
            value={view.groupBy?.column ?? ""}
            onChange={(e) =>
              patchView({ groupBy: e.target.value ? { column: e.target.value, dir: view.groupBy?.dir ?? "asc" } : null })
            }
            className="nexus-field h-8 max-w-[9rem] rounded-md border border-[var(--border)] bg-transparent px-1.5 text-[12px]"
            data-testid="bases-group-by"
          >
            <option value="">None</option>
            {groupChoices.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {view.groupBy ? (
          <button
            type="button"
            className="chip-btn"
            data-testid="bases-group-dir"
            aria-label={view.groupBy.dir === "asc" ? "Groups ascending" : "Groups descending"}
            onClick={() => patchView({ groupBy: { ...view.groupBy!, dir: view.groupBy!.dir === "asc" ? "desc" : "asc" } })}
          >
            {view.groupBy.dir === "asc" ? "Groups ↑" : "Groups ↓"}
          </button>
        ) : null}
        <button
          type="button"
          className={cn("chip-btn", formulaHelp && "is-active")}
          aria-pressed={formulaHelp}
          aria-controls="bases-formula-help"
          data-testid="bases-formula-help-toggle"
          onClick={() => setFormulaHelp((open) => !open)}
        >
          Formula help
        </button>
        <button
          type="button"
          className={cn("chip-btn", summaryPanel && "is-active")}
          aria-pressed={summaryPanel}
          aria-controls="bases-summary-formulas"
          data-testid="bases-summary-formulas-toggle"
          title="Summary formulas run once per group over the column's values; pick one in a column's Summary menu"
          onClick={() => {
            setSummaryPanel((open) => !open);
            setSummaryDraft(null);
          }}
        >
          Summary formulas{summaryFormulas.length ? ` · ${summaryFormulas.length}` : ""}
        </button>
        <input
          value={relationName}
          onChange={(e) => setRelationName(e.target.value)}
          placeholder="Relation field"
          className="nexus-field h-8 w-28 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
          data-testid="bases-relation-field"
        />
        <button type="button" className="chip-btn" data-testid="bases-add-relation" onClick={addRelationField}>
          Note link
        </button>
        <input
          value={relationQuery}
          onChange={(e) => setRelationQuery(e.target.value)}
          placeholder="Filter linked note"
          className="nexus-field h-9 min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 text-[13px]"
          data-testid="bases-relation-filter"
        />
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-open-vault-base"
          aria-expanded={vaultBasesOpen}
          title="Open a .base file that is already in this vault. Edits then save to that file."
          onClick={() => {
            if (vaultBasesOpen) setVaultBasesOpen(false);
            else void showVaultBases();
          }}
        >
          Open .base
        </button>
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-import-base"
          title="Replace the open views with a .base file from outside the vault"
          onClick={() => baseInput.current?.click()}
        >
          Import .base
        </button>
        <input
          ref={baseInput}
          type="file"
          accept=".base,.yaml,.yml"
          className="hidden"
          data-testid="bases-import-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importBase(file);
          }}
        />
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-export-base"
          title={`Write a copy of these views as ${BASE_EXPORT_FILE}`}
          onClick={() => void exportBase()}
        >
          Export .base
        </button>
        <button
          type="button"
          className="chip-btn"
          data-testid="bases-close"
          onClick={() => setBasesOpen(false)}
        >
          <X size={13} /> Close
        </button>
      </div>
      {vaultBasesOpen ? (
        <div className="shrink-0 border-b border-[var(--border)] px-3 py-2 text-[12px]" data-testid="bases-vault-bases">
          {vaultBases === null ? (
            <p className="text-[var(--text-muted)]">Looking for .base files…</p>
          ) : vaultBases.length === 0 ? (
            <p className="text-[var(--text-muted)]" data-testid="bases-vault-bases-empty">
              No .base files in this vault.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {vaultBases.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  className="chip-btn"
                  data-testid="bases-vault-base"
                  data-path={file.path}
                  title={file.path}
                  onClick={() => void openVaultBase(file)}
                >
                  {file.path}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {baseNotice ? (
        <div
          role="status"
          className={cn(
            "shrink-0 border-b border-[var(--border)] px-3 py-2 text-[12px]",
            baseNotice.tone === "error" ? "bg-[var(--danger-dim)] text-[var(--danger)]" : "bg-[var(--fill-subtle)]",
          )}
          data-testid="bases-base-notice"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{baseNotice.title}</p>
            <div className="flex items-center gap-1">
              {baseNotice.undo ? (
                <button
                  type="button"
                  className="chip-btn"
                  data-testid="bases-import-undo"
                  data-undo={baseNotice.undo.kind}
                  onClick={() => {
                    const undo = baseNotice.undo;
                    if (!undo) return;
                    void (async () => {
                      cancelPendingSave();
                      if (undo.storage) await live?.sync.retarget(undo.storage, undo.base?.text ?? null);
                      else if (undo.base !== undefined) live?.sync.adopt(undo.base);
                      if (undo.livePath !== undefined) setLivePath(undo.livePath);
                      setSession(undo.session);
                      setBaseNotice(null);
                    })();
                  }}
                >
                  {baseNotice.undo.label}
                </button>
              ) : null}
              {baseNotice.blocked ? (
                <button
                  type="button"
                  className="chip-btn"
                  data-testid="bases-live-retry"
                  onClick={() => void live?.sync.check().then(onChecked)}
                >
                  Retry
                </button>
              ) : null}
              {baseNotice.blocked?.replaceable ? (
                <button type="button" className="chip-btn" data-testid="bases-live-replace" onClick={replaceLive}>
                  Replace with these views
                </button>
              ) : null}
              <button type="button" className="chip-btn" onClick={() => setBaseNotice(null)}>
                OK
              </button>
            </div>
          </div>
          {baseNotice.lines.length ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[var(--text-muted)]" data-testid="bases-base-notes">
              {baseNotice.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {view.formulas.length ? (
        <div className="shrink-0 space-y-1 border-b border-[var(--border)] px-3 py-1.5" data-testid="bases-formulas">
          {view.formulas.map((f, index) => {
            const parseError = statusById.get(f.id)?.parseError ?? null;
            const errorId = `bases-formula-error-${f.id}`;
            return (
              <div key={f.id} data-testid="bases-formula-row" data-formula-id={f.id}>
                <div className="flex items-center gap-1.5">
                  <input
                    value={f.name}
                    onChange={(e) => patchFormula(f.id, { name: e.target.value })}
                    aria-label={`Formula column ${index + 1} name`}
                    className="nexus-field h-8 w-32 rounded-md border border-[var(--border)] bg-transparent px-2 text-[12px]"
                    data-testid="bases-formula-name"
                  />
                  <input
                    value={f.expr}
                    onChange={(e) => patchFormula(f.id, { expr: e.target.value })}
                    placeholder={index ? `e.g. formula.${view.formulas[0]?.id ?? "formula"} & " · " & file.folder` : "e.g. file.mtime.relative()"}
                    spellCheck={false}
                    aria-label={`Formula for ${f.name || `column ${index + 1}`}`}
                    aria-invalid={parseError ? true : undefined}
                    aria-describedby={parseError ? errorId : undefined}
                    title={`Columns to the right read this one as formula.${f.id}`}
                    className={cn(
                      "nexus-field h-8 min-w-[12rem] flex-1 rounded-md border bg-transparent px-2 font-mono text-[11px]",
                      parseError ? "border-[var(--danger)]" : "border-[var(--border)]",
                    )}
                    data-testid="bases-formula"
                    data-formula-id={f.id}
                  />
                  <code className="hidden shrink-0 text-[10.5px] text-[var(--text-muted)] md:inline" data-testid="bases-formula-key">
                    formula.{f.id}
                  </code>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 shrink-0"
                    aria-label={`Remove formula column ${f.name || index + 1}`}
                    data-testid="bases-formula-remove"
                    onClick={() => removeFormula(f.id)}
                  >
                    <X size={13} />
                  </button>
                </div>
                {parseError ? (
                  <p
                    id={errorId}
                    role="alert"
                    className="mt-0.5 rounded-md bg-[var(--danger-dim)] px-2 py-1 text-[12px] text-[var(--danger)]"
                    data-testid="bases-formula-parse-error"
                  >
                    Formula error in “{f.name || `column ${index + 1}`}”: {parseError}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {summaryPanel ? (
        <div
          id="bases-summary-formulas"
          className="shrink-0 space-y-1 border-b border-[var(--border)] px-3 py-1.5 text-[12px]"
          data-testid="bases-summary-formulas"
        >
          <p className="text-[11px] text-[var(--text-muted)]">
            A summary formula runs once per group, and once for all notes, over the column you pick it for. values is that
            column's values, one per note, with null for a note that has none; values.length counts the notes. Every view shares
            these, like summaries: in a .base file.
          </p>
          {summaryFormulas.map((f, at) => {
            const draft = summaryDraft?.at === at ? summaryDraft.name : null;
            const nameProblem =
              draft === null ? null : summaryFormulaNameProblem(draft, summaryFormulas.filter((_, i) => i !== at).map((o) => o.name));
            const exprError = f.expr.trim() ? compileSummaryFormula(f.expr).error : null;
            const uses = summaryUses(f.name);
            const errorId = `bases-summary-formula-error-${at}`;
            return (
              <div key={at} data-testid="bases-summary-formula-row" data-name={f.name}>
                <div className="flex items-center gap-1.5">
                  <input
                    value={draft ?? f.name}
                    onChange={(e) => setSummaryDraft({ at, name: e.target.value })}
                    onBlur={commitSummaryName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitSummaryName();
                      if (e.key === "Escape" && draft !== null) {
                        e.preventDefault();
                        e.stopPropagation();
                        setSummaryDraft(null);
                      }
                    }}
                    aria-label={`Summary formula ${at + 1} name`}
                    aria-invalid={nameProblem ? true : undefined}
                    className={cn(
                      "nexus-field h-8 w-32 rounded-md border bg-transparent px-2 text-[12px]",
                      nameProblem ? "border-[var(--danger)]" : "border-[var(--border)]",
                    )}
                    data-testid="bases-summary-formula-name"
                    data-at={at}
                  />
                  <input
                    value={f.expr}
                    onChange={(e) => patchSummaryExpr(at, e.target.value)}
                    placeholder="e.g. values.mean().round(2)"
                    spellCheck={false}
                    aria-label={`Summary formula for ${f.name}`}
                    aria-invalid={exprError ? true : undefined}
                    aria-describedby={exprError ? errorId : undefined}
                    className={cn(
                      "nexus-field h-8 min-w-[12rem] flex-1 rounded-md border bg-transparent px-2 font-mono text-[11px]",
                      exprError ? "border-[var(--danger)]" : "border-[var(--border)]",
                    )}
                    data-testid="bases-summary-formula"
                    data-at={at}
                  />
                  <span className="hidden shrink-0 text-[10.5px] text-[var(--text-muted)] md:inline" data-testid="bases-summary-formula-uses">
                    {uses ? `used by ${uses} column${uses === 1 ? "" : "s"}` : "not used yet"}
                  </span>
                  <button
                    type="button"
                    className="icon-btn h-8 w-8 shrink-0"
                    aria-label={`Remove summary formula ${f.name}`}
                    title={uses ? "Removing it also clears the summaries that use it" : undefined}
                    data-testid="bases-summary-formula-remove"
                    onClick={() => removeSummaryFormula(at)}
                  >
                    <X size={13} />
                  </button>
                </div>
                {nameProblem ? (
                  <p role="alert" className="mt-0.5 text-[12px] text-[var(--danger)]" data-testid="bases-summary-formula-name-error">
                    {nameProblem}
                  </p>
                ) : null}
                {exprError ? (
                  <p
                    id={errorId}
                    role="alert"
                    className="mt-0.5 rounded-md bg-[var(--danger-dim)] px-2 py-1 text-[12px] text-[var(--danger)]"
                    data-testid="bases-summary-formula-error"
                  >
                    Summary formula error in “{f.name}”: {exprError}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="chip-btn"
              data-testid="bases-add-summary-formula"
              disabled={summaryFormulas.length >= MAX_SUMMARY_FORMULAS}
              title={`Up to ${MAX_SUMMARY_FORMULAS} summary formulas`}
              onClick={() => addSummaryFormula()}
            >
              + Summary formula
            </button>
            {SUMMARY_FORMULA_EXAMPLES.map((example) => (
              <button
                key={example.formula}
                type="button"
                className="flex min-h-9 flex-col items-start rounded-md border border-[var(--border)] px-2 py-1 text-left hover:border-[var(--accent)] disabled:opacity-50"
                data-testid="bases-summary-formula-example"
                data-formula={example.formula}
                disabled={summaryFormulas.length >= MAX_SUMMARY_FORMULAS}
                title="Add as a summary formula"
                onClick={() => addSummaryFormula(example.formula, example.name)}
              >
                <span className="font-mono text-[11px]">{example.formula}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{example.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {formulaHelp ? (
        <div
          id="bases-formula-help"
          className="shrink-0 space-y-2 border-b border-[var(--border)] px-3 py-2 text-[12px]"
          data-testid="bases-formula-help"
        >
          <div className="flex flex-wrap gap-1.5">
            {FORMULA_EXAMPLES.map((example) => (
              <button
                key={example.formula}
                type="button"
                className="flex min-h-9 flex-col items-start rounded-md border border-[var(--border)] px-2 py-1 text-left hover:border-[var(--accent)]"
                data-testid="bases-formula-example"
                data-formula={example.formula}
                title="Add as a formula column"
                onClick={() => applyExample(example.formula, example.name)}
              >
                <span className="font-mono text-[11px]">{example.formula}</span>
                <span className="text-[11px] text-[var(--text-muted)]">{example.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Values: a property name, note["key with spaces"], file.name, file.path, file.folder, file.ext, file.mtime, file.links, file.backlinks, file.tags, "text", numbers, true, false, lists like [1, 2], regexes like /^draft/i.
            Operators: + - * / % · &amp; joins text · == != &lt; &gt; &lt;= &gt;= · &amp;&amp; || !. Put spaces around - between names; due-date is one property.
            Dates: date(x) reads YYYY-MM-DD or [[YYYY-MM-DD]]; add or subtract durations like "7d", "2w", "1M", "1y"; date - date gives days; times are UTC.
            Format tokens: YYYY MM M MMM MMMM DD D ddd dddd HH mm ss.
            formula.&lt;column&gt; reads a formula column to its left, like formula.due.relative().
          </p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-formula-lists">
            Lists: frontmatter like [a, b] or a block of - items is a list; tags[0] is the first item, tags[-1] the last.
            filter, map, and reduce re-run their expression per item with value and index, and reduce adds acc:
            tags.filter(value != "draft"), scores.map(value * 2), scores.reduce(acc + value, 0). + joins lists.
            Regex: status.matches(/^draft/i); replace and split take a regex too, and replace(/(\d+)/g, "#$1") uses groups.
            Links: a property made of [[links]] is a link, and equals the note's title or path. link("Note") makes one;
            links that point at a note open it from the cell. file.backlinks lists loaded notes that link here.
          </p>
          <p className="text-[11px] text-[var(--text-muted)]" data-testid="bases-formula-summaries">
            Summary formulas (the Summary formulas button) use the same functions on values, the list of one column's values in a
            group: values.mean().round(2), values.filter(value == "done").length, values.max() - values.min(). They cannot read
            file., formula., or a property by name; pick the column in its Summary menu instead.
          </p>
          <div className="space-y-0.5 text-[11px] text-[var(--text-muted)]" data-testid="bases-formula-functions">
            <p>Functions also work as methods, like status.upper() or tags.join(" · ").</p>
            {FORMULA_FUNCTION_GROUPS.map((group) => (
              <p key={group.group} data-testid="bases-formula-group" data-group={group.group}>
                <span className="font-medium text-[var(--text)]">{group.label}:</span> {group.names.join(", ")}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto" data-layout={layout}>
        {layout === "cards" ? (
          <div className="space-y-4 p-3" data-testid="bases-cards">
            {groups
              ? groups.map((group) => (
                  <section key={group.key} data-testid="bases-card-group" data-group={group.key}>
                    {groupHeader(group)}
                    {summaryEntries.length ? (
                      <p className="mb-2 text-[11.5px] text-[var(--text-muted)]" data-testid="bases-card-group-summary">
                        {summaryLine(group.rows)}
                      </p>
                    ) : null}
                    {collapsed.has(group.key) ? null : (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">{group.rows.map(renderCard)}</div>
                    )}
                  </section>
                ))
              : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">{shown.map(renderCard)}</div>
                )}
            {summaryEntries.length && shown.length ? (
              <p className="border-t border-[var(--border)] pt-2 text-[11.5px] text-[var(--text-muted)]" data-testid="bases-card-summary">
                {groups ? "All groups · " : ""}
                {summaryLine(shown)}
              </p>
            ) : null}
          </div>
        ) : (
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="sticky top-0 bg-[var(--panel-solid)]">
            <tr>
              {columns.map(([id, label]) => (
                <th key={id} className="border-b border-[var(--border)] px-2 py-1.5 font-medium">
                  <button
                    type="button"
                    className={cn("hover:text-[var(--accent)]", view.column === id && "text-[var(--accent)]")}
                    data-testid="bases-sort"
                    data-column={id}
                    onClick={() => sortBy(id)}
                  >
                    {label}
                    {view.column === id ? (view.dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups
              ? groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr data-testid="bases-group" data-group={group.key} className="border-b border-[var(--border)] bg-[var(--fill-subtle)]">
                      <td colSpan={columns.length} className="px-2 py-1">
                        {groupHeader(group)}
                      </td>
                    </tr>
                    {collapsed.has(group.key) ? null : group.rows.map(renderRow)}
                    {summaryEntries.length ? (
                      <tr data-testid="bases-group-summary" data-group={group.key} className="border-b border-[var(--border)] text-[11px] text-[var(--text-muted)]">
                        {columns.map(([id]) => (
                          <td key={id} className="px-2 py-1">
                            {summaryCell(group.rows, id)}
                          </td>
                        ))}
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              : shown.map(renderRow)}
          </tbody>
          {shown.length ? (
            <tfoot className="sticky bottom-0 bg-[var(--panel-solid)]">
              <tr data-testid="bases-summary-row" className="border-t border-[var(--border)] text-[11px]">
                {columns.map(([id, label]) => {
                  const kind = view.summaries[id] ?? null;
                  const offered: SummaryChoice[] = summaryKindsFor(shown, id);
                  const custom = summaryFormulas.map((f) => customSummary(f.name));
                  const options = kind && customSummaryName(kind) === null && !offered.includes(kind) ? [...offered, kind] : offered;
                  const customOptions = kind && customSummaryName(kind) !== null && !custom.includes(kind) ? [...custom, kind] : custom;
                  return (
                    <td key={id} className="px-2 py-1 align-top">
                      <div className="flex items-center gap-1">
                        <select
                          value={kind ?? ""}
                          onChange={(e) => setSummary(id, (e.target.value || null) as SummaryChoice | null)}
                          aria-label={`Summary for ${label}`}
                          className="nexus-field h-7 max-w-[7rem] rounded border border-[var(--border)] bg-transparent px-1 text-[11px] text-[var(--text-muted)]"
                          data-testid="bases-summary-select"
                          data-column={id}
                        >
                          <option value="">{kind ? "No summary" : "Summary"}</option>
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {summaryLabel(option)}
                            </option>
                          ))}
                          {customOptions.length ? (
                            <optgroup label="Summary formulas">
                              {customOptions.map((option) => (
                                <option key={option} value={option}>
                                  {summaryLabel(option)}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                        </select>
                        {kind ? summaryCell(shown, id) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
        )}
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-[12px] text-[var(--text-muted)]" data-testid="bases-empty">
            No notes match.
          </p>
        ) : null}
      </div>
      {linking ? (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2" data-testid="bases-link-picker">
          <input
            autoFocus
            value={linkQuery}
            onChange={(e) => setLinkQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                confirmTopLink();
              }
            }}
            placeholder="Type a note title, then Enter"
            aria-label="Choose a note to link"
            aria-controls="bases-link-list"
            aria-activedescendant={linkChoices[0] ? `bases-link-choice-${linkChoices[0].id}` : undefined}
            className="nexus-field mb-2 h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-2 text-[13px]"
            data-testid="bases-link-query"
          />
          <ul id="bases-link-list" role="listbox" className="max-h-64 overflow-y-auto" data-testid="bases-link-list">
            {linkChoices.map((note, index) => {
              const title = noteTableTitle(note.name || note.path);
              const active = index === 0;
              return (
                <li key={note.id}>
                  <button
                    id={`bases-link-choice-${note.id}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-md px-3 text-left text-[14px]",
                      active ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
                    )}
                    data-testid="bases-link-choice"
                    data-note-id={note.id}
                    data-active={active ? "1" : "0"}
                    onClick={() => linkNote(linking.rowId, linking.key, title)}
                  >
                    {title}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <p className="shrink-0 border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]" data-testid="bases-footer">
        {shown.length} note{shown.length === 1 ? "" : "s"}
        {built.keys.length
          ? ` · ${built.keys.join(", ")}`
          : visibleMissingIds.length === 0
            ? " · no frontmatter properties in this set"
            : ""}
        {built.truncated ? " · first 400 notes" : ""}
        {view.formulas.length
          ? ` · ${view.formulas.length} formula column${view.formulas.length === 1 ? "" : "s"}`
          : ""}
        {failureLine ? ` · ${failureLine.replace(/\.$/, "")}` : ""}
        {groups ? ` · grouped by ${columnLabel(groupColumn ?? "")}, ${groups.length} group${groups.length === 1 ? "" : "s"}` : ""}
        {readingProperties ? " · reading note properties" : ""}
        {indexFillBusy && visibleMissingIds.length > 0 && !readingProperties
          ? " · properties wait until the index is idle"
          : ""}
        {liveState === "failed" ? ` · views not saved yet, Nexus keeps trying` : ""}
        {liveState === "blocked" ? ` · views not saving until ${liveName()} can be read` : ""}
        . Typed note links save as [[Title]] in the note.{" "}
        {livePath
          ? `Views save to ${livePath}.`
          : live?.onDisk
            ? `Views save to ${LIVE_BASE_FILE}.`
            : "Views save in browser storage."}
      </p>
    </div>
  );
}
