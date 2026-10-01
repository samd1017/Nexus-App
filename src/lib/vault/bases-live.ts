/**
 * The vault's live `.base` file: Nexus reads its views from it and writes
 * every change back into it. Writes merge into the file as it is, so views,
 * formulas, filters, summaries, and comments Nexus does not show stay put.
 * Settings `.base` has no key for (text filter, link columns, Count) live
 * under a top-level `nexus:` block that other apps can ignore.
 */

import { Document, isMap, isScalar, parse, parseDocument, stringify } from "yaml";
import {
  FILE_FORMULAS,
  FILE_SORT,
  asRecord,
  baseViewNode,
  folderFilter,
  folderOf,
  formulaRefs,
  importBaseFile,
  normalFolder,
  rewriteFormulaRefs,
  summaryFromBase,
} from "@/lib/vault/bases-file";
import {
  formulaKey,
  parseBasesSession,
  type BasesSession,
  type BasesViewConfig,
} from "@/lib/vault/note-table";

export const LIVE_BASE_FILE = "Nexus Bases.base";
/** Where an unreadable live file is copied before Nexus replaces it. */
export const LIVE_BASE_BACKUP = ".nexus/Nexus Bases.unreadable.base";
export const MAX_LIVE_BASE_CHARS = 1024 * 1024;

const LIVE_HEADER = [
  "# Nexus Bases live views. Nexus saves every change here and reloads edits made in other apps.",
  "# The nexus: block keeps Nexus-only settings (text filter, link columns, Count summaries).",
].join("\n");

const OLD_EXPORT = /^\uFEFF?#\s*Exported from Nexus\b/;

const VIEW_FIELDS = [
  "name",
  "query",
  "folder",
  "column",
  "dir",
  "formulas",
  "columns",
  "relations",
  "layout",
  "groupBy",
  "summaries",
] as const satisfies readonly (keyof BasesViewConfig)[];

export type LiveBase = { text: string; session: BasesSession };

