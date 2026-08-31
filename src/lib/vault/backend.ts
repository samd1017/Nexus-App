/**
 * Wave 1d / A–C — VaultBackend façade over FSA + Tauri + mobile sandbox.
 * Public store API stays stable; disk ops route here progressively.
 * Markdown on disk remains canonical; backends never invent a cloud DB.
 */

import type { VaultNode } from "./types";
import type { VaultScan } from "./fs-adapter";
import * as fsa from "./fs-adapter";
import * as desk from "./tauri-adapter";
import { getBodyFromArchive, hasBodyArchive, setBodyInArchive } from "./body-archive";

export type BackendKind = "fsa" | "desktop" | "memory" | "sandbox";

export interface NodeMeta {
  path: string;
  name: string;
  kind: "folder" | "note";
  mtime: number;
  size?: number;
}

export interface VaultBackend {
  kind: BackendKind;
  scan(): Promise<VaultScan>;
  /** Meta-only listing when supported (no body reads) */
  walkMeta?(): Promise<NodeMeta[]>;
  /** Meta-only full VaultScan shape */
  scanMeta?(): Promise<VaultScan>;
  readNote?(path: string): Promise<string>;
  writeNote(path: string, content: string): Promise<void>;
  mkdir?(path: string): Promise<void>;
  deletePath?(path: string, kind: "folder" | "note"): Promise<void>;
  renamePath?(
    from: string,
    to: string,
    kind: "folder" | "note",
    content?: string,
  ): Promise<void>;
}

export class FsaBackend implements VaultBackend {
  kind = "fsa" as const;
  constructor(private root: FileSystemDirectoryHandle) {}

  scan(): Promise<VaultScan> {
    return fsa.scanVault(this.root);
  }

  async walkMeta(): Promise<NodeMeta[]> {
    const scan = await fsa.scanVaultMeta(this.root);
    return Object.values(scan.nodes).map((n) => ({
      path: n.path,
      name: n.name,
      kind: n.kind,
      mtime: n.mtime,
    }));
  }

  scanMeta(): Promise<VaultScan> {
    return fsa.scanVaultMeta(this.root);
  }

  async readNote(path: string): Promise<string> {
    return fsa.readNoteFile(this.root, path);
  }

  writeNote(path: string, content: string): Promise<void> {
    return fsa.writeNoteFile(this.root, path, content);
  }

  mkdir(path: string): Promise<void> {
    return fsa.createFolderOnDisk(this.root, path);
  }

  deletePath(path: string, kind: "folder" | "note"): Promise<void> {
    return fsa.deletePathOnDisk(this.root, path, kind);
  }

  renamePath(
    from: string,
    to: string,
    kind: "folder" | "note",
    content?: string,
  ): Promise<void> {
    return fsa.renamePathOnDisk(this.root, from, to, kind, content);
  }
}

export class DesktopBackend implements VaultBackend {
  kind = "desktop" as const;
  constructor(private root: string) {}

  scan(): Promise<VaultScan> {
    return desk.scanDesktopVault(this.root);
  }

  async walkMeta(): Promise<NodeMeta[]> {
    return desk.scanDesktopMeta(this.root);
  }

  scanMeta(): Promise<VaultScan> {
    return desk.scanDesktopVaultMeta(this.root);
  }

  async readNote(path: string): Promise<string> {
    return desk.readDesktopNote(this.root, path);
  }

  writeNote(path: string, content: string): Promise<void> {
    return desk.writeDesktopNote(this.root, path, content);
  }

  mkdir(path: string): Promise<void> {
    return desk.createDesktopFolder(this.root, path);
  }

  deletePath(path: string, kind: "folder" | "note"): Promise<void> {
    return desk.deleteDesktopPath(this.root, path, kind);
  }

  renamePath(
    from: string,
    to: string,
    kind: "folder" | "note",
    content?: string,
  ): Promise<void> {
    return desk.renameDesktopPath(this.root, from, to, kind, content);
  }
}

/** Memory backend for demo/local — scan from provided nodes. */
export class MemoryBackend implements VaultBackend {
  kind = "memory" as const;
  constructor(private getScan: () => VaultScan) {}

  async scan(): Promise<VaultScan> {
    return this.getScan();
  }

  /**
   * Demo: bodies live on the in-memory nodes.
   * Large-test local: meta-only store + module body archive — read archive first.
   */
  async readNote(path: string): Promise<string> {
    if (hasBodyArchive()) {
      const archived = getBodyFromArchive(path);
      if (archived !== undefined) return archived;
    }
    const n = Object.values(this.getScan().nodes).find((x) => x.path === path);
    if (n?.kind === "note" && n.content !== undefined) return n.content;
    throw new Error(`Note not loaded: ${path}`);
  }

  async writeNote(path: string, content: string): Promise<void> {
    // Keep archive in sync when present (large-test lazy mounts)
    if (hasBodyArchive()) setBodyInArchive(path, content);
    /* primary write path is still the zustand store */
  }
}

/**
 * Wave 3 — Mobile sandbox backend (app-data vaults).
 * Host (Tauri Mobile) injects scan/read/write/mkdir/delete/rename.
 * Does not claim 300k on phone — capture + browse; same DurableIndex schema.
 */
export type SandboxReader = {
  scan: () => Promise<VaultScan>;
  scanMeta?: () => Promise<VaultScan>;
  readNote?: (path: string) => Promise<string>;
  writeNote?: (path: string, content: string) => Promise<void>;
  mkdir?: (path: string) => Promise<void>;
  deletePath?: (path: string, kind: "folder" | "note") => Promise<void>;
  renamePath?: (
    from: string,
    to: string,
    kind: "folder" | "note",
    content?: string,
  ) => Promise<void>;
};

