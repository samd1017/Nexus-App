/**
 * CSS snippets: plain .css files in the vault that restyle the app.
 * Nexus reads `.nexus/snippets/*.css` and, when present, Obsidian's
 * `.obsidian/snippets/*.css`. Nothing is fetched from the network.
 */

export const SNIPPET_DIRS = [
  { dir: ".nexus/snippets", source: "nexus" },
  { dir: ".obsidian/snippets", source: "obsidian" },
] as const;

export type SnippetSource = (typeof SNIPPET_DIRS)[number]["source"];

export const MAX_SNIPPET_BYTES = 256 * 1024;
/** Text under 3:1 against its background is not readable UI copy. */
export const MIN_READABLE_CONTRAST = 3;
export const STARTER_SNIPPET_DIR = ".nexus/snippets";

export type RawSnippetFile = { name: string; text: string | null; size: number; error?: string };

export type CssSnippet = {
  /** Vault-relative path; stable across reloads. */
  id: string;
  name: string;
  source: SnippetSource;
  path: string;
  css: string;
  bytes: number;
  /** Rules dropped so the snippet stays offline. */
  blocked: string[];
  /** Why the snippet cannot be applied. */
  error: string | null;
};

/**
 * Obsidian theme variables mapped onto Nexus tokens. A snippet that sets
 * `--background-primary` repaints the Nexus panels the same way.
 */
export const OBSIDIAN_VAR_BRIDGE: [string, string[]][] = [
  ["--background-primary", ["--bg-primary", "--panel-solid"]],
  ["--background-primary-alt", ["--bg-elevated"]],
  ["--background-secondary", ["--bg-secondary"]],
  ["--background-secondary-alt", ["--bg-deepest"]],
  ["--background-modifier-border", ["--border"]],
  ["--text-normal", ["--text-primary"]],
  ["--text-muted", ["--text-secondary"]],
  ["--text-faint", ["--text-muted"]],
  ["--interactive-accent", ["--accent"]],
  ["--text-accent", ["--accent"]],
  ["--font-text-theme", ["--font-sans"]],
  ["--font-monospace-theme", ["--font-mono"]],
];

export function snippetDisplayName(fileName: string): string {
  return fileName.replace(/\.css$/i, "");
}

export function snippetSourceLabel(source: SnippetSource): string {
  return source === "nexus" ? ".nexus/snippets" : ".obsidian/snippets";
}

const REMOTE_URL = /url\(\s*(['"]?)\s*((?:https?:)?\/\/[^'")\s]*)\1\s*\)/gi;

/** Drop @import and remote url() so a snippet never reaches the network. */
export function sanitizeSnippetCss(css: string): { css: string; blocked: string[] } {
  const blocked: string[] = [];
  let out = css.replace(/@import\s+[^;]*;?/gi, (rule) => {
    blocked.push(rule.trim().replace(/\s+/g, " ").slice(0, 80));
    return "";
  });
  out = out.replace(REMOTE_URL, (_m, _q, url: string) => {
    blocked.push(`url(${url.slice(0, 72)})`);
    return "none";
  });
  return { css: out, blocked };
}

export function buildSnippet(source: SnippetSource, dir: string, file: RawSnippetFile): CssSnippet {
  const path = `${dir}/${file.name}`;
  const base = { id: path, name: snippetDisplayName(file.name), source, path, bytes: file.size };
  if (file.error) return { ...base, css: "", blocked: [], error: file.error };
  if (file.size > MAX_SNIPPET_BYTES || file.text === null) {
    return { ...base, css: "", blocked: [], error: `Larger than ${MAX_SNIPPET_BYTES / 1024} KB, so it is not applied.` };
  }
  const clean = sanitizeSnippetCss(file.text);
  return { ...base, css: clean.css, blocked: clean.blocked, error: null };
}

/** Nexus snippets first, then Obsidian; alphabetical inside each folder. */
export function orderSnippets(snippets: CssSnippet[]): CssSnippet[] {
  const rank = (s: CssSnippet) => (s.source === "nexus" ? 0 : 1);
  return [...snippets].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );
}

export function enabledStorageKey(vaultKey: string): string {
  return `nexus-css-snippets:${vaultKey}`;
}

export function parseEnabledSnippets(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 200);
  } catch {
    return [];
  }
}

export function starterSnippetPath(existing: string[]): string {
  const taken = new Set(existing.map((p) => p.toLowerCase()));
  for (let n = 1; n < 100; n += 1) {
    const path = `${STARTER_SNIPPET_DIR}/${n === 1 ? "my-snippet" : `my-snippet-${n}`}.css`;
    if (!taken.has(path.toLowerCase())) return path;
  }
  return `${STARTER_SNIPPET_DIR}/my-snippet-${Date.now()}.css`;
}

export const STARTER_SNIPPET_CSS = `/* Nexus CSS snippet. Turn it on in Settings → Appearance → CSS snippets.
 *
 * Nexus colors:    --bg-primary --bg-secondary --bg-elevated --text-primary
 *                  --text-secondary --text-muted --border --accent
 * Obsidian colors: --background-primary --background-secondary --text-normal
 *                  --text-muted --interactive-accent (mapped onto the above)
 * Scope by theme with body.theme-dark or body.theme-light.
 * @import and http(s) url() are dropped so snippets stay offline.
 */

/* Example: a warmer reading column in dark themes.
body.theme-dark {
  --background-primary: #14110f;
  --text-normal: #ece4d8;
}
*/

/* Example: a narrower editor line.
.note-editor {
  max-width: 46rem;
}
*/
`;

export type Rgba = { r: number; g: number; b: number; a: number };

/** Parses computed `rgb()` / `rgba()` (comma or space syntax). */
export function parseRgb(value: string): Rgba | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(value.trim());
  if (!m) return null;
  const alphaRaw = m[4];
  const a = alphaRaw === undefined ? 1 : alphaRaw.endsWith("%") ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Number.isFinite(a) ? a : 1 };
}

export function compositeOver(top: Rgba, under: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + under.r * (1 - a),
    g: top.g * a + under.g * (1 - a),
    b: top.b * a + under.b * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }: Rgba): number {
  const ch = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
}

/** WCAG contrast; a translucent foreground is blended onto the background first. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const solidBg = bg.a < 1 ? compositeOver(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const solidFg = fg.a < 1 ? compositeOver(fg, solidBg) : fg;
  const l1 = luminance(solidFg);
  const l2 = luminance(solidBg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastNotice(name: string | null, ratio: number, where: string): string {
  const shown = `${Math.floor(ratio * 10) / 10}:1`;
  const subject = name ? `“${name}” was turned off` : "CSS snippets were turned off";
  return `${subject}: ${where} text contrast would be ${shown}, below ${MIN_READABLE_CONTRAST}:1.`;
}
