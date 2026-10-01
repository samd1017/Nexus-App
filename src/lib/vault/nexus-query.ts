/**
 * Built-in note list for one fenced block.
 * LIST or TABLE, filtered by a folder path and/or a tag.
 * Not Dataview: no DQL, no FROM, no joins, no formulas.
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
  "Built-in list. Not Dataview — no DQL, FROM, joins, or formulas.";

export const NEXUS_QUERY_HELP =
  "LIST or TABLE, then path: and/or tag:. Example: LIST path:Research tag:graph";

export const NEXUS_QUERY_DQL =
  "This block is not Dataview. Use LIST or TABLE with path: and tag: only. No DQL, FROM, joins, or formulas.";

export type NexusQueryRow = {
  id: string;
  title: string;
  path: string;
  /** Set only when the TABLE asked for the indexed tags column. */
  tags: string | null;
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

type Parsed =
  | { kind: "help" }
  | { kind: "error"; error: string }
  | {
      kind: "ok";
      mode: "list" | "table";
      path: string | null;
      tag: string | null;
      field: string | null;
    };

function tokenize(source: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push((m[1] ?? m[2] ?? "").trim());
  return out.filter(Boolean);
}

function looksLikeDql(tokens: string[]): boolean {
  for (const token of tokens) {
    if (/^(FROM|WHERE|SORT|LIMIT|FLATTEN|GROUP)$/i.test(token)) return true;
    if (/^(file|this)\./i.test(token)) return true;
    if (token.includes("=")) return true;
    if (/^GROUP$/i.test(token)) return true;
  }
  return false;
}

export function parseNexusQuery(source: string): Parsed {
  const raw = (source || "").trim();
  if (!raw) return { kind: "help" };
  const tokens = tokenize(raw);
  if (looksLikeDql(tokens)) return { kind: "error", error: NEXUS_QUERY_DQL };
  const head = tokens[0]?.toUpperCase();
  if (head !== "LIST" && head !== "TABLE") {
    return {
      kind: "error",
      error: `Start with LIST or TABLE. ${NEXUS_QUERY_HELP}`,
    };
  }
  let path: string | null = null;
  let tag: string | null = null;
  let field: string | null = null;
  for (const token of tokens.slice(1)) {
    const hash = /^#([a-zA-Z][\w/-]*)$/.exec(token);
    if (hash) {
      if (tag) return { kind: "error", error: "Only one tag: is supported." };
      tag = hash[1].toLowerCase();
      continue;
    }
    const kv = /^([A-Za-z]+):([\s\S]+)$/.exec(token);
    if (!kv) {
      return {
        kind: "error",
        error: `Unknown “${token}”. Use path:, tag:, or field:.`,
      };
    }
    const key = kv[1].toLowerCase();
    const value = kv[2].trim();
    if (!value) return { kind: "error", error: `${key}: needs a value.` };
    if (key === "path" || key === "folder") {
      if (path) return { kind: "error", error: "Only one path: is supported." };
      path = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      continue;
    }
    if (key === "tag") {
      if (tag) return { kind: "error", error: "Only one tag: is supported." };
      tag = value.replace(/^#/, "").toLowerCase();
      continue;
    }
    if (key === "field") {
      if (head !== "TABLE") {
        return { kind: "error", error: "field: belongs on TABLE, not LIST." };
      }
      if (field) return { kind: "error", error: "Only one field: is supported." };
      field = value.toLowerCase();
      continue;
    }
    return {
      kind: "error",
      error: `Unknown “${key}:”. Use path:, tag:, or field:. ${NEXUS_QUERY_DQL}`,
    };
  }
  if (!path && !tag) {
    return {
      kind: "error",
      error: "Add path: or tag: so the list stays on one folder or tag.",
    };
  }
  return { kind: "ok", mode: head === "LIST" ? "list" : "table", path, tag, field };
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
  if (typeof node.content === "string") return extractTagsFromMarkdown(node.content);
  const meta = getDurableIndex()?.getNoteMeta(node.id);
  return (meta?.tags ?? []).map((t) => t.toLowerCase());
}

function rowFrom(node: VaultNode, withTags: boolean): NexusQueryRow {
  return {
    id: node.id,
    title: noteTitle(node),
    path: node.path,
    tags: withTags ? tagsOf(node).join(", ") : null,
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
  tag: string | null,
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
    if (tag && !tagsOf(node).includes(tag)) continue;
    notes.push(node);
  }
  return { notes, truncated: false, budgetHit };
}

export function runNexusQuery(
  source: string,
  nodes: Record<string, VaultNode>,
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
  const withTags = parsed.field === "tags";
  if (parsed.field && parsed.field !== "tags") {
    fieldNote = `“${parsed.field}” is not indexed. Showing title and path. Indexed column: tags.`;
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
    const collected = collectInFolder(nodes, folderId, parsed.path, parsed.tag);
    notes = collected.notes;
    budgetHit = collected.budgetHit;
  } else if (parsed.tag) {
    notes = notesForTag(nodes, parsed.tag);
  }

  if (parsed.path) {
    notes.sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)) || a.path.localeCompare(b.path));
  }
  const truncated = notes.length > NEXUS_QUERY_CAP;
  const rows = notes.slice(0, NEXUS_QUERY_CAP).map((n) => rowFrom(n, withTags));
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