export type LiveRead =
  | {
      ok: true;
      session: BasesSession;
      /** What shows differently in Nexus. Only filled for views another app wrote or edited. */
      notes: string[];
      /** A view was written or edited outside Nexus since Nexus last saved it. */
      outside: boolean;
      /** The file is an export from a Nexus build that kept views in `.nexus/note-table.json`. */
      oldExport: boolean;
    }
  | { ok: false; error: string };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    return `{${Object.keys(rec)
      .sort()
      .filter((key) => rec[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical(rec[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** FNV-1a over everything the import of view `index` reads, so any outside edit to it shows. */
function viewSync(root: Record<string, unknown>, index: number): string {
  const views = Array.isArray(root.views) ? root.views : [];
  const text = canonical({
    view: views[index] ?? null,
    formulas: root.formulas ?? null,
    properties: root.properties ?? null,
    filters: root.filters ?? null,
    summaries: root.summaries,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The same shape `parseBasesSession` would give, so equal configs compare equal. */
export function normalizeBasesSession(session: BasesSession): BasesSession {
  return parseBasesSession(JSON.stringify(session));
}

export function sameBasesView(a: BasesViewConfig, b: BasesViewConfig): boolean {
  return VIEW_FIELDS.every((field) => canonical(a[field]) === canonical(b[field]));
}

export function sameBasesSession(a: BasesSession, b: BasesSession): boolean {
  const x = normalizeBasesSession(a);
  const y = normalizeBasesSession(b);
  return (
    x.activeId === y.activeId &&
    canonical(x.summaryFormulas) === canonical(y.summaryFormulas) &&
    x.views.every((view, i) => sameBasesView(view, y.views[i] as BasesViewConfig))
  );
}

/** Import wording, restated for a file Nexus keeps rather than copies from. */
function liveNote(line: string): string {
  return line
    .replace(/ (?:was|were) not imported/g, (m) => (m.includes("were") ? " stay in the file" : " stays in the file"))
    .replace(/ and was left out\./g, "; it stays in the file.")
    .replace(/; it was left out\./g, "; it stays in the file.")
    .replace(/Nexus keeps two views; /, "Nexus shows two views; ")
    .replace(/, which did not carry over; it sorts by name\./, "; Nexus sorts by name and the file keeps that sort until you change it.")
    .replace(/, which did not carry over; it shows ungrouped\./, "; Nexus shows it ungrouped and the file keeps that grouping until you change it.");
}

export function readLiveBase(text: string, label = LIVE_BASE_FILE): LiveRead {
  if (text.length > MAX_LIVE_BASE_CHARS) return { ok: false, error: `${label} is larger than 1 MB.` };
  const imported = importBaseFile(text);
  if ("error" in imported) return { ok: false, error: imported.error.replace(/^This \.base file/, label).replace(/ to import\.$/, ".") };
  const root = asRecord(parse(text)) ?? {};
  const nexus = asRecord(root.nexus);
  const entries = nexus && Array.isArray(nexus.views) ? nexus.views.map(asRecord) : [];
  const rawViews = Array.isArray(root.views) ? root.views : [];
  let outside = false;
  const views = imported.session.views.map((view, index): BasesViewConfig => {
    const entry = entries[index];
    const raw = rawViews[index];
    if (entry && typeof entry.sync === "string" && entry.sync === viewSync(root, index)) {
      const kept: Partial<BasesViewConfig> = {};
      for (const field of VIEW_FIELDS) if (field in entry) (kept as Record<string, unknown>)[field] = entry[field];
      return { ...view, ...kept };
    }
    if (raw !== undefined) outside = true;
    if (!entry || entry.name !== view.name) return view;
    const next = { ...view };
    if (typeof entry.query === "string") next.query = entry.query;
    if (Array.isArray(entry.relations)) next.relations = entry.relations.filter((key): key is string => typeof key === "string");
    const summaries = asRecord(entry.summaries);
    for (const [column, kind] of Object.entries(summaries ?? {})) {
      if (kind === "count" && !(column in next.summaries)) next.summaries = { ...next.summaries, [column]: "count" };
    }
    return next;
  });
  const session = normalizeBasesSession({
    activeId: nexus?.activeView === "saved" ? "saved" : "all",
    views: [
      { ...(views[0] as BasesViewConfig), id: "all" },
      { ...(views[1] as BasesViewConfig), id: "saved" },
    ],
    summaryFormulas: imported.session.summaryFormulas,
  });
  return {
    ok: true,
    session,
    notes: outside ? imported.notes.map(liveNote) : [],
    outside,
    oldExport: OLD_EXPORT.test(text),
  };
}

function stripOldExportHeader(text: string): string {
  if (!OLD_EXPORT.test(text)) return text;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let at = 0;
  while (at < lines.length && /^\s*#/.test(lines[at] ?? "")) at += 1;
  return lines.slice(at).join("\n");
}

function refsIn(value: unknown): Set<string> {
  return new Set(formulaRefs(JSON.stringify(value ?? null)));
}

function filterList(node: unknown): { atoms: unknown[]; other: unknown | null } {
  if (node == null) return { atoms: [], other: null };
  if (typeof node === "string") return { atoms: [node], other: null };
  const rec = asRecord(node);
  if (rec && Object.keys(rec).length === 1 && Array.isArray(rec.and)) return { atoms: [...rec.and], other: null };
  return { atoms: [], other: node };
}

const isFolderAtom = (atom: unknown): boolean => typeof atom === "string" && folderOf(atom.trim()) !== null;

/** A view's filters with its folder atoms swapped for `folder`; other conditions stay. */
function withFolder(node: unknown, folder: string | null): unknown {
  const { atoms, other } = filterList(node);
  const kept = atoms.filter((atom) => !isFolderAtom(atom));
  const want = folder ? [folderFilter(folder)] : [];
  if (other !== null) return want.length ? { and: [...want, other] } : other;
  const all = [...want, ...kept];
  return all.length ? { and: all } : undefined;
}

function topFolder(node: unknown): string | null {
  const { atoms } = filterList(node);
  for (const atom of atoms) {
    const found = typeof atom === "string" ? folderOf(atom.trim()) : null;
    if (found !== null) return normalFolder(found);
  }
  return null;
}

/** Order entries Nexus does not read, kept when it rewrites a view's columns. */
function foreignOrder(order: unknown, owned: string[]): string[] {
  if (!Array.isArray(order)) return [];
  return order.filter((entry): entry is string => {
    if (typeof entry !== "string") return false;
    if (entry.startsWith("formula.")) return !owned.includes(entry.slice(8));
    if (!entry.startsWith("file.")) return false;
    return !(entry in FILE_FORMULAS) && !Object.values(FILE_SORT).includes(entry);
  });
}

/**
 * Summary entries Nexus does not read: names that are neither built in nor one of
 * `customNames` (the file's summary formulas), and ones under unreadable columns.
 */
function foreignSummaries(node: unknown, customNames: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [prop, value] of Object.entries(asRecord(node) ?? {})) {
    const read = typeof value === "string" && (customNames.has(value.trim()) || summaryFromBase(value) !== null);
    const unreadable = prop.startsWith("file.") && !(prop in FILE_FORMULAS) && !Object.values(FILE_SORT).includes(prop);
    if (!read || unreadable) out[prop] = value;
  }
  return out;
}

function setOrDelete(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === undefined || (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)) {
    delete target[key];
  } else target[key] = value;
}

/**
 * The file text for `next`, merged into `base` (the file as Nexus last read it).
 * Views that did not change keep their nodes and comments byte for byte; a file
 * that did not change at all comes back unchanged.
 */
export function writeLiveBase(base: LiveBase | null, next: BasesSession, detectedKeys: string[]): string {
  const session = normalizeBasesSession(next);
  const oldExport = base ? OLD_EXPORT.test(base.text) : false;
  const loaded = base ? normalizeBasesSession(base.session) : null;
  const imported = base ? importBaseFile(base.text) : null;
  const source = imported && !("error" in imported) ? imported : null;
  const fresh = !base || !source;
  const changed = session.views.map((view, i) => fresh || !sameBasesView(loaded?.views[i] as BasesViewConfig, view));
  const summariesChanged = fresh || canonical(loaded?.summaryFormulas) !== canonical(session.summaryFormulas);
  if (base && !fresh && !oldExport && !changed.some(Boolean) && !summariesChanged && loaded?.activeId === session.activeId) {
    return base.text;
  }
  const summaryNames = new Set(session.summaryFormulas.map((f) => f.name));
  const readNames = new Set([...summaryNames, ...(source?.session.summaryFormulas ?? []).map((f) => f.name)]);

  const doc: Document = fresh ? new Document({}) : parseDocument(stripOldExportHeader(base.text));
  const root = asRecord(doc.toJS()) ?? {};
  const rawViews: unknown[] = Array.isArray(root.views) ? [...root.views] : [];
  const sourceFormulas = new Map<string, string>(
    Object.entries(asRecord(root.formulas) ?? {}).map(([key, value]) => [key, typeof value === "string" ? value : String(value)]),
  );
  const properties: Record<string, unknown> = { ...(asRecord(root.properties) ?? {}) };

  const owned = new Set<string>();
  session.views.forEach((_, i) => {
    if (changed[i]) for (const key of source?.sourceKeys[i] ?? []) owned.add(key);
  });
  const keptRefs = new Set<string>();
  rawViews.forEach((raw, i) => {
    if (i >= 2 || !changed[i]) for (const key of refsIn(raw)) keptRefs.add(key);
  });
  session.views.forEach((_, i) => {
    if (!changed[i]) return;
    for (const entry of foreignOrder(asRecord(rawViews[i])?.order, source?.sourceKeys[i] ?? [])) {
      if (entry.startsWith("formula.")) keptRefs.add(entry.slice(8));
    }
    for (const key of refsIn(foreignSummaries(asRecord(rawViews[i])?.summaries, readNames))) keptRefs.add(key);
  });
  for (const key of refsIn(root.summaries)) keptRefs.add(key);
  for (const key of refsIn(root.filters)) keptRefs.add(key);
  const keep = new Set([...sourceFormulas.keys()].filter((key) => !owned.has(key) || keptRefs.has(key)));
  for (let grew = true; grew; ) {
    grew = false;
    for (const key of [...keep]) {
      for (const ref of formulaRefs(sourceFormulas.get(key) ?? "")) {
        if (sourceFormulas.has(ref) && !keep.has(ref)) {
          keep.add(ref);
          grew = true;
        }
      }
    }
  }
  const formulas = new Map([...sourceFormulas].filter(([key]) => keep.has(key)));
  for (const key of sourceFormulas.keys()) if (!keep.has(key)) delete properties[`formula.${key}`];

  const displayName = (key: string): string => {
    const named = asRecord(properties[`formula.${key}`])?.displayName;
    return typeof named === "string" && named.trim() ? named.trim() : key;
  };
  const keyOf = new Map<string, string>();
  session.views.forEach((view, i) => {
    if (!changed[i]) return;
    const local = new Map<string, string>();
    for (const f of view.formulas) {
      if (!f.expr.trim()) continue;
      const expr = rewriteFormulaRefs(f.expr, (ref) => local.get(ref.toLowerCase()) ?? null);
      let key = f.id;
      if (formulas.has(key) && !(formulas.get(key) === expr && displayName(key) === f.name)) {
        key = formulaKey(f.id, formulas.keys());
      }
      formulas.set(key, expr);
      properties[`formula.${key}`] = { ...(asRecord(properties[`formula.${key}`]) ?? {}), displayName: f.name };
      local.set(f.id.toLowerCase(), key);
      if (!local.has(f.name.toLowerCase())) local.set(f.name.toLowerCase(), key);
      keyOf.set(`${i}:${f.id}`, key);
    }
  });

  // A folder set on the whole file moves into each view once a view's folder differs from it.
  const shared = fresh ? null : topFolder(root.filters);
  let topFilters = root.filters;
  const pushDown = shared !== null && session.views.some((view, i) => changed[i] && normalFolder(view.folder) !== shared);
  if (pushDown) {
    topFilters = withFolder(root.filters, null);
    rawViews.forEach((raw, i) => {
      if (i < 2 && changed[i]) return;
      const rec = asRecord(raw);
      if (rec) rawViews[i] = { ...rec, filters: withFolder(rec.filters, shared) };
    });
  }

  const nodes: unknown[] = [...rawViews];
  session.views.forEach((view, i) => {
    if (!changed[i]) return;
    const prior = loaded?.views[i] ?? null;
    const old = fresh ? null : asRecord(rawViews[i]);
    const node = baseViewNode(view, detectedKeys, (f) => keyOf.get(`${i}:${f.id}`), [], summaryNames);
    if (!old) {
      nodes[i] = node;
      return;
    }
    const out: Record<string, unknown> = { ...old };
    const sameFormulas = !!prior && canonical(prior.formulas) === canonical(view.formulas);
    const oldType = typeof old.type === "string" ? old.type : "table";
    if (!(prior && prior.layout === view.layout && oldType !== "table" && oldType !== "cards")) out.type = node.type;
    out.name = node.name;
    const ownFolder = normalFolder(view.folder);
    const viewFolder = !pushDown && shared !== null && ownFolder === shared ? null : ownFolder || null;
    if (!prior || normalFolder(prior.folder) !== ownFolder || pushDown) setOrDelete(out, "filters", withFolder(old.filters, viewFolder));
    out.order = [...(node.order as string[]), ...foreignOrder(old.order, source?.sourceKeys[i] ?? [])];
    if (!prior || !sameFormulas || prior.column !== view.column || prior.dir !== view.dir || !Array.isArray(old.sort)) {
      const first = (node.sort as Record<string, unknown>[])[0] as Record<string, unknown>;
      const rest = (Array.isArray(old.sort) ? old.sort.slice(1) : []).filter(
        (item) => asRecord(item)?.property !== first.property,
      );
      out.sort = [first, ...rest];
    }
    if (!prior || !sameFormulas || canonical(prior.groupBy) !== canonical(view.groupBy)) setOrDelete(out, "groupBy", node.groupBy);
    if (!prior || !sameFormulas || canonical(prior.summaries) !== canonical(view.summaries)) {
      setOrDelete(out, "summaries", {
        ...foreignSummaries(old.summaries, readNames),
        ...((node.summaries as Record<string, unknown>) ?? {}),
      });
    }
    nodes[i] = out;
  });

  rawViews.forEach((raw, i) => {
    if (nodes[i] !== raw || raw !== (Array.isArray(root.views) ? root.views[i] : undefined)) {
      doc.setIn(["views", i], doc.createNode(nodes[i]));
    }
  });
  for (let i = rawViews.length; i < nodes.length; i += 1) doc.setIn(["views", i], doc.createNode(nodes[i]));

  for (const key of sourceFormulas.keys()) if (!formulas.has(key)) doc.deleteIn(["formulas", key]);
  for (const [key, expr] of formulas) if (sourceFormulas.get(key) !== expr) doc.setIn(["formulas", key], expr);
  if (!formulas.size) doc.delete("formulas");
  const oldProps = asRecord(root.properties) ?? {};
  for (const key of Object.keys(oldProps)) if (!(key in properties)) doc.deleteIn(["properties", key]);
  for (const [key, value] of Object.entries(properties)) {
    if (canonical(oldProps[key]) !== canonical(value)) doc.setIn(["properties", key], doc.createNode(value));
  }
  if (!Object.keys(properties).length) doc.delete("properties");
  if (summariesChanged) {
    // Entries Nexus did not import (not text, past the cap) stay; only names it knew can be removed.
    const rawKey = new Map<string, string>();
    for (const key of Object.keys(asRecord(root.summaries) ?? {})) if (!rawKey.has(key.trim())) rawKey.set(key.trim(), key);
    const oldExpr = asRecord(root.summaries) ?? {};
    if (root.summaries != null && !asRecord(root.summaries) && session.summaryFormulas.length) {
      doc.set("summaries", doc.createNode({}));
    }
    const before = loaded?.summaryFormulas ?? [];
    const beforeNames = new Set(before.map((f) => f.name));
    // A name swapped at the same place in the list is a rename: the entry keeps its spot and comments.
    const map = doc.get("summaries", true);
    session.summaryFormulas.forEach((f, i) => {
      const old = before[i];
      const key = old ? rawKey.get(old.name) : undefined;
      if (!old || key === undefined || beforeNames.has(f.name) || summaryNames.has(old.name) || rawKey.has(f.name)) return;
      const pair = isMap(map) ? map.items.find((item) => isScalar(item.key) && item.key.value === key) : undefined;
      if (!pair || !isScalar(pair.key)) return;
      pair.key.value = f.name;
      oldExpr[f.name] = oldExpr[key];
      rawKey.delete(old.name);
      rawKey.set(f.name, f.name);
    });
    for (const f of before) {
      const key = rawKey.get(f.name);
      if (key !== undefined && !summaryNames.has(f.name)) doc.deleteIn(["summaries", key]);
    }
    for (const f of session.summaryFormulas) {
      const key = rawKey.get(f.name) ?? f.name;
      const was = oldExpr[key];
      if (!((typeof was === "string" || typeof was === "number") && String(was) === f.expr)) doc.setIn(["summaries", key], f.expr);
    }
    if (!Object.keys(asRecord(asRecord(doc.toJS())?.summaries) ?? {}).length) doc.delete("summaries");
  }
  if (pushDown) {
    if (topFilters === undefined) doc.delete("filters");
    else doc.set("filters", doc.createNode(topFilters));
  }

  doc.delete("nexus");
  const body = doc.toString({ lineWidth: 0, flowCollectionPadding: false });
  const plain = fresh || oldExport ? `${LIVE_HEADER}\n\n${body}` : body;
  const readBack = importBaseFile(plain);
  const written = asRecord(parse(plain)) ?? {};
  const entries = session.views.map((view, i) => {
    const entry: Record<string, unknown> = { name: view.name, sync: viewSync(written, i) };
    const back = "error" in readBack ? null : (readBack.session.views[i] as BasesViewConfig);
    for (const field of VIEW_FIELDS) {
      if (field === "name") continue;
      if (!back || canonical(back[field]) !== canonical(view[field])) entry[field] = view[field];
    }
    return entry;
  });
  const block: Record<string, unknown> = { version: 1 };
  if (session.activeId === "saved") block.activeView = "saved";
  block.views = entries;
  const tail = stringify({ nexus: block }, { lineWidth: 0 });
  return `${plain.replace(/\s*$/, "\n")}${tail}`;
}
