import type { VaultNode } from "./types";

export type LargeVaultManifest = {
  chunks: number;
  chunkSize: number;
  total: number;
  vaultName: string;
  noteCount: number;
  folderCount: number;
};

type FolderSeed = { p: string; n: string; parent: string | null };
type NoteSeed = { p: string; n: string; f: string; c: string };

function idFor(path: string): string {
  return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
}

function folder(path: string, name: string, parentId: string | null): VaultNode {
  return {
    id: idFor(path || "__root__" + name),
    path,
    name,
    kind: "folder",
    parentId,
    mtime: Date.now(),
  };
}

function note(
  path: string,
  name: string,
  parentId: string | null,
  content: string,
  mtime: number,
): VaultNode {
  return {
    id: idFor(path),
    path,
    name,
    kind: "note",
    parentId,
    mtime,
    content,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

/**
 * Load the attached 45k-note large-test-vault seed (public/large-test-vault)
 * into in-memory VaultNodes for real app testing (same shape as demo vault).
 */
export async function buildLargeTestVault(opts?: {
  onProgress?: (loaded: number, total: number, phase: string) => void;
}): Promise<{
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  vaultName: string;
  noteCount: number;
}> {
  const onProgress = opts?.onProgress;
  onProgress?.(0, 1, "manifest");
  const manifest = await fetchJson<LargeVaultManifest>("/large-test-vault/manifest.json");
  onProgress?.(0, manifest.total, "folders");
  const folderSeeds = await fetchJson<FolderSeed[]>("/large-test-vault/folders.json");

  const nodes: Record<string, VaultNode> = {};
  const folderIdByPath = new Map<string, string>();

  // Parents first: shallow → deep
  const sortedFolders = [...folderSeeds].sort(
    (a, b) => a.p.split("/").length - b.p.split("/").length || a.p.localeCompare(b.p),
  );
  for (const f of sortedFolders) {
    const parentId = f.parent ? folderIdByPath.get(f.parent) ?? null : null;
    const node = folder(f.p, f.n, parentId);
    nodes[node.id] = node;
    folderIdByPath.set(f.p, node.id);
  }

  let loaded = 0;
  const now = Date.now();
  for (let c = 0; c < manifest.chunks; c++) {
    const chunk = await fetchJson<NoteSeed[]>(`/large-test-vault/notes-${c}.json`);
    for (const n of chunk) {
      const parentId = n.f ? folderIdByPath.get(n.f) ?? null : null;
      const node = note(n.p, n.n, parentId, n.c, now - (manifest.total - loaded));
      nodes[node.id] = node;
      loaded++;
    }
    onProgress?.(loaded, manifest.total, "notes");
    // yield to UI between chunks
    await new Promise((r) => setTimeout(r, 0));
  }

  // Root: top-level folders only (PARA roots)
  const rootIds = sortedFolders
    .filter((f) => !f.parent)
    .map((f) => folderIdByPath.get(f.p)!)
    .filter(Boolean);

  // Prefer opening README-like intro if present, else first inbox note, else first note
  const readme = Object.values(nodes).find((n) => n.kind === "note" && n.path === "README.md");
  if (readme) {
    // ensure README is a root-level note id in rootIds? demo has Welcome at root
    // keep folders as rootIds only; active note separate
  }

  return {
    nodes,
    rootIds,
    vaultName: manifest.vaultName || "Large Test Vault",
    noteCount: loaded,
  };
}

/** Stable vault id for recents / durable index scoping */
export const LARGE_TEST_VAULT_ID = "large-test-vault-45k";

