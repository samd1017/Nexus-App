/**
 * Phase 0/1 microbench — structural index vs naive O(n) scans.
 * Run: node scripts/bench-scale.mjs
 *
 * Does not boot the app; pure JS simulation of vault node maps.
 */

function makeVault(nNotes, folders = 20) {
  /** @type {Record<string, any>} */
  const nodes = {};
  const rootIds = [];
  for (let f = 0; f < folders; f++) {
    const id = `folder_${f}`;
    const path = `Folder${f}`;
    nodes[id] = {
      id,
      path,
      name: path,
      kind: "folder",
      parentId: null,
      mtime: Date.now(),
    };
    rootIds.push(id);
  }
  for (let i = 0; i < nNotes; i++) {
    const f = i % folders;
    const parentId = `folder_${f}`;
    const id = `note_${i}`;
    const name = `Note ${i}.md`;
    const path = `Folder${f}/${name}`;
    nodes[id] = {
      id,
      path,
      name,
      kind: "note",
      parentId,
      mtime: Date.now() - i,
      content: `# Note ${i}\n\nBody content for note ${i}. Links [[Note ${(i + 1) % nNotes}]]. #tag${i % 50}\n`,
    };
  }
  return { nodes, rootIds };
}

/** Naive getChildren — matches pre-Phase-1 store */
function naiveChildren(nodes, parentId) {
  return Object.values(nodes)
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** Minimal structural index (mirrors indexes.ts core) */
class MiniIndex {
  constructor() {
    this.childrenByParent = new Map();
  }
  rebuild(nodes) {
    this.childrenByParent = new Map();
    for (const n of Object.values(nodes)) {
      const pk = n.parentId ?? "__root__";
      let list = this.childrenByParent.get(pk);
      if (!list) {
        list = [];
        this.childrenByParent.set(pk, list);
      }
      list.push(n.id);
    }
    for (const [pk, ids] of this.childrenByParent) {
      ids.sort((a, b) => {
        const na = nodes[a];
        const nb = nodes[b];
        if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
        return na.name.localeCompare(nb.name);
      });
      this.childrenByParent.set(pk, ids);
    }
  }
  children(nodes, parentId) {
    const ids = this.childrenByParent.get(parentId ?? "__root__") ?? [];
    return ids.map((id) => nodes[id]).filter(Boolean);
  }
}

function time(label, fn, iters = 1) {
  const t0 = performance.now();
  let last;
  for (let i = 0; i < iters; i++) last = fn();
  const ms = performance.now() - t0;
  return { label, ms, per: ms / iters, last };
}

function run() {
  const sizes = [200, 1000, 2000, 5000, 10000];
  console.log("Nexus scale microbench (structural index vs naive)\n");
  console.log(
    "size".padStart(8),
    "rebuild_ms".padStart(12),
    "idx_100x_ms".padStart(12),
    "naive_100x_ms".padStart(14),
    "speedup".padStart(10),
  );

  for (const n of sizes) {
    const { nodes } = makeVault(n, 50);
    const idx = new MiniIndex();
    const rb = time("rebuild", () => {
      idx.rebuild(nodes);
    });
    // Touch 50 folders × 2
    const folders = Object.values(nodes)
      .filter((x) => x.kind === "folder")
      .map((x) => x.id);
    const indexed = time(
      "idx",
      () => {
        for (const f of folders) idx.children(nodes, f);
      },
      100,
    );
    const naive = time(
      "naive",
      () => {
        for (const f of folders) naiveChildren(nodes, f);
      },
      100,
    );
    const speedup = naive.ms / Math.max(indexed.ms, 0.001);
    console.log(
      String(n).padStart(8),
      rb.ms.toFixed(2).padStart(12),
      indexed.ms.toFixed(2).padStart(12),
      naive.ms.toFixed(2).padStart(14),
      (speedup.toFixed(1) + "x").padStart(10),
    );
  }

  // Correctness
  const { nodes } = makeVault(500, 10);
  const idx = new MiniIndex();
  idx.rebuild(nodes);
  for (const f of Object.values(nodes).filter((x) => x.kind === "folder")) {
    const a = idx.children(nodes, f.id).map((x) => x.id).join(",");
    const b = naiveChildren(nodes, f.id).map((x) => x.id).join(",");
    if (a !== b) {
      console.error("MISMATCH on", f.id);
      process.exit(1);
    }
  }
  console.log("\nCorrectness: OK (indexed children match naive sort)");
  console.log(
    "\nNote: Phase 1 still keeps full bodies in RAM; Phase 3 lazy bodies needed for 100k+.",
  );
}

run();