export class SandboxBackend implements VaultBackend {
  kind = "sandbox" as const;
  private nodes: Record<string, VaultNode> = {};
  private rootIds: string[] = [];
  private signatures: Record<string, string> = {};

  constructor(private reader: SandboxReader) {}

  async scan(): Promise<VaultScan> {
    const s = await this.reader.scan();
    this.nodes = s.nodes;
    this.rootIds = s.rootIds;
    this.signatures = s.signatures ?? {};
    return s;
  }

  async scanMeta(): Promise<VaultScan> {
    if (this.reader.scanMeta) {
      const s = await this.reader.scanMeta();
      this.nodes = s.nodes;
      this.rootIds = s.rootIds;
      this.signatures = s.signatures ?? {};
      return s;
    }
    // Strip bodies if host only provides full scan
    const s = await this.scan();
    const nodes: Record<string, VaultNode> = {};
    for (const [id, n] of Object.entries(s.nodes)) {
      if (n.kind === "folder") {
        nodes[id] = n;
        continue;
      }
      nodes[id] = {
        id: n.id,
        path: n.path,
        name: n.name,
        kind: "note",
        parentId: n.parentId,
        mtime: n.mtime,
      };
    }
    return { nodes, rootIds: s.rootIds, signatures: s.signatures };
  }

  async walkMeta(): Promise<NodeMeta[]> {
    const s = await this.scanMeta();
    return Object.values(s.nodes).map((n) => ({
      path: n.path,
      name: n.name,
      kind: n.kind,
      mtime: n.mtime,
    }));
  }

  async readNote(path: string): Promise<string> {
    if (this.reader.readNote) return this.reader.readNote(path);
    const n = Object.values(this.nodes).find((x) => x.path === path);
    if (!n || n.kind !== "note" || n.content === undefined) {
      throw new Error(`Note not loaded: ${path}`);
    }
    return n.content;
  }

  async writeNote(path: string, content: string): Promise<void> {
    if (this.reader.writeNote) {
      await this.reader.writeNote(path, content);
    }
    const existing = Object.values(this.nodes).find((n) => n.path === path);
    const id = existing?.id ?? `sandbox_${path}`;
    this.nodes[id] = {
      id,
      path,
      name: path.split("/").pop() || path,
      kind: "note",
      parentId: existing?.parentId ?? null,
      mtime: Date.now(),
      content,
    };
  }

  async mkdir(path: string): Promise<void> {
    if (this.reader.mkdir) {
      await this.reader.mkdir(path);
      return;
    }
    const id = `sandbox_dir_${path}`;
    this.nodes[id] = {
      id,
      path,
      name: path.split("/").pop() || path,
      kind: "folder",
      parentId: null,
      mtime: Date.now(),
    };
  }

  async deletePath(path: string, kind: "folder" | "note"): Promise<void> {
    if (this.reader.deletePath) {
      await this.reader.deletePath(path, kind);
    }
    for (const [id, n] of Object.entries(this.nodes)) {
      if (n.path === path || n.path.startsWith(path + "/")) {
        delete this.nodes[id];
      }
    }
  }

  async renamePath(
    from: string,
    to: string,
    kind: "folder" | "note",
    content?: string,
  ): Promise<void> {
    if (this.reader.renamePath) {
      await this.reader.renamePath(from, to, kind, content);
    }
    for (const n of Object.values(this.nodes)) {
      if (n.path === from) {
        n.path = to;
        n.name = to.split("/").pop() || to;
        if (kind === "note" && content !== undefined) n.content = content;
      } else if (n.path.startsWith(from + "/")) {
        n.path = to + n.path.slice(from.length);
      }
    }
  }
}

let activeBackend: VaultBackend | null = null;

export function setActiveBackend(b: VaultBackend | null): void {
  activeBackend = b;
}

export function getActiveBackend(): VaultBackend | null {
  return activeBackend;
}

export function backendFromMode(
  mode: string,
  fsaRoot: FileSystemDirectoryHandle | null,
  desktopRoot: string | null,
  memoryScan?: () => VaultScan,
  sandboxReader?: SandboxReader,
): VaultBackend | null {
  if (mode === "desktop" && desktopRoot) return new DesktopBackend(desktopRoot);
  if (mode === "fsa" && fsaRoot) return new FsaBackend(fsaRoot);
  // Wave C: mobile sandbox host injects reader (Tauri Mobile app-data later)
  if (mode === "sandbox" && sandboxReader) return new SandboxBackend(sandboxReader);
  if ((mode === "demo" || mode === "local") && memoryScan) {
    return new MemoryBackend(memoryScan);
  }
  return null;
}

/** Strip bodies for lazy open — keep metadata only. */
export function stripBodies(
  nodes: Record<string, VaultNode>,
  keepIds?: Set<string>,
): Record<string, VaultNode> {
  const out: Record<string, VaultNode> = {};
  for (const [id, n] of Object.entries(nodes)) {
    if (n.kind === "folder") {
      out[id] = n;
      continue;
    }
    if (keepIds?.has(id)) {
      out[id] = n;
      continue;
    }
    out[id] = {
      id: n.id,
      path: n.path,
      name: n.name,
      kind: n.kind,
      parentId: n.parentId,
      mtime: n.mtime,
    };
  }
  return out;
}

/** Note body for disk rename — undefined when unloaded so adapters re-read. */
export function contentForDiskWrite(
  node: VaultNode | undefined,
): string | undefined {
  if (!node || node.kind !== "note") return undefined;
  if (node.content === undefined) return undefined;
  return node.content;
}
