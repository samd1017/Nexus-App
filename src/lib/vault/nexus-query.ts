/**
 * Built-in note list for one fenced block.
 * LIST or TABLE, scoped with path:/tag: or FROM, tags joined by OR or AND,
 * optional SORT title|mtime. Not full Dataview.
 */

import { extractTagsFromMarkdown, notesForTag } from "@/lib/vault/tags";
import { ensureVaultIndex } from "@/lib/vault/indexes";
import { getDurableIndex } from "@/lib/vault/durable-index";
import type { VaultNode } from "@/lib/vault/types";
import { noteTitle } from "@/lib/vault/types";

export const NEXUS_QUERY_CAP = 100;
/** Stop walking a huge folder before the UI locks. */
const VISIT_BUDGET = 4000;

export const NEXUS_QUERY_FOOTER =
  "Built-in list. Not Dataview — no full DQL, no joins, no formulas.";

export const NEXUS_QUERY_HELP =
  "LIST or TABLE. FROM path:Journal or FROM #tag. Tags: #a OR #b, or #a AND #b. SORT title or SORT mtime, asc or desc. TABLE field:tags or field:mtime.";

export const NEXUS_QUERY_DQL =
  "This block is not Dataview. No full DQL: no file. joins, no date(), no formulas. Use LIST or TABLE, FROM path: or FROM #tag, OR/AND tags, and SORT title or SORT mtime.";

export type NexusQueryRow = {
  id: string;
  title: string;
  path: string;
  /** Set only when the TABLE asked for the indexed tags column. */
  tags: string | null;
  /** Set only when the TABLE asked for mtime, which lives on each note. */
  mtime: string | null;
};

export type NexusQueryModel = {
  footer: string;
  help: string | null;
  error: string | null;
  mode: "list" | "table" | null;
  rows: NexusQueryRow[];
  truncated: boolean;
  /** Shown when the walk stopped before the folder ended. */
  scanNote: string | null;
  /** Shown when a requested column is not in the index. */
  fieldNote: string | null;
};

type TagJoin = "or" | "and";

type QuerySort = { key: "title" | "mtime"; dir: "asc" | "desc" };

type Parsed =
  | { kind: "help" }
  | { kind: "error"; error: string }
  | {
      kind: "ok";
      mode: "list" | "table";
      path: string | null;
      tags: string[];
      tagMode: TagJoin;
      field: string | null;
      sort: QuerySort | null;
    };

function tokenize(source: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push((m[1] ?? m[2] ?? "").trim());
  return out.filter(Boolean);
}

