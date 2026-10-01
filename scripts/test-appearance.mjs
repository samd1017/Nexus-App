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
assert.match(appearance, /\.obsidian\/snippets/);
const palette = readFileSync("src/components/search/CommandPalette.tsx", "utf8");
assert.match(palette, /Turn off CSS snippets/);
assert.match(palette, /label: `Theme: \$\{choice\.label\}`/);
assert.match(readFileSync("src/components/layout/AppShell.tsx", "utf8"), /useVaultCssSnippets\(\)/);

console.log("appearance: PASS");
