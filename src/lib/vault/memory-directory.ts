/**
 * In-memory folder that speaks the File System Access calls the browser
 * shell uses. Dev opens use it to prove a page, Ready, and a save.
 * A granted Chrome folder is still the real vault.
 */

type MemFile = { kind: "file"; name: string; text: string; mtime: number };
type MemDir = { kind: "dir"; name: string; children: Map<string, MemFile | MemDir> };

type ReadStats = { getFileCalls: number };

let lastRoot: MemDir | null = null;
let lastStats: ReadStats | null = null;

function missing(name: string): Error {
  const err = new Error(name);
  err.name = "NotFoundError";
  return err;
}

class MemoryFileHandle {
  readonly kind = "file" as const;
  constructor(
    private node: MemFile,
    private stats: ReadStats,
  ) {}
  get name() {
    return this.node.name;
  }
  async getFile(): Promise<File> {
    this.stats.getFileCalls += 1;
    const text = this.node.text;
    const mtime = this.node.mtime;
    return {
      size: text.length,
      lastModified: mtime,
      slice(start = 0, end = text.length) {
        const part = text.slice(start, end);
        return { size: part.length, text: async () => part };
      },
      text: async () => text,
    } as unknown as File;
  }
  async createWritable() {
    const node = this.node;
    let buf = "";
    return {
      async write(data: string | Blob) {
        if (typeof data === "string") buf += data;
        else buf += await data.text();
      },
      async close() {
        node.text = buf;
        node.mtime = Date.now();
      },
    };
  }
}

class MemoryDirHandle {
  readonly kind = "directory" as const;
  constructor(
    private node: MemDir,
    private stats: ReadStats,
  ) {}
  get name() {
    return this.node.name;
  }
  async *entries(): AsyncGenerator<[string, MemoryDirHandle | MemoryFileHandle]> {
    for (const [name, child] of this.node.children) {
      if (child.kind === "dir") yield [name, new MemoryDirHandle(child, this.stats)];
      else yield [name, new MemoryFileHandle(child, this.stats)];
    }
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let child = this.node.children.get(name);
    if (!child && opts?.create) {
      child = { kind: "dir", name, children: new Map() };
      this.node.children.set(name, child);
    }
    if (!child || child.kind !== "dir") throw missing(name);
    return new MemoryDirHandle(child, this.stats);
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let child = this.node.children.get(name);
    if (!child && opts?.create) {
      child = { kind: "file", name, text: "", mtime: Date.now() };
      this.node.children.set(name, child);
    }
    if (!child || child.kind !== "file") throw missing(name);
    return new MemoryFileHandle(child, this.stats);
  }
  async queryPermission() {
    return "granted" as const;
  }
  async requestPermission() {
    return "granted" as const;
  }
}

/** Flat markdown folder. The shell must page it once the count passes the window. */
export function memoryVaultDirectory(noteCount: number): FileSystemDirectoryHandle {
  const stats: ReadStats = { getFileCalls: 0 };
  const root: MemDir = { kind: "dir", name: "paged-vault", children: new Map() };
  const count = Math.max(0, Math.floor(noteCount));
  for (let i = 0; i < count; i++) {
    const name = `n${String(i).padStart(5, "0")}.md`;
    root.children.set(name, {
      kind: "file",
      name,
      text: `# Note ${i}\n\nPage body ${i}.\n`,
      mtime: 1 + i,
    });
  }
  lastRoot = root;
  lastStats = stats;
  return new MemoryDirHandle(root, stats) as unknown as FileSystemDirectoryHandle;
}

export function memoryVaultFileReads(): number {
  return lastStats?.getFileCalls ?? 0;
}

export function readMemoryVaultNote(path: string): string | null {
  const root = lastRoot;
  if (!root) return null;
  const parts = path.split("/").filter(Boolean);
  let cur: MemFile | MemDir = root;
  for (const part of parts) {
    if (cur.kind !== "dir") return null;
    const next = cur.children.get(part);
    if (!next) return null;
    cur = next;
  }
  return cur.kind === "file" ? cur.text : null;
}
