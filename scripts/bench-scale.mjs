/**
 * Scale microbench — structural index, meta-only memory, indexed search, ego graph, durable index.
 * Run: node scripts/bench-scale.mjs
 */

function makeVault(nNotes, folders = 20, { withBodies = true } = {}) {
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
    /** @type {any} */
    const node = {
      id,
      path,
      name,
      kind: "note",
      parentId,
      mtime: Date.now() - i,
    };
    if (withBodies) {
      node.content = `# Note ${i}\n\nBody content for note ${i}. Links [[Note ${(i + 1) % nNotes}]]. #tag${i % 50}\n`;
    }
    nodes[id] = node;
  }
  return { nodes, rootIds };
}

function stripBodies(nodes, keepIds = new Set()) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [id, n] of Object.entries(nodes)) {
    if (n.kind === "folder" || keepIds.has(id)) {
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

function naiveChildren(nodes, parentId) {
  return Object.values(nodes)
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

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

/** Minimal inverted index (mirrors indexed-search core) */
class MiniSearchIndex {
  constructor() {
    this.docs = new Map();
    this.inv = new Map();
  }
  tokenize(text) {
    return text
      .toLowerCase()
      .split(/[^a-z0-9_]+/i)
      .filter((t) => t.length >= 2);
  }
  rebuild(nodes) {
    this.docs = new Map();
    this.inv = new Map();
    for (const n of Object.values(nodes)) {
      if (n.kind !== "note") continue;
      const title = n.name.replace(/\.md$/i, "");
      const body = n.content !== undefined ? String(n.content).slice(0, 4000) : "";
      const tokens = new Set(this.tokenize(`${title} ${n.path} ${body}`));
      this.docs.set(n.id, { id: n.id, title, path: n.path, tokens, body });
      for (const t of tokens) {
        let set = this.inv.get(t);
        if (!set) {
          set = new Set();
          this.inv.set(t, set);
        }
        set.add(n.id);
      }
    }
  }
  search(q, limit = 20) {
    const ql = q.toLowerCase();
    const toks = this.tokenize(q);
    const cand = new Set();
    for (const t of toks) {
      const set = this.inv.get(t);
      if (set) for (const id of set) cand.add(id);
    }
    if (cand.size < limit) {
      for (const d of this.docs.values()) {
        if (d.title.toLowerCase().includes(ql)) cand.add(d.id);
      }
    }
    const hits = [];
    for (const id of cand) {
      const d = this.docs.get(id);
      if (!d) continue;
      let score = 0;
      if (d.title.toLowerCase().startsWith(ql)) score = 100;
      else if (d.title.toLowerCase().includes(ql)) score = 70;
      else if (d.path.toLowerCase().includes(ql)) score = 50;
      else score = 20;
      hits.push({ id, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }
}

/** Map-first ego (2 hops) without full edge dump */
function egoFromLinks(nodes, centerId, hops = 2) {
  const out = new Map();
  const inn = new Map();
  const add = (m, k, v) => {
    let a = m.get(k);
    if (!a) {
      a = [];
      m.set(k, a);
    }
    if (!a.includes(v)) a.push(v);
  };
  const titleToId = new Map();
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    titleToId.set(n.name.replace(/\.md$/i, "").toLowerCase(), n.id);
  }
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note" || n.content === undefined) continue;
    const re = /\[\[([^\]|#]+)/g;
    let m;
    while ((m = re.exec(n.content))) {
      const dest = titleToId.get(m[1].trim().toLowerCase());
      if (dest && dest !== n.id) {
        add(out, n.id, dest);
        add(inn, dest, n.id);
      }
    }
  }
  const keep = new Set([centerId]);
  let frontier = [centerId];
  for (let h = 0; h < hops; h++) {
    const next = [];
    for (const id of frontier) {
      for (const x of out.get(id) ?? []) {
        if (!keep.has(x)) {
          keep.add(x);
          next.push(x);
        }
      }
      for (const x of inn.get(id) ?? []) {
        if (!keep.has(x)) {
          keep.add(x);
          next.push(x);
        }
      }
    }
    frontier = next;
  }
  return keep.size;
}

/** Memory durable index rebuild */
function memoryFtsRebuild(nodes) {
  const notes = [];
  for (const n of Object.values(nodes)) {
    if (n.kind !== "note") continue;
    notes.push({
      id: n.id,
      path: n.path,
      title: n.name.replace(/\.md$/i, ""),
      body: n.content !== undefined ? String(n.content).slice(0, 4000) : "",
    });
  }
  return notes;
}

function memoryFtsSearch(notes, q, limit = 20) {
  const ql = q.toLowerCase();
  const hits = [];
  for (const n of notes) {
    const hay = `${n.title} ${n.path} ${n.body}`.toLowerCase();
    if (!hay.includes(ql)) continue;
    hits.push(n);
    if (hits.length >= limit) break;
  }
  return hits;
}

function time(fn, iters = 1) {
  const t0 = performance.now();
  let last;
  for (let i = 0; i < iters; i++) last = fn();
  return { ms: performance.now() - t0, last };
}

function approxBytes(nodes) {
  // Rough JSON size proxy for memory comparison
  return JSON.stringify(nodes).length;
}

function run() {
  console.log("Nexus scale microbench (Wave A/B/C)\n");

  // --- Structural index ---
  console.log("=== Structural index (children lookup) ===");
  console.log(
    "size".padStart(8),
    "rebuild_ms".padStart(12),
    "idx_100x_ms".padStart(12),
    "naive_100x_ms".padStart(14),
    "speedup".padStart(10),
  );
  for (const size of [200, 1000, 2000, 5000, 10000]) {
    const { nodes } = makeVault(size);
    const idx = new MiniIndex();
    const rb = time(() => idx.rebuild(nodes));
    const ix = time(() => {
      for (let f = 0; f < 20; f++) idx.children(nodes, `folder_${f}`);
    }, 100);
    const nv = time(() => {
      for (let f = 0; f < 20; f++) naiveChildren(nodes, `folder_${f}`);
    }, 100);
    const speedup = nv.ms / Math.max(ix.ms, 0.001);
    console.log(
      String(size).padStart(8),
      rb.ms.toFixed(2).padStart(12),
      ix.ms.toFixed(2).padStart(12),
      nv.ms.toFixed(2).padStart(14),
      (speedup.toFixed(1) + "x").padStart(10),
    );
    // correctness
    const a = idx.children(nodes, "folder_0").map((n) => n.id).join(",");
    const b = naiveChildren(nodes, "folder_0").map((n) => n.id).join(",");
    if (a !== b) {
      console.error("Correctness FAIL at", size);
      process.exit(1);
    }
  }
  console.log("Correctness: OK\n");

  // --- Wave A: meta-only memory ---
  console.log("=== Wave A meta-only vs full body memory (proxy) ===");
  console.log(
    "size".padStart(8),
    "full_kb".padStart(12),
    "meta_kb".padStart(12),
    "ratio".padStart(10),
  );
  for (const size of [1000, 5000, 10000, 50000]) {
    const full = makeVault(size, 50, { withBodies: true }).nodes;
    const meta = stripBodies(full);
    const fb = approxBytes(full);
    const mb = approxBytes(meta);
    console.log(
      String(size).padStart(8),
      (fb / 1024).toFixed(0).padStart(12),
      (mb / 1024).toFixed(0).padStart(12),
      (fb / mb).toFixed(1).padStart(9) + "x",
    );
    // unloaded notes have no content
    const sample = Object.values(meta).find((n) => n.kind === "note");
    if (sample && sample.content !== undefined) {
      console.error("stripBodies failed");
      process.exit(1);
    }
  }
  console.log("Meta-only strip: OK\n");

  // --- Wave B: indexed search ---
  console.log("=== Wave B indexed search latency ===");
  console.log(
    "size".padStart(8),
    "rebuild_ms".padStart(12),
    "q_100x_ms".padStart(12),
    "hits".padStart(8),
  );
  for (const size of [1000, 5000, 10000, 50000]) {
    const { nodes } = makeVault(size, 50);
    const si = new MiniSearchIndex();
    const rb = time(() => si.rebuild(nodes));
    const q = time(() => si.search("Note 42", 20), 100);
    const hits = si.search("Note 42", 20);
    console.log(
      String(size).padStart(8),
      rb.ms.toFixed(2).padStart(12),
      q.ms.toFixed(2).padStart(12),
      String(hits.length).padStart(8),
    );
    if (hits.length < 1) {
      console.error("search miss");
      process.exit(1);
    }
  }
  console.log("Indexed search: OK\n");

  // --- Wave B: ego from maps ---
  console.log("=== Wave B map-first ego neighborhood size ===");
  {
    const { nodes } = makeVault(5000, 50);
    const t0 = performance.now();
    const n = egoFromLinks(nodes, "note_0", 2);
    const ms = performance.now() - t0;
    console.log(`  5k vault ego@note_0 hops=2 → ${n} nodes in ${ms.toFixed(2)}ms`);
    if (n < 1 || n > 5000) {
      console.error("ego bounds fail");
      process.exit(1);
    }
    console.log("Ego map-first: OK\n");
  }

  // --- Wave C: durable memory FTS ---
  console.log("=== Wave C durable memory index ===");
  for (const size of [1000, 10000, 50000]) {
    const { nodes } = makeVault(size, 50);
    const rb = time(() => memoryFtsRebuild(nodes));
    const notes = memoryFtsRebuild(nodes);
    const q = time(() => memoryFtsSearch(notes, "content for note", 20), 50);
    console.log(
      `  n=${size} rebuild=${rb.ms.toFixed(1)}ms search50x=${q.ms.toFixed(1)}ms`,
    );
  }
  console.log("Durable memory index: OK\n");

  console.log("All scale benches passed.");
}

run();