function unsupportedDql(token: string): boolean {
  if (/^(file|this)\./i.test(token)) return true;
  if (/date\s*\(/i.test(token)) return true;
  if (/contains\s*\(/i.test(token)) return true;
  if (/choice\s*\(/i.test(token)) return true;
  if (token.includes("=")) return true;
  if (/^(FLATTEN|GROUP|LIMIT)$/i.test(token)) return true;
  return false;
}

function readTag(token: string): string | null {
  const hash = /^#([a-zA-Z][\w/-]*)$/.exec(token);
  if (hash) return hash[1].toLowerCase();
  const kv = /^tag:#?([a-zA-Z][\w/-]*)$/i.exec(token);
  if (kv) return kv[1].toLowerCase();
  return null;
}

function cleanPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function readPath(token: string): string | null {
  const kv = /^(?:path|folder):([\s\S]+)$/i.exec(token);
  if (kv) {
    const value = kv[1].trim();
    return value ? cleanPath(value) : null;
  }
  if (!token || token.includes(":") || token.startsWith("#")) return null;
  if (/^(FROM|WHERE|SORT|OR|AND|ASC|DESC|LIST|TABLE)$/i.test(token)) return null;
  return cleanPath(token);
}

export function parseNexusQuery(source: string): Parsed {
  const raw = (source || "").trim();
  if (!raw) return { kind: "help" };
  const tokens = tokenize(raw);
  if (tokens.some(unsupportedDql)) return { kind: "error", error: NEXUS_QUERY_DQL };
  const head = tokens[0]?.toUpperCase();
  if (head !== "LIST" && head !== "TABLE") {
    return {
      kind: "error",
      error: `Start with LIST or TABLE. Not Dataview. ${NEXUS_QUERY_HELP}`,
    };
  }
  let path: string | null = null;
  const tags: string[] = [];
  let tagMode: TagJoin = "or";
  let sawJoin = false;
  let field: string | null = null;
  let sort: QuerySort | null = null;

  const addTag = (tag: string, joined: TagJoin | null): string | null => {
    if (tags.includes(tag)) return null;
    if (tags.length && !joined) return "Put OR or AND between tags.";
    if (joined) {
      if (sawJoin && tagMode !== joined) return "Use OR or AND, not both.";
      tagMode = joined;
      sawJoin = true;
    }
    tags.push(tag);
    return null;
  };

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const upper = token.toUpperCase();
    if (upper === "FROM" || upper === "WHERE") {
      const scope = tokens[++i];
      if (!scope) return { kind: "error", error: `${upper} needs path: or #tag.` };
      const tag = readTag(scope);
      if (tag) {
        const err = addTag(tag, null);
        if (err) return { kind: "error", error: err };
        continue;
      }
      const nextPath = readPath(scope);
      if (nextPath) {
        if (upper === "WHERE") {
          return { kind: "error", error: "WHERE only filters tags. Use FROM path: for a folder." };
        }
        if (path) return { kind: "error", error: "Only one path: is supported." };
        path = nextPath;
        continue;
      }
      return { kind: "error", error: `${upper} needs path: or #tag, not “${scope}”.` };
    }
    if (upper === "OR" || upper === "AND") {
      const scope = tokens[++i];
      const tag = scope ? readTag(scope) : null;
      if (!tag) return { kind: "error", error: `${upper} needs a tag, such as #idea.` };
      const err = addTag(tag, upper === "OR" ? "or" : "and");
      if (err) return { kind: "error", error: err };
      continue;
    }
    if (upper === "SORT") {
      const key = (tokens[++i] || "").toLowerCase();
      if (key !== "title" && key !== "mtime") {
        return { kind: "error", error: "SORT title or SORT mtime. asc or desc follows." };
      }
      let dir: "asc" | "desc" = "asc";
      const maybe = tokens[i + 1];
      if (maybe && /^(asc|desc)$/i.test(maybe)) {
        dir = maybe.toLowerCase() === "desc" ? "desc" : "asc";
        i += 1;
      }
      if (sort) return { kind: "error", error: "Only one SORT is supported." };
      sort = { key, dir };
      continue;
    }
    const tag = readTag(token);
    if (tag) {
      const err = addTag(tag, null);
      if (err) return { kind: "error", error: err };
      continue;
    }
    const nextPath = readPath(token);
    if (nextPath && /^(?:path|folder):/i.test(token)) {
      if (path) return { kind: "error", error: "Only one path: is supported." };
      path = nextPath;
      continue;
    }
    const fieldMatch = /^field:([\s\S]+)$/i.exec(token);
    if (fieldMatch) {
      if (head !== "TABLE") return { kind: "error", error: "field: belongs on TABLE, not LIST." };
      if (field) return { kind: "error", error: "Only one field: is supported." };
      const value = fieldMatch[1].trim().toLowerCase();
      if (!value) return { kind: "error", error: "field: needs a value." };
      field = value;
      continue;
    }
    return {
      kind: "error",
      error: `Unknown “${token}”. ${NEXUS_QUERY_HELP}`,
    };
  }
  if (!path && tags.length === 0) {
    return {
      kind: "error",
      error: "Add FROM path: or FROM #tag so the list stays on one folder or tag.",
    };
  }
  return {
    kind: "ok",
    mode: head === "LIST" ? "list" : "table",
    path,
    tags,
    tagMode,
    field,
    sort,
  };
}

function pathHasPrefix(path: string, prefix: string): boolean {
  const p = path.replace(/\\/g, "/").toLowerCase();
  const pre = prefix.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
  if (!pre) return false;
  if (p === pre) return true;
  if (p.startsWith(pre + "/")) return true;
  const next = p.charAt(pre.length);
  return p.startsWith(pre) && (next === " " || next === ".");
}

function tagsOf(node: VaultNode): string[] {
  if (node.kind !== "note") return [];
  const tags = new Set<string>();
  if (typeof node.content === "string") {
    for (const tag of extractTagsFromMarkdown(node.content)) tags.add(tag);
  }
  const meta = getDurableIndex()?.getNoteMeta(node.id);
  for (const tag of meta?.tags ?? []) tags.add(tag.toLowerCase());
  return [...tags];
}

/** notesForTag plus tags stored on the durable index (sqlite tag_map mirror). */
function notesForTagJoined(nodes: Record<string, VaultNode>, tag: string): VaultNode[] {
  const out = notesForTag(nodes, tag);
  const idx = getDurableIndex();
  if (!idx?.ready) return out;
  const needle = tag.replace(/^#/, "").toLowerCase();
  const seen = new Set(out.map((n) => n.id));
  for (const meta of idx.listNoteMeta()) {
    if (!meta?.id || seen.has(meta.id) || meta.kind === "folder") continue;
    if (!meta.tags?.some((t) => t.toLowerCase() === needle)) continue;
    const node = nodes[meta.id];
    if (node?.kind !== "note") continue;
    seen.add(node.id);
    out.push(node);
  }
  return out;
}

export function joinTaggedNotes(lists: VaultNode[][], mode: TagJoin): VaultNode[] {
  if (!lists.length) return [];
  if (mode === "and") {
    const sets = lists.map((list) => new Set(list.map((n) => n.id)));
    let smallest = lists[0] ?? [];
    for (const list of lists) if (list.length < smallest.length) smallest = list;
    return smallest.filter((n) => sets.every((set) => set.has(n.id)));
  }
  const seen = new Set<string>();
  const out: VaultNode[] = [];
  for (const list of lists) {
    for (const note of list) {
      if (!note || seen.has(note.id)) continue;
      seen.add(note.id);
      out.push(note);
    }
  }
  return out;
}

function formatMtime(mtime: number): string {
  if (!mtime) return "—";
  const d = new Date(mtime);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function hasTags(node: VaultNode, tags: string[], mode: TagJoin): boolean {
  if (!tags.length) return true;
  const have = tagsOf(node);
  if (mode === "and") return tags.every((tag) => have.includes(tag));
  return tags.some((tag) => have.includes(tag));
}

function rowFrom(node: VaultNode, field: "tags" | "mtime" | null): NexusQueryRow {
  return {
    id: node.id,
    title: noteTitle(node),
    path: node.path,
    tags: field === "tags" ? tagsOf(node).join(", ") : null,
    mtime: field === "mtime" ? formatMtime(node.mtime) : null,
  };
}

/**
 * Folder that contains this prefix, walking the child index (not every note).
 * `folderId` null means the prefix names nothing in the tree.
 */
function resolveFolder(
  nodes: Record<string, VaultNode>,
  prefix: string,
): string | null {
  const idx = ensureVaultIndex(nodes);
  idx.getIdByPath(nodes, prefix);
  const parts = prefix.split("/").filter(Boolean);
  let parentId: string | null = null;
  let matched = false;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].toLowerCase();
    const kids = idx.getChildIds(parentId);
    let folder: VaultNode | null = null;
    for (const id of kids) {
      const n = nodes[id];
      if (n?.kind === "folder" && n.name.toLowerCase() === seg) {
        folder = n;
        break;
      }
    }
    if (!folder) return matched ? parentId : null;
    parentId = folder.id;
    matched = true;
  }
  return parentId;
}

function collectInFolder(
  nodes: Record<string, VaultNode>,
  folderId: string,
  prefix: string,
  tags: string[],
  tagMode: TagJoin,
): { notes: VaultNode[]; truncated: boolean; budgetHit: boolean } {
  const idx = ensureVaultIndex(nodes);
  idx.getIdByPath(nodes, prefix);
  const notes: VaultNode[] = [];
  const stack = [...idx.getChildIds(folderId)];
  let visits = 0;
  let budgetHit = false;
  while (stack.length) {
    const id = stack.pop();
    if (!id) break;
    visits += 1;
    if (visits > VISIT_BUDGET) {
      budgetHit = true;
      break;
    }
    const node = nodes[id];
    if (!node) continue;
    if (node.kind === "folder") {
      const kids = idx.getChildIds(node.id);
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      continue;
    }
    if (!pathHasPrefix(node.path, prefix)) continue;
    if (!hasTags(node, tags, tagMode)) continue;
    notes.push(node);
  }
  return { notes, truncated: false, budgetHit };
}

export function runNexusQuery(
  source: string,
  nodes: Record<string, VaultNode>,
  /** Extra notes per tag, same order as the parsed tags. From sqlite tag_map. */
  tagExtras?: VaultNode[][] | null,
): NexusQueryModel {
  const footer = NEXUS_QUERY_FOOTER;
  const parsed = parseNexusQuery(source);
  if (parsed.kind === "help") {
    return {
      footer,
      help: NEXUS_QUERY_HELP,
      error: null,
      mode: null,
      rows: [],
      truncated: false,
      scanNote: null,
      fieldNote: null,
    };
  }
  if (parsed.kind === "error") {
    return {
      footer,
      help: null,
      error: parsed.error,
      mode: null,
      rows: [],
      truncated: false,
      scanNote: null,
      fieldNote: null,
    };
  }

  let fieldNote: string | null = null;
  let column: "tags" | "mtime" | null = null;
  if (parsed.field === "tags" || parsed.field === "mtime") column = parsed.field;
  else if (parsed.field) {
    fieldNote = `“${parsed.field}” is not indexed. Showing title and path. Indexed columns: tags, mtime.`;
  }

  let notes: VaultNode[] = [];
  let budgetHit = false;
  if (parsed.path) {
    const folderId = resolveFolder(nodes, parsed.path);
    if (!folderId) {
      return {
        footer,
        help: null,
        error: `No folder matches path:${parsed.path}. Use a folder from the file list.`,
        mode: parsed.mode,
        rows: [],
        truncated: false,
        scanNote: null,
        fieldNote: null,
      };
    }
    const collected = collectInFolder(nodes, folderId, parsed.path, parsed.tags, parsed.tagMode);
    notes = collected.notes;
    budgetHit = collected.budgetHit;
  } else if (parsed.tags.length) {
    notes = joinTaggedNotes(
      parsed.tags.map((tag, i) =>
        joinTaggedNotes([notesForTagJoined(nodes, tag), tagExtras?.[i] ?? []], "or"),
      ),
      parsed.tagMode,
    );
  }

  const dir = parsed.sort?.dir === "desc" ? -1 : 1;
  const sortKey = parsed.sort?.key ?? "title";
  notes.sort((a, b) => {
    if (sortKey === "mtime") {
      const delta = (a.mtime || 0) - (b.mtime || 0);
      if (delta) return delta * dir;
    }
    return noteTitle(a).localeCompare(noteTitle(b)) * dir || a.path.localeCompare(b.path) * dir;
  });
  const truncated = notes.length > NEXUS_QUERY_CAP;
  const rows = notes.slice(0, NEXUS_QUERY_CAP).map((n) => rowFrom(n, column));
  return {
    footer,
    help: null,
    error: null,
    mode: parsed.mode,
    rows,
    truncated,
    scanNote: budgetHit
      ? `Stopped while reading this folder (${VISIT_BUDGET} files). Narrow with tag:.`
      : null,
    fieldNote,
  };
}
