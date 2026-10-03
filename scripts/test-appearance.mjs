/**
 * Themes and CSS snippets: built-in theme choices, snippet sanitizing,
 * the readability guard math, and the desktop scope for snippet folders.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

if (!process.env.NEXUS_TSX) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("npx", ["--yes", "tsx", "scripts/test-appearance.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, NEXUS_TSX: "1" },
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.status ?? 1);
}

const prefs = await import("../src/lib/prefs/preferences.ts");
const ids = prefs.THEME_CHOICES.map((c) => c.id);
assert.deepEqual(ids, ["dark", "light", "midnight", "paper", "system"]);
assert.equal(prefs.themeModeOf("midnight"), "midnight");
assert.equal(prefs.themeModeOf("paper"), "paper");
assert.equal(prefs.themeModeOf("neon"), "dark");
assert.equal(prefs.themeModeOf(undefined), "dark");
assert.equal(prefs.resolveTheme("midnight"), "dark");
assert.equal(prefs.resolveTheme("paper"), "light");
assert.equal(prefs.themeVariantOf("midnight"), "midnight");
assert.equal(prefs.themeVariantOf("light"), null);
assert.equal(prefs.themeLabel("paper"), "Paper");

const css = readFileSync("src/styles.css", "utf8");
for (const variant of ["midnight", "paper"]) {
  const start = css.indexOf(`:root[data-theme-variant="${variant}"] {`);
  assert.ok(start > 0, `${variant} block`);
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /--bg-primary:/);
  assert.match(block, /--text-primary:/);
  assert.doesNotMatch(block, /--graph-void/, `${variant} leaves the 3D graph void alone`);
}
assert.ok(css.indexOf('[data-theme-variant="midnight"]') > css.indexOf('[data-theme="light"] {'));

const snip = await import("../src/lib/appearance/css-snippets.ts");
const cleaned = snip.sanitizeSnippetCss(
  `@import url("https://fonts.example/x.css");\nbody { background: url(https://cdn.example/bg.png) no-repeat; }\n.a { background: url(data:image/png;base64,AAAA); }\n.b { background-image: url('//cdn.example/y.png'); }`,
);
assert.doesNotMatch(cleaned.css, /@import/);
assert.doesNotMatch(cleaned.css, /https?:\/\//);
assert.doesNotMatch(cleaned.css, /\/\/cdn/);
assert.match(cleaned.css, /url\(data:image\/png;base64,AAAA\)/);
assert.equal(cleaned.blocked.length, 3);

const ok = snip.buildSnippet("nexus", ".nexus/snippets", { name: "wide.css", text: "body{color:red}", size: 15 });
assert.equal(ok.id, ".nexus/snippets/wide.css");
assert.equal(ok.name, "wide");
assert.equal(ok.error, null);
const big = snip.buildSnippet("obsidian", ".obsidian/snippets", { name: "big.css", text: null, size: snip.MAX_SNIPPET_BYTES + 1 });
assert.match(big.error, /Larger than 256 KB/);
const failed = snip.buildSnippet("nexus", ".nexus/snippets", { name: "x.css", text: null, size: 0, error: "denied" });
assert.equal(failed.error, "denied");

const ordered = snip.orderSnippets([
  snip.buildSnippet("obsidian", ".obsidian/snippets", { name: "a.css", text: "", size: 0 }),
  snip.buildSnippet("nexus", ".nexus/snippets", { name: "z.css", text: "", size: 0 }),
  snip.buildSnippet("nexus", ".nexus/snippets", { name: "b.css", text: "", size: 0 }),
]);
assert.deepEqual(ordered.map((s) => s.id), [".nexus/snippets/b.css", ".nexus/snippets/z.css", ".obsidian/snippets/a.css"]);

assert.deepEqual(snip.parseEnabledSnippets('["a","a","b",3]'), ["a", "b"]);
assert.deepEqual(snip.parseEnabledSnippets("nope"), []);
assert.deepEqual(snip.parseEnabledSnippets(null), []);
assert.equal(snip.enabledStorageKey("v1"), "nexus-css-snippets:v1");
assert.equal(snip.starterSnippetPath([]), ".nexus/snippets/my-snippet.css");
assert.equal(snip.starterSnippetPath([".nexus/snippets/my-snippet.css"]), ".nexus/snippets/my-snippet-2.css");
assert.match(snip.STARTER_SNIPPET_CSS, /--background-primary/);
assert.doesNotMatch(snip.STARTER_SNIPPET_CSS.replace(/\/\*[\s\S]*?\*\//g, ""), /\S/, "starter is all comments until edited");

assert.deepEqual(snip.parseRgb("rgb(1, 2, 3)"), { r: 1, g: 2, b: 3, a: 1 });
assert.deepEqual(snip.parseRgb("rgba(1, 2, 3, 0.5)"), { r: 1, g: 2, b: 3, a: 0.5 });
assert.deepEqual(snip.parseRgb("rgb(1 2 3 / 50%)"), { r: 1, g: 2, b: 3, a: 0.5 });
assert.equal(snip.parseRgb("oklch(0.5 0.1 200)"), null);
const black = { r: 0, g: 0, b: 0, a: 1 };
const white = { r: 255, g: 255, b: 255, a: 1 };
assert.equal(Math.round(snip.contrastRatio(black, white)), 21);
assert.equal(snip.contrastRatio(white, white), 1);
assert.ok(snip.contrastRatio({ r: 242, g: 242, b: 247, a: 1 }, { r: 15, g: 15, b: 18, a: 1 }) > 15);
assert.ok(snip.contrastRatio({ r: 0, g: 0, b: 0, a: 0.1 }, white) < snip.MIN_READABLE_CONTRAST);
assert.match(snip.contrastNotice("Low", 1.24, "editor"), /“Low” was turned off: editor text contrast would be 1.2:1, below 3:1/);
assert.match(snip.contrastNotice(null, 2, "page"), /CSS snippets were turned off/);
const bridge = new Map(snip.OBSIDIAN_VAR_BRIDGE);
assert.deepEqual(bridge.get("--background-primary"), ["--bg-primary", "--panel-solid"]);
assert.deepEqual(bridge.get("--text-normal"), ["--text-primary"]);
assert.deepEqual(bridge.get("--interactive-accent"), ["--accent"]);

const { mkdirTargetForWrite } = await import("../src/lib/vault/desktop-write-path.ts");
assert.equal(mkdirTargetForWrite(".nexus/snippets/my-snippet.css", false), ".nexus/snippets");
assert.equal(mkdirTargetForWrite(".nexus/snippets/my-snippet.css", true), null);
assert.equal(mkdirTargetForWrite(".nexus/snippets/my-snippet.css/x", false), ".nexus/snippets");

const scope = readFileSync("src-tauri/src/vault_scope.rs", "utf8");
assert.match(scope, /p\.join\("\.obsidian"\)\.join\("snippets"\)/);
assert.doesNotMatch(scope, /allow_directory\(&p\.join\("\.obsidian"\), true\)/);

const store = readFileSync("src/lib/appearance/snippets.ts", "utf8");
assert.match(store, /data-nexus-snippet/);
assert.match(store, /applyWithGuard/);
assert.match(store, /readDesktopTextFilesIn/);
assert.match(store, /readFsaTextFilesIn/);
const settings = readFileSync("src/components/settings/SettingsPanel.tsx", "utf8");
assert.match(settings, /<ThemePicker \/>/);
assert.match(settings, /<CssSnippetsSettings open=\{open\} \/>/);
const appearance = readFileSync("src/components/settings/AppearanceThemes.tsx", "utf8");
assert.match(appearance, /data-testid="settings-theme"/);
assert.match(appearance, /data-testid="settings-snippet-toggle"/);
assert.match(appearance, /the snippets folder another Markdown app may already keep/);
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /Turn off CSS snippets/);
assert.match(palette, /label: `Theme: \$\{choice\.label\}`/);
assert.match(readFileSync("src/components/layout/AppShell.tsx", "utf8"), /useVaultCssSnippets\(\)/);

const chrome = await import("../src/lib/appearance/accent-chrome.ts");
const darkSurfaces = ["#0F0F12", "#16161A", "#04060A", "#070A14"];
const lightSurfaces = ["#FFFFFF", "#F7F8FB", "#EEF0F4", "#FBF7EF", "#ECE4D4"];
for (const preset of ["#00C8FF", "#FF453A", "#30D158", "#7B61FF", "#FF9F0A"]) {
  for (const bg of darkSurfaces) {
    const ink = chrome.accentInk(preset, "dark");
    assert.ok(chrome.contrastHex(ink, bg) >= 3, `${preset} dark ink ${ink} on ${bg}`);
  }
  for (const bg of lightSurfaces) {
    const ink = chrome.accentInk(preset, "light");
    assert.ok(chrome.contrastHex(ink, bg) >= 3, `${preset} light ink ${ink} on ${bg}`);
  }
  assert.ok(chrome.contrastHex(chrome.onAccentHex(preset), preset) >= 3, `label on ${preset}`);
}
assert.notEqual(chrome.accentInk("#FF453A", "dark").toLowerCase(), "#5ad8ff");
assert.notEqual(chrome.accentInk("#30D158", "light").toLowerCase(), "#0078a8");
assert.notEqual(chrome.accentInk("#7B61FF", "dark").toLowerCase(), "#5ad8ff");

const groupKeys = ["Journal", "Projects", "People", "Archive"];
for (const key of groupKeys) {
  assert.notEqual(chrome.groupHue(key, "#FF453A"), chrome.groupHue(key, "#00C8FF"));
  assert.notEqual(chrome.groupHue(key, "#30D158"), chrome.groupHue(key, "#7B61FF"));
}
const roseGroups = groupKeys.map((key) => chrome.groupHue(key, "#FF453A"));
assert.equal(new Set(roseGroups.map((h) => h.toFixed(4))).size, groupKeys.length);

assert.notEqual(chrome.indexedGroupSwatch(0, "#FF453A"), chrome.indexedGroupSwatch(0, "#00C8FF"));
assert.notEqual(chrome.indexedGroupSwatch(0, "#30D158"), chrome.indexedGroupSwatch(1, "#30D158"));
assert.equal(
  chrome.indexedGroupSwatch(0, "#FF453A").toLowerCase(),
  chrome.hslToHex(chrome.indexedGroupHue(0, "#FF453A"), 0.62, 0.58).toLowerCase(),
);
const overviewSrc = readFileSync("src/lib/graph/overview.ts", "utf8");
assert.match(overviewSrc, /indexedGroupSwatch\(index, accentHex\)/);
assert.match(overviewSrc, /OVERVIEW_GROUP_COLORS\[index % OVERVIEW_GROUP_COLORS\.length\]/);

const props = new Map();
const dataset = {};
globalThis.document = {
  documentElement: {
    style: {
      setProperty: (k, v) => props.set(k, v),
      get colorScheme() {
        return "";
      },
      set colorScheme(_v) {},
    },
    dataset,
  },
  body: { classList: { toggle() {} } },
  querySelector: () => ({ setAttribute() {} }),
};
prefs.applyPrefsToDom({ ...prefs.DEFAULT_PREFS, accentPreset: "rose", theme: "paper" });
assert.equal(String(props.get("--accent")).toUpperCase(), "#FF453A");
assert.equal(props.get("--accent-ink"), chrome.accentInk("#FF453A", "light"));
assert.equal(props.get("--focus-ring"), props.get("--accent-ink"));
assert.equal(props.get("--focus-ring-on-dark"), chrome.accentInk("#FF453A", "dark"));
assert.equal(props.get("--on-accent"), chrome.onAccentHex("#FF453A"));
assert.notEqual(String(props.get("--accent-ink")).toLowerCase(), "#5ad8ff");
assert.equal(dataset.theme, "light");
assert.equal(dataset.themeVariant, "paper");

prefs.applyPrefsToDom({ ...prefs.DEFAULT_PREFS, accentPreset: "emerald", theme: "midnight" });
assert.equal(String(props.get("--accent")).toUpperCase(), "#30D158");
assert.equal(dataset.theme, "dark");
assert.equal(dataset.themeVariant, "midnight");
assert.equal(props.get("--focus-ring"), chrome.accentInk("#30D158", "dark"));
assert.equal(props.get("--accent-ink-on-dark"), chrome.accentInk("#30D158", "dark"));

const afterTokens = css.slice(css.indexOf('[data-theme="light"] .glass-elevated'));
assert.doesNotMatch(afterTokens, /rgba\(0,\s*200,\s*255/);
assert.doesNotMatch(afterTokens, /#5ad8ff/);
assert.doesNotMatch(afterTokens, /#00c8ff/);
assert.match(css, /box-shadow: inset 3px 0 0 var\(--accent-ink\)/);
assert.match(css, /--focus-ring: #5ad8ff;/);
assert.match(css, /--focus-ring: #0078a8;/);
assert.match(css, /--accent-ink: #0078a8;/);
const localGraph = readFileSync("src/components/graph/LocalGraph2D.tsx", "utf8");
assert.match(localGraph, /fill=\{p\.center \? "var\(--accent\)"/);
assert.doesNotMatch(localGraph, /#00c8ff/);
const planets = readFileSync("src/lib/graph/instrument-node.ts", "utf8");
assert.match(planets, /groupHue/);
assert.doesNotMatch(planets, /void accent/);
assert.doesNotMatch(planets, /0x6a7e92/);
assert.match(readFileSync("src/components/graph/OverviewGraph.tsx", "utf8"), /overviewGroupColor\(key, model\.keys, accentHex\)/);
assert.match(readFileSync("src/components/graph/OverviewGraph.tsx", "utf8"), /stroke=\{active \? "var\(--accent\)"/);

console.log("appearance: PASS");
