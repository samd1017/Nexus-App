/**
 * tag:, uppercase OR, and line:/section: filters.
 * Run: node src/lib/search/__tests__/query-ops.contract.mjs
 */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../..");
const outDir = path.join(tmpdir(), `nexus-query-ops-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

function resolveAlias(spec) {
  const base = path.join(root, "src", spec.slice(2));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, "index.ts")];
  return candidates.find((file) => {
    try {
      return readFileSync(file);
    } catch {
      return false;
    }
  });
}

await build({
  entryPoints: [path.join(root, "src/lib/search/query-ops.ts")],
  outfile: path.join(outDir, "query-ops.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
  plugins: [
    {
      name: "alias-and-stub",
      setup(api) {
        api.onResolve({ filter: /^@\// }, (args) => {
          const resolved = resolveAlias(args.path);
          if (!resolved) throw new Error(`unresolved ${args.path}`);
          return { path: resolved };
        });
        api.onResolve({ filter: /\.sql\?raw$/ }, (args) => {
          const spec = args.path.replace(/\?raw$/, "");
          return {
            path: path.isAbsolute(spec) ? spec : path.resolve(args.resolveDir, spec),
            namespace: "sql-raw",
          };
        });
        api.onLoad({ filter: /.*/, namespace: "sql-raw" }, (args) => ({
          contents: `export default ${JSON.stringify(readFileSync(args.path, "utf8"))};`,
          loader: "js",
        }));
        api.onResolve({ filter: /^(three|3d-force-graph)$/ }, (args) => ({
          path: args.path,
          namespace: "stub",
        }));
        api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          contents: "export default {};",
          loader: "js",
        }));
      },
    },
  ],
});

const {
  LINE_SECTION_WINDOW_HINT,
  SEARCH_OPERATOR_HELP,
  hasOrQuery,
  isTagOnlyQuery,
  parseSearchOps,
  planPagedDesktopSearch,
  searchUsesLoadedBodies,
  searchWithOps,
  unsupportedSearchHint,
  WINDOW_SCOPED_SEARCH_HINT,
} = await import(pathToFileURL(path.join(outDir, "query-ops.mjs")).href);

function note(id, name, content) {
  return {
    id,
    path: `${name}.md`,
    name: `${name}.md`,
    kind: "note",
    parentId: null,
    mtime: 1,
    content,
  };
}

const nodes = {
  a: note("a", "Alpha Note", "alpha apples\n\n#work"),
  b: note("b", "Beta Note", "beta berries\n\n#home"),
  c: note("c", "Shared Note", "alpha beta together"),
  w: note(
    "w",
    "Welcome",
    "# Welcome\n\n## Review tasks\n\nReview the LIVECOMPAREBODYTOKEN991 line\n\n## Other\n\nnope",
  ),
  ghost: {
    id: "ghost",
    path: "Ghost.md",
    name: "Ghost.md",
    kind: "note",
    parentId: null,
    mtime: 1,
  },
};

function ids(query) {
  return searchWithOps(nodes, query, 16)
    .map((hit) => hit.noteId)
    .sort();
}

{
  const hash = parseSearchOps("#work");
  const tag = parseSearchOps("tag:work");
  const hashed = parseSearchOps("tag:#Work");
  assert.equal(hash.tagFilter, "work");
  assert.equal(tag.tagFilter, "work");
  assert.equal(hashed.tagFilter, "work");
  assert.equal(hash.rest, "");
  assert.equal(tag.rest, "");
  assert.equal(hashed.rest, "");
  assert.equal(hasOrQuery(tag), false);
  assert.equal(isTagOnlyQuery(tag), true);
  assert.equal(isTagOnlyQuery(hash), true);
  assert.deepEqual(ids("tag:work"), ids("#work"));
  assert.deepEqual(ids("tag:#home"), ["b"]);
  assert.deepEqual(ids("#home"), ["b"]);
  assert.deepEqual(ids("tag:work alpha"), ["a"]);
  assert.deepEqual(ids("#work alpha"), ["a"]);
  assert.deepEqual(ids("tag:work beta"), []);
}

{
  const or = parseSearchOps("alpha OR beta");
  assert.equal(hasOrQuery(or), true);
  assert.equal(or.orClauses.length, 2);
  assert.equal(or.orClauses[0].rest, "alpha");
  assert.equal(or.orClauses[1].rest, "beta");
  const spaced = ids("alpha beta");
  const either = ids("alpha OR beta");
  assert.ok(spaced.includes("c"));
  assert.ok(!spaced.includes("b"));
  assert.deepEqual(either, ["a", "b", "c"]);
  assert.deepEqual(ids("tag:work OR tag:home"), ["a", "b"]);
  assert.deepEqual(ids("#work OR beta"), ["a", "b", "c"]);
  const lower = parseSearchOps("alpha or beta");
  assert.equal(hasOrQuery(lower), false);
  assert.equal(lower.orClauses.length, 0);
  assert.equal(lower.rest, "alpha or beta");
  const quoted = parseSearchOps('"alpha OR beta"');
  assert.equal(hasOrQuery(quoted), false);
  assert.equal(quoted.rest, '"alpha OR beta"');
  const dangling = parseSearchOps("alpha OR");
  assert.equal(hasOrQuery(dangling), false);
  assert.equal(dangling.rest, "alpha");
  assert.deepEqual(ids("alpha OR"), ids("alpha"));
}

{
  const line = parseSearchOps("line:12");
  assert.deepEqual(line.unsupported, []);
  assert.equal(line.lineFilter, 12);
  assert.equal(line.sectionFilter, null);
  assert.equal(line.rest, "");
  assert.equal(unsupportedSearchHint(line), null);
  assert.equal(searchUsesLoadedBodies(line), true);
  assert.deepEqual(ids("line:12"), []);
  const section = parseSearchOps('section:"Review tasks"');
  assert.deepEqual(section.unsupported, []);
  assert.equal(section.sectionFilter, "Review tasks");
  assert.equal(section.rest, "");
  assert.equal(unsupportedSearchHint(section), null);
  assert.deepEqual(ids('section:"Review tasks"'), ["w"]);
  assert.deepEqual(ids('section:"Review tasks" Review'), ["w"]);
  assert.deepEqual(ids('section:"Review tasks" nope'), []);
  assert.deepEqual(ids('section:"Other" nope'), ["w"]);
  assert.ok(!ids('section:"Review tasks"').includes("ghost"));
  const both = parseSearchOps("section:Intro line:4 alpha");
  assert.deepEqual(both.unsupported, []);
  assert.equal(both.lineFilter, 4);
  assert.equal(both.sectionFilter, "Intro");
  assert.equal(both.rest, "alpha");
  assert.equal(unsupportedSearchHint(both), null);
  assert.deepEqual(ids("alpha line:1"), ["a", "c"]);
  assert.deepEqual(ids("alpha line:4"), []);
  assert.deepEqual(ids("LIVECOMPAREBODYTOKEN991 line:5"), ["w"]);
  assert.deepEqual(ids("LIVECOMPAREBODYTOKEN991 line:9"), []);
  assert.deepEqual(ids("line:1 OR beta"), ["b", "c"]);
  const lineOr = parseSearchOps("line:1 OR beta");
  assert.deepEqual(lineOr.unsupported, []);
  assert.equal(lineOr.orClauses[0].lineFilter, 1);
  assert.equal(lineOr.orClauses[1].lineFilter, null);
  const quotedPath = parseSearchOps('path:"section:Intro" hello');
  assert.deepEqual(quotedPath.unsupported, []);
  assert.equal(quotedPath.lineFilter, null);
  assert.equal(quotedPath.sectionFilter, null);
  assert.equal(quotedPath.pathFilter, "section:Intro");
  assert.equal(quotedPath.rest, "hello");
  assert.equal(searchUsesLoadedBodies(quotedPath), false);
}

{
  const pathOp = parseSearchOps("path:Notes alpha");
  assert.equal(pathOp.pathFilter, "Notes");
  assert.equal(pathOp.rest, "alpha");
  assert.equal(hasOrQuery(pathOp), false);
  assert.equal(unsupportedSearchHint(pathOp), null);
}

{
  assert.match(SEARCH_OPERATOR_HELP, /tag:/);
  assert.match(SEARCH_OPERATOR_HELP, /\bOR\b/);
  assert.match(SEARCH_OPERATOR_HELP, /foo OR bar/);
  assert.match(SEARCH_OPERATOR_HELP, /line:/);
  assert.match(SEARCH_OPERATOR_HELP, /section:/);
  assert.match(SEARCH_OPERATOR_HELP, /body line/);
  assert.doesNotMatch(SEARCH_OPERATOR_HELP, /not supported yet/);
  const settings = readFileSync(path.join(root, "src/components/settings/SettingsPanel.tsx"), "utf8");
  const shortcuts = readFileSync(path.join(root, "src/components/chrome/ShortcutsSheet.tsx"), "utf8");
  const palette = [
    "src/components/search/CommandPalette.tsx",
    "src/components/search/palette-search.ts",
    "src/components/search/palette-results.tsx",
  ]
    .map((rel) => readFileSync(path.join(root, rel), "utf8"))
    .join("\n");
  assert.match(settings, /SEARCH_OPERATOR_HELP/);
  assert.match(shortcuts, /SEARCH_OPERATOR_HELP/);
  assert.match(shortcuts, /data-testid="search-operator-help"/);
  for (const phrase of ["tag:", ">OR</span>", "line:", "section:", "filter loaded notes", "search-unsupported-hint"]) {
    assert.match(palette, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(palette, /not supported yet/);
  assert.doesNotMatch(settings, /not supported yet/);
  assert.doesNotMatch(shortcuts, /not supported yet/);
}

{
  const or = parseSearchOps("alpha OR beta");
  const pathWords = parseSearchOps("path:inbox zephyr");
  const pathOnly = parseSearchOps("folder:projects");
  const sqliteOr = planPagedDesktopSearch({
    shellCatalog: true,
    sqlite: true,
    ops: or,
  });
  assert.equal(sqliteOr.engine, "sqlite-ops");
  assert.equal(sqliteOr.hint, null);
  const sqlitePath = planPagedDesktopSearch({
    shellCatalog: true,
    sqlite: true,
    ops: pathWords,
  });
  assert.equal(sqlitePath.engine, "sqlite-ops");
  assert.equal(sqlitePath.hint, null);
  const catalogPath = planPagedDesktopSearch({
    shellCatalog: true,
    sqlite: true,
    ops: pathOnly,
  });
  assert.equal(catalogPath.engine, "catalog-path");
  assert.equal(catalogPath.hint, null);
  const windowOr = planPagedDesktopSearch({
    shellCatalog: true,
    sqlite: false,
    ops: or,
  });
  assert.equal(windowOr.engine, "window");
  assert.equal(windowOr.hint, WINDOW_SCOPED_SEARCH_HINT);
  const lineWords = parseSearchOps("alpha line:1");
  const sqliteLine = planPagedDesktopSearch({
    shellCatalog: true,
    sqlite: true,
    ops: lineWords,
  });
  assert.equal(sqliteLine.engine, "default");
  assert.notEqual(sqliteLine.engine, "sqlite-ops");
  assert.equal(sqliteLine.hint, LINE_SECTION_WINDOW_HINT);
  const palette = [
    "src/components/search/CommandPalette.tsx",
    "src/components/search/palette-search.ts",
    "src/components/search/palette-results.tsx",
  ]
    .map((rel) => readFileSync(path.join(root, rel), "utf8"))
    .join("\n");
  assert.match(palette, /planPagedDesktopSearch/);
  assert.match(palette, /searchDesktopOps/);
  assert.match(palette, /search-scope-hint/);
  assert.doesNotMatch(
    palette,
    /searchPlan\.engine === "sqlite-ops"[\s\S]{0,400}searchWithOps\(nodes/,
  );
}

rmSync(outDir, { recursive: true, force: true });
console.log("query-ops contract ok");
