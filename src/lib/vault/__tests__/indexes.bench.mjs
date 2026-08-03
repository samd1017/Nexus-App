/**
 * Node-runnable smoke for VaultStructuralIndex logic (duplicated core checks).
 * Full TS index is exercised via the app; this validates adjacency invariants.
 *
 * node src/lib/vault/__tests__/indexes.bench.mjs
 */

import assert from "node:assert/strict";

function buildNodes(n) {
  /** @type {Record<string, any>} */
  const nodes = {
    f1: {
      id: "f1",
      path: "A",
      name: "A",
      kind: "folder",
      parentId: null,
      mtime: 1,
    },
  };
  for (let i = 0; i < n; i++) {
    nodes[`n${i}`] = {
      id: `n${i}`,
      path: `A/Note ${i}.md`,
      name: `Note ${i}.md`,
      kind: "note",
      parentId: "f1",
      mtime: i,
      content: `hello ${i}`,
    };
  }
  return nodes;
}

// Inline minimal port of children index
class Idx {
  constructor() {
    this.childrenByParent = new Map();
    this.pathToId = new Map();
  }
  rebuild(nodes) {
    this.childrenByParent = new Map();
    this.pathToId = new Map();
    for (const n of Object.values(nodes)) {
      const pk = n.parentId ?? "__root__";
      if (!this.childrenByParent.has(pk)) this.childrenByParent.set(pk, []);
      this.childrenByParent.get(pk).push(n.id);
      this.pathToId.set(n.path, n.id);
    }
    for (const [pk, ids] of this.childrenByParent) {
      ids.sort((a, b) => nodes[a].name.localeCompare(nodes[b].name));
      this.childrenByParent.set(pk, ids);
    }
  }
  children(nodes, parentId) {
    return (this.childrenByParent.get(parentId ?? "__root__") ?? [])
      .map((id) => nodes[id])
      .filter(Boolean);
  }
}

const nodes = buildNodes(1000);
const idx = new Idx();
idx.rebuild(nodes);
assert.equal(idx.children(nodes, "f1").length, 1000);
assert.equal(idx.pathToId.get("A/Note 42.md"), "n42");
assert.equal(idx.children(nodes, null)[0].id, "f1");

// Simulate content-only map clone (same keys)
const nodes2 = { ...nodes, n0: { ...nodes.n0, content: "changed", mtime: 999 } };
// index still valid for structure
assert.equal(idx.children(nodes2, "f1").length, 1000);

console.log("indexes.bench.mjs: OK");
