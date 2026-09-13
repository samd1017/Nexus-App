/**
 * Deterministic synthetic vault for scale soak.
 * Used in-browser (openSyntheticVault) and on disk (generate-synthetic-vault.mjs).
 */

import type { VaultNode } from "./types";

export const SYNTHETIC_VAULT_PREFIX = "soak-vault-";

export function soakVaultId(noteCount: number): string {
  return `${SYNTHETIC_VAULT_PREFIX}${noteCount}`;
}

export function parseSoakNoteCount(vaultId: string | null | undefined): number | null {
  if (!vaultId?.startsWith(SYNTHETIC_VAULT_PREFIX)) return null;
  const n = Number(vaultId.slice(SYNTHETIC_VAULT_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isSyntheticSoakVault(vaultId: string | null | undefined): boolean {
  return Boolean(vaultId && vaultId.startsWith(SYNTHETIC_VAULT_PREFIX));
}

const ROOTS = [
  "00-Inbox",
  "10-Projects",
  "20-Areas",
  "30-Resources",
  "40-Archive",
  "50-Daily",
  "60-Systems",
] as const;

const TOPICS = [
  "retrieval",
  "agents",
  "graph",
  "links",
  "daily",
  "index",
  "conflict",
  "search",
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function idFor(path: string): string {
  return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
}

function folderNode(path: string, name: string, parentId: string | null): VaultNode {
  return {
    id: idFor(path || `__root__${name}`),
    path,
    name,
    kind: "folder",
    parentId,
    mtime: 1_700_000_000_000,
  };
}

export function noteTitleForIndex(i: number): string {
  if (i % 200 === 0) return `Hub ${i}`;
  return `Topic ${i}`;
}

export function notePathForIndex(i: number, foldersPerRoot = 20): string {
  const root = ROOTS[i % ROOTS.length];
  const bucket = String(Math.floor(i / ROOTS.length) % foldersPerRoot).padStart(2, "0");
  const title = noteTitleForIndex(i);
  return `${root}/${bucket}/${title}.md`;
}

export function syntheticNoteBody(i: number, noteCount: number): string {
  const title = noteTitleForIndex(i);
  const topic = TOPICS[i % TOPICS.length];
  const next = noteTitleForIndex((i + 1) % noteCount);
  const prev = noteTitleForIndex((i + noteCount - 7) % noteCount);
  const hub = noteTitleForIndex(Math.floor(i / 200) * 200);
  const tagA = `scale`;
  const tagB = `topic-${topic}`;
  const tagC = `area-${i % 8}`;
  const attach =
    i % 50 === 0 ? `\n\nBrief: [agent-brief-${i % 20}.pdf](assets/agent-brief-${i % 20}.pdf)\n` : "";
  return `# ${title}

#${tagA} #${tagB} #${tagC}

## Overview

Soak note ${i} of ${noteCount}. This note is about **${topic}** in a local-first vault.

## Notes

- Related work lives in [[${next}]] and [[${prev}]].
- Cluster hub: [[${hub}]].
- Heading jump: [[${next}#Overview]].
- Block: ^soak-${i}

## Links

See also [[${noteTitleForIndex((i + 13) % noteCount)}]] and the ${topic} index.
${attach}`;
}

export type SyntheticVaultBuild = {
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  vaultName: string;
  noteCount: number;
  folderCount: number;
};

export type BuildSyntheticOpts = {
  noteCount: number;
  seed?: number;
  foldersPerRoot?: number;
  /** Called after each chunk so the UI can paint. */
  onProgress?: (loaded: number, total: number, phase: string) => void;
  /** Yield to the event loop every N notes (browser). 0 = sync. */
  yieldEvery?: number;
};

/**
 * Build a PARA-shaped vault with realistic wikilinks, tags, headings,
 * and occasional attachment metadata. Deterministic for a given seed.
 */
export async function buildSyntheticVault(
  opts: BuildSyntheticOpts,
): Promise<SyntheticVaultBuild> {
  const noteCount = Math.max(1, Math.floor(opts.noteCount));
  const foldersPerRoot = opts.foldersPerRoot ?? 20;
  const rng = mulberry32(opts.seed ?? 0x50a7);
  void rng;
  const yieldEvery = opts.yieldEvery ?? 0;
  const onProgress = opts.onProgress;

  const nodes: Record<string, VaultNode> = {};
  const folderIdByPath = new Map<string, string>();
  const rootIds: string[] = [];

  onProgress?.(0, noteCount, "folders");
  for (const root of ROOTS) {
    const f = folderNode(root, root, null);
    nodes[f.id] = f;
    folderIdByPath.set(root, f.id);
    rootIds.push(f.id);
    for (let b = 0; b < foldersPerRoot; b++) {
      const bucket = String(b).padStart(2, "0");
      const path = `${root}/${bucket}`;
      const child = folderNode(path, bucket, f.id);
      nodes[child.id] = child;
      folderIdByPath.set(path, child.id);
    }
  }

  const now = 1_700_000_000_000;
  for (let i = 0; i < noteCount; i++) {
    const path = notePathForIndex(i, foldersPerRoot);
    const parentPath = path.slice(0, path.lastIndexOf("/"));
    const parentId = folderIdByPath.get(parentPath) ?? null;
    const name = path.slice(path.lastIndexOf("/") + 1);
    const node: VaultNode = {
      id: idFor(path),
      path,
      name,
      kind: "note",
      parentId,
      mtime: now - i,
      content: syntheticNoteBody(i, noteCount),
    };
    nodes[node.id] = node;
    if (yieldEvery > 0 && (i + 1) % yieldEvery === 0) {
      onProgress?.(i + 1, noteCount, "notes");
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(noteCount, noteCount, "notes");

  const folderCount = Object.values(nodes).filter((n) => n.kind === "folder").length;
  return {
    nodes,
    rootIds,
    vaultName: `Soak ${noteCount.toLocaleString()}`,
    noteCount,
    folderCount,
  };
}

/** Sync helper for Node benches / file writers. */
export function buildSyntheticVaultSync(opts: Omit<BuildSyntheticOpts, "yieldEvery" | "onProgress">): SyntheticVaultBuild {
  const noteCount = Math.max(1, Math.floor(opts.noteCount));
  const foldersPerRoot = opts.foldersPerRoot ?? 20;
  const nodes: Record<string, VaultNode> = {};
  const folderIdByPath = new Map<string, string>();
  const rootIds: string[] = [];
  for (const root of ROOTS) {
    const f = folderNode(root, root, null);
    nodes[f.id] = f;
    folderIdByPath.set(root, f.id);
    rootIds.push(f.id);
    for (let b = 0; b < foldersPerRoot; b++) {
      const bucket = String(b).padStart(2, "0");
      const path = `${root}/${bucket}`;
      const child = folderNode(path, bucket, f.id);
      nodes[child.id] = child;
      folderIdByPath.set(path, child.id);
    }
  }
  const now = 1_700_000_000_000;
  for (let i = 0; i < noteCount; i++) {
    const path = notePathForIndex(i, foldersPerRoot);
    const parentPath = path.slice(0, path.lastIndexOf("/"));
    const parentId = folderIdByPath.get(parentPath) ?? null;
    const name = path.slice(path.lastIndexOf("/") + 1);
    nodes[idFor(path)] = {
      id: idFor(path),
      path,
      name,
      kind: "note",
      parentId,
      mtime: now - i,
      content: syntheticNoteBody(i, noteCount),
    };
  }
  return {
    nodes,
    rootIds,
    vaultName: `Soak ${noteCount.toLocaleString()}`,
    noteCount,
    folderCount: Object.values(nodes).filter((n) => n.kind === "folder").length,
  };
}

export function writeSyntheticMarkdownFiles(
  noteCount: number,
  writeFile: (relPath: string, body: string) => void,
): { files: number; folders: number } {
  const foldersPerRoot = 20;
  let folders = 0;
  for (const root of ROOTS) {
    writeFile(`${root}/.gitkeep`, "");
    folders += 1;
    for (let b = 0; b < foldersPerRoot; b++) {
      writeFile(`${root}/${String(b).padStart(2, "0")}/.gitkeep`, "");
      folders += 1;
    }
  }
  for (let i = 0; i < noteCount; i++) {
    writeFile(notePathForIndex(i, foldersPerRoot), syntheticNoteBody(i, noteCount));
  }
  return { files: noteCount, folders };
}
