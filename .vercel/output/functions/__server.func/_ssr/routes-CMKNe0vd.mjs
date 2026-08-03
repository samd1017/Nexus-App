import { i as __toESM } from "../_runtime.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { a as cn, i as NexusWordmark, n as NEXUS_TAGLINE, o as formatRelativeTime, r as NexusMark, s as slugifyTitle, t as NEXUS_NAME } from "./NexusLogo-DEtBYVdt.mjs";
import { l as require_react_dom, u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { $ as Download, A as Lightbulb, B as Ghost, C as Minimize2, D as ListOrdered, E as ListTree, F as Heading3, G as Focus, H as FolderPlus, I as Heading2, J as FilePlus2, K as FileText, L as Heading1, M as Image, N as History, O as ListChecks, P as Heading, Q as Earth, R as Hash, S as Minus, T as List, U as FolderOpen, V as Folder, W as FolderKanban, X as ExternalLink, Y as Eye, Z as Ellipsis, _ as PanelRightOpen, _t as Activity, a as Trash2, at as ChevronDown, b as PanelLeftClose, c as Settings, ct as Bot, d as Rows3, dt as BetweenVerticalEnd, et as Columns3, f as Radio, ft as BetweenHorizontalStart, g as PanelRight, gt as AlignCenter, h as Pencil, ht as AlignRight, i as TriangleAlert, it as ChevronRight, j as Italic, k as Link2, l as Search, lt as Bold, m as Plus, mt as AlignLeft, n as Users, nt as Cloud, o as Table, ot as Check, p as Quote, pt as BetweenHorizontalEnd, q as FilePlus, r as Unlink, rt as CircleHelp, s as Sparkles, st as CalendarDays, t as X, tt as CodeXml, u as Save, ut as BetweenVerticalStart, v as PanelRightClose, w as Maximize2, x as Network, y as PanelLeft, z as HardDrive } from "../_libs/lucide-react.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
import { t as marked } from "../_libs/marked.mjs";
import { t as TurndownService } from "../_libs/turndown.mjs";
import { O as mergeAttributes, R as Plugin, a as Mark, i as InputRule, z as PluginKey } from "../_libs/@tiptap/core+[...].mjs";
import { n as useEditor, t as EditorContent } from "../_libs/fast-equals+tiptap__react.mjs";
import { n as index_default } from "../_libs/@tiptap/extension-link+[...].mjs";
import { t as index_default$1 } from "../_libs/@tiptap/extension-bullet-list+[...].mjs";
import { t as index_default$2 } from "../_libs/@tiptap/extension-placeholder+[...].mjs";
import { t as index_default$3 } from "../_libs/tiptap__starter-kit.mjs";
import { t as index_default$4 } from "../_libs/tiptap__extension-task-list.mjs";
import { t as index_default$5 } from "../_libs/tiptap__extension-task-item.mjs";
import { t as index_default$6 } from "../_libs/tiptap__extension-image.mjs";
import { t as index_default$7 } from "../_libs/tiptap__extension-text-align.mjs";
import { i as TableRow, n as TableCell, r as TableHeader, t as Table$1 } from "../_libs/@tiptap/extension-table+[...].mjs";
import "../_libs/tiptap__extension-table-row.mjs";
import "../_libs/tiptap__extension-table-cell.mjs";
import "../_libs/tiptap__extension-table-header.mjs";
import { i as Trigger, n as Portal, r as Root2, t as Content2 } from "../_libs/@radix-ui/react-popover+[...].mjs";
import { a as CanvasTexture, c as Group, d as MeshBasicMaterial, f as MeshPhysicalMaterial, g as SphereGeometry, h as Scene, i as BufferAttribute, l as HemisphereLight, m as SRGBColorSpace, n as PMREMGenerator, o as Color, p as PlaneGeometry, r as AmbientLight, s as DirectionalLight, t as _3dForceGraph, u as Mesh, y as TorusGeometry } from "../_libs/3d-force-graph+[...].mjs";
import { t as _default } from "../_libs/three-spritetext.mjs";
import { t as _e } from "../_libs/cmdk.mjs";
import { t as entry_default } from "../_libs/fuse.js.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CMKNe0vd.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var import_react_dom = /* @__PURE__ */ __toESM(require_react_dom());
var DEFAULT_SETTINGS = {
	leftOpen: true,
	rightOpen: true,
	leftWidth: 260,
	rightWidth: 340,
	editorMode: "visual",
	graphMode: "panel",
	lastNotePath: null
};
function noteTitle(node) {
	if (node.kind !== "note") return node.name;
	return node.name.replace(/\.md$/i, "");
}
function pathJoin(...parts) {
	return parts.filter(Boolean).join("/").replace(/\/+/g, "/").replace(/^\//, "");
}
function parentPath(path) {
	const i = path.lastIndexOf("/");
	return i <= 0 ? "" : path.slice(0, i);
}
function idFor(path) {
	return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
}
function folder(path, name, parentId) {
	return {
		id: idFor(path || "__root_folder__" + name),
		path,
		name,
		kind: "folder",
		parentId,
		mtime: Date.now()
	};
}
function note(path, name, parentId, content) {
	return {
		id: idFor(path),
		path,
		name,
		kind: "note",
		parentId,
		mtime: Date.now(),
		content
	};
}
/** Demo vault that showcases Nexus features with clean, linked Markdown */
function buildDemoVault() {
	const nodes = {};
	const add = (n) => {
		nodes[n.id] = n;
		return n;
	};
	const projects = add(folder("Projects", "Projects", null));
	const research = add(folder("Research", "Research", null));
	const journal = add(folder("Journal", "Journal", null));
	const systems = add(folder("Systems", "Systems", null));
	const welcome = add(note("Welcome.md", "Welcome.md", null, `# Welcome to Nexus

**Notes for Humans and Agents.**

This demo vault is a tour of everything Nexus does — open notes, follow [[wikilinks]], switch Visual ↔ Source, search with **⌘K**, and watch the **graph** light up.

## Feature tour

| Feature | Try it |
| --- | --- |
| File tree | Folders on the left — Projects, Research, Systems, Journal |
| Visual editor | Default calm writing surface with formatting toolbar |
| Source mode | **⌘E** — same note as clean Markdown |
| Wikilinks | Click pills like [[Graph View]] or [[Linking Notes]] |
| Backlinks | Right panel → see what points here |
| Graph | Right panel → Graph, or **⌘G** for fullscreen |
| Search | **⌘K** — find any note instantly |
| Settings | Gear or **⌘,** — accents, density, editor prefs |
| Hermes | Vault menu → **Simulate Hermes write** |

## Quick path

1. Open [[Local-first Vault]] for how storage works  
2. Open [[Graph View]] and click a node to jump notes  
3. Edit this page, switch to **Source**, then back — content stays in sync  
4. Press **⌘K** and type \`hermes\`

## See the graph first

The right panel is already on **Graph** — orbit, zoom, and click a node. Press **⌘G** for fullscreen, or use the download icon to export a PNG.

## What stays true

- Vault = ordinary **folder of \`.md\` files**
- No accounts required
- Agents can edit the same files you do

---

*Demo data only. Open your own folder anytime.*
`));
	add(note(pathJoin("Projects", "Local-first Vault.md"), "Local-first Vault.md", projects.id, `# Local-first Vault

Nexus treats a **folder** as the product. No proprietary database for your notes.

## How it works

1. **Open folder as vault** — grant access to a real directory  
2. Notes are \`.md\` files; folders are directories  
3. Changes save to disk (or stay in-browser for this demo)  
4. External tools and agents write the **same files**

## Why this matters

| You get | Agents get |
| --- | --- |
| Readable Markdown | Same readable Markdown |
| \`git diff\` that makes sense | CLI and Hermes-friendly paths |
| Portability forever | No lock-in API |

## Related

- [[Welcome]]
- [[Hermes Compatibility]]
- [[Linking Notes]]
- [[Settings & Shortcuts]]
`));
	add(note(pathJoin("Projects", "Linking Notes.md"), "Linking Notes.md", projects.id, `# Linking Notes

Wikilinks are the connective tissue of the vault.

## Syntax

\`\`\`
[[Note Name]]
[[Note Name|display alias]]
\`\`\`

On disk they stay plain text. In **Visual** mode they render as interactive pills.

## Habits that scale

- Prefer **one idea per note**
- Link when you introduce a concept
- Use the **backlinks** panel to find unexpected structure
- Watch the [[Graph View]] cluster related work

## Map

- [[Welcome]]
- [[Graph View]]
- [[Visual & Source]]
- [[First Light]]
`));
	add(note(pathJoin("Research", "Graph View.md"), "Graph View.md", research.id, `# Graph View

The graph turns [[wikilinks]] into a living map of your thinking.

## What you’ll see

- **Nodes** sized by how connected they are  
- **Soft glow** on the active note  
- **Particles** along links (toggle in Settings)  
- **Physics** — Calm / Standard / Energetic  

## Controls

| Action | Result |
| --- | --- |
| Hover | Title + preview |
| Click | Open the note (exits fullscreen) |
| Drag | Reposition nodes |
| Scroll | Zoom |
| **⌘G** | Fullscreen graph |

## Seed network

- [[Welcome]]
- [[Linking Notes]]
- [[Design Language]]
- [[Hermes Compatibility]]
- [[Local-first Vault]]
`));
	add(note(pathJoin("Research", "Design Language.md"), "Design Language.md", research.id, `# Design Language

Dark, precise, high-signal — built to feel like an instrument, not a template.

## Palette

- Deepest \`#050507\`
- Surfaces \`#0F0F12\` → \`#16161A\`
- Accent cyan \`#00C8FF\` (changeable in Settings)
- Violet \`#7B61FF\`

## UI principles

- **Calm center** — the writing surface stays quiet  
- **Power on the edges** — tree, graph, search, settings  
- **Glass panels** with hairline borders  
- Motion ~220–280ms, never flashy  

## Try the accents

Open **Settings (⌘,)** and switch Cyan → Violet → Emerald. The whole UI updates live.

## Related

- [[Welcome]]
- [[Settings & Shortcuts]]
- [[Graph View]]
`));
	add(note(pathJoin("Research", "Visual & Source.md"), "Visual & Source.md", research.id, `# Visual & Source

Two views. **One note.** Same Markdown on disk.

## Visual

- Default writing mode  
- Headings, lists, tasks, code, tables  
- Wikilink pills you can click  

## Source

- Press **⌘E** or the Source chip  
- Edit raw Markdown  
- Switch back — rich view matches  

## Round-trip rules

Nexus keeps files clean so [[Hermes Compatibility]] and \`git diff\` stay honest. Prefer standard Markdown; avoid proprietary blobs.

## Practice

1. Type a sentence here in Visual  
2. Switch to Source — confirm it appears  
3. Edit the Markdown, return to Visual  

## Links

- [[Welcome]]
- [[Linking Notes]]
`));
	add(note(pathJoin("Systems", "Hermes Compatibility.md"), "Hermes Compatibility.md", systems.id, `# Hermes Compatibility

Hermes (and any agent or script) should treat this vault as ordinary files.

## Contract

- Notes = \`.md\` files  
- Folders = directories  
- No proprietary metadata inside note bodies  
- App preferences stay in the browser, not in your Markdown  

## Live watching

Creates, edits, renames, and deletes from outside the app appear in the UI within about **1–2 seconds** when a real folder is open.

## Demo it now

In the vault switcher menu, choose **Simulate Hermes write**. A new note lands under Systems without you typing it.

## Linked

- [[Local-first Vault]]
- [[Welcome]]
- [[Graph View]]
`));
	add(note(pathJoin("Systems", "Settings & Shortcuts.md"), "Settings & Shortcuts.md", systems.id, `# Settings & Shortcuts

## Settings (⌘,)

| Section | What you can change |
| --- | --- |
| Appearance | Accent color, density, graph particles |
| Editor | Default Visual/Source, font size, spellcheck |
| Graph | Default panel/hidden, physics intensity |
| Vault | Confirm delete, open last vault on launch |
| Keyboard | Full shortcut list |
| About | Nexus version + vault info |

## Keyboard map

| Shortcut | Action |
| --- | --- |
| ⌘K | Search / command palette |
| ⌘, | Settings |
| ⌘E | Toggle Visual / Source |
| ⌘G | Graph fullscreen |
| ⌘N | New note |
| ⌘S | Save (auto-save is already on) |
| ⌘\\\\ | Toggle left sidebar |
| ⌘⌥\\\\ | Toggle right panel |
| Esc | Close overlay / exit graph |

## Philosophy

Basics never require shortcuts. Power users never leave the keyboard.

## Related

- [[Welcome]]
- [[Design Language]]
- [[Visual & Source]]
`));
	add(note(pathJoin("Journal", "First Light.md"), "First Light.md", journal.id, `# First Light

Opened the vault for the first time.

The graph already ties together [[Local-first Vault]], [[Graph View]], and [[Hermes Compatibility]]. That loop — **write, link, see** — is the product.

## Tasks

- [x] Seed demo notes
- [x] Wire wikilinks
- [x] Try Visual ↔ Source
- [ ] Capture a real research thread
- [ ] Open my own folder as a vault

## Log

Felt immediate. Calm center, powerful edges. Settings accents made it mine in one click.

## Next

- [[Welcome]]
- [[Linking Notes]]
- [[Settings & Shortcuts]]
`));
	return {
		nodes,
		rootIds: [
			welcome.id,
			projects.id,
			research.id,
			systems.id,
			journal.id
		],
		vaultName: "Demo Vault"
	};
}
var HERMES_SAMPLE_NOTE = {
	path: pathJoin("Systems", "Hermes Pulse.md"),
	name: "Hermes Pulse.md",
	content: `# Hermes Pulse

This note was written by an **external process** (simulated agent).

Timestamp: \${TS}

## Observation

The filesystem watcher picked this up without a manual refresh. The vault remains a plain folder of Markdown.

## Links

- [[Hermes Compatibility]]
- [[Local-first Vault]]
- [[Welcome]]
`
};
/**
* Markdown purity — never rewrite Hermes/external notes without real user edits.
*/
/** Canonical normalize for equality (line endings + trailing space) */
function normalizeMarkdown(s) {
	return s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n+$/g, "") + "\n";
}
/**
* Semantic fingerprint: collapses whitespace noise so round-trip
* serialization noise doesn't force disk writes.
* Does NOT lowercase — case-only edits must still count as real changes.
*/
function markdownFingerprint(s) {
	return normalizeMarkdown(s).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
/**
* Prefer previous on-disk markdown when next is only a formatter rewrite.
* Returns previous if fingerprints match; otherwise normalized next.
*
* Do NOT use this for explicit Source-mode user edits — intentional blank
* lines / spacing would be dropped. Use normalizeLineEndings instead.
*/
function preferCleanWrite(previous, next) {
	if (!previous && !next) return "\n";
	if (!previous) return normalizeMarkdown(next);
	if (normalizeMarkdown(previous) === normalizeMarkdown(next)) return previous;
	if (markdownFingerprint(previous) === markdownFingerprint(next)) return previous;
	return normalizeMarkdown(next);
}
/** True when visual serialization would rewrite file without user intent */
function isOnlySerializationNoise(previous, next) {
	return markdownFingerprint(previous) === markdownFingerprint(next);
}
/** Source-mode: keep user spacing, only unify line endings */
function normalizeLineEndings(s) {
	return (s || "").replace(/\r\n/g, "\n");
}
var BULLET_STYLES = [
	{
		id: "disc",
		label: "Disc",
		sample: "●",
		marker: "-"
	},
	{
		id: "circle",
		label: "Circle",
		sample: "○",
		marker: "*"
	},
	{
		id: "square",
		label: "Square",
		sample: "■",
		marker: "+"
	},
	{
		id: "dash",
		label: "Dash",
		sample: "–",
		marker: "-"
	}
];
function isBulletStyle(v) {
	return v === "disc" || v === "circle" || v === "square" || v === "dash";
}
function markerForStyle(style) {
	return BULLET_STYLES.find((b) => b.id === style)?.marker ?? "-";
}
function styleFromMarker(marker) {
	if (marker === "*") return "circle";
	if (marker === "+") return "square";
	return "disc";
}
/**
* Clean Markdown serialization helpers.
* On-disk format: CommonMark + GFM + [[wikilinks]] — never proprietary HTML.
* Used for Visual ↔ Source round-trips (must stay lossless for tables/tasks).
*/
marked.setOptions({
	gfm: true,
	breaks: false
});
var turndown = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
	emDelimiter: "*",
	strongDelimiter: "**",
	hr: "---"
});
turndown.addRule("frontmatter", {
	filter: (node) => node.nodeName === "PRE" && node.getAttribute("data-frontmatter") === "true",
	replacement: (_content, node) => {
		return `---\n${(node.querySelector("code")?.textContent ?? node.textContent ?? "").replace(/\n+$/, "")}\n---\n\n`;
	}
});
turndown.addRule("wikilink", {
	filter: (node) => node.nodeName === "SPAN" && node.getAttribute("data-wikilink") != null,
	replacement: (_content, node) => {
		const el = node;
		const target = el.getAttribute("data-wikilink") || el.textContent || "";
		const alias = el.getAttribute("data-alias");
		if (alias && alias !== target) return `[[${target}|${alias}]]`;
		return `[[${target}]]`;
	}
});
turndown.addRule("taskListItem", {
	filter: (node) => {
		const el = node;
		if (el.nodeName !== "LI") return false;
		if (el.getAttribute("data-type") === "taskItem") return true;
		return !!el.querySelector?.(":scope > label input[type=\"checkbox\"]");
	},
	replacement: (content, node) => {
		const el = node;
		const input = el.querySelector("input[type=\"checkbox\"]") ?? null;
		const checked = el.getAttribute("data-checked") === "true" || !!input?.checked || input?.hasAttribute("checked");
		const body = content.replace(/^\s*\[[ xX]\]\s*/, "").replace(/^\n+/, "").replace(/\n+$/, "").replace(/\n+/g, " ").trim();
		return `- [${checked ? "x" : " "}] ${body}\n`;
	}
});
turndown.addRule("table", {
	filter: "table",
	replacement: (_content, node) => {
		const table = node;
		const rows = Array.from(table.querySelectorAll("tr"));
		if (!rows.length) return "";
		const lines = [];
		rows.forEach((row, ri) => {
			const cells = Array.from(row.querySelectorAll("th,td")).map((c) => {
				return (c.textContent ?? "").replace(/\n+/g, " ").trim().replace(/\|/g, "\\|");
			});
			if (!cells.length) return;
			lines.push("| " + cells.join(" | ") + " |");
			if (ri === 0) lines.push("| " + cells.map(() => "---").join(" | ") + " |");
		});
		return "\n\n" + lines.join("\n") + "\n\n";
	}
});
turndown.addRule("styledListItem", {
	filter: (node) => {
		if (node.nodeName !== "LI") return false;
		const el = node;
		if (el.getAttribute("data-type") === "taskItem") return false;
		if (el.querySelector?.(":scope > label input[type=\"checkbox\"]")) return false;
		const parent = el.parentElement;
		return !!(parent && parent.nodeName === "UL" && parent.getAttribute("data-type") !== "taskList");
	},
	replacement: (content, node) => {
		const styleAttr = node.parentElement?.getAttribute("data-bullet") || "disc";
		return `${markerForStyle(isBulletStyle(styleAttr) ? styleAttr : "disc")} ${content.replace(/^\n+/, "").replace(/\n+$/, "").replace(/\n/g, "\n    ").trim()}\n`;
	}
});
turndown.addRule("vaultImage", {
	filter: "img",
	replacement: (_content, node) => {
		const img = node;
		const vault = img.getAttribute("data-vault-src");
		let src = vault || img.getAttribute("src") || "";
		if (src.startsWith("blob:") && vault) src = vault;
		if (src.startsWith("blob:")) return "";
		const alt = img.getAttribute("alt") || "";
		const widthRaw = img.getAttribute("width") || img.getAttribute("data-width") || (img.style?.width ? String(parseInt(img.style.width, 10)) : "");
		const wNum = widthRaw ? parseInt(String(widthRaw), 10) : NaN;
		const wrap = img.closest?.(".nexus-image-wrap");
		const align = img.getAttribute("data-align") || wrap?.getAttribute("data-align") || "center";
		if (!src) return "";
		if (Number.isFinite(wNum) && wNum > 0 || align && align !== "center") {
			const wAttr = Number.isFinite(wNum) && wNum > 0 ? ` width="${wNum}"` : "";
			const aAttr = align && align !== "center" ? ` data-align="${align}"` : "";
			const vAttr = vault ? ` data-vault-src="${vault}"` : "";
			return `\n\n<img src="${src}" alt="${alt}"${wAttr}${aAttr}${vAttr} />\n\n`;
		}
		return `![${alt}](${src})`;
	}
});
var AMP = "&amp;";
var LT = "&lt;";
var GT = "&gt;";
var QUOT = "&quot;";
function escapeHtml(s) {
	return s.split("&").join(AMP).split("<").join(LT).split(">").join(GT).split("\"").join(QUOT);
}
function escapeAttr(s) {
	return s.split("&").join(AMP).split("\"").join(QUOT).split("<").join(LT);
}
/** Tag top-level <ul> with data-bullet from Markdown markers (- * +). */
function annotateBulletListsFromMarkdown(md, html) {
	if (typeof DOMParser === "undefined") return html;
	const markers = [];
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	let inCode = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.trimStart().startsWith("```")) {
			inCode = !inCode;
			continue;
		}
		if (inCode) continue;
		if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) continue;
		const m = /^([-*+])\s+/.exec(line);
		if (!m) continue;
		const prev = i > 0 ? lines[i - 1] : "";
		if (!(/^[-*+]\s+/.test(prev) && !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(prev))) markers.push(styleFromMarker(m[1]));
	}
	const root = new DOMParser().parseFromString(`<div id="nx-root">${html}</div>`, "text/html").getElementById("nx-root");
	if (!root) return html;
	let mi = 0;
	root.querySelectorAll("ul").forEach((ul) => {
		if (ul.getAttribute("data-type") === "taskList") return;
		const parentUl = ul.parentElement?.closest("ul");
		if (parentUl && parentUl.getAttribute("data-type") !== "taskList") {
			if (!ul.getAttribute("data-bullet")) ul.setAttribute("data-bullet", "circle");
			return;
		}
		ul.setAttribute("data-bullet", markers[mi++] ?? "disc");
	});
	return root.innerHTML;
}
/** Convert GFM checkbox lists from marked into TipTap TaskList HTML */
function normalizeTaskListsForTipTap(html) {
	if (typeof DOMParser === "undefined") return html;
	const root = new DOMParser().parseFromString(`<div id="nx-root">${html}</div>`, "text/html").getElementById("nx-root");
	if (!root) return html;
	root.querySelectorAll("ul").forEach((ul) => {
		const items = Array.from(ul.children).filter((c) => c.tagName === "LI");
		if (!items.length) return;
		if (items.filter((li) => li.querySelector("input[type=\"checkbox\"]")).length !== items.length) return;
		ul.setAttribute("data-type", "taskList");
		items.forEach((li) => {
			const input = li.querySelector("input[type=\"checkbox\"]");
			const checked = !!(input?.checked || input?.hasAttribute("checked") || li.getAttribute("data-checked") === "true");
			const clone = li.cloneNode(true);
			clone.querySelectorAll("input[type=\"checkbox\"]").forEach((n) => n.remove());
			let inner = clone.innerHTML.trim();
			if (!inner.startsWith("<")) inner = `<p>${inner || "<br>"}</p>`;
			else if (!/^<(p|div|h[1-6]|ul|ol|pre|blockquote)\b/i.test(inner)) inner = `<p>${inner}</p>`;
			li.setAttribute("data-type", "taskItem");
			li.setAttribute("data-checked", checked ? "true" : "false");
			li.innerHTML = `<label contenteditable="false"><input type="checkbox"${checked ? " checked" : ""}><span></span></label><div>${inner}</div>`;
		});
	});
	return root.innerHTML;
}
/**
* Markdown → HTML TipTap can parse (GFM tables, tasks, wikilink pills).
* This is the Visual mode entry path — must not leave raw Markdown as text.
*/
function markdownToHtml(md) {
	const raw = (md || "").replace(/\r\n/g, "\n");
	if (!raw.trim()) return "<p></p>";
	let frontmatterHtml = "";
	let body = raw;
	const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
	if (fm) {
		frontmatterHtml = `<pre data-frontmatter="true" class="nexus-frontmatter"><code>${escapeHtml(fm[1] ?? "")}</code></pre>`;
		body = raw.slice(fm[0].length);
	}
	const codeHold = [];
	const withCodeHeld = body.replace(/```[\s\S]*?```/g, (full) => {
		const i = codeHold.length;
		codeHold.push(full);
		return `%%CODE${i}%%`;
	}).replace(/`[^`\n]+`/g, (full) => {
		const i = codeHold.length;
		codeHold.push(full);
		return `%%CODE${i}%%`;
	});
	const placeholders = [];
	const forMarked = withCodeHeld.replace(/\[\[([^\]]+)\]\]/g, (full) => {
		const i = placeholders.length;
		placeholders.push(full);
		return `%%WIKI${i}%%`;
	}).replace(/%%CODE(\d+)%%/g, (_, n) => {
		return codeHold[Number(n)] ?? "";
	});
	let html = marked.parse(forMarked, { async: false });
	html = html.replace(/%%WIKI(\d+)%%/g, (_, n) => {
		const inner = (placeholders[Number(n)] ?? "").slice(2, -2);
		const pipe = inner.indexOf("|");
		const target = pipe >= 0 ? inner.slice(0, pipe).trim() : inner.trim();
		const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : target;
		return `<span data-wikilink="${escapeAttr(target)}" data-alias="${escapeAttr(alias)}" class="wikilink-pill">${escapeHtml(alias)}</span>`;
	});
	html = normalizeTaskListsForTipTap(html);
	html = annotateBulletListsFromMarkdown(body, html);
	if (frontmatterHtml) return frontmatterHtml + (html || "<p></p>");
	return html || "<p></p>";
}
/** Alias used by Visual editor */
var markdownWithWikilinksToHtml = markdownToHtml;
/**
* TipTap DOM / HTML → clean Markdown for Source + disk.
*/
function htmlToMarkdown(html) {
	if (!html || !html.trim()) return "\n";
	const cleaned = html.replace(/<p><\/p>/g, "").replace(/<br\s*class="ProseMirror-trailingBreak"\s*\/?>/gi, "");
	return turndown.turndown(cleaned).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
/** Serialize live editor root element → Markdown */
function htmlDocToMarkdown(root) {
	const clone = root.cloneNode(true);
	clone.querySelectorAll(".ProseMirror-trailingBreak, .ProseMirror-separator").forEach((n) => n.remove());
	clone.querySelectorAll("li[data-type=\"taskItem\"]").forEach((li) => {
		const input = li.querySelector("input[type=\"checkbox\"]");
		if (input) li.setAttribute("data-checked", input.checked ? "true" : "false");
	});
	return htmlToMarkdown(clone.innerHTML);
}
function extractOutline(md) {
	const lines = md.split("\n");
	const out = [];
	let pos = 0;
	for (const line of lines) {
		const m = /^(#{1,6})\s+(.+)$/.exec(line);
		if (m) out.push({
			level: m[1].length,
			text: m[2].trim(),
			pos
		});
		pos += line.length + 1;
	}
	return out;
}
function previewSnippet(md, max = 120) {
	const plain = md.replace(/^#+\s+/gm, "").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1").replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*_~>#-]/g, "").replace(/\s+/g, " ").trim();
	if (plain.length <= max) return plain;
	return plain.slice(0, max - 1) + "…";
}
var visualFlush = null;
var sourceFlush = null;
var flushing = false;
function registerVisualFlush(fn) {
	visualFlush = fn;
}
function registerSourceFlush(fn) {
	sourceFlush = fn;
}
/** Flush active editors — must run before mode or note switches */
function flushActiveEditors() {
	if (flushing) return;
	flushing = true;
	const v = visualFlush;
	const s = sourceFlush;
	try {
		try {
			v?.();
		} catch {}
		try {
			s?.();
		} catch {}
	} finally {
		flushing = false;
	}
}
var IDB_NAME = "noteapp-vault-handles-v2";
var IDB_STORE = "handles";
var HANDLE_KEY = "current";
var RECENTS_KEY$1 = "recents";
function isFileSystemAccessSupported() {
	return typeof window !== "undefined" && "showDirectoryPicker" in window;
}
function openIdb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(IDB_NAME, 2);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}
async function saveDirectoryHandle(handle, meta) {
	const db = await openIdb();
	await new Promise((resolve, reject) => {
		const tx = db.transaction(IDB_STORE, "readwrite");
		tx.objectStore(IDB_STORE).put({
			handle,
			meta,
			savedAt: Date.now()
		}, HANDLE_KEY);
		const getReq = tx.objectStore(IDB_STORE).get(RECENTS_KEY$1);
		getReq.onsuccess = () => {
			const map = getReq.result || {};
			map[meta.id] = {
				handle,
				meta
			};
			tx.objectStore(IDB_STORE).put(map, RECENTS_KEY$1);
		};
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	db.close();
}
async function loadDirectoryHandle() {
	try {
		const db = await openIdb();
		const row = await new Promise((resolve, reject) => {
			const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(HANDLE_KEY);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		db.close();
		if (!row?.handle) return null;
		return row;
	} catch {
		return null;
	}
}
async function loadRecentHandle(id) {
	try {
		const db = await openIdb();
		const map = await new Promise((resolve, reject) => {
			const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(RECENTS_KEY$1);
			req.onsuccess = () => resolve(req.result || {});
			req.onerror = () => reject(req.error);
		});
		db.close();
		return map[id]?.handle ?? null;
	} catch {
		return null;
	}
}
async function clearDirectoryHandle() {
	try {
		const db = await openIdb();
		await new Promise((resolve, reject) => {
			const tx = db.transaction(IDB_STORE, "readwrite");
			tx.objectStore(IDB_STORE).delete(HANDLE_KEY);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		db.close();
	} catch {}
}
async function ensurePermission(handle, mode = "readwrite") {
	try {
		const opts = { mode };
		if (await handle.queryPermission?.(opts) === "granted") return true;
		return await handle.requestPermission?.(opts) === "granted";
	} catch {
		return false;
	}
}
function nodeId$1(path) {
	return "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}
var SKIP_DIRS$1 = /* @__PURE__ */ new Set([
	".git",
	".noteapp",
	"node_modules",
	".trash",
	".obsidian",
	".vscode",
	".idea"
]);
async function walkCollect(root, onFile, onDir) {
	async function walk(dir, relPath) {
		for await (const [name, handle] of dir.entries()) {
			if (name === ".DS_Store" || name === "Thumbs.db") continue;
			if (handle.kind === "directory") {
				if (SKIP_DIRS$1.has(name) || name.startsWith(".")) continue;
				const path = relPath ? pathJoin(relPath, name) : name;
				onDir(path, name, relPath);
				await walk(handle, path);
			} else if (handle.kind === "file" && name.toLowerCase().endsWith(".md")) {
				const path = relPath ? pathJoin(relPath, name) : name;
				const fh = handle;
				await onFile(path, name, relPath, await fh.getFile(), fh);
			}
		}
	}
	await walk(root, "");
}
async function scanVault(root) {
	const nodes = {};
	const rootIds = [];
	const signatures = {};
	const folderIds = /* @__PURE__ */ new Map();
	await walkCollect(root, async (path, name, parentPath, file) => {
		const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
		const id = nodeId$1(path);
		const content = await file.text();
		nodes[id] = {
			id,
			path,
			name,
			kind: "note",
			parentId,
			mtime: file.lastModified,
			content
		};
		signatures[path] = `${file.lastModified}:${file.size}`;
		if (!parentPath) rootIds.push(id);
	}, (path, name, parentPath) => {
		const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
		const id = nodeId$1(path);
		folderIds.set(path, id);
		nodes[id] = {
			id,
			path,
			name,
			kind: "folder",
			parentId,
			mtime: Date.now()
		};
		if (!parentPath) rootIds.push(id);
	});
	rootIds.sort((a, b) => {
		const na = nodes[a];
		const nb = nodes[b];
		if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
		return na.name.localeCompare(nb.name);
	});
	return {
		nodes,
		rootIds,
		signatures
	};
}
async function incrementalRescan(root, prev) {
	const nextSigs = await scanSignatures(root);
	const changedPaths = [];
	const prevByPath = new Map(Object.values(prev.nodes).filter((n) => n.kind === "note").map((n) => [n.path, n]));
	const allPaths = /* @__PURE__ */ new Set([...Object.keys(prev.signatures), ...Object.keys(nextSigs)]);
	for (const p of allPaths) if (prev.signatures[p] !== nextSigs[p]) changedPaths.push(p);
	if (Object.keys(nextSigs).length === 0 || changedPaths.length > 40 || Math.abs(Object.keys(nextSigs).length - Object.keys(prev.signatures).length) > 15) {
		const scan = await scanVault(root);
		return {
			scan,
			changedPaths: Object.keys(scan.signatures)
		};
	}
	const notePaths = Object.keys(nextSigs);
	const folderPaths = /* @__PURE__ */ new Set();
	for (const p of notePaths) {
		const parts = p.split("/");
		for (let i = 1; i < parts.length; i++) folderPaths.add(parts.slice(0, i).join("/"));
	}
	const nodes = {};
	const rootIds = [];
	const folderIds = /* @__PURE__ */ new Map();
	const sortedFolders = [...folderPaths].sort((a, b) => a.split("/").length - b.split("/").length);
	for (const path of sortedFolders) {
		const name = path.split("/").pop();
		const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
		const id = nodeId$1(path);
		folderIds.set(path, id);
		nodes[id] = {
			id,
			path,
			name,
			kind: "folder",
			parentId,
			mtime: Date.now()
		};
		if (!parentPath) rootIds.push(id);
	}
	for (const path of notePaths) {
		const name = path.split("/").pop();
		const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
		const id = nodeId$1(path);
		let content;
		let mtime;
		if (prev.signatures[path] === nextSigs[path] && prevByPath.has(path)) {
			const old = prevByPath.get(path);
			content = old.content ?? "";
			mtime = old.mtime;
		} else {
			const file = await readFileAtPath(root, path);
			content = await file.text();
			mtime = file.lastModified;
		}
		nodes[id] = {
			id,
			path,
			name,
			kind: "note",
			parentId,
			mtime,
			content
		};
		if (!parentPath) rootIds.push(id);
	}
	rootIds.sort((a, b) => {
		const na = nodes[a];
		const nb = nodes[b];
		if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
		return na.name.localeCompare(nb.name);
	});
	return {
		scan: {
			nodes,
			rootIds,
			signatures: nextSigs
		},
		changedPaths
	};
}
async function readFileAtPath(root, path) {
	const parts = path.split("/").filter(Boolean);
	const fileName = parts.pop();
	let dir = root;
	for (const part of parts) dir = await dir.getDirectoryHandle(part);
	return (await dir.getFileHandle(fileName)).getFile();
}
async function getDirAtPath(root, dirPath, create = false) {
	if (!dirPath) return root;
	const parts = dirPath.split("/").filter(Boolean);
	let cur = root;
	for (const part of parts) cur = await cur.getDirectoryHandle(part, { create });
	return cur;
}
async function writeNoteFile(root, path, content) {
	const parts = path.split("/").filter(Boolean);
	const fileName = parts.pop();
	const writable = await (await (await getDirAtPath(root, parts.join("/"), true)).getFileHandle(fileName, { create: true })).createWritable();
	await writable.write(content);
	await writable.close();
}
async function writeBinaryFile(root, path, data) {
	const parts = path.split("/").filter(Boolean);
	const fileName = parts.pop();
	const writable = await (await (await getDirAtPath(root, parts.join("/"), true)).getFileHandle(fileName, { create: true })).createWritable();
	await writable.write(data);
	await writable.close();
}
async function readBinaryFile(root, path) {
	return await readFileAtPath(root, path);
}
async function createFolderOnDisk(root, path) {
	await getDirAtPath(root, path, true);
}
async function deletePathOnDisk(root, path, kind) {
	const parts = path.split("/").filter(Boolean);
	const name = parts.pop();
	await (await getDirAtPath(root, parts.join("/"), false)).removeEntry(name, { recursive: kind === "folder" });
}
async function renamePathOnDisk(root, oldPath, newPath, kind, content) {
	if (kind === "note") {
		let text = content;
		if (text == null) text = await (await readFileAtPath(root, oldPath)).text();
		await writeNoteFile(root, newPath, text);
		await deletePathOnDisk(root, oldPath, "note");
		return;
	}
	const oldParts = oldPath.split("/").filter(Boolean);
	const oldName = oldParts.pop();
	const parent = await getDirAtPath(root, oldParts.join("/"), false);
	const oldDir = await parent.getDirectoryHandle(oldName);
	await getDirAtPath(root, newPath, true);
	for await (const [name, handle] of oldDir.entries()) {
		const from = pathJoin(oldPath, name);
		const to = pathJoin(newPath, name);
		if (handle.kind === "file") await writeNoteFile(root, to, await (await handle.getFile()).text());
		else await renamePathOnDisk(root, from, to, "folder");
	}
	await parent.removeEntry(oldName, { recursive: true });
}
async function pickVaultFolder() {
	if (!isFileSystemAccessSupported()) return null;
	try {
		return await window.showDirectoryPicker({
			id: "noteapp-vault",
			mode: "readwrite",
			startIn: "documents"
		});
	} catch {
		return null;
	}
}
async function scanSignatures(root) {
	const signatures = {};
	await walkCollect(root, async (path, _name, _pp, file) => {
		signatures[path] = `${file.lastModified}:${file.size}`;
	}, () => {});
	return signatures;
}
function signaturesChanged(a, b) {
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return true;
	for (const k of keysA) if (a[k] !== b[k]) return true;
	return false;
}
var ROOT_KEY = "nexus-desktop-vault-root";
var RECENTS_KEY = "nexus-desktop-vault-recents";
var SKIP_DIRS = /* @__PURE__ */ new Set([
	".git",
	".noteapp",
	"node_modules",
	".trash",
	".obsidian",
	".vscode",
	".idea",
	"src-tauri",
	"dist",
	"dist-desktop",
	"target"
]);
function nodeId(path) {
	return "desk_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}
function getDesktopVaultRoot() {
	try {
		return localStorage.getItem(ROOT_KEY);
	} catch {
		return null;
	}
}
function setDesktopVaultRoot(root) {
	try {
		if (root) localStorage.setItem(ROOT_KEY, root);
		else localStorage.removeItem(ROOT_KEY);
	} catch {}
}
function loadDesktopRecents() {
	try {
		const raw = localStorage.getItem(RECENTS_KEY);
		if (!raw) return [];
		return JSON.parse(raw);
	} catch {
		return [];
	}
}
function pushDesktopRecent(entry) {
	const list = loadDesktopRecents().filter((r) => r.id !== entry.id);
	list.unshift(entry);
	try {
		localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 10)));
	} catch {}
}
function basename(p) {
	const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
	return parts[parts.length - 1] || p;
}
/** Join vault root + relative POSIX path (macOS / Linux; Windows uses \\ roots). */
function joinRoot(root, rel) {
	if (!rel) return root;
	const sep = /^[A-Za-z]:[\\/]/.test(root) || root.startsWith("\\\\") ? "\\" : "/";
	return `${root.replace(/[/\\]+$/, "")}${sep}${rel.replace(/^[/\\]+/, "").replace(/[/\\]+/g, sep)}`;
}
async function pickDesktopVaultFolder(title = "Open Nexus Vault", opts) {
	const { open } = await import("../_libs/tauri-apps__plugin-dialog.mjs").then((n) => n.t);
	const selected = await open({
		directory: true,
		multiple: false,
		recursive: true,
		title
	});
	if (selected == null) return null;
	const root = Array.isArray(selected) ? selected[0] : selected;
	if (!root || typeof root !== "string") return null;
	if (opts?.remember !== false) {
		setDesktopVaultRoot(root);
		pushDesktopRecent({
			id: "desk-" + basename(root).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase(),
			name: basename(root),
			path: root
		});
	}
	return root;
}
/** Create a new empty vault directory with a Welcome note. Returns absolute path. */
async function createNewDesktopVault(parentDir, vaultName, welcomeMarkdown) {
	const { mkdir, writeTextFile, exists } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	const sep = /^[A-Za-z]:[\\/]/.test(parentDir) || parentDir.startsWith("\\\\") ? "\\" : "/";
	const cleanParent = parentDir.replace(/[/\\]+$/, "");
	const safe = vaultName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").slice(0, 80).trim() || "Nexus Vault";
	let vaultPath = `${cleanParent}${sep}${safe}`;
	let n = 2;
	while (await exists(vaultPath)) {
		vaultPath = `${cleanParent}${sep}${safe} ${n}`;
		n += 1;
		if (n > 50) throw new Error("Could not find a free vault folder name");
	}
	await mkdir(vaultPath, { recursive: true });
	await writeTextFile(`${vaultPath}${sep}Welcome.md`, welcomeMarkdown);
	setDesktopVaultRoot(vaultPath);
	pushDesktopRecent({
		id: "desk-" + basename(vaultPath).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase(),
		name: basename(vaultPath),
		path: vaultPath
	});
	return vaultPath;
}
/** Reveal a path in Finder (macOS) / Explorer (Windows). */
async function revealDesktopPath(path) {
	const { revealItemInDir } = await import("../_libs/tauri-apps__plugin-opener.mjs").then((n) => n.t);
	await revealItemInDir(path);
}
async function walkNotes(root, relDir, onFile, onDir) {
	const { readDir, stat } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	const absDir = joinRoot(root, relDir);
	let entries;
	try {
		entries = await readDir(absDir);
	} catch (err) {
		console.warn("[nexus] readDir failed", absDir, err);
		return;
	}
	for (const entry of entries) {
		const name = entry.name;
		if (!name || name === ".DS_Store" || name === "Thumbs.db") continue;
		if (entry.isDirectory) {
			if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
			const rel = relDir ? pathJoin(relDir, name) : name;
			onDir(rel, name, relDir);
			await walkNotes(root, rel, onFile, onDir);
		} else if (entry.isFile && name.toLowerCase().endsWith(".md")) {
			const rel = relDir ? pathJoin(relDir, name) : name;
			const abs = joinRoot(root, rel);
			try {
				const meta = await stat(abs);
				await onFile(rel, name, relDir, abs, meta.mtime ? typeof meta.mtime === "number" ? meta.mtime : new Date(meta.mtime).getTime() : Date.now(), Number(meta.size ?? 0));
			} catch (err) {
				console.warn("[nexus] stat/read skip", abs, err);
			}
		}
	}
}
async function scanDesktopVault(root) {
	const { readTextFile } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	const nodes = {};
	const rootIds = [];
	const signatures = {};
	const folderIds = /* @__PURE__ */ new Map();
	await walkNotes(root, "", async (path, name, parentPath, abs, mtime, size) => {
		const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
		const id = nodeId(path);
		let content = "";
		try {
			content = await readTextFile(abs);
		} catch (err) {
			console.warn("[nexus] readTextFile failed", abs, err);
			content = "";
		}
		nodes[id] = {
			id,
			path,
			name,
			kind: "note",
			parentId,
			mtime,
			content
		};
		signatures[path] = `${mtime}:${size}`;
		if (!parentPath) rootIds.push(id);
	}, (path, name, parentPath) => {
		const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
		const id = nodeId(path);
		folderIds.set(path, id);
		nodes[id] = {
			id,
			path,
			name,
			kind: "folder",
			parentId,
			mtime: Date.now()
		};
		if (!parentPath) rootIds.push(id);
	});
	rootIds.sort((a, b) => {
		const na = nodes[a];
		const nb = nodes[b];
		if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
		return na.name.localeCompare(nb.name);
	});
	return {
		nodes,
		rootIds,
		signatures
	};
}
async function scanDesktopSignatures(root) {
	const signatures = {};
	await walkNotes(root, "", async (path, _n, _p, _a, mtime, size) => {
		signatures[path] = `${mtime}:${size}`;
	}, () => {});
	return signatures;
}
async function writeDesktopNote(root, relPath, content) {
	const { writeTextFile, mkdir } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
	parts.pop();
	if (parts.length) await mkdir(joinRoot(root, parts.join("/")), { recursive: true });
	await writeTextFile(joinRoot(root, relPath), content);
}
async function createDesktopFolder(root, relPath) {
	const { mkdir } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	await mkdir(joinRoot(root, relPath), { recursive: true });
}
async function deleteDesktopPath(root, relPath, kind) {
	const { remove } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	await remove(joinRoot(root, relPath), { recursive: kind === "folder" });
}
async function renameDesktopPath(root, oldRel, newRel, kind, content) {
	const { rename, writeTextFile } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	const parentParts = newRel.replace(/\\/g, "/").split("/").filter(Boolean);
	parentParts.pop();
	if (parentParts.length) await createDesktopFolder(root, parentParts.join("/"));
	if (kind === "note" && content != null) await writeTextFile(joinRoot(root, oldRel), content);
	await rename(joinRoot(root, oldRel), joinRoot(root, newRel));
}
async function openDesktopVaultAt(root) {
	setDesktopVaultRoot(root);
	return scanDesktopVault(root);
}
/**
* Incremental desktop rescan — only re-read note bodies whose mtime:size signature changed.
* Falls back to full scan on structural churn (many adds/removes).
*/
async function incrementalScanDesktopVault(root, prev) {
	const { readTextFile, stat } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	const nextSigs = await scanDesktopSignatures(root);
	const changedPaths = [];
	const prevByPath = new Map(Object.values(prev.nodes).filter((n) => n.kind === "note").map((n) => [n.path, n]));
	const allPaths = /* @__PURE__ */ new Set([...Object.keys(prev.signatures), ...Object.keys(nextSigs)]);
	for (const p of allPaths) if (prev.signatures[p] !== nextSigs[p]) changedPaths.push(p);
	if (Object.keys(nextSigs).length === 0 || changedPaths.length > 40 || Math.abs(Object.keys(nextSigs).length - Object.keys(prev.signatures).length) > 15) {
		const scan = await scanDesktopVault(root);
		return {
			scan,
			changedPaths: Object.keys(scan.signatures)
		};
	}
	const notePaths = Object.keys(nextSigs);
	const folderPaths = /* @__PURE__ */ new Set();
	for (const p of notePaths) {
		const parts = p.split("/");
		for (let i = 1; i < parts.length; i++) folderPaths.add(parts.slice(0, i).join("/"));
	}
	const nodes = {};
	const rootIds = [];
	const folderIds = /* @__PURE__ */ new Map();
	const sortedFolders = [...folderPaths].sort((a, b) => a.split("/").length - b.split("/").length);
	for (const path of sortedFolders) {
		const name = path.split("/").pop();
		const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
		const id = nodeId(path);
		folderIds.set(path, id);
		nodes[id] = {
			id,
			path,
			name,
			kind: "folder",
			parentId,
			mtime: Date.now()
		};
		if (!parentPath) rootIds.push(id);
	}
	for (const path of notePaths) {
		const name = path.split("/").pop();
		const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
		const parentId = parentPath ? folderIds.get(parentPath) ?? null : null;
		const id = nodeId(path);
		let content;
		let mtime;
		if (prev.signatures[path] === nextSigs[path] && prevByPath.has(path)) {
			const old = prevByPath.get(path);
			content = old.content ?? "";
			mtime = old.mtime;
		} else {
			const abs = joinRoot(root, path);
			try {
				content = await readTextFile(abs);
				const meta = await stat(abs);
				mtime = meta.mtime ? typeof meta.mtime === "number" ? meta.mtime : new Date(meta.mtime).getTime() : Date.now();
			} catch (err) {
				console.warn("[nexus] incremental read failed", abs, err);
				content = prevByPath.get(path)?.content ?? "";
				mtime = Date.now();
			}
		}
		nodes[id] = {
			id,
			path,
			name,
			kind: "note",
			parentId,
			mtime,
			content
		};
		if (!parentPath) rootIds.push(id);
	}
	rootIds.sort((a, b) => {
		const na = nodes[a];
		const nb = nodes[b];
		if (na.kind !== nb.kind) return na.kind === "folder" ? -1 : 1;
		return na.name.localeCompare(nb.name);
	});
	return {
		scan: {
			nodes,
			rootIds,
			signatures: nextSigs
		},
		changedPaths
	};
}
/** Poll-based watcher for desktop (no FileSystemObserver in WKWebView) */
function startDesktopWatch(root, onChange, intervalMs = 900) {
	let lastSig = "";
	let lastScan = null;
	let suppressUntil = 0;
	let timer = null;
	let busy = false;
	const tick = async () => {
		if (busy || Date.now() < suppressUntil) return;
		busy = true;
		try {
			const sigs = await scanDesktopSignatures(root);
			const hash = JSON.stringify(sigs);
			if (hash === lastSig) return;
			lastSig = hash;
			if (lastScan) {
				const { scan } = await incrementalScanDesktopVault(root, lastScan);
				lastScan = scan;
				onChange(scan);
			} else {
				const scan = await scanDesktopVault(root);
				lastScan = scan;
				onChange(scan);
			}
		} catch (err) {
			console.warn("[nexus] desktop watch tick failed", err);
		} finally {
			busy = false;
		}
	};
	(async () => {
		try {
			const sigs = await scanDesktopSignatures(root);
			lastSig = JSON.stringify(sigs);
			lastScan = await scanDesktopVault(root);
		} catch {
			lastSig = "";
			lastScan = null;
		}
		timer = setInterval(() => void tick(), intervalMs);
	})();
	return {
		stop: () => {
			if (timer) clearInterval(timer);
			timer = null;
		},
		acknowledge: () => {
			suppressUntil = Date.now() + 1800;
			scanDesktopSignatures(root).then((s) => {
				lastSig = JSON.stringify(s);
			}).catch(() => {});
		}
	};
}
async function writeDesktopBinary(root, relPath, data) {
	const { writeFile, mkdir } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	const parts = relPath.replace(/\\/g, "/").split("/").filter(Boolean);
	parts.pop();
	if (parts.length) await mkdir(joinRoot(root, parts.join("/")), { recursive: true });
	await writeFile(joinRoot(root, relPath), data);
}
async function readDesktopBinary(root, relPath) {
	const { readFile } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	return readFile(joinRoot(root, relPath));
}
/** Native Finder/Explorer image picker (desktop shell). */
async function pickDesktopImageFile() {
	const { open } = await import("../_libs/tauri-apps__plugin-dialog.mjs").then((n) => n.t);
	const selected = await open({
		multiple: false,
		filters: [{
			name: "Images",
			extensions: [
				"png",
				"jpg",
				"jpeg",
				"gif",
				"webp",
				"svg",
				"bmp",
				"avif"
			]
		}],
		title: "Choose image"
	});
	if (selected == null) return null;
	const path = Array.isArray(selected) ? selected[0] : selected;
	if (!path || typeof path !== "string") return null;
	const { readFile } = await import("../_libs/tauri-apps__plugin-fs.mjs").then((n) => n.t);
	const data = await readFile(path);
	return {
		path,
		name: path.replace(/\\/g, "/").split("/").pop() || "image.png",
		data
	};
}
function detectPlatform() {
	if (typeof window === "undefined") return "unknown";
	const w = window;
	if (w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri === true) return "tauri";
	try {
		if (typeof window.__TAURI_OS_PLUGIN_INTERNALS__ !== "undefined") return "tauri";
	} catch {}
	return "web";
}
function isDesktopShell() {
	return detectPlatform() === "tauri";
}
/** Async confirm (preferred when opening vaults / menus) */
async function confirmDesktopShell() {
	if (isDesktopShell()) return true;
	try {
		const { isTauri } = await import("../_libs/tauri-apps__api.mjs").then((n) => n.i);
		return isTauri();
	} catch {
		return false;
	}
}
/** Local filesystem folder open available on this runtime */
function canOpenLocalVaultFolder() {
	if (typeof window === "undefined") return false;
	if (isDesktopShell()) return true;
	return "showDirectoryPicker" in window;
}
function ensureMdPath(path) {
	const clean = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
	if (!clean) return "Untitled.md";
	return clean.toLowerCase().endsWith(".md") ? clean : `${clean}.md`;
}
function titleFromPath(path) {
	return (path.split("/").pop() || "Untitled").replace(/\.md$/i, "");
}
/** Ensure parent folder paths exist for a set of file paths. */
function collectFolderPaths(paths) {
	const set = /* @__PURE__ */ new Set();
	for (const p of paths) {
		const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
		const folderParts = parts[parts.length - 1]?.toLowerCase().endsWith(".md") ? parts.slice(0, -1) : parts;
		let acc = "";
		for (const part of folderParts) {
			acc = acc ? `${acc}/${part}` : part;
			set.add(acc);
		}
	}
	return Array.from(set).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
}
function defaultNoteContent(title, body) {
	if (body != null && body.length > 0) {
		if (/^#\s+/m.test(body)) return body;
		return `# ${title}\n\n${body.replace(/^\n+/, "")}`;
	}
	return `# ${title}\n\n`;
}
function uniquePath(desired, existing) {
	if (!existing.has(desired)) return desired;
	const isNote = desired.toLowerCase().endsWith(".md");
	const stem = isNote ? desired.slice(0, -3) : desired;
	const ext = isNote ? ".md" : "";
	let i = 1;
	while (existing.has(`${stem} ${i}${ext}`)) i++;
	return `${stem} ${i}${ext}`;
}
function pathToName(path) {
	return path.split("/").pop() || path;
}
function buildPathIndex(nodes) {
	const m = /* @__PURE__ */ new Map();
	for (const n of Object.values(nodes)) m.set(n.path, n.id);
	return m;
}
var ACCENT_PRESETS = {
	cyan: {
		label: "Cyan",
		hex: "#00C8FF"
	},
	violet: {
		label: "Violet",
		hex: "#7B61FF"
	},
	emerald: {
		label: "Emerald",
		hex: "#30D158"
	},
	amber: {
		label: "Amber",
		hex: "#FF9F0A"
	},
	rose: {
		label: "Rose",
		hex: "#FF453A"
	}
};
function osPrefersReducedMotion() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	try {
		return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	} catch {
		return false;
	}
}
var DEFAULT_PREFS = {
	accentPreset: "cyan",
	accentCustom: "#00C8FF",
	density: "comfortable",
	graphParticles: true,
	defaultEditorMode: "visual",
	editorFontSize: 15,
	spellCheck: false,
	defaultGraphView: "panel",
	physicsIntensity: "standard",
	confirmDelete: true,
	openLastVault: true,
	openTodayOnLaunch: true,
	launchNoteMode: "today",
	focusMode: false,
	reducedMotion: false
};
var NEXUS_VERSION = "1.0.0";
var SHORTCUTS = [
	{
		keys: "⌘ K",
		action: "Search / command palette"
	},
	{
		keys: "⌘ O",
		action: "Open vault folder"
	},
	{
		keys: "⌘ ,",
		action: "Open Settings"
	},
	{
		keys: "⌘ .",
		action: "Focus / zen mode"
	},
	{
		keys: "⌘ E",
		action: "Toggle Visual / Source"
	},
	{
		keys: "⌘ G",
		action: "Toggle graph fullscreen"
	},
	{
		keys: "⌘ N",
		action: "New note"
	},
	{
		keys: "⌘ D",
		action: "Today's daily note"
	},
	{
		keys: "⌘ S",
		action: "Save (flush)"
	},
	{
		keys: "⌘ \\",
		action: "Toggle left sidebar"
	},
	{
		keys: "⌘ ⌥ \\",
		action: "Toggle right panel"
	},
	{
		keys: "⌘ [ / ]",
		action: "Note history back / forward"
	},
	{
		keys: "Esc",
		action: "Close overlay / exit graph"
	},
	{
		keys: "⌘ ⌫",
		action: "Delete current note"
	}
];
function hexToRgb(hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = parseInt(m[1], 16);
	return {
		r: n >> 16 & 255,
		g: n >> 8 & 255,
		b: n & 255
	};
}
function resolveAccentHex(prefs) {
	if (prefs.accentPreset === "custom") return hexToRgb(prefs.accentCustom) ? normalizeHex(prefs.accentCustom) : ACCENT_PRESETS.cyan.hex;
	return ACCENT_PRESETS[prefs.accentPreset].hex;
}
function normalizeHex(hex) {
	const h = hex.trim();
	if (h.startsWith("#")) return h.toUpperCase();
	return `#${h.toUpperCase()}`;
}
function isValidHex(hex) {
	return Boolean(hexToRgb(hex));
}
/** Apply prefs to CSS variables on :root for live theming */
function applyPrefsToDom(prefs) {
	if (typeof document === "undefined") return;
	const root = document.documentElement;
	const hex = resolveAccentHex(prefs);
	const rgb = hexToRgb(hex) ?? {
		r: 0,
		g: 200,
		b: 255
	};
	root.style.setProperty("--accent", hex);
	root.style.setProperty("--accent-dim", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
	root.style.setProperty("--accent-glow", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
	root.style.setProperty("--shadow-elevated", `0 8px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.04)`);
	root.style.setProperty("--editor-font-size", `${prefs.editorFontSize}px`);
	root.style.setProperty("--ui-density", prefs.density === "compact" ? "0.85" : "1");
	root.style.setProperty("--tree-item-pad-y", prefs.density === "compact" ? "3px" : "5px");
	root.dataset.density = prefs.density;
	root.dataset.reducedMotion = prefs.reducedMotion ? "true" : "false";
	root.dataset.focusMode = prefs.focusMode ? "true" : "false";
	root.style.setProperty("--color-accent", hex.toLowerCase());
}
function snapshotPrefs(s) {
	return {
		accentPreset: s.accentPreset,
		accentCustom: s.accentCustom,
		density: s.density,
		graphParticles: s.graphParticles,
		defaultEditorMode: s.defaultEditorMode,
		editorFontSize: s.editorFontSize,
		spellCheck: s.spellCheck,
		defaultGraphView: s.defaultGraphView,
		physicsIntensity: s.physicsIntensity,
		confirmDelete: s.confirmDelete,
		openLastVault: s.openLastVault,
		openTodayOnLaunch: s.openTodayOnLaunch,
		launchNoteMode: s.launchNoteMode,
		focusMode: s.focusMode,
		reducedMotion: s.reducedMotion
	};
}
function normalizeLaunchNoteMode(raw, openTodayOnLaunch) {
	if (raw === "today" || raw === "last" || raw === "smart") return raw;
	return openTodayOnLaunch ? "today" : "last";
}
var usePrefsStore = create()(persist((set, get) => ({
	...DEFAULT_PREFS,
	settingsOpen: false,
	setSettingsOpen: (open) => set({ settingsOpen: open }),
	toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),
	updatePrefs: (patch) => {
		const nextPatch = { ...patch };
		if (patch.launchNoteMode != null && patch.openTodayOnLaunch == null) nextPatch.openTodayOnLaunch = patch.launchNoteMode === "today" || patch.launchNoteMode === "smart";
		if (patch.openTodayOnLaunch != null && patch.launchNoteMode == null) nextPatch.launchNoteMode = patch.openTodayOnLaunch ? "today" : "last";
		set(nextPatch);
		applyPrefsToDom({
			...get(),
			...nextPatch
		});
	},
	resetPrefs: () => {
		set({ ...DEFAULT_PREFS });
		applyPrefsToDom(DEFAULT_PREFS);
	}
}), {
	name: "nexus-prefs-v1",
	partialize: (s) => snapshotPrefs(s),
	merge: (persisted, current) => {
		const p = persisted ?? {};
		const reducedMotion = persisted != null && typeof persisted === "object" && "reducedMotion" in persisted ? Boolean(p.reducedMotion) : osPrefersReducedMotion();
		const openTodayOnLaunch = p.openTodayOnLaunch != null ? Boolean(p.openTodayOnLaunch) : DEFAULT_PREFS.openTodayOnLaunch;
		const launchNoteMode = normalizeLaunchNoteMode(p.launchNoteMode, openTodayOnLaunch);
		return {
			...current,
			...p,
			reducedMotion,
			openTodayOnLaunch,
			launchNoteMode
		};
	},
	onRehydrateStorage: () => (state) => {
		if (state) applyPrefsToDom(state);
	}
}));
/** Snapshot helpers for non-React code */
function getPrefs() {
	return snapshotPrefs(usePrefsStore.getState());
}
var PREF_KEY = "nexus-cloud-pref-v2";
function providerLabel(p) {
	if (p === "dropbox") return "Dropbox";
	if (p === "google") return "Google Drive";
	return "OneDrive";
}
function providerSyncHint(p) {
	if (p === "dropbox") return "Open your Dropbox folder (or a subfolder) as the vault after desktop sync is on.";
	if (p === "google") return "Open the Google Drive for desktop stream/mirror folder as the vault.";
	return "Open your OneDrive folder as the vault after Files On-Demand sync.";
}
var CLOUD_SYNC_HINT = "Best path: enable Dropbox / Drive / OneDrive desktop sync, then Open folder as vault. Zero accounts in Nexus. Notes stay ordinary Markdown.";
function loadCloudSession() {
	try {
		const raw = localStorage.getItem(PREF_KEY);
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
function saveCloudSession(session) {
	if (!session) localStorage.removeItem(PREF_KEY);
	else localStorage.setItem(PREF_KEY, JSON.stringify(session));
}
/** Mark that the user prefers a given provider's synced folder (no OAuth). */
function preferSyncedProvider(provider) {
	const session = {
		provider,
		label: providerLabel(provider) + " (synced folder)",
		connectedAt: Date.now(),
		method: "synced-folder"
	};
	saveCloudSession(session);
	return session;
}
function disconnectCloud() {
	saveCloudSession(null);
}
/** @deprecated OAuth intentionally not used — use preferSyncedProvider */
async function beginCloudOAuth(provider) {
	return {
		ok: true,
		session: preferSyncedProvider(provider),
		reason: providerSyncHint(provider)
	};
}
function formatDateISO(d = /* @__PURE__ */ new Date()) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDateLong(d = /* @__PURE__ */ new Date()) {
	return d.toLocaleDateString(void 0, {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric"
	});
}
/** Calendar date shifted by `delta` days (local time). */
function shiftDate(d, delta) {
	const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	next.setDate(next.getDate() + delta);
	return next;
}
/** Vault-relative path for a daily note */
function dailyNotePath(d = /* @__PURE__ */ new Date()) {
	return `Journal/${formatDateISO(d)}.md`;
}
function dailyNoteTitle(d = /* @__PURE__ */ new Date()) {
	return formatDateISO(d);
}
/**
* Extract open loops from a prior daily note for carry-forward:
* - unchecked task lines `- [ ] ...`
* - non-empty Focus section list items (not checked-done)
*/
function extractCarryForwardItems(markdown) {
	const items = [];
	const seen = /* @__PURE__ */ new Set();
	const push = (line) => {
		const t = line.trim();
		if (!t) return;
		if (seen.has(t)) return;
		seen.add(t);
		items.push(t);
	};
	for (const raw of markdown.split("\n")) {
		const m = /^\s*-\s+\[ \]\s+(.+)$/.exec(raw);
		if (m && m[1].trim()) push(`- [ ] ${m[1].trim()}`);
	}
	const focusMatch = /^##\s+Focus\s*\n([\s\S]*?)(?=^##\s+|\s*$)/m.exec(markdown);
	if (focusMatch) for (const raw of focusMatch[1].split("\n")) {
		if (/^\s*-\s+\[[xX]\]\s+/.test(raw)) continue;
		const unchecked = /^\s*-\s+\[ \]\s+(.+)$/.exec(raw);
		if (unchecked && unchecked[1].trim()) continue;
		const bullet = /^\s*-\s+(?!\[)(.+)$/.exec(raw);
		if (bullet && bullet[1].trim()) push(`- ${bullet[1].trim()}`);
	}
	return items;
}
/** Insert a `## From yesterday` block into a fresh daily note body. */
function injectCarryForward(content, items) {
	if (items.length === 0) return content;
	const block = [
		"## From yesterday",
		"",
		...items,
		""
	].join("\n");
	if (/^##\s+Later\b/m.test(content)) return content.replace(/^##\s+Later\b/m, `${block}\n## Later`);
	if (/^##\s+Notes\b/m.test(content)) return content.replace(/^##\s+Notes\b/m, `${block}\n## Notes`);
	return `${content.trimEnd()}\n\n${block}\n`;
}
/**
* Build today's daily content, optionally carrying open loops from yesterday's body.
*/
function buildDailyNoteContent(date = /* @__PURE__ */ new Date(), yesterdayMarkdown) {
	let content = buildTemplateContent("daily", formatDateLong(date), date);
	if (yesterdayMarkdown) {
		const items = extractCarryForwardItems(yesterdayMarkdown);
		content = injectCarryForward(content, items);
	}
	return content;
}
var NOTE_TEMPLATES = [
	{
		id: "blank",
		label: "Blank note",
		description: "Empty note with a title heading",
		defaultTitle: "Untitled",
		build: ({ title }) => `# ${title}\n\n`
	},
	{
		id: "daily",
		label: "Daily note",
		description: "Today’s page under Journal/",
		defaultTitle: formatDateISO(),
		preferredFolder: "Journal",
		build: ({ date }) => {
			const long = formatDateLong(date);
			const iso = formatDateISO(date);
			return [
				`# ${long}`,
				"",
				`*${iso}*`,
				"",
				"## Focus",
				"",
				"- ",
				"",
				"## Notes",
				"",
				"",
				"## Later",
				"",
				"- ",
				""
			].join("\n");
		}
	},
	{
		id: "meeting",
		label: "Meeting",
		description: "Agenda, notes, actions",
		defaultTitle: "Meeting",
		preferredFolder: "Meetings",
		build: ({ title, date }) => {
			const iso = formatDateISO(date);
			return [
				`# ${title}`,
				"",
				`**Date:** ${iso}`,
				"",
				"## Attendees",
				"",
				"- ",
				"",
				"## Agenda",
				"",
				"1. ",
				"",
				"## Notes",
				"",
				"",
				"## Action items",
				"",
				"- [ ] ",
				""
			].join("\n");
		}
	},
	{
		id: "idea",
		label: "Idea",
		description: "Capture a spark before it fades",
		defaultTitle: "Idea",
		preferredFolder: "Ideas",
		build: ({ title }) => [
			`# ${title}`,
			"",
			"## The idea",
			"",
			"",
			"## Why it matters",
			"",
			"",
			"## Next step",
			"",
			"- [ ] ",
			"",
			"## Related",
			"",
			"- [[",
			""
		].join("\n")
	},
	{
		id: "project",
		label: "Project",
		description: "Goals, status, and open loops",
		defaultTitle: "Project",
		preferredFolder: "Projects",
		build: ({ title }) => [
			`# ${title}`,
			"",
			"**Status:** Active",
			"",
			"## Goal",
			"",
			"",
			"## Current focus",
			"",
			"- ",
			"",
			"## Open loops",
			"",
			"- [ ] ",
			"",
			"## Log",
			"",
			""
		].join("\n")
	}
];
function getTemplate(id) {
	return NOTE_TEMPLATES.find((t) => t.id === id) ?? NOTE_TEMPLATES[0];
}
function buildTemplateContent(id, title, date = /* @__PURE__ */ new Date()) {
	return getTemplate(id).build({
		title: title.replace(/\.md$/i, ""),
		date
	});
}
/**
* Visit-based Recent notes — MRU note opens, persisted in localStorage.
*/
var NOTE_VISITS_KEY = "nexus-note-visits-v1";
function loadNoteVisits() {
	if (typeof localStorage === "undefined") return [];
	try {
		const raw = localStorage.getItem(NOTE_VISITS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((x) => typeof x === "string" && x.length > 0).slice(0, 12);
	} catch {
		return [];
	}
}
function pushNoteVisit(id, prev = loadNoteVisits()) {
	const next = [id, ...prev.filter((x) => x !== id)].slice(0, 12);
	if (typeof localStorage !== "undefined") try {
		localStorage.setItem(NOTE_VISITS_KEY, JSON.stringify(next));
	} catch {}
	return next;
}
/**
* Recent note visit history (Wave S4 extract).
* Used by sidebar "Recent" and reserved for Wave H2/F consumers.
* Vault open-recents stay in store localStorage keys (nexus-recent-v1).
*/
var VISIT_KEY = "nexus-visits-v1";
var MAX_VISITS = 40;
function loadVisits() {
	try {
		const raw = localStorage.getItem(VISIT_KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		if (!Array.isArray(list)) return [];
		return list.filter((v) => v && typeof v.vaultId === "string" && typeof v.noteId === "string" && typeof v.path === "string" && typeof v.at === "number");
	} catch {
		return [];
	}
}
function saveVisits(list) {
	try {
		localStorage.setItem(VISIT_KEY, JSON.stringify(list.slice(0, MAX_VISITS)));
	} catch {}
}
/** Record a note open; returns updated full visit list. */
function recordNoteVisit(vaultId, noteId, path) {
	if (!vaultId || !noteId) return loadVisits();
	const list = loadVisits().filter((v) => !(v.vaultId === vaultId && (v.noteId === noteId || v.path === path)));
	list.unshift({
		vaultId,
		noteId,
		path,
		at: Date.now()
	});
	const next = list.slice(0, MAX_VISITS);
	saveVisits(next);
	return next;
}
/**
* Session command recents for the command palette.
* Kept in a module array for in-session speed; also mirrored to sessionStorage
* so a soft reload keeps the last few command ids (optional polish).
*/
var MAX$1 = 8;
var STORAGE_KEY$1 = "nexus-cmd-recents-v1";
function loadPersisted() {
	if (typeof sessionStorage === "undefined") return [];
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY$1);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((x) => typeof x === "string" && x.length > 0).slice(0, MAX$1);
	} catch {
		return [];
	}
}
function persist$1(list) {
	if (typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.setItem(STORAGE_KEY$1, JSON.stringify(list.slice(0, MAX$1)));
	} catch {}
}
/** Recently run command action ids (newest first). */
var recentCommandIds = loadPersisted();
/** Recently visited note ids (newest first) — session-only fallback. */
var recentVisitIds = [];
function pushFront(list, id) {
	const i = list.indexOf(id);
	if (i >= 0) list.splice(i, 1);
	list.unshift(id);
	while (list.length > MAX$1) list.pop();
}
function trackCommand(id) {
	if (!id) return;
	pushFront(recentCommandIds, id);
	persist$1(recentCommandIds);
}
function trackVisit(id) {
	if (!id) return;
	pushFront(recentVisitIds, id);
}
/** Pending query applied the next time the palette opens (e.g. tag chip). */
var pendingCommandQuery = null;
function setPendingCommandQuery(query) {
	pendingCommandQuery = query;
}
function takePendingCommandQuery() {
	const q = pendingCommandQuery;
	pendingCommandQuery = null;
	return q;
}
/**
* Browser-style note navigation stack for ⌘[ / ⌘] back/forward.
* Separate from MRU visits (note-visits / visit-history).
*/
var MAX = 50;
var stack = [];
var index = -1;
/** When true, setActiveNote must not push (history traversal). */
var suppressPush = false;
function pushNav(noteId) {
	if (suppressPush) return;
	if (!noteId) return;
	if (stack[index] === noteId) return;
	if (index >= 0 && index < stack.length - 1) stack = stack.slice(0, index + 1);
	stack.push(noteId);
	if (stack.length > MAX) stack = stack.slice(stack.length - MAX);
	index = stack.length - 1;
}
function canGoBack() {
	return index > 0;
}
function canGoForward() {
	return index >= 0 && index < stack.length - 1;
}
function goBack() {
	if (!canGoBack()) return null;
	index -= 1;
	return stack[index] ?? null;
}
function goForward() {
	if (!canGoForward()) return null;
	index += 1;
	return stack[index] ?? null;
}
/** Run a navigation that should not append to the history stack. */
function withHistoryNav(fn) {
	suppressPush = true;
	try {
		return fn();
	} finally {
		suppressPush = false;
	}
}
/**
* Wave 3 — Pulse activity stream.
* Module-level ring buffer of recent vault events for the right-rail Pulse tab.
*/
var MAX_EVENTS = 50;
var events = [];
var version = 0;
var listeners = /* @__PURE__ */ new Set();
var seq = 0;
function notify() {
	version += 1;
	for (const cb of listeners) try {
		cb();
	} catch {}
}
function makeId$1() {
	seq += 1;
	return `pulse_${Date.now().toString(36)}_${seq}`;
}
/** Push a pulse event (newest first). Partial events get id/at filled. */
function pushPulse(event) {
	const full = {
		id: event.id ?? makeId$1(),
		at: event.at ?? Date.now(),
		kind: event.kind,
		path: event.path,
		title: event.title,
		message: event.message
	};
	events = [full, ...events].slice(0, MAX_EVENTS);
	notify();
	return full;
}
function getPulseEvents() {
	return events;
}
function subscribePulse(cb) {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}
/** Snapshot for useSyncExternalStore — version bumps force re-render. */
function getPulseVersion() {
	return version;
}
/** React hook — re-renders when pulse buffer changes. */
function usePulseEvents() {
	(0, import_react.useSyncExternalStore)(subscribePulse, getPulseVersion, getPulseVersion);
	return getPulseEvents();
}
/** Nexus keys (Wave S5). Dual-read legacy noteapp-* on load; always write nexus-*. */
var STORAGE_KEY = "nexus-vault-v1";
var STORAGE_KEY_LEGACY = "noteapp-vault-v2";
var RECENT_KEY = "nexus-recent-v1";
var RECENT_KEY_LEGACY = "noteapp-recent-v2";
/** Copy legacy noteapp-* → nexus-* once when new key is absent. */
function migrateNamingKeys() {
	try {
		if (!localStorage.getItem(STORAGE_KEY)) {
			const legacy = localStorage.getItem(STORAGE_KEY_LEGACY);
			if (legacy) localStorage.setItem(STORAGE_KEY, legacy);
		}
		if (!localStorage.getItem(RECENT_KEY)) {
			const legacy = localStorage.getItem(RECENT_KEY_LEGACY);
			if (legacy) localStorage.setItem(RECENT_KEY, legacy);
		}
	} catch {}
}
if (typeof window !== "undefined") migrateNamingKeys();
var fsaRoot = null;
var desktopRoot = null;
var desktopWatchAck = null;
var writeQueue = Promise.resolve();
var watcherAck = null;
var lastExternalToastAt = 0;
var lastDiskResyncAt = 0;
var diskWriteError = null;
/** Coalesce rapid create/import storms (agent bulk writes). */
var CREATE_BATCH_MS = 48;
var DISK_ACK_MS = 120;
var EXTERNAL_DEBOUNCE_MS = 80;
var pendingDiskOps = [];
var diskFlushTimer = null;
var externalSnapTimer = null;
var pendingExternal = null;
/** path → fingerprint of external body already shelved as .conflict-* */
var shelvedConflicts = /* @__PURE__ */ new Map();
var stageBuf = null;
var stageTimer = null;
async function resyncFromDiskAfterError() {
	const now = Date.now();
	if (now - lastDiskResyncAt < 1500) return;
	lastDiskResyncAt = now;
	try {
		if (desktopRoot) {
			const scan = await openDesktopVaultAt(desktopRoot);
			useVaultStore.getState().applyExternalSnapshot(scan.nodes, scan.rootIds);
		} else if (fsaRoot) {
			const scan = await scanVault(fsaRoot);
			useVaultStore.getState().applyExternalSnapshot(scan.nodes, scan.rootIds);
		}
	} catch (err) {
		console.error("[vault] resync after write failure failed", err);
	}
}
function reportDiskError(label, err) {
	console.error("[vault] disk write failed", err);
	const msg = err instanceof Error ? err.message : "Unknown disk error";
	diskWriteError = msg;
	queueMicrotask(() => {
		try {
			useVaultStore.getState().setToast(`Could not ${label}: ${msg}`);
			resyncFromDiskAfterError();
		} catch {}
	});
}
function queueDiskWrite(fn, label = "save") {
	writeQueue = writeQueue.then(fn).catch((err) => reportDiskError(label, err));
	return writeQueue;
}
function flushDiskOps() {
	if (diskFlushTimer) {
		clearTimeout(diskFlushTimer);
		diskFlushTimer = null;
	}
	const ops = pendingDiskOps;
	pendingDiskOps = [];
	if (!ops.length) return writeQueue;
	return queueDiskWrite(async () => {
		for (const op of ops) try {
			await op();
		} catch (err) {
			reportDiskError("update vault files", err);
			throw err;
		}
		if (desktopRoot) desktopWatchAck?.();
		else if (fsaRoot && watcherAck) await watcherAck(fsaRoot);
	}, "update vault files");
}
function enqueueDiskOp(op, immediate = false) {
	pendingDiskOps.push(op);
	if (immediate) {
		flushDiskOps();
		return;
	}
	if (diskFlushTimer) clearTimeout(diskFlushTimer);
	diskFlushTimer = setTimeout(flushDiskOps, DISK_ACK_MS);
}
function beginStage(get) {
	if (!stageBuf) stageBuf = {
		nodes: { ...get().nodes },
		rootIds: [...get().rootIds],
		expandedFolders: [...get().expandedFolders],
		dirtyNoteIds: [...get().dirtyNoteIds],
		activeNoteId: get().activeNoteId
	};
	return stageBuf;
}
function scheduleStageFlush(set) {
	if (stageTimer) return;
	stageTimer = setTimeout(() => {
		stageTimer = null;
		const s = stageBuf;
		stageBuf = null;
		if (!s) return;
		set({
			nodes: s.nodes,
			rootIds: s.rootIds,
			expandedFolders: s.expandedFolders,
			dirtyNoteIds: s.dirtyNoteIds,
			activeNoteId: s.activeNoteId
		});
	}, CREATE_BATCH_MS);
}
function flushStageNow(set) {
	if (stageTimer) {
		clearTimeout(stageTimer);
		stageTimer = null;
	}
	const s = stageBuf;
	stageBuf = null;
	if (!s) return;
	set({
		nodes: s.nodes,
		rootIds: s.rootIds,
		expandedFolders: s.expandedFolders,
		dirtyNoteIds: s.dirtyNoteIds,
		activeNoteId: s.activeNoteId
	});
}
function getFsaRoot() {
	return fsaRoot;
}
function getDesktopRoot() {
	return desktopRoot;
}
function setWatcherAck(fn) {
	watcherAck = fn;
}
function setDesktopWatchAck(fn) {
	desktopWatchAck = fn;
}
function isDiskVault(mode) {
	return mode === "fsa" || mode === "desktop";
}
/** Load recent vaults; dual-read legacy noteapp-recent-v2 → write nexus-recent-v1 (S5). */
function loadRecents() {
	try {
		const raw = localStorage.getItem(RECENT_KEY) ?? localStorage.getItem(RECENT_KEY_LEGACY);
		if (!raw) return [];
		if (!localStorage.getItem(RECENT_KEY) && localStorage.getItem(RECENT_KEY_LEGACY)) try {
			localStorage.setItem(RECENT_KEY, raw);
		} catch {}
		return JSON.parse(raw);
	} catch {
		return [];
	}
}
function saveRecents(list) {
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
	} catch {}
}
function makeId(path) {
	return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_") + "_" + Math.random().toString(36).slice(2, 7);
}
/** Wave 6: expand only ancestors of active note (+ top-level Journal) — not every folder */
function smartExpandedFolders(nodes, activeId) {
	const out = /* @__PURE__ */ new Set();
	for (const n of Object.values(nodes)) if (n.kind === "folder" && n.path === "Journal" && n.parentId == null) out.add(n.id);
	let cur = activeId ? nodes[activeId] : null;
	while (cur?.parentId) {
		out.add(cur.parentId);
		cur = nodes[cur.parentId] ?? null;
	}
	return Array.from(out);
}
function stableId(path) {
	return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
}
async function persistNoteIfFsa(path, content, opts) {
	const ack = opts?.ack !== false;
	if (desktopRoot) {
		await writeDesktopNote(desktopRoot, path, content);
		if (ack) desktopWatchAck?.();
		return;
	}
	if (!fsaRoot) return;
	await writeNoteFile(fsaRoot, path, content);
	if (ack && watcherAck) await watcherAck(fsaRoot);
}
/** Expand folder ancestors so the note is visible in the tree. */
function expandPathToNote(nodes, noteId) {
	if (!noteId) return [];
	const out = [];
	let cur = nodes[noteId]?.parentId ?? null;
	while (cur) {
		out.push(cur);
		cur = nodes[cur]?.parentId ?? null;
	}
	return out;
}
function pushRecent(entry) {
	const list = loadRecents().filter((r) => r.id !== entry.id);
	list.unshift(entry);
	saveRecents(list);
	return list;
}
/**
* Wave H / Habit Home: honor launch note preference after a vault is fully mounted.
* Silent so we don't toast on every open.
*
* launchNoteMode:
* - today: always open today's daily
* - last: leave restored last note
* - smart: open today when no active note, or active is a prior Journal daily
*
* openTodayOnLaunch remains as legacy mirror (true when mode is today/smart).
*/
function applyLaunchNotePreference() {
	try {
		const prefs = getPrefs();
		const mode = prefs.launchNoteMode ?? (prefs.openTodayOnLaunch ? "today" : "last");
		if (mode === "last") return;
		const st = useVaultStore.getState();
		if (!st.vaultId) return;
		if (mode === "smart") {
			const activeId = st.activeNoteId;
			const active = activeId ? st.nodes[activeId] : null;
			const todayPath = dailyNotePath(/* @__PURE__ */ new Date());
			if (active?.kind === "note" && active.path === todayPath) return;
			if (active?.kind === "note" && active.path && !/^Journal\/\d{4}-\d{2}-\d{2}\.md$/.test(active.path)) return;
			st.openDailyNote({ silent: true });
			return;
		}
		st.openDailyNote({ silent: true });
	} catch {}
}
var useVaultStore = create()(persist((set, get) => ({
	ready: false,
	vaultId: null,
	vaultName: "",
	vaultPath: "",
	mode: "demo",
	nodes: {},
	rootIds: [],
	activeNoteId: null,
	settings: { ...DEFAULT_SETTINGS },
	expandedFolders: [],
	lastExternalSync: null,
	dirtyNoteIds: [],
	recentVaults: [],
	commandOpen: false,
	toast: null,
	hermesTick: 0,
	cloudSession: null,
	fsaSupported: false,
	connecting: false,
	pendingDelete: null,
	recentNoteVisits: loadNoteVisits(),
	folderAccessLost: false,
	bootstrap: async () => {
		const recents = loadRecents();
		const fsaSupported = canOpenLocalVaultFolder();
		const cloudSession = loadCloudSession();
		set({
			recentVaults: recents,
			recentNoteVisits: loadNoteVisits(),
			fsaSupported,
			cloudSession,
			ready: true,
			folderAccessLost: false
		});
		if (isDesktopShell() && getPrefs().openLastVault) {
			const root = getDesktopVaultRoot();
			if (root) {
				set({ connecting: true });
				try {
					desktopRoot = root;
					fsaRoot = null;
					const scan = await openDesktopVaultAt(root);
					const lastPath = get().settings.lastNotePath;
					const active = lastPath && Object.values(scan.nodes).find((n) => n.path === lastPath)?.id || Object.values(scan.nodes).find((n) => n.kind === "note")?.id || null;
					const name = root.split(/[/\\]/).filter(Boolean).pop() || "Vault";
					const vaultId = "desk-" + name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
					const recents2 = pushRecent({
						id: vaultId,
						name,
						path: root,
						lastOpened: Date.now(),
						mode: "desktop"
					});
					set({
						vaultId,
						vaultName: name,
						vaultPath: root,
						mode: "desktop",
						nodes: scan.nodes,
						rootIds: scan.rootIds,
						activeNoteId: active,
						expandedFolders: smartExpandedFolders(scan.nodes, active),
						recentVaults: recents2,
						connecting: false,
						dirtyNoteIds: []
					});
					applyLaunchNotePreference();
					return;
				} catch {
					desktopRoot = null;
					set({ connecting: false });
				}
			}
		}
		if (!isDesktopShell() && isFileSystemAccessSupported() && getPrefs().openLastVault) {
			const saved = await loadDirectoryHandle();
			if (saved?.handle) {
				let ok = await ensurePermission(saved.handle, "readwrite");
				if (!ok) ok = await ensurePermission(saved.handle, "readwrite");
				if (ok) {
					fsaRoot = saved.handle;
					set({ connecting: true });
					try {
						const scan = await scanVault(saved.handle);
						const lastPath = get().settings.lastNotePath;
						const active = lastPath && Object.values(scan.nodes).find((n) => n.path === lastPath)?.id || Object.values(scan.nodes).find((n) => n.kind === "note")?.id || null;
						const recents2 = pushRecent({
							id: saved.meta.id,
							name: saved.meta.name,
							path: saved.meta.name,
							lastOpened: Date.now(),
							mode: "fsa"
						});
						set({
							vaultId: saved.meta.id,
							vaultName: saved.meta.name,
							vaultPath: saved.meta.name,
							mode: "fsa",
							nodes: scan.nodes,
							rootIds: scan.rootIds,
							activeNoteId: active,
							expandedFolders: smartExpandedFolders(scan.nodes, active),
							recentVaults: recents2,
							connecting: false,
							dirtyNoteIds: []
						});
						applyLaunchNotePreference();
						return;
					} catch {
						fsaRoot = null;
						set({
							connecting: false,
							folderAccessLost: true,
							toast: "Folder access lost — click to re-open"
						});
					}
				} else {
					fsaRoot = null;
					set({
						folderAccessLost: true,
						toast: "Folder access lost — click to re-open"
					});
				}
			}
		}
		const state = get();
		if (state.vaultId && state.mode !== "fsa" && state.mode !== "desktop" && Object.keys(state.nodes).length > 0) {
			applyLaunchNotePreference();
			return;
		}
		set({
			vaultId: null,
			vaultName: "",
			vaultPath: "",
			nodes: {},
			rootIds: [],
			activeNoteId: null
		});
	},
	openDemoVault: () => {
		fsaRoot = null;
		desktopRoot = null;
		setDesktopVaultRoot(null);
		const demo = buildDemoVault();
		const vaultId = "demo-vault";
		const welcome = Object.values(demo.nodes).find((n) => n.path === "Welcome.md");
		const expanded = Object.values(demo.nodes).filter((n) => n.kind === "folder").map((n) => n.id);
		const recents = pushRecent({
			id: vaultId,
			name: demo.vaultName,
			path: "Demo Vault (in-browser)",
			lastOpened: Date.now(),
			mode: "demo"
		});
		set({
			vaultId,
			vaultName: demo.vaultName,
			vaultPath: "Demo Vault",
			mode: "demo",
			nodes: demo.nodes,
			rootIds: demo.rootIds,
			activeNoteId: welcome?.id ?? null,
			expandedFolders: expanded,
			dirtyNoteIds: [],
			lastExternalSync: null,
			recentVaults: recents,
			settings: {
				...get().settings,
				lastNotePath: welcome?.path ?? null,
				editorMode: getPrefs().defaultEditorMode,
				graphMode: "panel",
				rightOpen: true
			}
		});
		applyLaunchNotePreference();
	},
	openLocalVault: (name, seed) => {
		fsaRoot = null;
		desktopRoot = null;
		setDesktopVaultRoot(null);
		const data = seed ?? buildDemoVault();
		const vaultId = "local-" + slugifyTitle(name).toLowerCase().replace(/\s+/g, "-");
		const first = Object.values(data.nodes).find((n) => n.kind === "note");
		const recents = pushRecent({
			id: vaultId,
			name,
			path: name,
			lastOpened: Date.now(),
			mode: "local"
		});
		const prefs = getPrefs();
		set({
			vaultId,
			vaultName: name,
			vaultPath: name,
			mode: "local",
			nodes: data.nodes,
			rootIds: data.rootIds,
			activeNoteId: first?.id ?? null,
			expandedFolders: smartExpandedFolders(data.nodes, first?.id ?? null),
			dirtyNoteIds: [],
			recentVaults: recents,
			settings: {
				...get().settings,
				editorMode: prefs.defaultEditorMode,
				graphMode: prefs.defaultGraphView,
				rightOpen: prefs.defaultGraphView === "panel",
				lastNotePath: first?.path ?? null
			}
		});
		applyLaunchNotePreference();
	},
	openFolderAsVault: async () => {
		set({
			connecting: true,
			folderAccessLost: false
		});
		try {
			if (await confirmDesktopShell() || isDesktopShell()) {
				const root = await pickDesktopVaultFolder();
				if (!root) {
					set({ connecting: false });
					return;
				}
				desktopRoot = root;
				fsaRoot = null;
				const scan = await openDesktopVaultAt(root);
				const name = root.split(/[/\\]/).filter(Boolean).pop() || "Vault";
				const vaultId = "desk-" + name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
				const first = Object.values(scan.nodes).find((n) => n.kind === "note");
				const recents = pushRecent({
					id: vaultId,
					name,
					path: root,
					lastOpened: Date.now(),
					mode: "desktop"
				});
				set({
					vaultId,
					vaultName: name,
					vaultPath: root,
					mode: "desktop",
					nodes: scan.nodes,
					rootIds: scan.rootIds,
					activeNoteId: first?.id ?? null,
					expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
					dirtyNoteIds: [],
					recentVaults: recents,
					connecting: false,
					toast: `Opened vault: ${name}`,
					settings: {
						...get().settings,
						lastNotePath: first?.path ?? null,
						editorMode: getPrefs().defaultEditorMode,
						graphMode: getPrefs().defaultGraphView,
						rightOpen: getPrefs().defaultGraphView === "panel"
					}
				});
				applyLaunchNotePreference();
				return;
			}
			const handle = await pickVaultFolder();
			if (!handle) {
				set({ connecting: false });
				return;
			}
			if (!await ensurePermission(handle, "readwrite")) {
				set({
					connecting: false,
					toast: "Permission denied — cannot read vault folder"
				});
				return;
			}
			fsaRoot = handle;
			const vaultId = "fsa-" + handle.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
			await saveDirectoryHandle(handle, {
				id: vaultId,
				name: handle.name
			});
			const scan = await scanVault(handle);
			const first = Object.values(scan.nodes).find((n) => n.kind === "note");
			const recents = pushRecent({
				id: vaultId,
				name: handle.name,
				path: handle.name,
				lastOpened: Date.now(),
				mode: "fsa"
			});
			set({
				vaultId,
				vaultName: handle.name,
				vaultPath: handle.name,
				mode: "fsa",
				nodes: scan.nodes,
				rootIds: scan.rootIds,
				activeNoteId: first?.id ?? null,
				expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
				dirtyNoteIds: [],
				recentVaults: recents,
				connecting: false,
				toast: `Opened vault: ${handle.name}`,
				settings: {
					...get().settings,
					lastNotePath: first?.path ?? null,
					editorMode: getPrefs().defaultEditorMode,
					graphMode: getPrefs().defaultGraphView,
					rightOpen: getPrefs().defaultGraphView === "panel"
				}
			});
			applyLaunchNotePreference();
		} catch (e) {
			set({
				connecting: false,
				toast: e instanceof Error ? e.message : "Failed to open folder"
			});
		}
	},
	createNewVault: async (name) => {
		const vaultName = (name || "Nexus Vault").trim() || "Nexus Vault";
		const welcome = [
			"# Welcome",
			"",
			"This is your new **Nexus** vault.",
			"",
			"Notes are plain Markdown files in this folder. Type `[[` to link notes, switch Visual and Source, and open the graph to see connections.",
			"",
			"— Nexus · Notes for Humans and Agents",
			""
		].join("\n");
		set({ connecting: true });
		try {
			if (await confirmDesktopShell() || isDesktopShell()) {
				const parent = await pickDesktopVaultFolder("Choose where to create the vault", { remember: false });
				if (!parent) {
					set({ connecting: false });
					return;
				}
				const vaultPath = await createNewDesktopVault(parent, vaultName, welcome);
				desktopRoot = vaultPath;
				fsaRoot = null;
				const scan = await openDesktopVaultAt(vaultPath);
				const nameOut = vaultPath.split(/[/\\]/).filter(Boolean).pop() || vaultName;
				const vaultId = "desk-" + nameOut.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
				const first = Object.values(scan.nodes).find((n) => n.kind === "note");
				const recents = pushRecent({
					id: vaultId,
					name: nameOut,
					path: vaultPath,
					lastOpened: Date.now(),
					mode: "desktop"
				});
				set({
					vaultId,
					vaultName: nameOut,
					vaultPath,
					mode: "desktop",
					nodes: scan.nodes,
					rootIds: scan.rootIds,
					activeNoteId: first?.id ?? null,
					expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
					dirtyNoteIds: [],
					recentVaults: recents,
					connecting: false,
					toast: `Created vault: ${nameOut}`,
					settings: {
						...get().settings,
						lastNotePath: first?.path ?? null,
						editorMode: getPrefs().defaultEditorMode,
						graphMode: getPrefs().defaultGraphView,
						rightOpen: getPrefs().defaultGraphView === "panel"
					}
				});
				applyLaunchNotePreference();
				return;
			}
			const parent = await pickVaultFolder();
			if (!parent) {
				set({ connecting: false });
				return;
			}
			if (!await ensurePermission(parent, "readwrite")) {
				set({
					connecting: false,
					toast: "Permission denied — cannot create vault"
				});
				return;
			}
			let childName = vaultName.replace(/[\\/]+/g, "-").slice(0, 80);
			let handle = null;
			for (let i = 0; i < 40; i++) {
				const tryName = i === 0 ? childName : `${childName} ${i + 1}`;
				try {
					handle = await parent.getDirectoryHandle(tryName, { create: true });
					childName = tryName;
					break;
				} catch {}
			}
			if (!handle) {
				set({
					connecting: false,
					toast: "Could not create vault folder"
				});
				return;
			}
			fsaRoot = handle;
			desktopRoot = null;
			await writeNoteFile(handle, "Welcome.md", welcome);
			const vaultId = "fsa-" + childName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
			await saveDirectoryHandle(handle, {
				id: vaultId,
				name: childName
			});
			const scan = await scanVault(handle);
			const first = Object.values(scan.nodes).find((n) => n.kind === "note");
			const recents = pushRecent({
				id: vaultId,
				name: childName,
				path: childName,
				lastOpened: Date.now(),
				mode: "fsa"
			});
			set({
				vaultId,
				vaultName: childName,
				vaultPath: childName,
				mode: "fsa",
				nodes: scan.nodes,
				rootIds: scan.rootIds,
				activeNoteId: first?.id ?? null,
				expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
				dirtyNoteIds: [],
				recentVaults: recents,
				connecting: false,
				toast: `Created vault: ${childName}`,
				settings: {
					...get().settings,
					lastNotePath: first?.path ?? null,
					editorMode: getPrefs().defaultEditorMode,
					graphMode: getPrefs().defaultGraphView,
					rightOpen: getPrefs().defaultGraphView === "panel"
				}
			});
			applyLaunchNotePreference();
		} catch (e) {
			set({
				connecting: false,
				toast: e instanceof Error ? e.message : "Failed to create vault"
			});
		}
	},
	revealVaultInFinder: async () => {
		const { mode, vaultPath, vaultId } = get();
		if (!vaultId) {
			set({ toast: "No vault open" });
			return;
		}
		if (mode === "desktop" && vaultPath) {
			try {
				await revealDesktopPath(vaultPath);
			} catch (e) {
				set({ toast: e instanceof Error ? e.message : "Could not reveal vault in Finder" });
			}
			return;
		}
		if (mode === "fsa") {
			set({ toast: "In the browser, the vault is the folder you granted access to." });
			return;
		}
		set({ toast: "Reveal is available for local folders on desktop" });
	},
	reopenRecentVault: async (id) => {
		if (await confirmDesktopShell() || isDesktopShell()) {
			const recent = get().recentVaults.find((r) => r.id === id);
			const root = recent?.path || getDesktopVaultRoot();
			if (!root || recent?.mode === "demo") {
				if (id === "demo-vault" || recent?.mode === "demo") {
					get().openDemoVault();
					return;
				}
				set({ toast: "Pick the vault folder again" });
				await get().openFolderAsVault();
				return;
			}
			set({ connecting: true });
			try {
				desktopRoot = root;
				fsaRoot = null;
				const scan = await openDesktopVaultAt(root);
				const name = root.split(/[/\\]/).filter(Boolean).pop() || "Vault";
				const first = Object.values(scan.nodes).find((n) => n.kind === "note");
				const recents = pushRecent({
					id,
					name,
					path: root,
					lastOpened: Date.now(),
					mode: "desktop"
				});
				set({
					vaultId: id,
					vaultName: name,
					vaultPath: root,
					mode: "desktop",
					nodes: scan.nodes,
					rootIds: scan.rootIds,
					activeNoteId: first?.id ?? null,
					expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
					dirtyNoteIds: [],
					recentVaults: recents,
					connecting: false,
					toast: `Reopened vault: ${name}`
				});
				applyLaunchNotePreference();
			} catch (e) {
				set({
					connecting: false,
					toast: e instanceof Error ? e.message : "Failed to reopen vault"
				});
			}
			return;
		}
		const handle = await loadRecentHandle(id);
		if (!handle) {
			set({ toast: "Re-select the folder to restore access" });
			await get().openFolderAsVault();
			return;
		}
		set({ connecting: true });
		try {
			if (!await ensurePermission(handle, "readwrite")) {
				set({
					connecting: false,
					toast: "Permission needed — pick the folder again"
				});
				await get().openFolderAsVault();
				return;
			}
			fsaRoot = handle;
			const vaultId = id;
			await saveDirectoryHandle(handle, {
				id: vaultId,
				name: handle.name
			});
			const scan = await scanVault(handle);
			const first = Object.values(scan.nodes).find((n) => n.kind === "note");
			const recents = pushRecent({
				id: vaultId,
				name: handle.name,
				path: handle.name,
				lastOpened: Date.now(),
				mode: "fsa"
			});
			set({
				vaultId,
				vaultName: handle.name,
				vaultPath: handle.name,
				mode: "fsa",
				nodes: scan.nodes,
				rootIds: scan.rootIds,
				activeNoteId: first?.id ?? null,
				expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
				dirtyNoteIds: [],
				recentVaults: recents,
				connecting: false,
				toast: `Reopened vault: ${handle.name}`
			});
			applyLaunchNotePreference();
		} catch (e) {
			set({
				connecting: false,
				toast: e instanceof Error ? e.message : "Failed to reopen vault"
			});
		}
	},
	closeVault: () => {
		flushActiveEditors();
		fsaRoot = null;
		desktopRoot = null;
		setDesktopVaultRoot(null);
		clearDirectoryHandle();
		set({
			vaultId: null,
			vaultName: "",
			vaultPath: "",
			mode: "demo",
			nodes: {},
			rootIds: [],
			activeNoteId: null,
			dirtyNoteIds: [],
			lastExternalSync: null,
			expandedFolders: [],
			pendingDelete: null,
			settings: {
				...get().settings,
				graphMode: "panel",
				editorMode: "visual"
			}
		});
	},
	setActiveNote: (id) => {
		flushStageNow(set);
		flushActiveEditors();
		if (id === get().activeNoteId) return;
		const note = id ? get().nodes[id] : null;
		const pathExpand = expandPathToNote(get().nodes, id);
		const expanded = /* @__PURE__ */ new Set([...get().expandedFolders, ...pathExpand]);
		let recentNoteVisits = get().recentNoteVisits;
		if (typeof id === "string" && note?.kind === "note") {
			recentNoteVisits = pushNoteVisit(id, get().recentNoteVisits);
			trackVisit(id);
			pushNav(id);
			const vaultId = get().vaultId;
			if (vaultId && note.path) recordNoteVisit(vaultId, id, note.path);
		}
		set({
			activeNoteId: id,
			expandedFolders: Array.from(expanded),
			recentNoteVisits,
			settings: {
				...get().settings,
				lastNotePath: note?.path ?? get().settings.lastNotePath
			}
		});
	},
	toggleFolder: (id) => {
		const cur = get().expandedFolders;
		set({ expandedFolders: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
	},
	setLeftOpen: (open) => set({ settings: {
		...get().settings,
		leftOpen: open
	} }),
	setRightOpen: (open) => set({ settings: {
		...get().settings,
		rightOpen: open
	} }),
	setLeftWidth: (w) => set({ settings: {
		...get().settings,
		leftWidth: Math.min(480, Math.max(200, Math.round(w)))
	} }),
	setRightWidth: (w) => set({ settings: {
		...get().settings,
		rightWidth: Math.min(520, Math.max(260, Math.round(w)))
	} }),
	setEditorMode: (mode) => {
		flushActiveEditors();
		set({ settings: {
			...get().settings,
			editorMode: mode
		} });
	},
	setGraphMode: (mode) => set({ settings: {
		...get().settings,
		graphMode: mode
	} }),
	toggleEditorMode: () => {
		flushActiveEditors();
		const cur = get().settings.editorMode;
		set({ settings: {
			...get().settings,
			editorMode: cur === "visual" ? "source" : "visual"
		} });
	},
	toggleLeft: () => set({ settings: {
		...get().settings,
		leftOpen: !get().settings.leftOpen
	} }),
	toggleRight: () => set({ settings: {
		...get().settings,
		rightOpen: !get().settings.rightOpen
	} }),
	toggleGraphFullscreen: () => {
		const cur = get().settings.graphMode;
		set({ settings: {
			...get().settings,
			graphMode: cur === "fullscreen" ? "panel" : "fullscreen",
			rightOpen: true
		} });
	},
	updateNoteContent: (id, content, opts) => {
		flushStageNow(set);
		const node = get().nodes[id];
		if (!node || node.kind !== "note") return;
		const prev = node.content ?? "";
		const next = opts?.external ? content : opts?.source ? content : preferCleanWrite(prev, content);
		if (prev === next) return;
		set({
			nodes: {
				...get().nodes,
				[id]: {
					...node,
					content: next,
					mtime: Date.now()
				}
			},
			dirtyNoteIds: opts?.external ? get().dirtyNoteIds.filter((x) => x !== id) : get().dirtyNoteIds.includes(id) ? get().dirtyNoteIds : [...get().dirtyNoteIds, id],
			lastExternalSync: opts?.external ? Date.now() : get().lastExternalSync
		});
		if (!opts?.external && isDiskVault(get().mode)) queueDiskWrite(() => persistNoteIfFsa(node.path, next));
	},
	renameNode: (id, newName) => {
		flushStageNow(set);
		const node = get().nodes[id];
		if (!node) return;
		let name = newName.trim();
		if (!name) return;
		if (node.kind === "note") {
			name = name.replace(/\.md$/i, "");
			if (!name) return;
			name = `${name}.md`;
		}
		const parent = parentPath(node.path);
		let newPath = parent ? pathJoin(parent, name) : name;
		if (newPath === node.path && name === node.name) return;
		if (Object.values(get().nodes).find((n) => n.id !== id && n.path === newPath)) {
			const stem = name.replace(/\.md$/i, "");
			const ext = node.kind === "note" ? ".md" : "";
			let i = 1;
			const paths = new Set(Object.values(get().nodes).map((n) => n.path));
			while (paths.has(parent ? pathJoin(parent, `${stem} ${i}${ext}`) : `${stem} ${i}${ext}`)) i++;
			name = `${stem} ${i}${ext}`;
			newPath = parent ? pathJoin(parent, name) : name;
			get().setToast(`Name in use — saved as ${name.replace(/\.md$/i, "")}`);
		}
		const oldPath = node.path;
		const nodes = { ...get().nodes };
		const titleOnly = name.replace(/\.md$/i, "");
		let content = node.content;
		if (node.kind === "note" && typeof content === "string") if (/^#\s+.+$/m.test(content)) content = content.replace(/^#\s+.+$/m, `# ${titleOnly}`);
		else content = `# ${titleOnly}\n\n` + content.replace(/^\n+/, "");
		nodes[id] = {
			...node,
			name,
			path: newPath,
			mtime: Date.now(),
			...node.kind === "note" ? { content } : {}
		};
		if (node.kind === "folder") {
			const oldPrefix = node.path + "/";
			for (const n of Object.values(nodes)) if (n.path.startsWith(oldPrefix)) nodes[n.id] = {
				...n,
				path: newPath + n.path.slice(node.path.length),
				mtime: Date.now()
			};
		}
		set({ nodes });
		if (get().mode === "desktop" && desktopRoot) {
			const root = desktopRoot;
			queueDiskWrite(async () => {
				await renameDesktopPath(root, oldPath, newPath, node.kind, node.kind === "note" ? nodes[id].content ?? "" : void 0);
				desktopWatchAck?.();
			});
		} else if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await renamePathOnDisk(root, oldPath, newPath, node.kind, node.kind === "note" ? nodes[id].content ?? "" : void 0);
				if (watcherAck) await watcherAck(root);
			});
		}
	},
	createNote: (parentId, title = "Untitled", opts) => {
		const activate = opts?.activate !== false;
		const stage = beginStage(get);
		const parent = parentId ? stage.nodes[parentId] : null;
		const base = slugifyTitle(title) || "Untitled";
		let name = base.endsWith(".md") ? base : `${base}.md`;
		let path = parent ? pathJoin(parent.path, name) : name;
		let i = 1;
		const paths = new Set(Object.values(stage.nodes).map((n) => n.path));
		while (paths.has(path)) {
			name = `${base.replace(/\.md$/i, "")} ${i}.md`;
			path = parent ? pathJoin(parent.path, name) : name;
			i++;
		}
		const id = makeId(path);
		const titleClean = title.replace(/\.md$/i, "");
		let content;
		if (opts?.raw && typeof opts.content === "string") content = opts.content;
		else if (typeof opts?.content === "string") content = opts.content;
		else if (opts?.template) content = buildTemplateContent(opts.template, titleClean);
		else content = `# ${titleClean}\n\n`;
		stage.nodes[id] = {
			id,
			path,
			name,
			kind: "note",
			parentId,
			mtime: Date.now(),
			content
		};
		if (parentId == null && !stage.rootIds.includes(id)) stage.rootIds = [...stage.rootIds, id];
		if (parentId && !stage.expandedFolders.includes(parentId)) stage.expandedFolders = [...stage.expandedFolders, parentId];
		if (activate) {
			stage.activeNoteId = id;
			pushNoteVisit(id);
		}
		if (!stage.dirtyNoteIds.includes(id)) stage.dirtyNoteIds = [...stage.dirtyNoteIds, id];
		scheduleStageFlush(set);
		if (isDiskVault(get().mode)) {
			const pth = path;
			const body = content;
			enqueueDiskOp(async () => {
				await persistNoteIfFsa(pth, body, { ack: false });
			});
		}
		if (activate) pushPulse({
			kind: "create",
			path,
			title: titleClean,
			message: `Created ${path}`
		});
		return id;
	},
	createFolder: (parentId, name = "New Folder", opts) => {
		const expand = opts?.expand !== false;
		const stage = beginStage(get);
		const parent = parentId ? stage.nodes[parentId] : null;
		let folderName = slugifyTitle(name) || "New Folder";
		let path = parent ? pathJoin(parent.path, folderName) : folderName;
		const paths = new Set(Object.values(stage.nodes).map((n) => n.path));
		let i = 1;
		while (paths.has(path)) {
			folderName = `${name} ${i}`;
			path = parent ? pathJoin(parent.path, folderName) : folderName;
			i++;
		}
		const id = makeId(path);
		stage.nodes[id] = {
			id,
			path,
			name: folderName,
			kind: "folder",
			parentId,
			mtime: Date.now()
		};
		if (parentId == null && !stage.rootIds.includes(id)) stage.rootIds = [...stage.rootIds, id];
		if (expand && !stage.expandedFolders.includes(id)) stage.expandedFolders = [...stage.expandedFolders, id];
		scheduleStageFlush(set);
		if (get().mode === "desktop" && desktopRoot) {
			const root = desktopRoot;
			const pth = path;
			enqueueDiskOp(async () => {
				await createDesktopFolder(root, pth);
			});
		} else if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			const pth = path;
			enqueueDiskOp(async () => {
				await createFolderOnDisk(root, pth);
			});
		}
		return id;
	},
	createFromTemplate: (templateId, parentId = null) => {
		if (templateId === "daily") return get().openDailyNote();
		const tpl = getTemplate(templateId);
		const date = /* @__PURE__ */ new Date();
		let parent = parentId ?? null;
		if (parent == null && tpl.preferredFolder) {
			const folderPath = tpl.preferredFolder;
			const existing = Object.values(get().nodes).find((n) => n.kind === "folder" && n.path === folderPath);
			if (existing) parent = existing.id;
			else {
				let acc = "";
				let curParent = null;
				for (const part of folderPath.split("/").filter(Boolean)) {
					acc = acc ? `${acc}/${part}` : part;
					const hit = Object.values(get().nodes).find((n) => n.kind === "folder" && n.path === acc);
					if (hit) curParent = hit.id;
					else curParent = get().createFolder(curParent, part, { expand: true });
				}
				parent = curParent;
			}
		}
		const title = tpl.defaultTitle;
		const content = buildTemplateContent(templateId, title, date);
		return get().createNote(parent, title, {
			content,
			raw: true
		});
	},
	openDailyNote: (opts) => {
		return get().openDailyNoteForDate(/* @__PURE__ */ new Date(), opts);
	},
	openDailyNoteForDate: (date, opts) => {
		const silent = opts?.silent === true;
		const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const path = dailyNotePath(target);
		const existing = Object.values(get().nodes).find((n) => n.kind === "note" && n.path === path);
		const today = /* @__PURE__ */ new Date();
		const isToday = target.getFullYear() === today.getFullYear() && target.getMonth() === today.getMonth() && target.getDate() === today.getDate();
		if (existing) {
			get().setActiveNote(existing.id);
			if (!silent) get().setToast(isToday ? "Opened today's daily note" : `Opened daily note ${formatDateISO(target)}`);
			return existing.id;
		}
		let journalId = Object.values(get().nodes).find((n) => n.kind === "folder" && n.path === "Journal")?.id ?? null;
		if (!journalId) journalId = get().createFolder(null, "Journal", { expand: true });
		let yesterdayMarkdown = null;
		if (isToday) {
			const y = new Date(target);
			y.setDate(y.getDate() - 1);
			const yPath = dailyNotePath(y);
			yesterdayMarkdown = Object.values(get().nodes).find((n) => n.kind === "note" && n.path === yPath)?.content ?? null;
		}
		const content = buildDailyNoteContent(target, yesterdayMarkdown);
		const id = get().createNote(journalId, dailyNoteTitle(target), {
			content,
			raw: true
		});
		if (!silent) get().setToast(isToday ? "Created today's daily note" : `Created daily note ${formatDateISO(target)}`);
		return id;
	},
	importBulk: (input) => {
		flushStageNow(set);
		const activateLast = input.activateLast === true;
		const folderSpecs = input.folders ?? [];
		const noteSpecs = (input.notes ?? []).map((n) => ({
			...n,
			path: ensureMdPath(n.path)
		}));
		const implied = collectFolderPaths([...folderSpecs.map((f) => f.path), ...noteSpecs.map((n) => n.path)]);
		const allFolderPaths = Array.from(/* @__PURE__ */ new Set([...implied, ...folderSpecs.map((f) => f.path.replace(/\\/g, "/").replace(/^\/+/, ""))])).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
		const nodes = { ...get().nodes };
		let rootIds = [...get().rootIds];
		const pathToId = buildPathIndex(nodes);
		const existingPaths = new Set(Object.values(nodes).map((n) => n.path));
		const folderIds = [];
		const noteIds = [];
		let created = 0;
		let skipped = 0;
		const now = Date.now();
		const diskOps = [];
		const expanded = new Set(get().expandedFolders);
		for (const fpath of allFolderPaths) {
			if (!fpath) continue;
			if (existingPaths.has(fpath)) {
				skipped++;
				continue;
			}
			const parent = parentPath(fpath);
			const parentId = parent ? pathToId.get(parent) ?? null : null;
			if (parent && !parentId) {
				skipped++;
				continue;
			}
			const id = makeId(fpath);
			nodes[id] = {
				id,
				path: fpath,
				name: pathToName(fpath),
				kind: "folder",
				parentId,
				mtime: now
			};
			pathToId.set(fpath, id);
			existingPaths.add(fpath);
			folderIds.push(id);
			created++;
			if (parentId == null) rootIds.push(id);
			expanded.add(id);
			if (get().mode === "desktop" && desktopRoot) {
				const root = desktopRoot;
				diskOps.push(async () => {
					await createDesktopFolder(root, fpath);
				});
			} else if (get().mode === "fsa" && fsaRoot) {
				const root = fsaRoot;
				diskOps.push(async () => {
					await createFolderOnDisk(root, fpath);
				});
			}
		}
		for (const spec of noteSpecs) {
			let path = spec.path;
			if (existingPaths.has(path)) {
				const existingId = pathToId.get(path);
				if (existingId && nodes[existingId]?.kind === "note") {
					const content = defaultNoteContent(spec.title || titleFromPath(path), spec.content);
					nodes[existingId] = {
						...nodes[existingId],
						content,
						mtime: now
					};
					noteIds.push(existingId);
					created++;
					if (isDiskVault(get().mode)) diskOps.push(async () => {
						await persistNoteIfFsa(path, content, { ack: false });
					});
					continue;
				}
				path = uniquePath(path, existingPaths);
			}
			const parent = parentPath(path);
			const parentId = parent ? pathToId.get(parent) ?? null : null;
			if (parent && !parentId) {
				skipped++;
				continue;
			}
			const content = defaultNoteContent(spec.title || titleFromPath(path), spec.content);
			const id = makeId(path);
			nodes[id] = {
				id,
				path,
				name: pathToName(path),
				kind: "note",
				parentId,
				mtime: now,
				content
			};
			pathToId.set(path, id);
			existingPaths.add(path);
			noteIds.push(id);
			created++;
			if (parentId == null) rootIds.push(id);
			if (parentId) expanded.add(parentId);
			if (isDiskVault(get().mode)) diskOps.push(async () => {
				await persistNoteIfFsa(path, content, { ack: false });
			});
		}
		rootIds = Array.from(new Set(rootIds)).filter((id) => nodes[id]);
		const lastNote = noteIds.length ? noteIds[noteIds.length - 1] : null;
		set({
			nodes,
			rootIds,
			expandedFolders: Array.from(expanded),
			activeNoteId: activateLast && lastNote ? lastNote : get().activeNoteId,
			dirtyNoteIds: activateLast && lastNote ? Array.from(/* @__PURE__ */ new Set([...get().dirtyNoteIds, lastNote])) : get().dirtyNoteIds,
			toast: input.silent ? get().toast : created ? `Imported ${created} item${created === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}` : get().toast,
			lastExternalSync: now
		});
		for (const op of diskOps) enqueueDiskOp(op);
		if (diskOps.length >= 10) flushDiskOps();
		return {
			folderIds,
			noteIds,
			created,
			skipped
		};
	},
	deleteNode: (id) => {
		flushStageNow(set);
		const nodes = { ...get().nodes };
		const target = nodes[id];
		if (!target) return;
		const toDelete = /* @__PURE__ */ new Set();
		const walk = (nid) => {
			toDelete.add(nid);
			for (const n of Object.values(nodes)) if (n.parentId === nid) walk(n.id);
		};
		walk(id);
		for (const d of toDelete) delete nodes[d];
		pushPulse({
			kind: "delete",
			path: target.path,
			title: target.kind === "note" ? noteTitle(target) : target.name,
			message: `Deleted ${target.path}`
		});
		set({
			nodes,
			rootIds: get().rootIds.filter((r) => !toDelete.has(r)),
			activeNoteId: toDelete.has(get().activeNoteId ?? "") ? null : get().activeNoteId,
			expandedFolders: get().expandedFolders.filter((x) => !toDelete.has(x))
		});
		if (get().mode === "desktop" && desktopRoot) {
			const root = desktopRoot;
			queueDiskWrite(async () => {
				await deleteDesktopPath(root, target.path, target.kind);
				desktopWatchAck?.();
			});
		} else if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await deletePathOnDisk(root, target.path, target.kind);
				if (watcherAck) await watcherAck(root);
			});
		}
	},
	requestDelete: (id) => {
		const node = get().nodes[id];
		if (!node) return;
		if (!getPrefs().confirmDelete) {
			get().deleteNode(id);
			return;
		}
		set({ pendingDelete: {
			id,
			kind: node.kind === "folder" ? "folder" : "note",
			label: node.kind === "note" ? noteTitle(node) : node.name
		} });
	},
	confirmPendingDelete: () => {
		const p = get().pendingDelete;
		if (!p) return;
		set({ pendingDelete: null });
		get().deleteNode(p.id);
	},
	cancelPendingDelete: () => set({ pendingDelete: null }),
	moveNode: (id, newParentId) => {
		flushStageNow(set);
		const node = get().nodes[id];
		if (!node || id === newParentId) return;
		if ((node.parentId ?? null) === (newParentId ?? null)) return;
		if (newParentId) {
			let p = newParentId;
			while (p) {
				if (p === id) {
					get().setToast("Can't move a folder into itself");
					return;
				}
				p = get().nodes[p]?.parentId ?? null;
			}
		}
		const parent = newParentId ? get().nodes[newParentId] : null;
		if (newParentId && parent?.kind !== "folder") return;
		let destName = node.name;
		let newPath = parent ? pathJoin(parent.path, destName) : destName;
		const occupied = new Set(Object.values(get().nodes).filter((n) => n.id !== id).map((n) => n.path));
		if (occupied.has(newPath)) {
			const isNote = node.kind === "note";
			const stem = isNote ? destName.replace(/\.md$/i, "") : destName;
			const ext = isNote ? ".md" : "";
			let i = 1;
			while (occupied.has(parent ? pathJoin(parent.path, `${stem} ${i}${ext}`) : `${stem} ${i}${ext}`)) i++;
			destName = `${stem} ${i}${ext}`;
			newPath = parent ? pathJoin(parent.path, destName) : destName;
		}
		const oldPath = node.path;
		const nodes = { ...get().nodes };
		nodes[id] = {
			...node,
			name: destName,
			parentId: newParentId,
			path: newPath,
			mtime: Date.now()
		};
		if (node.kind === "folder") {
			const oldPrefix = oldPath + "/";
			for (const n of Object.values(nodes)) {
				if (n.id === id) continue;
				if (n.path.startsWith(oldPrefix)) nodes[n.id] = {
					...n,
					path: newPath + n.path.slice(oldPath.length),
					mtime: Date.now()
				};
			}
		}
		let rootIds = get().rootIds.filter((r) => r !== id);
		if (newParentId == null) rootIds = [...rootIds, id];
		const expanded = new Set(get().expandedFolders);
		if (newParentId) expanded.add(newParentId);
		set({
			nodes,
			rootIds,
			expandedFolders: Array.from(expanded),
			toast: `Moved to ${parent ? parent.path || parent.name : "vault root"}`
		});
		window.setTimeout(() => {
			if (get().toast?.startsWith("Moved to")) get().setToast(null);
		}, 1800);
		if (get().mode === "desktop" && desktopRoot) {
			const root = desktopRoot;
			queueDiskWrite(async () => {
				await renameDesktopPath(root, oldPath, newPath, node.kind, node.kind === "note" ? nodes[id].content ?? "" : void 0);
				desktopWatchAck?.();
			});
		} else if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await renamePathOnDisk(root, oldPath, newPath, node.kind, node.kind === "note" ? nodes[id].content ?? "" : void 0);
				if (watcherAck) await watcherAck(root);
			});
		}
	},
	setCommandOpen: (open) => set({ commandOpen: open }),
	setToast: (msg) => set({ toast: msg }),
	simulateHermesWrite: () => {
		const { nodes, rootIds, mode } = get();
		const systems = Object.values(nodes).find((n) => n.kind === "folder" && n.path === "Systems");
		const path = HERMES_SAMPLE_NOTE.path;
		const existing = Object.values(nodes).find((n) => n.path === path);
		const content = HERMES_SAMPLE_NOTE.content.replace("${TS}", (/* @__PURE__ */ new Date()).toISOString());
		if (existing) {
			get().updateNoteContent(existing.id, content, { external: true });
			if (isDiskVault(mode)) queueDiskWrite(() => persistNoteIfFsa(path, content));
			pushPulse({
				kind: "hermes",
				path,
				title: "Hermes Pulse",
				message: "Hermes updated Systems/Hermes Pulse.md"
			});
			set({
				lastExternalSync: Date.now(),
				hermesTick: get().hermesTick + 1,
				toast: "Hermes updated Systems/Hermes Pulse.md",
				activeNoteId: existing.id
			});
			return;
		}
		const id = mode === "fsa" ? "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_") : mode === "desktop" ? "desk_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_") : stableId(path);
		const node = {
			id,
			path,
			name: HERMES_SAMPLE_NOTE.name,
			kind: "note",
			parentId: systems?.id ?? null,
			mtime: Date.now(),
			content
		};
		const nextRoots = systems == null ? [...rootIds, id] : rootIds;
		const expanded = systems && !get().expandedFolders.includes(systems.id) ? [...get().expandedFolders, systems.id] : get().expandedFolders;
		set({
			nodes: {
				...nodes,
				[id]: node
			},
			rootIds: nextRoots,
			expandedFolders: expanded,
			lastExternalSync: Date.now(),
			hermesTick: get().hermesTick + 1,
			toast: "Hermes created Systems/Hermes Pulse.md",
			activeNoteId: id
		});
		pushPulse({
			kind: "hermes",
			path,
			title: "Hermes Pulse",
			message: "Hermes created Systems/Hermes Pulse.md"
		});
		if (isDiskVault(mode)) queueDiskWrite(() => persistNoteIfFsa(path, content));
	},
	applyExternalSnapshot: (nodes, rootIds) => {
		pendingExternal = {
			nodes,
			rootIds
		};
		if (externalSnapTimer) clearTimeout(externalSnapTimer);
		const wait = Object.keys(nodes).length > 80 ? 120 : EXTERNAL_DEBOUNCE_MS;
		externalSnapTimer = setTimeout(() => {
			externalSnapTimer = null;
			const pending = pendingExternal;
			pendingExternal = null;
			if (!pending) return;
			get()._applyExternalSnapshotNow(pending.nodes, pending.rootIds);
		}, wait);
	},
	_applyExternalSnapshotNow: (nodes, rootIds) => {
		const prev = get().nodes;
		if (Object.values(prev).filter((n) => n.kind === "note").map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`).sort().join("|") === Object.values(nodes).filter((n) => n.kind === "note").map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`).sort().join("|") && get().rootIds.join() === rootIds.join()) return;
		const active = get().activeNoteId;
		const activePath = active ? prev[active]?.path : null;
		let nextActive = active && nodes[active] ? active : null;
		if (!nextActive && activePath) nextActive = Object.values(nodes).find((n) => n.path === activePath)?.id ?? null;
		const pathToNewId = /* @__PURE__ */ new Map();
		for (const n of Object.values(nodes)) pathToNewId.set(n.path, n.id);
		const dirty = new Set(get().dirtyNoteIds);
		const existingPaths = new Set(Object.values(nodes).map((n) => n.path));
		let conflictToast = null;
		let nextRootIds = rootIds;
		for (const dirtyId of dirty) {
			const local = prev[dirtyId];
			if (!local || local.kind !== "note") continue;
			const diskId = nodes[dirtyId]?.kind === "note" ? dirtyId : Object.values(nodes).find((n) => n.kind === "note" && n.path === local.path)?.id;
			if (!diskId || !nodes[diskId]) {
				const restoredId = makeId(local.path);
				const parentPathStr = parentPath(local.path);
				let parentId = null;
				if (parentPathStr) parentId = Object.values(nodes).find((n) => n.kind === "folder" && n.path === parentPathStr)?.id ?? null;
				nodes = {
					...nodes,
					[restoredId]: {
						...local,
						id: restoredId,
						parentId,
						mtime: Date.now(),
						content: local.content ?? ""
					}
				};
				pathToNewId.set(local.path, restoredId);
				if (parentId == null && !nextRootIds.includes(restoredId)) nextRootIds = [...nextRootIds, restoredId];
				existingPaths.add(local.path);
				if (isDiskVault(get().mode)) {
					const pth = local.path;
					const body = local.content ?? "";
					enqueueDiskOp(async () => {
						await persistNoteIfFsa(pth, body, { ack: false });
					});
				}
				conflictToast = conflictToast ?? `Restored unsaved note ${pathToName(local.path)} (removed externally)`;
				continue;
			}
			const disk = nodes[diskId];
			const localBody = local.content ?? "";
			const diskBody = disk.content ?? "";
			if (localBody === diskBody || isOnlySerializationNoise(localBody, diskBody)) {
				nodes = {
					...nodes,
					[diskId]: {
						...disk,
						content: localBody,
						mtime: local.mtime
					}
				};
				continue;
			}
			const diskFp = markdownFingerprint(diskBody);
			if (shelvedConflicts.get(local.path) === diskFp) {
				nodes = {
					...nodes,
					[diskId]: {
						...disk,
						content: localBody,
						mtime: local.mtime
					}
				};
				continue;
			}
			shelvedConflicts.set(local.path, diskFp);
			const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
			const base = local.path.replace(/\.md$/i, "");
			let sibling = `${base}.conflict-${stamp}.md`;
			let n = 1;
			while (existingPaths.has(sibling)) {
				sibling = `${base}.conflict-${stamp}-${n}.md`;
				n++;
			}
			existingPaths.add(sibling);
			nodes = {
				...nodes,
				[diskId]: {
					...disk,
					content: localBody,
					mtime: local.mtime
				}
			};
			const siblingId = makeId(sibling);
			nodes = {
				...nodes,
				[siblingId]: {
					id: siblingId,
					path: sibling,
					name: pathToName(sibling),
					kind: "note",
					parentId: disk.parentId,
					mtime: Date.now(),
					content: diskBody
				}
			};
			pathToNewId.set(sibling, siblingId);
			if (disk.parentId == null && !nextRootIds.includes(siblingId)) nextRootIds = [...nextRootIds, siblingId];
			if (isDiskVault(get().mode)) {
				const siblingPath = sibling;
				const body = diskBody;
				enqueueDiskOp(async () => {
					await persistNoteIfFsa(siblingPath, body, { ack: false });
				});
			}
			conflictToast = `Conflict — kept your edits; disk copy saved as ${pathToName(sibling)}`;
		}
		const remappedExpanded = [];
		for (const id of get().expandedFolders) {
			const p = prev[id]?.path;
			if (!p) continue;
			const nid = pathToNewId.get(p);
			if (nid && nodes[nid]) remappedExpanded.push(nid);
		}
		const remappedDirty = [];
		for (const id of get().dirtyNoteIds) {
			const p = prev[id]?.path;
			if (!p) continue;
			const nid = pathToNewId.get(p);
			if (nid && nodes[nid]?.kind === "note") remappedDirty.push(nid);
		}
		for (const path of [...shelvedConflicts.keys()]) if (!remappedDirty.some((id) => nodes[id]?.path === path)) shelvedConflicts.delete(path);
		const now = Date.now();
		const shouldToast = now - lastExternalToastAt > 2500;
		if (shouldToast || conflictToast) lastExternalToastAt = now;
		set({
			nodes,
			rootIds: nextRootIds,
			lastExternalSync: now,
			activeNoteId: nextActive,
			dirtyNoteIds: remappedDirty,
			toast: conflictToast ? conflictToast : shouldToast ? "Vault updated from disk" : get().toast,
			expandedFolders: [.../* @__PURE__ */ new Set([...remappedExpanded, ...expandPathToNote(nodes, nextActive)])]
		});
		if (conflictToast) {
			const activeP = nextActive && nodes[nextActive]?.path || activePath || "vault";
			pushPulse({
				kind: "conflict",
				path: activeP,
				title: pathToName(activeP).replace(/\.md$/i, ""),
				message: conflictToast
			});
		} else if (shouldToast) pushPulse({
			kind: "external",
			path: activePath || "vault",
			title: activePath ? pathToName(activePath).replace(/\.md$/i, "") : "Vault",
			message: "Vault updated from disk"
		});
	},
	getActiveNote: () => {
		const id = get().activeNoteId;
		if (!id) return null;
		return get().nodes[id] ?? null;
	},
	getChildren: (parentId) => {
		return Object.values(get().nodes).filter((n) => n.parentId === parentId).sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	},
	flushDirty: () => {
		flushActiveEditors();
		diskWriteError = null;
		flushDiskOps();
		const disk = isDiskVault(get().mode);
		return writeQueue.then(() => {
			if (diskWriteError) return;
			for (const id of get().dirtyNoteIds) {
				const p = get().nodes[id]?.path;
				if (p) shelvedConflicts.delete(p);
			}
			set({ dirtyNoteIds: [] });
			get().setToast(disk ? "Saved to disk" : "Saved");
		});
	},
	connectCloud: async (provider) => {
		const result = await beginCloudOAuth(provider);
		set({
			cloudSession: result.session ?? loadCloudSession(),
			toast: result.reason || `Use Open folder on your ${providerLabel(provider)} sync directory`
		});
	},
	disconnectCloud: () => {
		disconnectCloud();
		set({
			cloudSession: null,
			toast: "Cloud preference cleared"
		});
	},
	refreshCloudSession: () => {
		set({ cloudSession: loadCloudSession() });
	}
}), {
	name: STORAGE_KEY,
	partialize: (s) => {
		const disk = s.mode === "fsa" || s.mode === "desktop";
		return {
			vaultId: disk ? null : s.vaultId,
			vaultName: disk ? "" : s.vaultName,
			vaultPath: disk ? "" : s.vaultPath,
			mode: disk ? "demo" : s.mode,
			nodes: disk ? {} : s.nodes,
			rootIds: disk ? [] : s.rootIds,
			activeNoteId: disk ? null : s.activeNoteId,
			settings: s.settings,
			expandedFolders: disk ? [] : s.expandedFolders
		};
	}
}));
if (typeof window !== "undefined") window.__NOTEAPP__ = {
	store: useVaultStore,
	importBulk: (input) => useVaultStore.getState().importBulk(input)
};
function getNoteDisplayTitle(node) {
	if (!node) return "";
	return noteTitle(node);
}
function getBreadcrumbs(node, nodes) {
	if (!node) return [];
	const parts = [];
	let cur = node;
	while (cur) {
		parts.unshift(cur.kind === "note" ? noteTitle(cur) : cur.name);
		cur = cur.parentId ? nodes[cur.parentId] : void 0;
	}
	return parts;
}
/**
* Focus / zen mode — hide side panels and restore prior panel state on exit.
*/
var panelSnapshot = null;
/** Enter or exit focus mode, snapshotting left/right panel openness. */
function setFocusMode(on) {
	const prefs = usePrefsStore.getState();
	if (on === prefs.focusMode) return;
	if (on) {
		const settings = useVaultStore.getState().settings;
		panelSnapshot = {
			leftOpen: settings.leftOpen,
			rightOpen: settings.rightOpen
		};
		prefs.updatePrefs({ focusMode: true });
		useVaultStore.getState().setLeftOpen(false);
		useVaultStore.getState().setRightOpen(false);
	} else {
		prefs.updatePrefs({ focusMode: false });
		if (panelSnapshot) {
			useVaultStore.getState().setLeftOpen(panelSnapshot.leftOpen);
			useVaultStore.getState().setRightOpen(panelSnapshot.rightOpen);
			panelSnapshot = null;
		}
	}
}
function toggleFocusMode() {
	const next = !usePrefsStore.getState().focusMode;
	setFocusMode(next);
	return next;
}
/** Window chrome: branding + status. Native traffic lights live in the OS bar. */
function TitleBar() {
	const vaultName = useVaultStore((s) => s.vaultName);
	const mode = useVaultStore((s) => s.mode);
	const lastExternalSync = useVaultStore((s) => s.lastExternalSync);
	const vaultId = useVaultStore((s) => s.vaultId);
	const setSettingsOpen = usePrefsStore((s) => s.setSettingsOpen);
	const focusMode = usePrefsStore((s) => s.focusMode);
	const desktop = isDesktopShell();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "titlebar-drag relative z-40 flex h-11 shrink-0 items-center border-b border-[var(--border)] bg-[rgba(8,8,10,0.94)] px-3 backdrop-blur-xl",
		"data-tauri-drag-region": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: desktop ? "w-[72px] shrink-0" : "w-3 shrink-0 sm:w-4",
				"aria-hidden": true,
				"data-tauri-drag-region": true
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute inset-0 flex items-center justify-center",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusWordmark, {
						size: "sm",
						className: "text-[var(--text-primary)]"
					}), vaultName && !focusMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[var(--text-muted)]",
						children: "·"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[12.5px] text-[var(--text-secondary)]",
						children: vaultName
					})] }) : null]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "titlebar-no-drag ml-auto flex items-center gap-2",
				children: [
					!focusMode ? !vaultId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]",
						children: "No vault"
					}) : lastExternalSync ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "rounded-full border border-[rgba(48,209,88,0.3)] bg-[rgba(48,209,88,0.1)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)]",
						title: new Date(lastExternalSync).toLocaleString(),
						children: ["Live · ", formatRelativeTime(lastExternalSync)]
					}) : mode === "fsa" || mode === "desktop" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-full border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]",
						children: mode === "desktop" ? "Desktop vault" : "Watching disk"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]",
						children: "Local · offline"
					}) : null,
					vaultId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: `icon-btn h-8 w-8${focusMode ? " text-[var(--accent)]" : ""}`,
						title: focusMode ? "Exit focus mode (⌘.)" : "Focus mode (⌘.)",
						"aria-label": focusMode ? "Exit focus mode" : "Enter focus mode",
						"aria-pressed": focusMode,
						onClick: () => setFocusMode(!focusMode),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Focus, { size: 15 })
					}) : null,
					!focusMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "icon-btn h-8 w-8",
						title: "Settings (⌘,)",
						"aria-label": "Open settings",
						onClick: () => setSettingsOpen(true),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { size: 15 })
					}) : null
				]
			})
		]
	});
}
/** Global macOS-style keyboard shortcuts */
function KeyboardShortcuts() {
	(0, import_react.useEffect)(() => {
		const onKey = (e) => {
			const mod = e.metaKey || e.ctrlKey;
			const store = useVaultStore.getState();
			const prefs = usePrefsStore.getState();
			if (mod && (e.key === "," || e.code === "Comma")) {
				e.preventDefault();
				prefs.toggleSettings();
				return;
			}
			if (mod && (e.key === "." || e.code === "Period" || e.shiftKey && e.key.toLowerCase() === "f")) {
				e.preventDefault();
				const next = toggleFocusMode();
				store.setToast(next ? "Focus mode on" : "Focus mode off");
				return;
			}
			if (mod && e.key.toLowerCase() === "k") {
				e.preventDefault();
				store.setCommandOpen(!store.commandOpen);
				return;
			}
			if (e.key === "Escape") {
				if (prefs.settingsOpen) {
					prefs.setSettingsOpen(false);
					return;
				}
				if (store.commandOpen) {
					store.setCommandOpen(false);
					return;
				}
				if (store.settings.graphMode === "fullscreen") {
					store.setGraphMode("panel");
					return;
				}
				if (prefs.focusMode) {
					setFocusMode(false);
					store.setToast("Focus mode off");
					return;
				}
			}
			if (mod && (e.key === "[" || e.code === "BracketLeft") && !e.shiftKey && !e.altKey) {
				e.preventDefault();
				if (!canGoBack()) return;
				const id = goBack();
				if (id && store.nodes[id]?.kind === "note") withHistoryNav(() => store.setActiveNote(id));
				return;
			}
			if (mod && (e.key === "]" || e.code === "BracketRight") && !e.shiftKey && !e.altKey) {
				e.preventDefault();
				if (!canGoForward()) return;
				const id = goForward();
				if (id && store.nodes[id]?.kind === "note") withHistoryNav(() => store.setActiveNote(id));
				return;
			}
			if (mod && e.key.toLowerCase() === "o") {
				e.preventDefault();
				store.openFolderAsVault();
				return;
			}
			if (mod && e.key.toLowerCase() === "e") {
				e.preventDefault();
				store.toggleEditorMode();
				return;
			}
			if (mod && e.key === "\\") {
				e.preventDefault();
				if (prefs.focusMode) return;
				if (e.altKey) store.toggleRight();
				else store.toggleLeft();
				return;
			}
			if (mod && e.key.toLowerCase() === "g") {
				e.preventDefault();
				if (prefs.focusMode) return;
				store.toggleGraphFullscreen();
				return;
			}
			if (mod && e.key.toLowerCase() === "n") {
				e.preventDefault();
				store.createNote(null);
				return;
			}
			if (mod && e.key.toLowerCase() === "d") {
				e.preventDefault();
				store.openDailyNote();
				return;
			}
			if (mod && e.key.toLowerCase() === "s") {
				e.preventDefault();
				store.flushDirty();
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace" && mod) {
				const t = e.target;
				const tag = t?.tagName?.toLowerCase();
				if (tag === "input" || tag === "textarea" || Boolean(t?.isContentEditable) || Boolean(t?.closest?.("[contenteditable=\"true\"]"))) return;
				if (store.pendingDelete || store.commandOpen || prefs.settingsOpen) return;
				const id = store.activeNoteId;
				if (!id) return;
				e.preventDefault();
				store.requestDelete(id);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	return null;
}
function Toast() {
	const toast = useVaultStore((s) => s.toast);
	const setToast = useVaultStore((s) => s.setToast);
	(0, import_react.useEffect)(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 2600);
		return () => clearTimeout(t);
	}, [toast, setToast]);
	if (!toast) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "pointer-events-none fixed bottom-6 left-1/2 z-[120] -translate-x-1/2",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "glass-elevated rounded-full px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] shadow-[0_0_24px_rgba(0,200,255,0.15)]",
			children: toast
		})
	});
}
/** In-app confirm — window.confirm is blocked in many embedded previews. */
function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, onConfirm, onCancel }) {
	const firstBtnRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const t = window.setTimeout(() => {
			firstBtnRef.current?.focus({ preventScroll: true });
		}, 0);
		const onKey = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onCancel();
			}
			if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				onConfirm();
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => {
			window.clearTimeout(t);
			window.removeEventListener("keydown", onKey, true);
		};
	}, [
		open,
		onCancel,
		onConfirm
	]);
	if (!open || typeof document === "undefined") return null;
	return (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]",
		"data-nexus-confirm": "true",
		onMouseDown: (e) => {
			if (e.target === e.currentTarget) onCancel();
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "nexus-confirm-title",
			className: cn("w-full max-w-[380px] rounded-[16px] border border-[var(--border)]", "bg-[var(--bg-elevated,#16161A)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"),
			onMouseDown: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", danger ? "border-[rgba(255,69,58,0.35)] bg-[rgba(255,69,58,0.12)] text-[#FF453A]" : "border-[var(--border)] bg-white/[0.04] text-[var(--accent)]"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { size: 16 })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						id: "nexus-confirm-title",
						className: "text-[15px] font-semibold tracking-tight text-[var(--text-primary)]",
						children: title
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]",
						children: message
					})]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-5 flex justify-end gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					ref: firstBtnRef,
					type: "button",
					className: "ghost-btn",
					onClick: onCancel,
					children: cancelLabel
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: cn("primary-btn", danger && "!border-[rgba(255,69,58,0.45)] !bg-[rgba(255,69,58,0.9)] !text-white hover:!bg-[#FF453A]"),
					onClick: onConfirm,
					children: confirmLabel
				})]
			})]
		})
	}), document.body);
}
/** Top-level delete confirm — portaled; not clipped by sidebars. */
function DeleteConfirmHost() {
	const pending = useVaultStore((s) => s.pendingDelete);
	const confirmPendingDelete = useVaultStore((s) => s.confirmPendingDelete);
	const cancelPendingDelete = useVaultStore((s) => s.cancelPendingDelete);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ConfirmDialog, {
		open: Boolean(pending),
		title: pending?.kind === "folder" ? "Delete folder?" : "Delete note?",
		message: pending ? pending.kind === "folder" ? `Delete “${pending.label}” and everything inside it? This cannot be undone.` : `Delete “${pending.label}”? This cannot be undone.` : "",
		confirmLabel: "Delete",
		danger: true,
		onCancel: cancelPendingDelete,
		onConfirm: confirmPendingDelete
	});
}
/**
* Finder-style vault menu:
* Recents → Open → Create → Reveal → Close
* Cloud / demo / Hermes are not primary destinations.
*/
function VaultSwitcher() {
	const vaultId = useVaultStore((s) => s.vaultId);
	const vaultName = useVaultStore((s) => s.vaultName);
	const vaultPath = useVaultStore((s) => s.vaultPath);
	const mode = useVaultStore((s) => s.mode);
	const recentVaults = useVaultStore((s) => s.recentVaults);
	const openDemoVault = useVaultStore((s) => s.openDemoVault);
	const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
	const createNewVault = useVaultStore((s) => s.createNewVault);
	const revealVaultInFinder = useVaultStore((s) => s.revealVaultInFinder);
	const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
	const closeVault = useVaultStore((s) => s.closeVault);
	const connecting = useVaultStore((s) => s.connecting);
	const [open, setOpen] = (0, import_react.useState)(false);
	const [moreOpen, setMoreOpen] = (0, import_react.useState)(false);
	const [createOpen, setCreateOpen] = (0, import_react.useState)(false);
	const [createName, setCreateName] = (0, import_react.useState)("Nexus Vault");
	const rootRef = (0, import_react.useRef)(null);
	const desktop = isDesktopShell();
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onDoc = (e) => {
			if (!rootRef.current?.contains(e.target)) {
				setOpen(false);
				setMoreOpen(false);
			}
		};
		const onKey = (e) => {
			if (e.key === "Escape") {
				setOpen(false);
				setMoreOpen(false);
				setCreateOpen(false);
			}
		};
		window.addEventListener("mousedown", onDoc);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("mousedown", onDoc);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);
	const subtitle = mode === "desktop" ? vaultPath || "Local folder" : mode === "fsa" ? "Local folder · live watch" : mode === "demo" && vaultId ? "Demo vault" : "Plain Markdown folder";
	const canReveal = Boolean(vaultId && mode === "desktop" && vaultPath);
	const openRecent = (id, rMode) => {
		if (rMode === "demo") openDemoVault();
		else reopenRecentVault(id);
		setOpen(false);
	};
	const submitCreate = () => {
		const name = createName.trim() || "Nexus Vault";
		setCreateOpen(false);
		setOpen(false);
		createNewVault(name);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative px-3 pt-3",
		ref: rootRef,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: () => setOpen((v) => !v),
				className: cn("flex w-full items-center gap-2 rounded-[12px] border border-[var(--border)] bg-white/[0.03] px-3 py-2.5 text-left transition-[border-color,background,transform] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:border-[rgba(0,200,255,0.25)] hover:bg-white/[0.05]", open && "border-[rgba(0,200,255,0.3)] accent-glow"),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(0,200,255,0.12)] text-[var(--accent)]",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, { size: 16 })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "truncate text-[13px] font-semibold tracking-tight",
							children: vaultName || "Select vault"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "truncate text-[11px] text-[var(--text-muted)]",
							children: connecting ? "Working…" : subtitle
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
						size: 15,
						className: cn("shrink-0 text-[var(--text-muted)] transition-transform duration-200", open && "rotate-180")
					})
				]
			}),
			open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "glass-elevated absolute left-3 right-3 top-[calc(100%+6px)] z-50 max-h-[min(70vh,520px)] overflow-y-auto rounded-[14px] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]",
				children: [
					recentVaults.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]",
							children: "Open Recent"
						}),
						recentVaults.slice(0, 8).map((r) => {
							const active = r.id === vaultId;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: cn("flex w-full items-start gap-2 rounded-[10px] px-2.5 py-2 text-left hover:bg-white/[0.05]", active && "bg-[rgba(0,200,255,0.08)]"),
								onClick: () => openRecent(r.id, r.mode),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[var(--accent)]",
									children: active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { size: 14 }) : null
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block truncate text-[12.5px] text-[var(--text-primary)]",
										children: r.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "block truncate text-[11px] text-[var(--text-muted)]",
										children: r.path
									})]
								})]
							}, r.id);
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-2 my-1.5 h-px bg-[var(--border)]" })
					] }) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuRow, {
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, {
							size: 15,
							className: "text-[var(--accent)]"
						}),
						label: "Open…",
						hint: desktop ? "⌘O" : void 0,
						onClick: () => {
							openFolderAsVault();
							setOpen(false);
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuRow, {
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderPlus, {
							size: 15,
							className: "text-[var(--accent)]"
						}),
						label: "New Vault…",
						onClick: () => {
							setCreateName("Nexus Vault");
							setCreateOpen(true);
						}
					}),
					vaultId && mode !== "demo" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-2 my-1.5 h-px bg-[var(--border)]" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuRow, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, {
								size: 15,
								className: canReveal ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
							}),
							label: desktop ? "Show in Finder" : "Show vault location",
							disabled: !canReveal && desktop,
							onClick: () => {
								revealVaultInFinder();
								setOpen(false);
							}
						}),
						!desktop && mode === "fsa" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "px-2.5 pb-1.5 text-[10.5px] leading-snug text-[var(--text-muted)]",
							children: "Browser vaults stay in the folder you granted access to."
						}) : null
					] }) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-2 my-1.5 h-px bg-[var(--border)]" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuRow, {
						icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { size: 15 }),
						label: "Close",
						muted: true,
						disabled: !vaultId,
						onClick: () => {
							closeVault();
							setOpen(false);
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-2 my-1.5 h-px bg-[var(--border)]" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]",
						onClick: () => setMoreOpen((v) => !v),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, { size: 15 }),
							"More",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
								size: 13,
								className: cn("ml-auto transition-transform", moreOpen && "rotate-180")
							})
						]
					}),
					moreOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-0.5 ml-2 border-l border-[var(--border)] pl-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuRow, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, {
								size: 15,
								className: "text-[var(--accent-violet)]"
							}),
							label: "Open demo vault",
							onClick: () => {
								openDemoVault();
								setOpen(false);
								setMoreOpen(false);
							}
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "px-2.5 py-1.5 text-[10.5px] leading-snug text-[var(--text-muted)]",
							children: "Cloud sync: turn on Dropbox, Drive, or OneDrive desktop sync, then use Open… on that folder. Nexus never stores accounts."
						})]
					}) : null
				]
			}) : null,
			createOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "fixed inset-0 z-[90] flex items-center justify-center p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "absolute inset-0 bg-black/55",
					"aria-label": "Cancel",
					onClick: () => setCreateOpen(false)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "glass-elevated relative z-10 w-full max-w-[360px] rounded-[16px] border border-[var(--border)] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "text-[15px] font-semibold tracking-tight",
							children: "New Vault"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-[12.5px] text-[var(--text-muted)]",
							children: [
								"Creates a folder of plain Markdown files",
								desktop ? ", then opens it" : " inside a parent folder you pick",
								"."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "mt-4 block text-[12px] font-medium text-[var(--text-secondary)]",
							children: ["Name", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								autoFocus: true,
								value: createName,
								onChange: (e) => setCreateName(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										submitCreate();
									}
									if (e.key === "Escape") setCreateOpen(false);
								},
								className: "mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none ring-[var(--accent)] focus:ring-1",
								placeholder: "Nexus Vault"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex justify-end gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "ghost-btn",
								onClick: () => setCreateOpen(false),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "primary-btn",
								onClick: submitCreate,
								children: "Create…"
							})]
						})
					]
				})]
			}) : null
		]
	});
}
function MenuRow({ icon, label, onClick, hint, muted, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		disabled,
		onClick,
		className: cn("flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40", muted ? "text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]" : "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"),
		children: [
			icon,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "flex-1",
				children: label
			}),
			hint ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-mono text-[10px] text-[var(--text-muted)]",
				children: hint
			}) : null
		]
	});
}
/** Shared empty placeholder for FileTree, Graph, right-panel sections. */
function EmptyState({ icon, title, description, className, compact = false, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("rounded-[12px] border border-dashed border-[var(--border)] text-center", compact ? "px-3 py-6" : "px-4 py-8", className),
		children: [
			icon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto mb-2 flex justify-center text-[var(--text-muted)] opacity-40",
				children: icon
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[13px] font-medium text-[var(--text-secondary)]",
				children: title
			}),
			description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[11.5px] leading-snug text-[var(--text-muted)]",
				children: description
			}) : null,
			children ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex justify-center",
				children
			}) : null
		]
	});
}
function displayName(node) {
	return node.kind === "note" ? noteTitle(node) : node.name;
}
function isDescendant(nodes, ancestorId, maybeChildId) {
	let p = maybeChildId;
	while (p) {
		if (p === ancestorId) return true;
		p = nodes[p]?.parentId ?? null;
	}
	return false;
}
function resolveDropFromPoint(clientX, clientY, dragId, nodes) {
	const el = document.elementFromPoint(clientX, clientY);
	if (!el) return { type: "root" };
	const row = el.closest("[data-node-id]");
	if (row) {
		const id = row.getAttribute("data-node-id");
		const kind = row.getAttribute("data-node-kind");
		if (id && kind === "folder" && id !== dragId) {
			if (!isDescendant(nodes, dragId, id)) return {
				type: "folder",
				id
			};
		}
		if (id && kind === "note") {
			const parentId = nodes[id]?.parentId ?? null;
			if (parentId && parentId !== dragId && !isDescendant(nodes, dragId, parentId)) return {
				type: "folder",
				id: parentId
			};
			return { type: "root" };
		}
	}
	if (el.closest("[data-file-tree]")) return { type: "root" };
	return null;
}
var TreeNode = (0, import_react.memo)(function TreeNode({ node, depth, renamingId, setRenamingId, openCtx, dragId, dropTarget, onPointerDragStart }) {
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const expandedFolders = useVaultStore((s) => s.expandedFolders);
	const toggleFolder = useVaultStore((s) => s.toggleFolder);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const getChildren = useVaultStore((s) => s.getChildren);
	const renameNode = useVaultStore((s) => s.renameNode);
	const renaming = renamingId === node.id;
	const [nameDraft, setNameDraft] = (0, import_react.useState)(displayName(node));
	const inputRef = (0, import_react.useRef)(null);
	const skipBlur = (0, import_react.useRef)(false);
	(0, import_react.useEffect)(() => {
		if (!renaming) setNameDraft(displayName(node));
	}, [
		node.id,
		node.name,
		node.content,
		renaming
	]);
	(0, import_react.useEffect)(() => {
		if (renaming) {
			setNameDraft(displayName(node));
			requestAnimationFrame(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			});
		}
	}, [renaming, node.id]);
	const expanded = expandedFolders.includes(node.id);
	const childSig = useVaultStore((s) => {
		if (node.kind !== "folder") return "";
		return Object.values(s.nodes).filter((n) => n.parentId === node.id).map((n) => `${n.id}:${n.name}:${n.kind}:${n.mtime}`).sort().join("|");
	});
	const children = (0, import_react.useMemo)(() => node.kind === "folder" && expanded ? getChildren(node.id) : [], [
		node.kind,
		node.id,
		expanded,
		getChildren,
		childSig
	]);
	const isActive = node.kind === "note" && node.id === activeNoteId;
	const isDragging = dragId === node.id;
	const isDropHover = dropTarget?.type === "folder" && dropTarget.id === node.id && dragId != null && dragId !== node.id;
	const commitRename = () => {
		if (skipBlur.current) {
			skipBlur.current = false;
			return;
		}
		const next = nameDraft.trim();
		const current = displayName(node);
		setRenamingId(null);
		if (!next || next === current) {
			setNameDraft(current);
			return;
		}
		renameNode(node.id, next);
	};
	const cancelRename = () => {
		skipBlur.current = true;
		setRenamingId(null);
		setNameDraft(displayName(node));
	};
	const openNote = (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (renaming || dragId) return;
		if (window.__nexusSuppressTreeClick) return;
		if (node.kind === "folder") {
			toggleFolder(node.id);
			return;
		}
		setActiveNote(node.id);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("tree-item group relative flex w-full items-center gap-1.5 text-left select-none", isActive && "is-active", isDragging && "opacity-40", isDropHover && "ring-1 ring-[var(--accent)] bg-[rgba(0,200,255,0.1)]"),
		style: { paddingLeft: 8 + depth * 14 },
		role: "treeitem",
		"aria-selected": isActive,
		"aria-expanded": node.kind === "folder" ? expanded : void 0,
		"data-node-id": node.id,
		"data-node-kind": node.kind,
		onPointerDown: (e) => {
			if (renaming) return;
			if (e.button !== 0) return;
			if (e.target.closest("input,button,[role='button'],a")) return;
			onPointerDragStart(node.id, e);
		},
		onClick: openNote,
		onDoubleClick: (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (dragId) return;
			setRenamingId(node.id);
		},
		onContextMenu: (e) => {
			e.preventDefault();
			e.stopPropagation();
			openCtx({
				kind: "item",
				nodeId: node.id,
				x: e.clientX,
				y: e.clientY
			});
		},
		children: [
			node.kind === "folder" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)]",
				children: expanded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { size: 14 })
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "w-4 shrink-0" }),
			node.kind === "folder" ? expanded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, {
				size: 15,
				className: "shrink-0 text-[var(--accent)]"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Folder, {
				size: 15,
				className: "shrink-0 text-[var(--text-muted)]"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, {
				size: 15,
				className: cn("shrink-0", isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]")
			}),
			renaming ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: inputRef,
				autoFocus: true,
				className: "min-w-0 flex-1 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[13px] text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]",
				value: nameDraft,
				onChange: (e) => setNameDraft(e.target.value),
				onBlur: commitRename,
				onKeyDown: (e) => {
					e.stopPropagation();
					if (e.key === "Enter") {
						e.preventDefault();
						commitRename();
					}
					if (e.key === "Escape") {
						e.preventDefault();
						cancelRename();
					}
				},
				onClick: (e) => e.stopPropagation(),
				onDoubleClick: (e) => e.stopPropagation(),
				onPointerDown: (e) => e.stopPropagation()
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "min-w-0 flex-1 cursor-grab truncate active:cursor-grabbing",
				children: displayName(node)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "titlebar-no-drag relative ml-auto flex shrink-0 opacity-70 group-hover:opacity-100",
				onClick: (e) => e.stopPropagation(),
				onPointerDown: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "icon-btn flex h-6 w-6 items-center justify-center",
					onClick: (e) => {
						e.preventDefault();
						e.stopPropagation();
						const rect = e.currentTarget.getBoundingClientRect();
						openCtx({
							kind: "item",
							nodeId: node.id,
							x: Math.min(rect.right, window.innerWidth - 12),
							y: rect.bottom + 4
						});
					},
					"aria-label": `Actions for ${displayName(node)}`,
					title: "Actions",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, { size: 14 })
				})
			})
		]
	}), node.kind === "folder" && expanded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		role: "group",
		children: children.map((child) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeNode, {
			node: child,
			depth: depth + 1,
			renamingId,
			setRenamingId,
			openCtx,
			dragId,
			dropTarget,
			onPointerDragStart
		}, child.id))
	}) : null] });
});
function MenuBtn({ icon, label, onClick, danger }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors", danger ? "text-[var(--danger)] hover:bg-[rgba(255,69,58,0.1)]" : "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"),
		children: [icon, label]
	});
}
function FileTree() {
	const rootIds = useVaultStore((s) => s.rootIds);
	const nodes = useVaultStore((s) => s.nodes);
	const createNote = useVaultStore((s) => s.createNote);
	const createFromTemplate = useVaultStore((s) => s.createFromTemplate);
	const createFolder = useVaultStore((s) => s.createFolder);
	const requestDelete = useVaultStore((s) => s.requestDelete);
	const toggleFolder = useVaultStore((s) => s.toggleFolder);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	useVaultStore((s) => s.moveNode);
	const [renamingId, setRenamingId] = (0, import_react.useState)(null);
	const [ctx, setCtx] = (0, import_react.useState)(null);
	const [dragId, setDragId] = (0, import_react.useState)(null);
	const [dropTarget, setDropTarget] = (0, import_react.useState)(null);
	const [ghost, setGhost] = (0, import_react.useState)(null);
	const sessionRef = (0, import_react.useRef)(null);
	(0, import_react.useRef)(false);
	const dropTargetRef = (0, import_react.useRef)(null);
	const expandTimer = (0, import_react.useRef)(null);
	const nodesRef = (0, import_react.useRef)(nodes);
	nodesRef.current = nodes;
	const roots = (0, import_react.useMemo)(() => {
		return rootIds.map((id) => nodes[id]).filter(Boolean).sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}, [rootIds, nodes]);
	(0, import_react.useEffect)(() => {
		if (!ctx) return;
		const onPointerDown = (e) => {
			const t = e.target;
			if (t?.closest?.("[data-nexus-ctx-menu]")) return;
			if (t?.closest?.("[data-nexus-confirm]")) return;
			setCtx(null);
		};
		const onKey = (e) => {
			if (e.key === "Escape") setCtx(null);
		};
		const timer = window.setTimeout(() => {
			window.addEventListener("pointerdown", onPointerDown, true);
			window.addEventListener("keydown", onKey);
		}, 0);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("pointerdown", onPointerDown, true);
			window.removeEventListener("keydown", onKey);
		};
	}, [ctx]);
	(0, import_react.useEffect)(() => {
		const onMove = (e) => {
			const s = sessionRef.current;
			if (!s) return;
			const dx = e.clientX - s.startX;
			const dy = e.clientY - s.startY;
			if (!s.active) {
				if (Math.hypot(dx, dy) < 6) return;
				s.active = true;
				setDragId(s.id);
				const n = nodesRef.current[s.id];
				setGhost({
					x: e.clientX,
					y: e.clientY,
					label: n ? displayName(n) : "Moving…"
				});
				document.body.style.cursor = "grabbing";
				document.body.style.userSelect = "none";
			} else setGhost((g) => g ? {
				...g,
				x: e.clientX,
				y: e.clientY
			} : g);
			const target = resolveDropFromPoint(e.clientX, e.clientY, s.id, nodesRef.current);
			dropTargetRef.current = target;
			setDropTarget(target);
			if (target?.type === "folder") {
				const fid = target.id;
				if (!useVaultStore.getState().expandedFolders.includes(fid)) {
					if (!expandTimer.current) expandTimer.current = setTimeout(() => {
						expandTimer.current = null;
						if (sessionRef.current?.active && dropTargetRef.current?.type === "folder" && dropTargetRef.current.id === fid) {
							if (!useVaultStore.getState().expandedFolders.includes(fid)) useVaultStore.getState().toggleFolder(fid);
						}
					}, 420);
				}
			} else if (expandTimer.current) {
				clearTimeout(expandTimer.current);
				expandTimer.current = null;
			}
		};
		const endDrag = (e) => {
			const s = sessionRef.current;
			if (!s) return;
			sessionRef.current = null;
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
			if (expandTimer.current) {
				clearTimeout(expandTimer.current);
				expandTimer.current = null;
			}
			const wasActive = s.active;
			const target = dropTargetRef.current;
			setDragId(null);
			setDropTarget(null);
			setGhost(null);
			dropTargetRef.current = null;
			if (!wasActive) return;
			window.__nexusSuppressTreeClick = true;
			window.setTimeout(() => {
				window.__nexusSuppressTreeClick = false;
			}, 80);
			e.preventDefault();
			if (!target) return;
			if (target.type === "folder") {
				if (target.id === s.id) return;
				if (isDescendant(nodesRef.current, s.id, target.id)) return;
				useVaultStore.getState().moveNode(s.id, target.id);
			} else if (target.type === "root") useVaultStore.getState().moveNode(s.id, null);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", endDrag);
		window.addEventListener("pointercancel", endDrag);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", endDrag);
			window.removeEventListener("pointercancel", endDrag);
		};
	}, []);
	const onPointerDragStart = (id, e) => {
		sessionRef.current = {
			id,
			startX: e.clientX,
			startY: e.clientY,
			active: false,
			pointerId: e.pointerId
		};
	};
	const ctxNode = ctx?.kind === "item" ? nodes[ctx.nodeId] : null;
	const startRename = (id) => {
		setCtx(null);
		setRenamingId(id);
	};
	const createAndRename = (kind, parentId) => {
		setCtx(null);
		if (parentId) {
			if (!useVaultStore.getState().expandedFolders.includes(parentId)) toggleFolder(parentId);
		}
		const id = kind === "note" ? createNote(parentId, "Untitled") : createFolder(parentId, "New Folder");
		requestAnimationFrame(() => setRenamingId(id));
	};
	const createFromTemplateInCtx = (templateId) => {
		const parentId = ctx?.kind === "empty" ? ctx.parentId : ctxNode?.kind === "folder" ? ctxNode.id : null;
		setCtx(null);
		if (parentId) {
			if (!useVaultStore.getState().expandedFolders.includes(parentId)) toggleFolder(parentId);
		}
		createFromTemplate(templateId, parentId);
	};
	const rootDropActive = dropTarget?.type === "root" && dragId != null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		"data-file-tree": true,
		className: cn("titlebar-no-drag relative min-h-full px-2 pb-8", rootDropActive && "rounded-lg ring-1 ring-inset ring-[rgba(0,200,255,0.35)]"),
		role: "tree",
		"aria-label": "Vault files",
		onContextMenu: (e) => {
			e.preventDefault();
			setCtx({
				kind: "empty",
				x: e.clientX,
				y: e.clientY,
				parentId: null
			});
		},
		children: [
			roots.map((node) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeNode, {
				node,
				depth: 0,
				renamingId,
				setRenamingId,
				openCtx: setCtx,
				dragId,
				dropTarget,
				onPointerDragStart
			}, node.id)),
			roots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
				compact: true,
				className: "mx-2 my-4",
				title: "Empty vault",
				description: "Right-click to add a note or folder."
			}) : null,
			dragId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none sticky bottom-1 mt-3 rounded-md border border-dashed border-[rgba(0,200,255,0.28)] bg-[rgba(0,200,255,0.05)] px-2 py-1.5 text-center text-[10.5px] text-[var(--text-muted)]",
				children: "Drop on a folder to nest · drop empty space for root"
			}) : null,
			ghost ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none fixed z-[100] rounded-lg border border-[rgba(0,200,255,0.4)] bg-[rgba(15,15,18,0.95)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-primary)] shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
				style: {
					left: ghost.x + 12,
					top: ghost.y + 12
				},
				children: ghost.label
			}) : null,
			ctx && typeof document !== "undefined" ? (0, import_react_dom.createPortal)(/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				"data-nexus-ctx-menu": true,
				className: "glass-elevated fixed z-[120] min-w-[176px] rounded-[12px] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.5)]",
				style: {
					left: Math.min(ctx.x, window.innerWidth - 200),
					top: Math.min(ctx.y, window.innerHeight - 300)
				},
				onClick: (e) => e.stopPropagation(),
				onPointerDown: (e) => e.stopPropagation(),
				onContextMenu: (e) => e.preventDefault(),
				children: [
					ctx.kind === "empty" || ctxNode && ctxNode.kind === "folder" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 13 }),
							label: "New note",
							onClick: () => createAndRename("note", ctx.kind === "empty" ? ctx.parentId : ctxNode?.kind === "folder" ? ctxNode.id : null)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { size: 13 }),
							label: "New meeting",
							onClick: () => createFromTemplateInCtx("meeting")
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lightbulb, { size: 13 }),
							label: "New idea",
							onClick: () => createFromTemplateInCtx("idea")
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderKanban, { size: 13 }),
							label: "New project",
							onClick: () => createFromTemplateInCtx("project")
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderPlus, { size: 13 }),
							label: "New folder",
							onClick: () => createAndRename("folder", ctx.kind === "empty" ? ctx.parentId : ctxNode?.kind === "folder" ? ctxNode.id : null)
						})
					] }) : null,
					ctx.kind === "item" && ctxNode ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						ctxNode.kind === "folder" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-[var(--border)]" }) : null,
						ctxNode.kind === "note" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { size: 13 }),
							label: "Open",
							onClick: () => {
								setActiveNote(ctxNode.id);
								setCtx(null);
							}
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { size: 13 }),
							label: "Rename",
							onClick: () => startRename(ctxNode.id)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { size: 13 }),
							label: "Delete",
							danger: true,
							onClick: () => {
								const id = ctxNode.id;
								setCtx(null);
								queueMicrotask(() => requestDelete(id));
							}
						})
					] }) : null,
					ctx.kind === "empty" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "px-2.5 py-1 text-[10px] text-[var(--text-muted)]",
						children: "Creates at vault root"
					}) : null
				]
			}), document.body) : null
		]
	});
}
var ICONS = {
	blank: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, { size: 14 }),
	daily: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarDays, { size: 14 }),
	meeting: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { size: 14 }),
	idea: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lightbulb, { size: 14 }),
	project: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderKanban, { size: 14 })
};
/**
* Template chooser for new notes — Blank / Daily / Meeting / Idea / Project.
* Dark SpaceX chrome popover; web + desktop parity.
*/
function NewNoteMenu({ className, children, title = "New note", variant = "icon", parentId = null, align = "left" }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const rootRef = (0, import_react.useRef)(null);
	const menuId = (0, import_react.useId)();
	const createFromTemplate = useVaultStore((s) => s.createFromTemplate);
	const createNote = useVaultStore((s) => s.createNote);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onDoc = (e) => {
			if (!rootRef.current?.contains(e.target)) setOpen(false);
		};
		const onKey = (e) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDoc);
		window.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDoc);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);
	const pick = (id) => {
		setOpen(false);
		if (id === "blank") {
			createNote(parentId, "Untitled");
			return;
		}
		createFromTemplate(id, parentId);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: rootRef,
		className: "relative inline-flex",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: cn(variant === "primary" ? "primary-btn" : variant === "ghost" ? "ghost-btn" : "icon-btn", className),
			title,
			"aria-haspopup": "menu",
			"aria-expanded": open,
			"aria-controls": menuId,
			onClick: () => setOpen((v) => !v),
			children: children ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus2, { size: 16 })
		}), open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			id: menuId,
			role: "menu",
			"aria-label": "New note template",
			className: cn("glass-elevated absolute top-[calc(100%+6px)] z-[90] min-w-[200px] rounded-[12px] border border-[var(--border)] p-1 shadow-[0_16px_48px_rgba(0,0,0,0.55)]", align === "right" ? "right-0" : "left-0"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
				children: "New note"
			}), NOTE_TEMPLATES.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "menuitem",
				onClick: () => pick(t.id),
				className: "flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mt-0.5 text-[var(--accent)]",
					children: ICONS[t.id]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block text-[12.5px] font-medium text-[var(--text-primary)]",
						children: t.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block text-[11px] leading-snug text-[var(--text-muted)]",
						children: t.description
					})]
				})]
			}, t.id))]
		}) : null]
	});
}
var DEFAULT_LEFT_WIDTH = 260;
var WEEKDAY_SHORT = [
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat",
	"Sun"
];
/** Monday-start week containing `ref` (local calendar). */
function weekDaysMondayStart(ref = /* @__PURE__ */ new Date()) {
	const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
	const day = d.getDay();
	const monday = shiftDate(d, day === 0 ? -6 : 1 - day);
	return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}
function LeftSidebar() {
	const leftOpen = useVaultStore((s) => s.settings.leftOpen);
	const leftWidth = useVaultStore((s) => s.settings.leftWidth);
	const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
	const setLeftWidth = useVaultStore((s) => s.setLeftWidth);
	const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
	const createFolder = useVaultStore((s) => s.createFolder);
	const openDailyNote = useVaultStore((s) => s.openDailyNote);
	const openDailyNoteForDate = useVaultStore((s) => s.openDailyNoteForDate);
	const nodes = useVaultStore((s) => s.nodes);
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const recentNoteVisits = useVaultStore((s) => s.recentNoteVisits);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const focusMode = usePrefsStore((s) => s.focusMode);
	const dragStartX = (0, import_react.useRef)(0);
	const dragStartWidth = (0, import_react.useRef)(0);
	const today = /* @__PURE__ */ new Date();
	const todayIso = formatDateISO(today);
	const yesterday = shiftDate(today, -1);
	const yesterdayIso = formatDateISO(yesterday);
	const todayPath = dailyNotePath(today);
	const yesterdayPath = dailyNotePath(yesterday);
	const activePath = activeNoteId && nodes[activeNoteId]?.kind === "note" ? nodes[activeNoteId].path : null;
	const isTodayActive = activePath === todayPath;
	const isYesterdayActive = activePath === yesterdayPath;
	const weekDays = (0, import_react.useMemo)(() => weekDaysMondayStart(/* @__PURE__ */ new Date()), []);
	const recentNotes = (0, import_react.useMemo)(() => {
		const byVisit = [];
		const seen = /* @__PURE__ */ new Set();
		for (const id of recentNoteVisits ?? []) {
			const n = nodes[id];
			if (n?.kind === "note" && !seen.has(id)) {
				byVisit.push(n);
				seen.add(id);
			}
			if (byVisit.length >= 5) break;
		}
		if (byVisit.length >= 5) return byVisit;
		const byMtime = Object.values(nodes).filter((n) => n.kind === "note" && !seen.has(n.id)).sort((a, b) => b.mtime - a.mtime);
		for (const n of byMtime) {
			byVisit.push(n);
			if (byVisit.length >= 5) break;
		}
		return byVisit;
	}, [nodes, recentNoteVisits]);
	if (focusMode) return null;
	if (!leftOpen) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex w-11 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--bg-primary)] py-3 sm:w-12",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: "icon-btn",
			onClick: () => setLeftOpen(true),
			title: "Show sidebar (⌘\\\\)",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeftClose, {
				size: 16,
				className: "rotate-180"
			})
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: "fixed inset-0 z-20 bg-black/50 md:hidden",
		"aria-label": "Close sidebar",
		onClick: () => setLeftOpen(false)
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "titlebar-no-drag panel-slide glass-panel absolute inset-y-0 left-0 z-30 flex h-full w-[min(280px,86vw)] shrink-0 flex-col border-r border-[var(--border)] bg-[rgba(15,15,18,0.94)] md:relative md:z-0 md:bg-[rgba(15,15,18,0.78)]",
		style: { width: leftWidth },
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(VaultSwitcher, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "sidebar-toolbar mt-3 flex items-center gap-1.5 px-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setCommandOpen(true),
						className: "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[var(--border)] bg-white/[0.03] px-2.5 text-left text-[12.5px] text-[var(--text-muted)] transition-colors hover:border-[rgba(0,200,255,0.25)] hover:text-[var(--text-secondary)]",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { size: 14 }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "flex-1 truncate",
								children: "Search"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
								className: "hidden rounded border border-[var(--border)] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)] sm:inline",
								children: "⌘K"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewNoteMenu, {
						title: "New note",
						variant: "icon",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 16 })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "icon-btn",
						title: "Daily note (⌘D)",
						onClick: () => openDailyNote(),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarDays, { size: 16 })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "icon-btn",
						title: "New folder",
						onClick: () => createFolder(null),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderPlus, { size: 16 })
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 px-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "sidebar-section-label px-1 pb-1",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
							children: "Daily"
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-1.5 flex items-center justify-between gap-0.5",
						role: "group",
						"aria-label": "Week days",
						children: weekDays.map((d, i) => {
							const iso = formatDateISO(d);
							const path = dailyNotePath(d);
							const isActive = activePath === path;
							const isToday = iso === todayIso;
							const isYesterday = iso === yesterdayIso;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => openDailyNoteForDate(d),
								title: `${WEEKDAY_SHORT[i]} ${iso}${isToday ? " · Today" : isYesterday ? " · Yesterday" : ""}`,
								className: cn("daily-chip daily-chip--day flex h-8 w-8 flex-col items-center justify-center rounded-lg border text-[11px] font-medium leading-none transition-colors", isActive ? "is-active" : isToday ? "border-[rgba(0,200,255,0.22)] bg-white/[0.04] text-[var(--text-primary)]" : isYesterday ? "border-[var(--border)] bg-white/[0.03] text-[var(--text-secondary)]" : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-white/[0.04] hover:text-[var(--text-secondary)]"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[8.5px] font-semibold uppercase tracking-wide opacity-70",
									children: WEEKDAY_SHORT[i].slice(0, 1)
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mt-0.5 tabular-nums",
									children: d.getDate()
								})]
							}, iso);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap gap-1.5",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn("daily-chip", isTodayActive && "is-active"),
							onClick: () => openDailyNote(),
							title: `Open today's daily note · ${todayIso}`,
							children: "Today"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn("daily-chip", isYesterdayActive && "is-active"),
							onClick: () => openDailyNoteForDate(yesterday),
							title: `Open yesterday's daily note · ${yesterdayIso}`,
							children: "Yesterday"
						})]
					})
				]
			}),
			recentNotes.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 px-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "sidebar-section-label px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
					children: "Recent"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "space-y-0.5",
					children: recentNotes.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setActiveNote(n.id),
						className: "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, {
							size: 12,
							className: "shrink-0 opacity-50"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "truncate",
							children: noteTitle(n)
						})]
					}) }, n.id))
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "sidebar-section-label mt-2 flex items-center justify-between px-4 pb-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
					children: "Files"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "icon-btn h-6 w-6",
					onClick: () => setLeftOpen(false),
					title: "Collapse sidebar",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeftClose, { size: 14 })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "min-h-0 flex-1 overflow-y-auto",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileTree, {})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "separator",
				"aria-orientation": "vertical",
				"aria-label": "Resize left sidebar",
				title: "Drag to resize · double-click to reset",
				className: "panel-resize-handle titlebar-no-drag panel-resize-handle--right",
				onPointerDown: (e) => {
					e.preventDefault();
					dragStartX.current = e.clientX;
					dragStartWidth.current = leftWidth;
					e.currentTarget.setPointerCapture(e.pointerId);
				},
				onPointerMove: (e) => {
					if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
					setLeftWidth(dragStartWidth.current + (e.clientX - dragStartX.current));
				},
				onPointerUp: (e) => {
					if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
				},
				onDoubleClick: () => setLeftWidth(DEFAULT_LEFT_WIDTH)
			})
		]
	})] });
}
/** Bullet list with selectable marker style (disc / circle / square / dash). */
var StyledBulletList = index_default$1.extend({
	name: "bulletList",
	addAttributes() {
		return {
			...this.parent?.(),
			bulletStyle: {
				default: "disc",
				parseHTML: (element) => {
					const v = element.getAttribute("data-bullet");
					return isBulletStyle(v) ? v : "disc";
				},
				renderHTML: (attributes) => {
					return { "data-bullet": isBulletStyle(attributes.bulletStyle) ? attributes.bulletStyle : "disc" };
				}
			}
		};
	},
	addCommands() {
		return {
			...this.parent?.(),
			setBulletStyle: (style) => ({ commands, editor }) => {
				if (!editor.isActive("bulletList")) return commands.toggleBulletList() ? commands.updateAttributes("bulletList", { bulletStyle: style }) : false;
				return commands.updateAttributes("bulletList", { bulletStyle: style });
			}
		};
	}
});
var MIN_W = 80;
var MAX_W = 1200;
function clampWidth(n) {
	return Math.max(MIN_W, Math.min(MAX_W, Math.round(n)));
}
/**
* Vault image with resize handle + alignment.
* Stores width/align for round-trip (HTML img when sized; clean MD when default).
*/
var VaultImage = index_default$6.extend({
	name: "image",
	draggable: true,
	addAttributes() {
		return {
			...this.parent?.(),
			src: { default: null },
			alt: { default: null },
			title: { default: null },
			vaultSrc: {
				default: null,
				parseHTML: (element) => {
					const vault = element.getAttribute("data-vault-src");
					if (vault) return vault;
					const src = element.getAttribute("src") || "";
					if (src && !src.startsWith("http") && !src.startsWith("data:") && !src.startsWith("blob:")) return src;
					return null;
				},
				renderHTML: (attributes) => {
					if (!attributes.vaultSrc) return {};
					return { "data-vault-src": attributes.vaultSrc };
				}
			},
			width: {
				default: null,
				parseHTML: (element) => {
					const w = element.getAttribute("width") || element.getAttribute("data-width") || element.style.width;
					if (!w) return null;
					const n = parseInt(String(w), 10);
					return Number.isFinite(n) && n > 0 ? n : null;
				},
				renderHTML: (attributes) => {
					if (!attributes.width) return {};
					return {
						width: String(attributes.width),
						"data-width": String(attributes.width),
						style: `width: ${attributes.width}px; height: auto;`
					};
				}
			},
			align: {
				default: "center",
				parseHTML: (element) => {
					const a = element.getAttribute("data-align") || element.getAttribute("data-image-align");
					if (a === "left" || a === "right" || a === "center") return a;
					const style = element.getAttribute("style") || "";
					if (style.includes("float: left") || style.includes("float:left")) return "left";
					if (style.includes("float: right") || style.includes("float:right")) return "right";
					return "center";
				},
				renderHTML: (attributes) => {
					return { "data-align": attributes.align || "center" };
				}
			}
		};
	},
	addNodeView() {
		return ({ node, editor, getPos }) => {
			const wrap = document.createElement("div");
			wrap.className = "nexus-image-wrap";
			wrap.setAttribute("data-align", node.attrs.align || "center");
			wrap.contentEditable = "false";
			const frame = document.createElement("div");
			frame.className = "nexus-image-frame";
			const img = document.createElement("img");
			img.className = "nexus-image-el";
			img.draggable = false;
			img.alt = node.attrs.alt || "";
			if (node.attrs.vaultSrc) img.setAttribute("data-vault-src", node.attrs.vaultSrc);
			img.src = node.attrs.src || node.attrs.vaultSrc || "";
			if (node.attrs.width) {
				img.style.width = `${node.attrs.width}px`;
				img.setAttribute("width", String(node.attrs.width));
			}
			img.style.height = "auto";
			img.style.maxWidth = "100%";
			img.style.display = "block";
			const handle = document.createElement("button");
			handle.type = "button";
			handle.className = "nexus-image-handle";
			handle.title = "Drag to resize";
			handle.setAttribute("aria-label", "Resize image");
			handle.tabIndex = -1;
			const toolbar = document.createElement("div");
			toolbar.className = "nexus-image-toolbar";
			toolbar.innerHTML = `
        <button type="button" data-act="smaller" title="Smaller">−</button>
        <button type="button" data-act="larger" title="Larger">+</button>
        <span class="nexus-image-sep"></span>
        <button type="button" data-act="left" title="Align left">⟸</button>
        <button type="button" data-act="center" title="Align center">☰</button>
        <button type="button" data-act="right" title="Align right">⟹</button>
        <span class="nexus-image-sep"></span>
        <button type="button" data-act="reset" title="Reset size">↺</button>
      `;
			frame.appendChild(img);
			frame.appendChild(handle);
			frame.appendChild(toolbar);
			wrap.appendChild(frame);
			const applyAlign = (align) => {
				wrap.setAttribute("data-align", align);
			};
			applyAlign(node.attrs.align || "center");
			let current = node;
			const setAttrs = (attrs) => {
				if (typeof getPos !== "function") return;
				const pos = getPos();
				if (typeof pos !== "number") return;
				editor.chain().focus().command(({ tr }) => {
					const existing = tr.doc.nodeAt(pos);
					if (!existing || existing.type.name !== "image") return false;
					tr.setNodeMarkup(pos, void 0, {
						...existing.attrs,
						...attrs
					});
					return true;
				}).run();
			};
			const currentWidth = () => {
				if (current.attrs.width) return Number(current.attrs.width);
				return img.getBoundingClientRect().width || img.naturalWidth || 320;
			};
			toolbar.addEventListener("mousedown", (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
			toolbar.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				const btn = e.target.closest("button[data-act]");
				if (!btn) return;
				const act = btn.getAttribute("data-act");
				if (act === "smaller") {
					const w = clampWidth(currentWidth() * .85);
					img.style.width = `${w}px`;
					setAttrs({ width: w });
				} else if (act === "larger") {
					const w = clampWidth(currentWidth() * 1.15);
					img.style.width = `${w}px`;
					setAttrs({ width: w });
				} else if (act === "left" || act === "center" || act === "right") {
					applyAlign(act);
					setAttrs({ align: act });
				} else if (act === "reset") {
					img.style.width = "";
					img.removeAttribute("width");
					setAttrs({
						width: null,
						align: "center"
					});
					applyAlign("center");
				}
			});
			let dragging = false;
			let startX = 0;
			let startW = 0;
			const onMove = (e) => {
				if (!dragging) return;
				const dx = e.clientX - startX;
				const next = clampWidth(startW + dx);
				img.style.width = `${next}px`;
			};
			const onUp = (e) => {
				if (!dragging) return;
				dragging = false;
				try {
					handle.releasePointerCapture(e.pointerId);
				} catch {}
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				wrap.classList.remove("is-resizing");
				const w = clampWidth(img.getBoundingClientRect().width);
				img.style.width = `${w}px`;
				setAttrs({ width: w });
			};
			handle.addEventListener("pointerdown", (e) => {
				e.preventDefault();
				e.stopPropagation();
				dragging = true;
				startX = e.clientX;
				startW = currentWidth();
				wrap.classList.add("is-resizing");
				handle.setPointerCapture(e.pointerId);
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
			});
			return {
				dom: wrap,
				selectNode: () => {
					wrap.classList.add("is-selected");
				},
				deselectNode: () => {
					wrap.classList.remove("is-selected");
				},
				update: (updated) => {
					if (updated.type.name !== "image") return false;
					current = updated;
					const vault = updated.attrs.vaultSrc;
					if (vault) img.setAttribute("data-vault-src", vault);
					if (updated.attrs.src) {
						const nextSrc = updated.attrs.src;
						if (!img.src.startsWith("blob:") || nextSrc.startsWith("blob:") || nextSrc.startsWith("data:")) {
							if (img.getAttribute("src") !== nextSrc) img.src = nextSrc;
						}
					} else if (vault && !img.src) img.src = vault;
					img.alt = updated.attrs.alt || "";
					if (updated.attrs.width) {
						img.style.width = `${updated.attrs.width}px`;
						img.setAttribute("width", String(updated.attrs.width));
					} else if (!wrap.classList.contains("is-resizing")) {
						img.style.width = "";
						img.removeAttribute("width");
					}
					applyAlign(updated.attrs.align || "center");
					return true;
				},
				destroy: () => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
				},
				stopEvent: (event) => {
					const t = event.target;
					return t === handle || handle.contains(t) || t === toolbar || toolbar.contains(t);
				},
				ignoreMutation: () => true
			};
		};
	}
});
/**
* Import images into the vault via native file picker (Finder / Explorer / OS dialog).
* Writes under assets/ and returns a vault-relative path for clean Markdown.
*/
var ASSET_DIR = "assets";
var previewCache = /* @__PURE__ */ new Map();
function sanitizeFileName(name) {
	return (name.replace(/\\/g, "/").split("/").pop() || "image.png").replace(/[^\w.\-()+ ]+/g, "_").replace(/\s+/g, "-") || "image.png";
}
function uniqueAssetPath(fileName) {
	const safe = sanitizeFileName(fileName);
	const dot = safe.lastIndexOf(".");
	const stem = dot > 0 ? safe.slice(0, dot) : safe;
	const ext = dot > 0 ? safe.slice(dot) : ".png";
	return `${ASSET_DIR}/${stem}-${Date.now().toString(36).slice(-5)}${ext}`;
}
function mimeFromName(name) {
	const lower = name.toLowerCase();
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".svg")) return "image/svg+xml";
	if (lower.endsWith(".bmp")) return "image/bmp";
	if (lower.endsWith(".avif")) return "image/avif";
	return "application/octet-stream";
}
function toBlobPart(data) {
	const copy = new Uint8Array(data.byteLength);
	copy.set(data);
	return copy;
}
function cachePreview(relPath, blob) {
	const prev = previewCache.get(relPath);
	if (prev) URL.revokeObjectURL(prev);
	const url = URL.createObjectURL(blob);
	previewCache.set(relPath, url);
	return url;
}
/** Browser file picker (used when not in Tauri). */
function pickBrowserImageFile() {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.multiple = false;
		input.style.position = "fixed";
		input.style.left = "-9999px";
		document.body.appendChild(input);
		let settled = false;
		const done = (file) => {
			if (settled) return;
			settled = true;
			input.remove();
			resolve(file);
		};
		input.addEventListener("change", () => {
			done(input.files?.[0] ?? null);
		});
		window.addEventListener("focus", () => {
			window.setTimeout(() => {
				if (!settled && !input.files?.length) done(null);
			}, 400);
		}, { once: true });
		input.click();
	});
}
/**
* Open OS file picker, copy image into vault assets/, return paths.
* Demo / memory vault falls back to in-note data URL (no disk).
*/
async function importImageFromPicker() {
	const desktop = await confirmDesktopShell();
	const mode = useVaultStore.getState().mode;
	const toast = (msg) => useVaultStore.getState().setToast(msg);
	if (desktop && getDesktopRoot()) try {
		const picked = await pickDesktopImageFile();
		if (!picked) return null;
		const root = getDesktopRoot();
		const vaultPath = uniqueAssetPath(picked.name);
		await writeDesktopBinary(root, vaultPath, picked.data);
		const previewUrl = cachePreview(vaultPath, new Blob([toBlobPart(picked.data)], { type: mimeFromName(picked.name) }));
		toast(`Image saved to ${vaultPath}`);
		return {
			vaultPath,
			previewUrl,
			alt: sanitizeFileName(picked.name).replace(/\.[^.]+$/, "")
		};
	} catch (err) {
		console.error("[nexus] desktop image import failed", err);
		toast("Could not import image");
		return null;
	}
	const file = await pickBrowserImageFile();
	if (!file) return null;
	const fsa = getFsaRoot();
	if (mode === "fsa" && fsa) try {
		const vaultPath = uniqueAssetPath(file.name);
		await writeBinaryFile(fsa, vaultPath, file);
		const previewUrl = cachePreview(vaultPath, file);
		toast(`Image saved to ${vaultPath}`);
		return {
			vaultPath,
			previewUrl,
			alt: sanitizeFileName(file.name).replace(/\.[^.]+$/, "")
		};
	} catch (err) {
		console.error("[nexus] fsa image import failed", err);
		toast("Could not write image into vault folder");
	}
	const dataUrl = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
	if (mode === "demo" || mode === "local") toast("Image embedded in note (open a folder vault to save as a file)");
	return {
		vaultPath: dataUrl,
		previewUrl: dataUrl,
		alt: sanitizeFileName(file.name).replace(/\.[^.]+$/, "")
	};
}
/** Resolve vault-relative image path → display URL for the visual editor. */
async function resolveVaultImageUrl(src) {
	if (!src) return null;
	if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:") || src.startsWith("blob:")) return src;
	const cached = previewCache.get(src);
	if (cached) return cached;
	const desktopRoot = getDesktopRoot();
	if (desktopRoot) try {
		const data = await readDesktopBinary(desktopRoot, src);
		return cachePreview(src, new Blob([toBlobPart(data)], { type: mimeFromName(src) }));
	} catch {
		return null;
	}
	const fsa = getFsaRoot();
	if (fsa) try {
		return cachePreview(src, await readBinaryFile(fsa, src));
	} catch {
		return null;
	}
	return null;
}
/**
* Wikilink mark — pill in visual mode, serializes to [[target]] / [[target|alias]].
* Click handling uses DOM events (WKWebView / Mac app friendly).
*/
var Wikilink = Mark.create({
	name: "wikilink",
	inclusive: false,
	excludes: "_",
	addOptions() {
		return {
			onOpen: void 0,
			HTMLAttributes: {}
		};
	},
	addAttributes() {
		return {
			target: {
				default: null,
				parseHTML: (el) => el.getAttribute("data-wikilink"),
				renderHTML: (attrs) => ({ "data-wikilink": attrs.target })
			},
			alias: {
				default: null,
				parseHTML: (el) => el.getAttribute("data-alias"),
				renderHTML: (attrs) => attrs.alias ? { "data-alias": attrs.alias } : {}
			}
		};
	},
	parseHTML() {
		return [{ tag: "span[data-wikilink]" }];
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: "wikilink-pill" }),
			0
		];
	},
	addCommands() {
		return { setWikilink: (attrs) => ({ commands }) => commands.setMark(this.name, attrs) };
	},
	addInputRules() {
		return [new InputRule({
			find: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/,
			handler: ({ range, match, chain }) => {
				const target = (match[1] ?? "").trim();
				const alias = (match[2] ?? "").trim() || target;
				if (!target) return;
				chain().deleteRange(range).insertContent({
					type: "text",
					text: alias,
					marks: [{
						type: this.name,
						attrs: {
							target,
							alias
						}
					}]
				}).run();
			}
		})];
	},
	addProseMirrorPlugins() {
		const onOpen = this.options.onOpen;
		const openFromEvent = (event) => {
			if (!onOpen) return false;
			const el = event.target?.closest?.("span[data-wikilink], .wikilink-pill");
			if (!el) return false;
			const target = el.getAttribute("data-wikilink") || el.getAttribute("data-alias") || el.textContent?.trim();
			if (!target) return false;
			event.preventDefault();
			event.stopPropagation();
			onOpen(target);
			return true;
		};
		return [new Plugin({
			key: new PluginKey("wikilink-click"),
			props: {
				handleClick: (_view, _pos, event) => openFromEvent(event),
				handleDOMEvents: {
					click: (_view, event) => openFromEvent(event),
					mousedown: (_view, event) => {
						if (event.target?.closest?.("span[data-wikilink], .wikilink-pill")) return false;
						return false;
					}
				}
			}
		})];
	}
});
/** [[wikilink]] parsing and resolution — clean CommonMark + wikilinks on disk. */
var WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
function parseWikilinkInner(inner) {
	const pipe = inner.indexOf("|");
	if (pipe >= 0) return {
		target: inner.slice(0, pipe).trim(),
		alias: inner.slice(pipe + 1).trim() || null
	};
	return {
		target: inner.trim(),
		alias: null
	};
}
function extractWikilinks(markdown) {
	const out = [];
	const re = new RegExp(WIKILINK_RE.source, "g");
	let m;
	while ((m = re.exec(markdown)) !== null) {
		const raw = m[0];
		const { target, alias } = parseWikilinkInner(m[1] ?? "");
		if (!target) continue;
		out.push({
			raw,
			target,
			alias,
			start: m.index,
			end: m.index + raw.length
		});
	}
	return out;
}
function extractWikilinkTargets(markdown) {
	const seen = /* @__PURE__ */ new Set();
	for (const w of extractWikilinks(markdown)) seen.add(w.target);
	return [...seen];
}
/**
* Stable fingerprint of wikilink targets in a note body.
* Used by GraphView to skip rebuilds when only non-link content changes (Wave S1).
*/
function getContentLinkSig(markdown) {
	return extractWikilinkTargets(markdown).join("\0");
}
/** Normalize a note title / path for fuzzy wikilink matching */
function normalizeLinkTarget(target) {
	return target.trim().replace(/\.md$/i, "").replace(/\\/g, "/").toLowerCase();
}
function wikilinkContext(markdown, start, end, radius = 60) {
	const from = Math.max(0, start - radius);
	const to = Math.min(markdown.length, end + radius);
	let s = markdown.slice(from, to).replace(/\s+/g, " ").trim();
	if (from > 0) s = "…" + s;
	if (to < markdown.length) s = s + "…";
	return s;
}
function parentFolderOf(path) {
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	parts.pop();
	return parts.join("/");
}
/**
* Map-based wikilink index: normalized title / name / path → node id.
* Built once per resolve pass so graph builds stay O(links) not O(links × notes).
*/
function buildWikilinkIndex(nodes) {
	const index = /* @__PURE__ */ new Map();
	const setIfAbsent = (key, id) => {
		if (key && !index.has(key)) index.set(key, id);
	};
	for (const n of Object.values(nodes)) {
		if (n.kind !== "note") continue;
		const title = normalizeLinkTarget(noteTitle(n));
		const name = normalizeLinkTarget(n.name);
		const path = normalizeLinkTarget(n.path);
		const pathNo = normalizeLinkTarget(n.path.replace(/\.md$/i, ""));
		setIfAbsent(title, n.id);
		setIfAbsent(name, n.id);
		setIfAbsent(pathNo, n.id);
		setIfAbsent(path, n.id);
	}
	for (const f of Object.values(nodes)) {
		if (f.kind !== "folder") continue;
		setIfAbsent(normalizeLinkTarget(f.name), f.id);
		setIfAbsent(normalizeLinkTarget(f.path), f.id);
	}
	return index;
}
function buildGraph(nodes) {
	const notes = Object.values(nodes).filter((n) => n.kind === "note");
	const degree = /* @__PURE__ */ new Map();
	const edgeSet = /* @__PURE__ */ new Set();
	const edges = [];
	const index = buildWikilinkIndex(nodes);
	/** Unresolved wikilink targets → ghost node meta */
	const ghosts = /* @__PURE__ */ new Map();
	const bump = (id) => degree.set(id, (degree.get(id) ?? 0) + 1);
	for (const n of notes) {
		const targets = extractWikilinkTargets(n.content ?? "");
		for (const t of targets) {
			const dest = resolveWikilink(t, nodes, index);
			if (dest && dest.kind === "note" && dest.id !== n.id) {
				const key = [n.id, dest.id].sort().join("→");
				if (edgeSet.has(key)) continue;
				edgeSet.add(key);
				edges.push({
					source: n.id,
					target: dest.id
				});
				bump(n.id);
				bump(dest.id);
				continue;
			}
			if (dest) continue;
			const norm = normalizeLinkTarget(t);
			if (!norm) continue;
			const gid = `ghost:${norm}`;
			let g = ghosts.get(gid);
			if (!g) {
				g = {
					id: gid,
					title: t.trim().replace(/\.md$/i, "") || norm,
					ghostTarget: t.trim(),
					sources: []
				};
				ghosts.set(gid, g);
			}
			if (!g.sources.includes(n.id)) g.sources.push(n.id);
			const gKey = [n.id, gid].sort().join("→");
			if (edgeSet.has(gKey)) continue;
			edgeSet.add(gKey);
			edges.push({
				source: n.id,
				target: gid
			});
			bump(n.id);
			bump(gid);
		}
	}
	const gNodes = notes.map((n) => ({
		id: n.id,
		title: noteTitle(n),
		path: n.path,
		degree: degree.get(n.id) ?? 0,
		preview: previewSnippet(n.content ?? "", 100),
		folder: parentFolderOf(n.path)
	}));
	for (const g of ghosts.values()) gNodes.push({
		id: g.id,
		title: g.title,
		path: "",
		degree: degree.get(g.id) ?? g.sources.length,
		preview: "Missing note — click to create",
		folder: "",
		ghost: true,
		ghostTarget: g.ghostTarget
	});
	return {
		nodes: gNodes,
		edges
	};
}
/**
* Resolve a wikilink target to a note or folder.
* Uses an optional prebuilt index for exact title/path matches;
* falls back to suffix / partial matching for fuzzy targets.
*/
function resolveWikilink(target, nodes, index) {
	const norm = normalizeLinkTarget(target);
	if (!norm) return null;
	const exactId = (index ?? buildWikilinkIndex(nodes)).get(norm);
	if (exactId && nodes[exactId]) return nodes[exactId];
	const notes = Object.values(nodes).filter((n) => n.kind === "note");
	const folders = Object.values(nodes).filter((n) => n.kind === "folder");
	const scoreNote = (n) => {
		const title = normalizeLinkTarget(noteTitle(n));
		const path = normalizeLinkTarget(n.path);
		const pathNo = normalizeLinkTarget(n.path.replace(/\.md$/i, ""));
		if (pathNo.endsWith("/" + norm)) return 80;
		if (path.endsWith(norm + ".md") || pathNo.endsWith(norm)) return 75;
		if (title.includes(norm) && norm.length >= 3) return 40;
		return 0;
	};
	let best = null;
	let bestScore = 0;
	for (const n of notes) {
		const s = scoreNote(n);
		if (s > bestScore) {
			bestScore = s;
			best = n;
		}
	}
	if (best && bestScore >= 75) return best;
	for (const f of folders) {
		const name = normalizeLinkTarget(f.name);
		const path = normalizeLinkTarget(f.path);
		if (name === norm || path === norm || path.endsWith("/" + norm)) return f;
	}
	if (best && bestScore >= 40) return best;
	return null;
}
function buildSuggestItems(nodes, query, limit = 40) {
	const q = normalizeLinkTarget(query);
	const list = [];
	for (const n of Object.values(nodes)) {
		const title = n.kind === "note" ? noteTitle(n) : n.name;
		const pathNoMd = n.path.replace(/\.md$/i, "");
		const hay = `${title} ${pathNoMd}`.toLowerCase();
		if (q && !hay.includes(q) && !normalizeLinkTarget(title).includes(q)) continue;
		list.push({
			id: n.id,
			kind: n.kind,
			title,
			path: n.path,
			target: n.kind === "note" ? title : pathNoMd
		});
	}
	list.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "note" ? -1 : 1;
		const aq = normalizeLinkTarget(a.title).startsWith(q) ? 0 : 1;
		const bq = normalizeLinkTarget(b.title).startsWith(q) ? 0 : 1;
		if (aq !== bq) return aq - bq;
		return a.title.localeCompare(b.title);
	});
	return list.slice(0, limit);
}
/** Scan text before cursor for an unfinished `[[query` (no closing ]]). */
function detectOpenWikilink(editor) {
	const { state } = editor;
	const { from } = state.selection;
	if (!state.selection.empty) return null;
	const $from = state.selection.$from;
	const parentStart = $from.start();
	const m = $from.parent.textBetween(Math.max(0, $from.parentOffset - 80), $from.parentOffset, "\0", "\0").match(/\[\[([^\]\n]*)$/);
	if (!m) return null;
	const query = m[1] ?? "";
	if (query.includes("\0")) return null;
	const openAt = from - query.length - 2;
	if (openAt < parentStart - 1) return null;
	return {
		active: true,
		query,
		from: openAt,
		to: from
	};
}
/**
* Source (textarea) variant: detect open `[[query` before cursor index.
*/
function detectOpenWikilinkInText(text, cursor) {
	if (cursor < 0 || cursor > text.length) return null;
	const start = Math.max(0, cursor - 80);
	const m = text.slice(start, cursor).match(/\[\[([^\]\n]*)$/);
	if (!m) return null;
	const query = m[1] ?? "";
	const from = cursor - query.length - 2;
	if (from < 0) return null;
	return {
		query,
		from,
		to: cursor
	};
}
/**
* Approximate caret viewport rect inside a textarea (mirror technique).
*/
function coordsAtTextareaCaret(ta, cursor) {
	try {
		const style = window.getComputedStyle(ta);
		const mirror = document.createElement("div");
		mirror.style.position = "absolute";
		mirror.style.visibility = "hidden";
		mirror.style.overflow = "hidden";
		mirror.style.whiteSpace = "pre-wrap";
		mirror.style.wordWrap = "break-word";
		mirror.style.top = "0";
		mirror.style.left = "-9999px";
		mirror.style.width = `${ta.clientWidth}px`;
		mirror.style.font = style.font;
		mirror.style.fontSize = style.fontSize;
		mirror.style.fontFamily = style.fontFamily;
		mirror.style.fontWeight = style.fontWeight;
		mirror.style.lineHeight = style.lineHeight;
		mirror.style.letterSpacing = style.letterSpacing;
		mirror.style.padding = style.padding;
		mirror.style.border = style.border;
		mirror.style.boxSizing = style.boxSizing;
		const text = ta.value.slice(0, cursor);
		mirror.textContent = text.endsWith("\n") ? text + "​" : text;
		const marker = document.createElement("span");
		marker.textContent = "​";
		mirror.appendChild(marker);
		document.body.appendChild(mirror);
		const taRect = ta.getBoundingClientRect();
		const markerRect = marker.getBoundingClientRect();
		const mirrorRect = mirror.getBoundingClientRect();
		const left = taRect.left + (markerRect.left - mirrorRect.left) - ta.scrollLeft;
		const top = taRect.top + (markerRect.top - mirrorRect.top) - ta.scrollTop;
		const lineH = markerRect.height || parseFloat(style.lineHeight) || 18;
		document.body.removeChild(mirror);
		return {
			left: Math.max(8, left),
			top: Math.max(8, top),
			bottom: Math.max(8, top + lineH)
		};
	} catch {
		const r = ta.getBoundingClientRect();
		return {
			left: r.left + 16,
			top: r.top + 24,
			bottom: r.top + 48
		};
	}
}
function coordsAtPos(editor, pos) {
	try {
		const coords = editor.view.coordsAtPos(pos);
		return {
			left: coords.left,
			top: coords.top,
			bottom: coords.bottom
		};
	} catch {
		return {
			left: 24,
			top: 120,
			bottom: 140
		};
	}
}
/** Replace [[query with a wikilink mark pill (Visual editor) */
function insertWikilinkSuggestion(editor, range, item) {
	const alias = item.title;
	const target = item.target;
	editor.chain().focus().deleteRange(range).insertContent({
		type: "text",
		text: alias,
		marks: [{
			type: "wikilink",
			attrs: {
				target,
				alias
			}
		}]
	}).insertContent(" ").run();
}
/** Insert `[[target]]` into a source string at range */
function insertWikilinkInSource(text, range, item) {
	const token = `[[${item.target}]]`;
	return {
		next: text.slice(0, range.from) + token + text.slice(range.to),
		cursor: range.from + token.length
	};
}
/** In-app input dialog — replaces window.prompt (blocked in many shells). */
function InsertFieldDialog({ open, title, label, placeholder, initialValue = "", confirmLabel = "Insert", secondaryLabel, onConfirm, onSecondary, onClose }) {
	const [value, setValue] = (0, import_react.useState)(initialValue);
	const inputRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		setValue(initialValue);
		const t = window.setTimeout(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		}, 30);
		return () => window.clearTimeout(t);
	}, [open, initialValue]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);
	if (!open) return null;
	const submit = () => {
		const v = value.trim();
		if (!v) return;
		onConfirm(v);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]",
		role: "dialog",
		"aria-modal": "true",
		"aria-label": title,
		onMouseDown: (e) => {
			if (e.target === e.currentTarget) onClose();
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("w-full max-w-md rounded-xl border border-[var(--border-strong)]", "bg-[var(--bg-elevated)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"),
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-3 flex items-center justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "text-[14px] font-semibold tracking-tight text-[var(--text-primary)]",
						children: title
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "icon-btn h-7 w-7",
						title: "Close",
						onClick: onClose,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { size: 14 })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					className: "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]",
					children: label
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					ref: inputRef,
					className: "field w-full",
					value,
					placeholder,
					spellCheck: false,
					onChange: (e) => setValue(e.target.value),
					onKeyDown: (e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							submit();
						}
					}
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-wrap items-center justify-end gap-2",
					children: [
						secondaryLabel && onSecondary ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "ghost-btn",
							onClick: onSecondary,
							children: secondaryLabel
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "ghost-btn",
							onClick: onClose,
							children: "Cancel"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "primary-btn",
							disabled: !value.trim(),
							onClick: submit,
							children: confirmLabel
						})
					]
				})
			]
		})
	});
}
function EditorToolbar({ editor }) {
	const [, bump] = (0, import_react.useReducer)((n) => n + 1, 0);
	const [dialog, setDialog] = (0, import_react.useState)(null);
	const [linkSeed, setLinkSeed] = (0, import_react.useState)("https://");
	const [importingImage, setImportingImage] = (0, import_react.useState)(false);
	const [moreOpen, setMoreOpen] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const onUp = () => bump();
		editor.on("selectionUpdate", onUp);
		editor.on("transaction", onUp);
		editor.on("focus", onUp);
		return () => {
			editor.off("selectionUpdate", onUp);
			editor.off("transaction", onUp);
			editor.off("focus", onUp);
		};
	}, [editor]);
	const inTable = editor.isActive("table");
	const inBullet = editor.isActive("bulletList");
	const currentBullet = (() => {
		if (!inBullet) return "disc";
		const raw = editor.getAttributes("bulletList").bulletStyle;
		return isBulletStyle(raw) ? raw : "disc";
	})();
	const moreActive = editor.isActive({ textAlign: "left" }) || editor.isActive({ textAlign: "center" }) || editor.isActive({ textAlign: "right" }) || editor.isActive("codeBlock") || editor.isActive("blockquote");
	const openLinkDialog = () => {
		const prev = editor.getAttributes("link").href || "";
		setLinkSeed(prev || "https://");
		setDialog("link");
	};
	const applyLink = (url) => {
		const href = url.trim();
		if (!href) {
			setDialog(null);
			return;
		}
		editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
		setDialog(null);
	};
	const removeLink = () => {
		editor.chain().focus().extendMarkRange("link").unsetLink().run();
		setDialog(null);
	};
	const pickAndInsertImage = async () => {
		if (importingImage) return;
		setImportingImage(true);
		try {
			const imported = await importImageFromPicker();
			if (!imported) return;
			editor.chain().focus().setImage({
				src: imported.previewUrl,
				alt: imported.alt,
				vaultSrc: imported.vaultPath.startsWith("data:") ? null : imported.vaultPath
			}).run();
			requestAnimationFrame(() => {
				const imgs = editor.view.dom.querySelectorAll("img");
				const last = imgs[imgs.length - 1];
				if (last && imported.vaultPath && !imported.vaultPath.startsWith("data:")) {
					last.setAttribute("data-vault-src", imported.vaultPath);
					last.setAttribute("src", imported.previewUrl);
					last.setAttribute("alt", imported.alt);
				}
			});
		} finally {
			setImportingImage(false);
		}
	};
	const btn = (active, onClick, icon, title, disabled) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		title,
		disabled,
		onMouseDown: (e) => {
			e.preventDefault();
			if (!disabled) onClick();
		},
		className: cn("icon-btn h-7 w-7", active && "is-active", disabled && "pointer-events-none opacity-35"),
		children: icon
	});
	const moreItem = (active, onClick, icon, label) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onMouseDown: (e) => {
			e.preventDefault();
			onClick();
			setMoreOpen(false);
		},
		className: cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors", active ? "bg-[rgba(0,200,255,0.12)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]"),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "flex h-5 w-5 shrink-0 items-center justify-center opacity-80",
			children: icon
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "flex-1",
			children: label
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-0 border-b border-[var(--border)]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-nowrap items-center gap-0.5 overflow-x-auto px-3 py-1.5",
				children: [
					btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bold, { size: 14 }), "Bold"),
					btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Italic, { size: 14 }), "Italic"),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
					btn(editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading1, { size: 14 }), "Heading 1"),
					btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading2, { size: 14 }), "Heading 2"),
					btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading3, { size: 14 }), "Heading 3"),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
					btn(inBullet, () => editor.chain().focus().toggleBulletList().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(List, { size: 14 }), "Bullet list"),
					btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListOrdered, { size: 14 }), "Ordered list"),
					btn(editor.isActive("taskList"), () => editor.chain().focus().toggleTaskList().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListChecks, { size: 14 }), "Task list"),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
					btn(editor.isActive("link"), openLinkDialog, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { size: 14 }), "Link"),
					btn(importingImage, () => void pickAndInsertImage(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Image, { size: 14 }), importingImage ? "Importing image…" : "Insert image from file", importingImage),
					btn(inTable, () => {
						if (inTable) return;
						editor.chain().focus().insertTable({
							rows: 3,
							cols: 3,
							withHeaderRow: true
						}).run();
					}, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Table, { size: 14 }), inTable ? "Table selected" : "Insert table"),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Root2, {
						open: moreOpen,
						onOpenChange: setMoreOpen,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trigger, {
							asChild: true,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								title: "More formatting",
								onMouseDown: (e) => e.preventDefault(),
								className: cn("icon-btn h-7 w-7", (moreOpen || moreActive) && "is-active"),
								"aria-label": "More formatting",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, { size: 14 })
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Content2, {
							side: "bottom",
							align: "end",
							sideOffset: 6,
							className: "z-[80] w-[200px] rounded-[12px] border border-[var(--border)] bg-[rgba(18,18,22,0.97)] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl",
							onOpenAutoFocus: (e) => e.preventDefault(),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
									children: "Align"
								}),
								moreItem(editor.isActive({ textAlign: "left" }), () => editor.chain().focus().setTextAlign("left").run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlignLeft, { size: 14 }), "Align left"),
								moreItem(editor.isActive({ textAlign: "center" }), () => editor.chain().focus().setTextAlign("center").run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlignCenter, { size: 14 }), "Align center"),
								moreItem(editor.isActive({ textAlign: "right" }), () => editor.chain().focus().setTextAlign("right").run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlignRight, { size: 14 }), "Align right"),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "my-1 h-px bg-[var(--border)]" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
									children: "Blocks"
								}),
								moreItem(editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeXml, { size: 14 }), "Code block"),
								moreItem(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Quote, { size: 14 }), "Quote"),
								moreItem(false, () => editor.chain().focus().setHorizontalRule().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minus, { size: 14 }), "Divider")
							]
						}) })]
					})
				]
			}),
			inBullet ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-1 border-t border-[var(--border)] bg-[rgba(123,97,255,0.05)] px-3 py-1.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-violet)]",
					children: "Bullets"
				}), BULLET_STYLES.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					title: `${b.label} bullets`,
					onMouseDown: (e) => {
						e.preventDefault();
						editor.chain().focus().setBulletStyle(b.id).run();
					},
					className: cn("inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border px-2 text-[12px] transition-colors", currentBullet === b.id ? "border-[rgba(0,200,255,0.45)] bg-[rgba(0,200,255,0.12)] text-[var(--accent)]" : "border-transparent bg-white/[0.03] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[13px] leading-none",
						"aria-hidden": true,
						children: b.sample
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "hidden sm:inline",
						children: b.label
					})]
				}, b.id))]
			}) : null,
			inTable ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-center gap-0.5 border-t border-[var(--border)] bg-[rgba(0,200,255,0.04)] px-3 py-1.5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]",
						children: "Table"
					}),
					btn(false, () => editor.chain().focus().addColumnBefore().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BetweenHorizontalStart, { size: 14 }), "Add column before"),
					btn(false, () => editor.chain().focus().addColumnAfter().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BetweenHorizontalEnd, { size: 14 }), "Add column after"),
					btn(false, () => editor.chain().focus().deleteColumn().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Columns3, { size: 14 }), "Delete column"),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
					btn(false, () => editor.chain().focus().addRowBefore().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BetweenVerticalStart, { size: 14 }), "Add row before"),
					btn(false, () => editor.chain().focus().addRowAfter().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BetweenVerticalEnd, { size: 14 }), "Add row after"),
					btn(false, () => editor.chain().focus().deleteRow().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rows3, { size: 14 }), "Delete row"),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
					btn(false, () => editor.chain().focus().toggleHeaderRow().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading, { size: 14 }), "Toggle header row"),
					btn(editor.isActive({ textAlign: "left" }), () => editor.chain().focus().setTextAlign("left").run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlignLeft, { size: 14 }), "Cell align left"),
					btn(editor.isActive({ textAlign: "center" }), () => editor.chain().focus().setTextAlign("center").run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlignCenter, { size: 14 }), "Cell align center"),
					btn(editor.isActive({ textAlign: "right" }), () => editor.chain().focus().setTextAlign("right").run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlignRight, { size: 14 }), "Cell align right"),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
					btn(false, () => editor.chain().focus().deleteTable().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { size: 14 }), "Delete table")
				]
			}) : null
		]
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InsertFieldDialog, {
		open: dialog === "link",
		title: "Add link",
		label: "URL",
		placeholder: "https://example.com",
		initialValue: linkSeed,
		confirmLabel: "Apply link",
		secondaryLabel: editor.isActive("link") ? "Remove link" : void 0,
		onSecondary: editor.isActive("link") ? removeLink : void 0,
		onConfirm: applyLink,
		onClose: () => setDialog(null)
	})] });
}
function Sep() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-1 h-4 w-px shrink-0 bg-[var(--border)]" });
}
/** Floating autocomplete for [[wikilinks]] — notes + folders, scrollable. */
function WikilinkSuggestMenu({ open, items, selected, query, rect, onSelect, onHover, onClose }) {
	const listRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		(listRef.current?.querySelector(`[data-idx="${selected}"]`))?.scrollIntoView({ block: "nearest" });
	}, [selected, open]);
	if (!open) return null;
	const maxH = 280;
	const top = window.innerHeight - rect.bottom - 12 < 160 && rect.top > 200 ? Math.max(8, rect.top - maxH - 6) : Math.min(rect.bottom + 6, window.innerHeight - 120);
	const left = Math.min(Math.max(8, rect.left), window.innerWidth - 320);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed z-[95] w-[min(320px,calc(100vw-16px))] overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[rgba(12,12,15,0.97)] shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl",
		style: {
			left,
			top,
			maxHeight: maxH
		},
		role: "listbox",
		"aria-label": "Link to note or folder",
		onMouseDown: (e) => {
			e.preventDefault();
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between border-b border-[var(--border)] px-3 py-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]",
					children: "Link to"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "truncate font-mono text-[10px] text-[var(--text-muted)]",
					children: [
						"[[",
						query || "…",
						"]]"
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: listRef,
				className: "max-h-[232px] overflow-y-auto overscroll-contain p-1",
				children: items.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-2.5 py-3 text-[12.5px] text-[var(--text-muted)]",
					children: "No matches — keep typing or create the note later."
				}) : items.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					"data-idx": i,
					role: "option",
					"aria-selected": i === selected,
					className: cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors", i === selected ? "bg-[rgba(0,200,255,0.12)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]"),
					onMouseEnter: () => onHover(i),
					onClick: () => onSelect(item),
					children: [
						item.kind === "folder" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Folder, {
							size: 14,
							className: "shrink-0 text-[var(--accent)]"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, {
							size: 14,
							className: "shrink-0 text-[var(--text-muted)]"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block truncate text-[12.5px] font-medium",
								children: item.title
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block truncate font-mono text-[10px] text-[var(--text-muted)]",
								children: item.path
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "shrink-0 text-[9px] uppercase tracking-wide text-[var(--text-muted)]",
							children: item.kind
						})
					]
				}, item.id))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "border-t border-[var(--border)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]",
				children: ["↑↓ navigate · Enter select · Esc close", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "float-right text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
					onClick: onClose,
					children: "Esc"
				})]
			})
		]
	});
}
function openWikilinkTarget(target) {
	const state = useVaultStore.getState();
	try {
		flushActiveEditors();
	} catch {}
	const hit = resolveWikilink(target, state.nodes);
	if (!hit) {
		state.setToast(`No note found for [[${target}]]`);
		return;
	}
	if (hit.kind === "folder") {
		if (!state.expandedFolders.includes(hit.id)) state.toggleFolder(hit.id);
		const child = Object.values(state.nodes).filter((n) => n.parentId === hit.id && n.kind === "note").sort((a, b) => a.name.localeCompare(b.name))[0];
		if (child) state.setActiveNote(child.id);
		else state.setToast(`Opened folder “${hit.name}”`);
		return;
	}
	state.setActiveNote(hit.id);
}
/**
* True when daily template Focus section still has only empty bullets
* (e.g. `## Focus\n\n- \n`).
*/
function hasEmptyFocusBullet$1(markdown) {
	const focusMatch = /^##\s+Focus\s*\n([\s\S]*?)(?=^##\s+|\s*$)/m.exec(markdown);
	if (!focusMatch) return false;
	const body = focusMatch[1].trim();
	if (!body) return true;
	const lines = body.split("\n").filter((l) => l.trim().length > 0);
	if (lines.length === 0) return true;
	return lines.every((line) => /^\s*-\s*$/.test(line));
}
/** Place caret in first empty paragraph under ## Focus, else focus end of first list item. */
function morningAutofocusEditor(ed) {
	let afterFocus = false;
	let targetPos = null;
	ed.state.doc.descendants((node, pos) => {
		if (targetPos != null) return false;
		if (node.type.name === "heading") {
			if (node.textContent.trim().toLowerCase() === "focus") {
				afterFocus = true;
				return;
			}
			if (afterFocus) {
				afterFocus = false;
				return false;
			}
		}
		if (afterFocus && node.type.name === "paragraph" && node.textContent.trim() === "") {
			targetPos = pos + 1;
			return false;
		}
	});
	if (targetPos != null) ed.chain().focus().setTextSelection(targetPos).run();
	else ed.commands.focus();
}
/**
* Visual view of a single note. Parent remounts via key when note/mode changes.
* Always: Markdown store ↔ GFM HTML (tables, tasks) ↔ TipTap ↔ clean Markdown.
*/
function VisualEditor({ noteId, content }) {
	const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
	const saveTimer = (0, import_react.useRef)(null);
	const applying = (0, import_react.useRef)(false);
	const userEdited = (0, import_react.useRef)(false);
	const baselineMd = (0, import_react.useRef)(content);
	const noteIdRef = (0, import_react.useRef)(noteId);
	const contentRef = (0, import_react.useRef)(content);
	/** Morning autofocus: once per note id open */
	const morningFocusedFor = (0, import_react.useRef)(null);
	noteIdRef.current = noteId;
	contentRef.current = content;
	const [suggestOpen, setSuggestOpen] = (0, import_react.useState)(false);
	const [suggestQuery, setSuggestQuery] = (0, import_react.useState)("");
	const [suggestFrom, setSuggestFrom] = (0, import_react.useState)(0);
	const [suggestTo, setSuggestTo] = (0, import_react.useState)(0);
	const [suggestItems, setSuggestItems] = (0, import_react.useState)([]);
	const [suggestSelected, setSuggestSelected] = (0, import_react.useState)(0);
	const [suggestRect, setSuggestRect] = (0, import_react.useState)({
		left: 0,
		top: 0,
		bottom: 0
	});
	const suggestOpenRef = (0, import_react.useRef)(false);
	const suggestItemsRef = (0, import_react.useRef)([]);
	const suggestSelectedRef = (0, import_react.useRef)(0);
	const suggestRangeRef = (0, import_react.useRef)({
		from: 0,
		to: 0
	});
	suggestOpenRef.current = suggestOpen;
	suggestItemsRef.current = suggestItems;
	suggestSelectedRef.current = suggestSelected;
	suggestRangeRef.current = {
		from: suggestFrom,
		to: suggestTo
	};
	const paintEditorExtras = (ed) => {
		ed.view.dom.querySelectorAll("span[data-wikilink]").forEach((pill) => {
			const hit = resolveWikilink(pill.getAttribute("data-wikilink") || "", useVaultStore.getState().nodes);
			pill.classList.toggle("is-missing", !hit);
			pill.classList.add("wikilink-pill");
			pill.style.cursor = "pointer";
		});
		(async () => {
			const imgs = Array.from(ed.view.dom.querySelectorAll("img[src], img[data-vault-src]"));
			for (const img of imgs) {
				const srcAttr = img.getAttribute("src") || "";
				const key = img.getAttribute("data-vault-src") || (srcAttr && !srcAttr.startsWith("http") && !srcAttr.startsWith("blob:") && !srcAttr.startsWith("data:") ? srcAttr : null);
				if (!key) continue;
				if (!img.getAttribute("data-vault-src")) img.setAttribute("data-vault-src", key);
				if (srcAttr.startsWith("blob:") || srcAttr.startsWith("data:")) continue;
				const url = await resolveVaultImageUrl(key);
				if (url && !ed.isDestroyed) img.setAttribute("src", url);
			}
		})();
	};
	const refreshSuggest = (0, import_react.useCallback)((ed) => {
		const open = detectOpenWikilink(ed);
		if (!open) {
			setSuggestOpen(false);
			return;
		}
		const items = buildSuggestItems(useVaultStore.getState().nodes, open.query);
		setSuggestOpen(true);
		setSuggestQuery(open.query);
		setSuggestFrom(open.from);
		setSuggestTo(open.to);
		setSuggestItems(items);
		setSuggestSelected(0);
		setSuggestRect(coordsAtPos(ed, open.to));
	}, []);
	const commit = (0, import_react.useCallback)((ed, opts) => {
		if (applying.current && !(opts?.force && userEdited.current)) return;
		if (!ed || ed.isDestroyed) return;
		const id = noteIdRef.current;
		let serialized;
		try {
			serialized = htmlDocToMarkdown(ed.view.dom);
		} catch {
			return;
		}
		const prev = useVaultStore.getState().nodes[id]?.content ?? baselineMd.current;
		const edited = userEdited.current;
		if (isOnlySerializationNoise(prev, serialized) && !edited) return;
		const md = edited ? normalizeMarkdown(prev) === normalizeMarkdown(serialized) ? prev : normalizeMarkdown(serialized) : preferCleanWrite(prev, serialized);
		if (md === prev) {
			userEdited.current = false;
			return;
		}
		baselineMd.current = md;
		userEdited.current = false;
		updateNoteContent(id, md);
	}, [updateNoteContent]);
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			index_default$3.configure({
				heading: { levels: [
					1,
					2,
					3,
					4
				] },
				codeBlock: { HTMLAttributes: { class: "note-code" } },
				bulletList: false
			}),
			StyledBulletList,
			index_default$2.configure({ placeholder: "Start writing… Type [[ to link notes." }),
			index_default$4.configure({ HTMLAttributes: { "data-type": "taskList" } }),
			index_default$5.configure({
				nested: true,
				HTMLAttributes: { "data-type": "taskItem" }
			}),
			VaultImage.configure({
				inline: false,
				allowBase64: true
			}),
			index_default.configure({
				openOnClick: false,
				autolink: true
			}),
			index_default$7.configure({
				types: ["heading", "paragraph"],
				alignments: [
					"left",
					"center",
					"right"
				]
			}),
			Table$1.configure({
				resizable: true,
				HTMLAttributes: { class: "note-table" }
			}),
			TableRow,
			TableHeader,
			TableCell,
			Wikilink.configure({ onOpen: (target) => openWikilinkTarget(target) })
		],
		content: markdownWithWikilinksToHtml(content || ""),
		editorProps: {
			attributes: {
				class: "note-editor min-h-[50vh] focus:outline-none",
				"data-note-id": noteId
			},
			handleKeyDown: (view, event) => {
				if (!suggestOpenRef.current) return false;
				const items = suggestItemsRef.current;
				if (event.key === "ArrowDown") {
					event.preventDefault();
					setSuggestSelected((i) => items.length ? (i + 1) % items.length : 0);
					return true;
				}
				if (event.key === "ArrowUp") {
					event.preventDefault();
					setSuggestSelected((i) => items.length ? (i - 1 + items.length) % items.length : 0);
					return true;
				}
				if (event.key === "Enter" || event.key === "Tab") {
					if (!items.length) return false;
					event.preventDefault();
					const item = items[suggestSelectedRef.current] ?? items[0];
					if (item) {
						const { from, to } = suggestRangeRef.current;
						const { state, dispatch } = view;
						const tr = state.tr;
						tr.delete(from, to);
						const mark = state.schema.marks.wikilink?.create({
							target: item.target,
							alias: item.title
						});
						const textNode = state.schema.text(item.title, mark ? [mark] : void 0);
						tr.insert(from, textNode);
						tr.insertText(" ", from + item.title.length);
						dispatch(tr);
						setSuggestOpen(false);
					}
					return true;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					setSuggestOpen(false);
					return true;
				}
				return false;
			}
		},
		onCreate: ({ editor: ed }) => {
			applying.current = true;
			const html = markdownWithWikilinksToHtml(contentRef.current || "");
			ed.commands.setContent(html, { emitUpdate: false });
			baselineMd.current = contentRef.current;
			userEdited.current = false;
			requestAnimationFrame(() => {
				paintEditorExtras(ed);
				applying.current = false;
			});
		},
		onUpdate: ({ editor: ed }) => {
			if (applying.current) return;
			userEdited.current = true;
			refreshSuggest(ed);
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => commit(ed), 160);
		},
		onSelectionUpdate: ({ editor: ed }) => {
			if (applying.current) return;
			refreshSuggest(ed);
		}
	}, [noteId]);
	(0, import_react.useEffect)(() => {
		if (!editor || editor.isDestroyed) return;
		if (userEdited.current) return;
		if (isOnlySerializationNoise(baselineMd.current, content)) return;
		applying.current = true;
		baselineMd.current = content;
		contentRef.current = content;
		const html = markdownWithWikilinksToHtml(content || "");
		editor.commands.setContent(html, { emitUpdate: false });
		requestAnimationFrame(() => {
			paintEditorExtras(editor);
			applying.current = false;
		});
	}, [editor, content]);
	(0, import_react.useEffect)(() => {
		if (!editor || editor.isDestroyed) return;
		if (morningFocusedFor.current === noteId) return;
		const node = useVaultStore.getState().nodes[noteId];
		if (!node || node.kind !== "note") return;
		if (node.path !== dailyNotePath(/* @__PURE__ */ new Date())) return;
		if (!hasEmptyFocusBullet$1(node.content ?? content)) return;
		morningFocusedFor.current = noteId;
		const t = window.setTimeout(() => {
			if (editor.isDestroyed) return;
			try {
				morningAutofocusEditor(editor);
			} catch {}
		}, 40);
		return () => window.clearTimeout(t);
	}, [
		editor,
		noteId,
		content
	]);
	(0, import_react.useEffect)(() => {
		if (!editor) return;
		const flushNow = () => {
			if (saveTimer.current) {
				clearTimeout(saveTimer.current);
				saveTimer.current = null;
			}
			try {
				if (!editor.isDestroyed) commit(editor, { force: true });
			} catch {}
		};
		registerVisualFlush(flushNow);
		return () => {
			flushNow();
			registerVisualFlush(null);
			if (saveTimer.current) {
				clearTimeout(saveTimer.current);
				saveTimer.current = null;
			}
		};
	}, [editor, commit]);
	(0, import_react.useEffect)(() => {
		if (!editor) return;
		const dom = editor.view.dom;
		const onKeyUp = () => refreshSuggest(editor);
		dom.addEventListener("keyup", onKeyUp);
		return () => dom.removeEventListener("keyup", onKeyUp);
	}, [editor, refreshSuggest]);
	const pickSuggest = (item) => {
		if (!editor) return;
		insertWikilinkSuggestion(editor, {
			from: suggestFrom,
			to: suggestTo
		}, item);
		setSuggestOpen(false);
		window.setTimeout(() => {
			if (editor && !editor.isDestroyed) commit(editor, { force: true });
		}, 0);
	};
	if (!editor) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-40 items-center justify-center text-[var(--text-muted)]",
		"data-note-id": noteId,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-5 w-5 animate-pulse rounded-md bg-[rgba(0,200,255,0.2)]" })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fade-in flex h-full min-h-0 flex-col",
		"data-note-id": noteId,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditorToolbar, { editor }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-10 md:py-6",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto max-w-[720px]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditorContent, { editor })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WikilinkSuggestMenu, {
				open: suggestOpen,
				items: suggestItems,
				selected: suggestSelected,
				query: suggestQuery,
				rect: suggestRect,
				onSelect: pickSuggest,
				onHover: setSuggestSelected,
				onClose: () => setSuggestOpen(false)
			})]
		})]
	});
}
/** True when Focus section still has only empty bullets. */
function hasEmptyFocusBullet(markdown) {
	const focusMatch = /^##\s+Focus\s*\n([\s\S]*?)(?=^##\s+|\s*$)/m.exec(markdown);
	if (!focusMatch) return false;
	const body = focusMatch[1].trim();
	if (!body) return true;
	const lines = body.split("\n").filter((l) => l.trim().length > 0);
	if (lines.length === 0) return true;
	return lines.every((line) => /^\s*-\s*$/.test(line));
}
/** Caret index after first empty Focus bullet (`- `). */
function emptyFocusCaretIndex(markdown) {
	const m = /^##\s+Focus\s*\n/m.exec(markdown);
	if (!m || m.index == null) return null;
	const afterHeading = m.index + m[0].length;
	const rest = markdown.slice(afterHeading);
	const bullet = /^\s*-\s*/m.exec(rest);
	if (!bullet || bullet.index == null) return null;
	return afterHeading + bullet.index + bullet[0].length;
}
/**
* Source view of the same note. Always seeds from the latest store content so
* Visual → Source never opens on an empty/stale buffer.
* Light [[ wikilink suggest (E4) reuses the same note list as Visual.
*
* Wave 1: intentional Source edits always save (no fingerprint drop of blank lines).
*/
function SourceEditor({ noteId, content }) {
	const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
	const spellCheck = usePrefsStore((s) => s.spellCheck);
	const editorFontSize = usePrefsStore((s) => s.editorFontSize);
	const seed = useVaultStore.getState().nodes[noteId]?.content ?? content ?? "";
	const [value, setValue] = (0, import_react.useState)(seed);
	const valueRef = (0, import_react.useRef)(seed);
	const noteIdRef = (0, import_react.useRef)(noteId);
	const dirtyRef = (0, import_react.useRef)(false);
	const timer = (0, import_react.useRef)(null);
	const taRef = (0, import_react.useRef)(null);
	const morningFocusedFor = (0, import_react.useRef)(null);
	const [suggestOpen, setSuggestOpen] = (0, import_react.useState)(false);
	const [suggestQuery, setSuggestQuery] = (0, import_react.useState)("");
	const [suggestFrom, setSuggestFrom] = (0, import_react.useState)(0);
	const [suggestTo, setSuggestTo] = (0, import_react.useState)(0);
	const [suggestItems, setSuggestItems] = (0, import_react.useState)([]);
	const [suggestSelected, setSuggestSelected] = (0, import_react.useState)(0);
	const [suggestRect, setSuggestRect] = (0, import_react.useState)({
		left: 0,
		top: 0,
		bottom: 0
	});
	const suggestOpenRef = (0, import_react.useRef)(false);
	const suggestItemsRef = (0, import_react.useRef)([]);
	const suggestSelectedRef = (0, import_react.useRef)(0);
	const suggestRangeRef = (0, import_react.useRef)({
		from: 0,
		to: 0
	});
	suggestOpenRef.current = suggestOpen;
	suggestItemsRef.current = suggestItems;
	suggestSelectedRef.current = suggestSelected;
	suggestRangeRef.current = {
		from: suggestFrom,
		to: suggestTo
	};
	const refreshSuggest = (0, import_react.useCallback)((text, cursor) => {
		const open = detectOpenWikilinkInText(text, cursor);
		if (!open) {
			setSuggestOpen(false);
			return;
		}
		const items = buildSuggestItems(useVaultStore.getState().nodes, open.query);
		setSuggestOpen(true);
		setSuggestQuery(open.query);
		setSuggestFrom(open.from);
		setSuggestTo(open.to);
		setSuggestItems(items);
		setSuggestSelected(0);
		const ta = taRef.current;
		if (ta) setSuggestRect(coordsAtTextareaCaret(ta, open.to));
	}, []);
	const scheduleSave = (0, import_react.useCallback)((val) => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			const id = noteIdRef.current;
			const prev = useVaultStore.getState().nodes[id]?.content ?? "";
			const next = normalizeLineEndings(val);
			dirtyRef.current = false;
			if (next !== prev) updateNoteContent(id, next, { source: true });
		}, 200);
	}, [updateNoteContent]);
	const applyValue = (0, import_react.useCallback)((val, cursor) => {
		dirtyRef.current = true;
		setValue(val);
		valueRef.current = val;
		scheduleSave(val);
		if (typeof cursor === "number") requestAnimationFrame(() => {
			const ta = taRef.current;
			if (!ta) return;
			ta.focus();
			ta.setSelectionRange(cursor, cursor);
			refreshSuggest(val, cursor);
		});
	}, [scheduleSave, refreshSuggest]);
	const pickSuggest = (0, import_react.useCallback)((item) => {
		const { from, to } = suggestRangeRef.current;
		const { next, cursor } = insertWikilinkInSource(valueRef.current, {
			from,
			to
		}, item);
		setSuggestOpen(false);
		applyValue(next, cursor);
	}, [applyValue]);
	(0, import_react.useEffect)(() => {
		const live = useVaultStore.getState().nodes[noteId]?.content ?? content ?? "";
		if (noteIdRef.current !== noteId) {
			noteIdRef.current = noteId;
			dirtyRef.current = false;
			setValue(live);
			valueRef.current = live;
			setSuggestOpen(false);
			return;
		}
		if (dirtyRef.current) return;
		if (live === valueRef.current) return;
		setValue(live);
		valueRef.current = live;
	}, [noteId, content]);
	(0, import_react.useEffect)(() => {
		if (morningFocusedFor.current === noteId) return;
		const node = useVaultStore.getState().nodes[noteId];
		if (!node || node.kind !== "note") return;
		if (node.path !== dailyNotePath(/* @__PURE__ */ new Date())) return;
		const body = node.content ?? content ?? valueRef.current;
		if (!hasEmptyFocusBullet(body)) return;
		morningFocusedFor.current = noteId;
		const caret = emptyFocusCaretIndex(body);
		const t = window.setTimeout(() => {
			const ta = taRef.current;
			if (!ta) return;
			ta.focus();
			if (caret != null) ta.setSelectionRange(caret, caret);
		}, 40);
		return () => window.clearTimeout(t);
	}, [noteId, content]);
	(0, import_react.useEffect)(() => {
		const boundNoteId = noteId;
		noteIdRef.current = boundNoteId;
		const flushNow = () => {
			if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}
			const id = boundNoteId;
			const val = valueRef.current;
			dirtyRef.current = false;
			const prev = useVaultStore.getState().nodes[id]?.content ?? "";
			const next = normalizeLineEndings(val);
			if (next !== prev) updateNoteContent(id, next, { source: true });
		};
		registerSourceFlush(flushNow);
		return () => {
			flushNow();
			registerSourceFlush(null);
			if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}
		};
	}, [updateNoteContent, noteId]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fade-in flex h-full min-h-0 flex-col overflow-hidden px-6 py-4 md:px-10 md:py-6",
		"data-note-id": noteId,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				ref: taRef,
				className: "source-editor min-h-[50vh] w-full flex-1",
				value,
				spellCheck,
				style: { fontSize: editorFontSize },
				onChange: (e) => {
					const val = e.target.value;
					const cursor = e.target.selectionStart ?? val.length;
					dirtyRef.current = true;
					setValue(val);
					valueRef.current = val;
					scheduleSave(val);
					refreshSuggest(val, cursor);
				},
				onKeyUp: (e) => {
					const ta = e.currentTarget;
					refreshSuggest(ta.value, ta.selectionStart ?? 0);
				},
				onClick: (e) => {
					const ta = e.currentTarget;
					refreshSuggest(ta.value, ta.selectionStart ?? 0);
				},
				onKeyDown: (e) => {
					if (!suggestOpenRef.current) return;
					const items = suggestItemsRef.current;
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setSuggestSelected((i) => items.length ? (i + 1) % items.length : 0);
						return;
					}
					if (e.key === "ArrowUp") {
						e.preventDefault();
						setSuggestSelected((i) => items.length ? (i - 1 + items.length) % items.length : 0);
						return;
					}
					if (e.key === "Enter" || e.key === "Tab") {
						if (!items.length) return;
						e.preventDefault();
						const item = items[suggestSelectedRef.current] ?? items[0];
						if (item) pickSuggest(item);
						return;
					}
					if (e.key === "Escape") {
						e.preventDefault();
						setSuggestOpen(false);
					}
				}
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WikilinkSuggestMenu, {
				open: suggestOpen,
				items: suggestItems,
				selected: suggestSelected,
				query: suggestQuery,
				rect: suggestRect,
				onSelect: pickSuggest,
				onHover: setSuggestSelected,
				onClose: () => setSuggestOpen(false)
			})]
		})
	});
}
/** Controlled title field — renames the file and keeps the leading # heading in sync. */
function NoteTitleInput({ noteId }) {
	const note = useVaultStore((s) => s.nodes[noteId]);
	const renameNode = useVaultStore((s) => s.renameNode);
	const display = note ? getNoteDisplayTitle(note) : "";
	const [value, setValue] = (0, import_react.useState)(display);
	(0, import_react.useEffect)(() => {
		setValue(display);
	}, [noteId, display]);
	if (!note || note.kind !== "note") return null;
	const commit = () => {
		const next = value.trim();
		if (!next) {
			setValue(display);
			return;
		}
		if (next !== display) renameNode(noteId, next);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: "note-title-input w-full bg-transparent text-[15px] font-semibold tracking-tight outline-none titlebar-no-drag",
		value,
		onChange: (e) => setValue(e.target.value),
		onBlur: commit,
		onKeyDown: (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				e.target.blur();
			}
			if (e.key === "Escape") {
				setValue(display);
				e.target.blur();
			}
		},
		"aria-label": "Note title",
		placeholder: "Untitled"
	});
}
function EditorPane() {
	const nodes = useVaultStore((s) => s.nodes);
	const editorMode = useVaultStore((s) => s.settings.editorMode);
	const graphMode = useVaultStore((s) => s.settings.graphMode);
	const rightOpen = useVaultStore((s) => s.settings.rightOpen);
	const mode = useVaultStore((s) => s.mode);
	const toggleGraphFullscreen = useVaultStore((s) => s.toggleGraphFullscreen);
	const setRightOpen = useVaultStore((s) => s.setRightOpen);
	const openDailyNote = useVaultStore((s) => s.openDailyNote);
	const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
	const setEditorMode = useVaultStore((s) => s.setEditorMode);
	const focusMode = usePrefsStore((s) => s.focusMode);
	const note = useVaultStore((s) => s.activeNoteId ? s.nodes[s.activeNoteId] ?? null : null);
	const crumbs = (0, import_react.useMemo)(() => getBreadcrumbs(note ?? null, nodes), [note, nodes]);
	if (!note || note.kind !== "note") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fade-in flex h-full flex-col items-center justify-center px-8 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] text-[var(--accent)] shadow-[0_0_40px_rgba(0,200,255,0.12)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusMark, {
					size: 36,
					className: "text-[var(--text-primary)]"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[22px] font-semibold tracking-tight",
				children: "Select a note"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-sm text-[14px] leading-relaxed text-[var(--text-secondary)]",
				children: "Choose a file from the vault, search with ⌘K, or create a note."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[12px] tracking-wide text-[var(--text-muted)]",
				children: NEXUS_TAGLINE
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 flex flex-wrap items-center justify-center gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(NewNoteMenu, {
						variant: "primary",
						title: "New note",
						align: "left",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus2, { size: 16 }), "New note"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "ghost-btn",
						onClick: () => openDailyNote(),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarDays, { size: 16 }), "Today's note"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "ghost-btn",
						onClick: () => setCommandOpen(true),
						children: "Search ⌘K"
					})
				]
			})
		]
	});
	const body = note.content ?? "";
	const editorKey = `${note.id}::${editorMode}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full min-w-0 flex-1 flex-col bg-[var(--bg-deepest)]",
		"data-active-note": note.id,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 md:px-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]",
					children: crumbs.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "flex items-center gap-1.5",
						children: [i > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "opacity-40",
							children: "/"
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: cn(i === crumbs.length - 1 && "text-[var(--text-secondary)]"),
							children: c
						})]
					}, i))
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NoteTitleInput, { noteId: note.id })]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex shrink-0 items-center gap-1",
				children: focusMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "chip-btn is-active",
					title: "Exit focus mode (⌘.)",
					onClick: () => setFocusMode(false),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Focus, { size: 13 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "hidden sm:inline",
						children: "Exit focus"
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "mr-2 hidden text-[11px] text-[var(--text-muted)] sm:inline",
						children: [mode === "fsa" ? "on disk · " : "", formatRelativeTime(note.mtime)]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: cn("chip-btn", editorMode === "visual" && "is-active"),
						onClick: () => setEditorMode("visual"),
						title: "Visual mode",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 13 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "hidden sm:inline",
							children: "Visual"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: cn("chip-btn", editorMode === "source" && "is-active"),
						onClick: () => setEditorMode("source"),
						title: "Source mode (⌘E)",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeXml, { size: 13 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "hidden sm:inline",
							children: "Source"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: cn("chip-btn", graphMode === "fullscreen" && "is-active"),
						onClick: toggleGraphFullscreen,
						title: "Graph (⌘G)",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, { size: 13 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "hidden sm:inline",
							children: "Graph"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "icon-btn ml-1",
						onClick: () => setRightOpen(!rightOpen),
						title: "Toggle right panel",
						children: rightOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRightClose, { size: 16 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRightOpen, { size: 16 })
					})
				] })
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex min-h-0 flex-1 flex-col",
			children: editorMode === "visual" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VisualEditor, {
				noteId: note.id,
				content: body
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceEditor, {
				noteId: note.id,
				content: body
			})
		}, editorKey)]
	});
}
var cachedSig = "";
var cachedIndex = null;
function vaultSig(nodes) {
	return Object.values(nodes).filter((n) => n.kind === "note").map((n) => `${n.id}\0${n.path}\0${n.mtime}\0${(n.content ?? "").length}`).sort().join("|");
}
/**
* Map of normalized wikilink target keys → source note ids (unique, insertion order).
* Keys include title, path (with/without .md), and basename forms emitted by notes.
*/
function buildReverseIndex(nodes) {
	const sig = vaultSig(nodes);
	if (cachedIndex && cachedSig === sig) return cachedIndex;
	const index = /* @__PURE__ */ new Map();
	const add = (key, fromId) => {
		if (!key) return;
		let list = index.get(key);
		if (!list) {
			list = [];
			index.set(key, list);
		}
		if (!list.includes(fromId)) list.push(fromId);
	};
	for (const n of Object.values(nodes)) {
		if (n.kind !== "note") continue;
		const content = n.content ?? "";
		for (const link of extractWikilinks(content)) {
			const target = normalizeLinkTarget(link.target);
			if (!target) continue;
			add(target, n.id);
		}
	}
	cachedSig = sig;
	cachedIndex = index;
	return index;
}
/** Target keys a note may be linked as (title, path, name variants). */
function noteTargetKeys(note) {
	return [
		normalizeLinkTarget(noteTitle(note)),
		normalizeLinkTarget(note.path.replace(/\.md$/i, "")),
		normalizeLinkTarget(note.path),
		normalizeLinkTarget(note.name)
	].filter(Boolean);
}
function getBacklinks(targetNote, nodes) {
	const index = buildReverseIndex(nodes);
	const targets = new Set(noteTargetKeys(targetNote));
	const fromIds = /* @__PURE__ */ new Set();
	for (const key of targets) {
		const list = index.get(key);
		if (!list) continue;
		for (const id of list) if (id !== targetNote.id) fromIds.add(id);
	}
	const out = [];
	for (const fromId of fromIds) {
		const n = nodes[fromId];
		if (!n || n.kind !== "note") continue;
		const content = n.content ?? "";
		const links = extractWikilinks(content);
		let mentionCount = 0;
		const mentions = [];
		for (const link of links) {
			if (!targets.has(normalizeLinkTarget(link.target))) continue;
			mentionCount += 1;
			mentions.push({
				fromId: n.id,
				fromPath: n.path,
				fromTitle: noteTitle(n),
				context: wikilinkContext(content, link.start, link.end)
			});
		}
		for (const m of mentions) out.push({
			...m,
			count: mentionCount > 1 ? mentionCount : void 0
		});
	}
	return out.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
}
function getBrokenLinksForNote(note, nodes) {
	if (note.kind !== "note") return [];
	const content = note.content ?? "";
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const link of extractWikilinks(content)) {
		const key = link.target.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		if (resolveWikilink(link.target, nodes)) continue;
		const start = Math.max(0, link.start - 40);
		const end = Math.min(content.length, link.end + 40);
		let ctx = content.slice(start, end).replace(/\s+/g, " ").trim();
		if (start > 0) ctx = "…" + ctx;
		if (end < content.length) ctx = ctx + "…";
		out.push({
			target: link.target,
			context: ctx
		});
	}
	return out.sort((a, b) => a.target.localeCompare(b.target));
}
/** Vault-wide broken [[wikilinks]] across all notes */
function getAllBrokenLinks(nodes, limit = 40) {
	const notes = Object.values(nodes).filter((n) => n.kind === "note");
	const out = [];
	for (const note of notes) for (const bl of getBrokenLinksForNote(note, nodes)) {
		out.push({
			...bl,
			noteId: note.id,
			noteTitle: noteTitle(note),
			notePath: note.path
		});
		if (out.length >= limit) return out;
	}
	return out;
}
/** Notes with no incoming or outgoing wikilinks */
function getOrphanNotes(nodes, limit = 24) {
	const notes = Object.values(nodes).filter((n) => n.kind === "note");
	const linked = /* @__PURE__ */ new Set();
	for (const n of notes) {
		const links = extractWikilinks(n.content ?? "");
		if (links.length) linked.add(n.id);
		for (const l of links) {
			const hit = resolveWikilink(l.target, nodes);
			if (hit) linked.add(hit.id);
		}
	}
	return notes.filter((n) => !linked.has(n.id)).sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((n) => ({
		id: n.id,
		title: noteTitle(n),
		path: n.path
	}));
}
var TAG_RE = /(?:^|[\s([{])#([a-zA-Z][\w/-]{0,48})\b/g;
var FRONTMATTER_TAGS = /^---\r?\n([\s\S]*?)\r?\n---/;
/** Strip fenced code so # in code isn't a tag */
function stripCode(md) {
	return md.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]+`/g, " ");
}
function extractTagsFromMarkdown(markdown) {
	const tags = /* @__PURE__ */ new Set();
	const fm = FRONTMATTER_TAGS.exec(markdown);
	if (fm) {
		const block = fm[1];
		const tagsLine = /^tags:\s*(.+)$/im.exec(block);
		if (tagsLine) {
			const raw = tagsLine[1].trim();
			if (raw.startsWith("[")) {
				for (const m of raw.matchAll(/["']?([a-zA-Z][\w/-]*)["']?/g)) if (m[1] && m[1].toLowerCase() !== "tags") tags.add(m[1].toLowerCase());
			} else for (const part of raw.split(/[,\s]+/)) {
				const t = part.replace(/^#/, "").trim();
				if (t) tags.add(t.toLowerCase());
			}
		}
	}
	const body = stripCode(markdown);
	TAG_RE.lastIndex = 0;
	let m;
	while (m = TAG_RE.exec(body)) tags.add(m[1].toLowerCase());
	return Array.from(tags).sort();
}
/** Aggregate tags across the vault */
function collectVaultTags(nodes) {
	const map = /* @__PURE__ */ new Map();
	for (const n of Object.values(nodes)) {
		if (n.kind !== "note") continue;
		for (const t of extractTagsFromMarkdown(n.content ?? "")) {
			let set = map.get(t);
			if (!set) {
				set = /* @__PURE__ */ new Set();
				map.set(t, set);
			}
			set.add(n.id);
		}
	}
	return Array.from(map.entries()).map(([tag, ids]) => ({
		tag,
		count: ids.size,
		noteIds: Array.from(ids)
	})).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
function notesForTag(nodes, tag) {
	const needle = tag.replace(/^#/, "").toLowerCase();
	return Object.values(nodes).filter((n) => n.kind === "note" && extractTagsFromMarkdown(n.content ?? "").includes(needle)).sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
}
/**
* Jump editor scroll to a heading from the outline panel.
* Works for Visual (ProseMirror DOM) and Source (textarea).
*/
function jumpToOutlineHeading(text, level) {
	if (typeof document === "undefined") return false;
	const needle = text.trim().toLowerCase();
	if (!needle) return false;
	const editor = document.querySelector(".note-editor");
	if (editor) {
		const headings = editor.querySelectorAll("h1,h2,h3,h4,h5,h6");
		for (const h of Array.from(headings)) {
			const t = (h.textContent || "").trim().toLowerCase();
			if (t === needle || t.startsWith(needle)) {
				h.scrollIntoView({
					behavior: "smooth",
					block: "center"
				});
				h.classList.add("outline-flash");
				window.setTimeout(() => h.classList.remove("outline-flash"), 900);
				return true;
			}
		}
	}
	const ta = document.querySelector("textarea[aria-label=\"Markdown source\"]");
	if (ta) {
		const lines = ta.value.split("\n");
		let pos = 0;
		"#".repeat(Math.min(6, Math.max(1, level))) + "";
		for (const line of lines) {
			const m = /^(#{1,6})\s+(.+)$/.exec(line);
			if (m && m[2].trim().toLowerCase() === needle) {
				ta.focus();
				ta.setSelectionRange(pos, pos + line.length);
				ta.scrollTop = pos / Math.max(1, ta.value.length) * ta.scrollHeight - ta.clientHeight / 3;
				return true;
			}
			if (m && m[2].trim().toLowerCase() === needle) {}
			pos += line.length + 1;
		}
		pos = 0;
		for (const line of lines) {
			const m = /^(#{1,6})\s+(.+)$/.exec(line);
			if (m && m[2].trim().toLowerCase() === needle) {
				ta.focus();
				ta.setSelectionRange(pos, pos + line.length);
				ta.scrollTop = pos / Math.max(1, ta.value.length) * ta.scrollHeight - ta.clientHeight / 3;
				return true;
			}
			pos += line.length + 1;
		}
	}
	return false;
}
var LOD_SEGMENT_THRESHOLD = 250;
var LOD_CAP = 400;
function accentRgb() {
	if (typeof document === "undefined") return {
		r: 0,
		g: 200,
		b: 255
	};
	const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
	const m = /^#?([0-9a-f]{6})$/i.exec(raw);
	if (!m) return {
		r: 0,
		g: 200,
		b: 255
	};
	const n = parseInt(m[1], 16);
	return {
		r: n >> 16 & 255,
		g: n >> 8 & 255,
		b: n & 255
	};
}
function physicsParams(intensity) {
	if (intensity === "calm") return {
		charge: -48,
		distance: 42,
		velocity: .42,
		alpha: .03
	};
	if (intensity === "energetic") return {
		charge: -130,
		distance: 28,
		velocity: .22,
		alpha: .015
	};
	return {
		charge: -85,
		distance: 36,
		velocity: .3,
		alpha: .02
	};
}
/** G3: stronger folder hue separation via distinct HSL palette slots */
function folderTintColor(folder, desktopBoost) {
	let h = 2166136261;
	const key = folder || "__root__";
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	const hues = [
		205,
		160,
		285,
		35,
		125,
		330,
		50,
		240,
		15,
		175
	];
	const hue = hues[Math.abs(h) % hues.length] / 360;
	const sat = desktopBoost ? .42 : .36;
	const light = desktopBoost ? .4 : .34;
	return new Color().setHSL(hue, sat, light);
}
function folderColorHex(folder, desktopBoost) {
	return `#${folderTintColor(folder, desktopBoost).getHexString()}`;
}
function buildStudioEnv(renderer) {
	const pmrem = new PMREMGenerator(renderer);
	pmrem.compileEquirectangularShader();
	const scene = new Scene();
	const sky = new Mesh(new SphereGeometry(50, 32, 32), new MeshBasicMaterial({
		side: 1,
		depthWrite: false
	}));
	const geo = sky.geometry;
	const cols = new Float32Array(geo.attributes.position.count * 3);
	const pos = geo.attributes.position;
	for (let i = 0; i < pos.count; i++) {
		const t = (pos.getY(i) / 50 + 1) * .5;
		cols[i * 3] = .14 + t * .5;
		cols[i * 3 + 1] = .16 + t * .52;
		cols[i * 3 + 2] = .2 + t * .55;
	}
	geo.setAttribute("color", new BufferAttribute(cols, 3));
	sky.material.vertexColors = true;
	scene.add(sky);
	const addPanel = (color, intensity, w, h, p, rotY = 0) => {
		const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({
			color,
			side: 2
		}));
		m.position.set(...p);
		m.rotation.y = rotY;
		m.material.color.multiplyScalar(intensity);
		scene.add(m);
	};
	addPanel(15265526, 1.8, 18, 14, [
		20,
		12,
		10
	], -.6);
	addPanel(8030878, .75, 14, 12, [
		-18,
		4,
		-8
	], .7);
	addPanel(4872810, .45, 20, 8, [
		0,
		-14,
		5
	], 0);
	const env = pmrem.fromScene(scene, .03).texture;
	pmrem.dispose();
	scene.traverse((o) => {
		const mesh = o;
		if (mesh.geometry) mesh.geometry.dispose();
		if (mesh.material) mesh.material.dispose();
	});
	return env;
}
/** Deep-space sky: fine dust stars + soft nebulae (not chunky sparkles) */
function paintGalaxyTexture(full) {
	const size = full ? 2048 : 1536;
	const c = document.createElement("canvas");
	c.width = size;
	c.height = size;
	const ctx = c.getContext("2d");
	ctx.fillStyle = "#02040a";
	ctx.fillRect(0, 0, size, size);
	const base = ctx.createRadialGradient(size * .5, size * .48, size * .05, size * .5, size * .48, size * .72);
	base.addColorStop(0, "rgba(12, 22, 40, 0.55)");
	base.addColorStop(.45, "rgba(6, 12, 24, 0.25)");
	base.addColorStop(1, "rgba(2, 4, 10, 0)");
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, size, size);
	const blobs = [
		{
			x: .3,
			y: .4,
			r: .42,
			color: "30,70,110",
			a: full ? .22 : .16
		},
		{
			x: .7,
			y: .36,
			r: .36,
			color: "55,40,95",
			a: full ? .17 : .12
		},
		{
			x: .52,
			y: .58,
			r: .48,
			color: "14,48,88",
			a: full ? .16 : .11
		},
		{
			x: .38,
			y: .7,
			r: .3,
			color: "28,72,88",
			a: full ? .14 : .1
		},
		{
			x: .62,
			y: .32,
			r: .24,
			color: "70,100,130",
			a: full ? .12 : .08
		}
	];
	for (const b of blobs) {
		const x = b.x * size;
		const y = b.y * size;
		const r = b.r * size;
		const g = ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, `rgba(${b.color},${b.a})`);
		g.addColorStop(.5, `rgba(${b.color},${b.a * .28})`);
		g.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, size, size);
	}
	ctx.save();
	ctx.translate(size / 2, size / 2);
	ctx.rotate(-.42);
	const band = ctx.createLinearGradient(0, -size * .1, 0, size * .1);
	band.addColorStop(0, "rgba(70,100,140,0)");
	band.addColorStop(.5, full ? "rgba(90,120,160,0.09)" : "rgba(90,120,160,0.07)");
	band.addColorStop(1, "rgba(70,100,140,0)");
	ctx.fillStyle = band;
	ctx.fillRect(-size, -size * .12, size * 2, size * .24);
	for (let i = 0; i < (full ? 1100 : 650); i++) {
		const x = (Math.random() - .5) * size * 1.6;
		const y = (Math.random() - .5) * size * .09;
		const mag = Math.pow(Math.random(), 2.8);
		const r = .15 + mag * .4;
		const a = .08 + mag * .28;
		ctx.beginPath();
		ctx.fillStyle = `rgba(220,230,245,${a})`;
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
	const n = full ? 5e3 : 3200;
	for (let i = 0; i < n; i++) {
		const x = Math.random() * size;
		const y = Math.random() * size;
		const mag = Math.pow(Math.random(), 3.1);
		const r = .12 + mag * (full ? .55 : .45);
		const a = .1 + mag * .48;
		const roll = Math.random();
		let col;
		if (roll < .1) col = `rgba(170,200,255,${a})`;
		else if (roll > .93) col = `rgba(255,230,200,${a * .85})`;
		else col = `rgba(230,235,245,${a})`;
		ctx.beginPath();
		ctx.fillStyle = col;
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	const bright = full ? 18 : 10;
	for (let i = 0; i < bright; i++) {
		const x = Math.random() * size;
		const y = Math.random() * size;
		const r = .35 + Math.random() * .3;
		ctx.beginPath();
		ctx.fillStyle = "rgba(245,248,255,0.78)";
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	const tex = new CanvasTexture(c);
	tex.colorSpace = SRGBColorSpace;
	tex.anisotropy = 4;
	tex.needsUpdate = true;
	return tex;
}
/**
* Single sky sphere — fine galaxy field, slow drift.
* Dual shells doubled noise and made stars look chunky.
*/
function buildSpaceBackdrop(scene, mode) {
	const root = new Group();
	const layers = [];
	const full = mode === "fullscreen";
	const tex = paintGalaxyTexture(full);
	const sky = new Mesh(new SphereGeometry(full ? 3e3 : 2400, 64, 40), new MeshBasicMaterial({
		map: tex,
		side: 1,
		depthWrite: false,
		depthTest: false,
		transparent: false,
		fog: false
	}));
	sky.renderOrder = -50;
	sky.frustumCulled = false;
	root.add(sky);
	layers.push({
		obj: sky,
		speed: 9e-4
	});
	scene.add(root);
	scene.fog = null;
	scene.background = new Color(132106);
	return {
		root,
		layers
	};
}
function truncateLabel(name, max = 22) {
	const clean = name.replace(/\s+/g, " ").trim();
	if (clean.length <= max) return clean;
	return clean.slice(0, max - 1) + "…";
}
function linkIds(link) {
	return [typeof link.source === "object" ? link.source.id : String(link.source), typeof link.target === "object" ? link.target.id : String(link.target)];
}
function buildNeighbors(links) {
	const m = /* @__PURE__ */ new Map();
	const add = (a, b) => {
		if (!m.has(a)) m.set(a, /* @__PURE__ */ new Set());
		m.get(a).add(b);
	};
	for (const l of links) {
		const [s, t] = linkIds(l);
		add(s, t);
		add(t, s);
	}
	return m;
}
function makeLabel(text, opts) {
	const { active, hover, dim, full, radius } = opts;
	const label = new _default(text);
	label.fontFace = "Arial";
	label.fontWeight = active || hover ? "bold" : "normal";
	label.fontSize = 120;
	label.color = active ? "#f4f7fb" : hover ? "#e8eef6" : dim ? "#6a7280" : "#c0c8d4";
	label.backgroundColor = "rgba(0,0,0,0)";
	label.padding = 2;
	label.borderWidth = 0;
	label.borderRadius = 0;
	label.strokeWidth = active || hover ? .28 : .2;
	label.strokeColor = "#000000";
	const th = active ? full ? 3.2 : 2.4 : hover ? full ? 2.8 : 2.1 : full ? 2.2 : 1.7;
	label.textHeight = th;
	label.position.y = radius + th * .65 + (full ? .4 : .25);
	label.renderOrder = active || hover ? 20 : 8;
	label.material.depthTest = false;
	label.material.depthWrite = false;
	label.material.transparent = true;
	label.material.opacity = active ? 1 : hover ? .98 : dim ? .45 : .82;
	label.material.sizeAttenuation = true;
	return label;
}
function createOrb(node, activeId, hoverId, focusId, neighbors, dimStrength, mode, accent, showLabel, desktopBoost, lowDetail = false) {
	const group = new Group();
	const isGhost = !!node.ghost;
	const isActive = node.id === activeId;
	const isHover = node.id === hoverId;
	const isHub = !isGhost && node.degree >= 3;
	const inFocus = !focusId || node.id === focusId || (neighbors?.has(node.id) ?? false);
	const dim = !!focusId && !inFocus && dimStrength > 0;
	const full = mode === "fullscreen";
	const panel = mode === "panel";
	const segs = lowDetail ? isGhost ? 12 : full ? 28 : 20 : isGhost ? full ? 32 : 24 : full ? 72 : 56;
	const base = (full ? 3.15 : panel ? 2.55 : 2.4) * (desktopBoost ? 1.14 : 1);
	const rank = isActive || isHover ? 1 : isHub ? .84 : .68;
	const radius = base + Math.pow(Math.max(1, node.val), .55) * (full ? 1.75 : 1.4) * rank + (isActive || isHover ? .5 : 0);
	let bodyColor = folderTintColor(node.folder, desktopBoost);
	if (node.ghost) bodyColor = new Color(desktopBoost ? 2765372 : 2238512);
	else if (isActive || isHover) bodyColor = bodyColor.clone().lerp(new Color(desktopBoost ? 6055544 : 4870752), .55);
	else if (isHub) bodyColor = bodyColor.clone().lerp(new Color(desktopBoost ? 4871270 : 3949650), .35);
	if (dim) bodyColor.multiplyScalar(1 - dimStrength * .5);
	const bodyOpacity = dim ? Math.max(.08, 1 - dimStrength * .92) : isGhost ? .38 : 1;
	let emissive = accent.clone().multiplyScalar(desktopBoost ? .22 : .12);
	let emissiveIntensity = desktopBoost ? .055 : .028;
	if (isActive || isHover) {
		emissive = accent.clone();
		emissiveIntensity = desktopBoost ? .16 : .1;
	} else if (neighbors?.has(node.id)) {
		emissive = accent.clone().multiplyScalar(.55);
		emissiveIntensity = desktopBoost ? .1 : .055;
	}
	const body = new Mesh(new SphereGeometry(radius, segs, segs), new MeshPhysicalMaterial({
		color: bodyColor,
		metalness: desktopBoost ? .88 : .94,
		roughness: isActive || isHover ? .14 : isHub ? .22 : .3,
		clearcoat: isActive || isHover ? .75 : desktopBoost ? .55 : .42,
		clearcoatRoughness: isActive || isHover ? .06 : .16,
		transparent: dim || isGhost,
		opacity: bodyOpacity,
		depthWrite: !(dim || isGhost),
		transmission: 0,
		specularIntensity: isActive || isHover ? 1.5 : desktopBoost ? 1.35 : 1.15,
		specularColor: new Color(15265526),
		emissive,
		emissiveIntensity,
		envMapIntensity: isActive || isHover ? desktopBoost ? 1.85 : 1.55 : isHub ? desktopBoost ? 1.45 : 1.2 : desktopBoost ? 1.3 : 1.05,
		side: 0
	}));
	body.renderOrder = dim && dimStrength > .5 ? 0 : 1;
	group.add(body);
	if (!dim || dimStrength < .4) {
		const shell = new Mesh(new SphereGeometry(radius * 1.045, Math.min(segs, 48), Math.min(segs, 48)), new MeshBasicMaterial({
			color: accent.clone().multiplyScalar(desktopBoost ? .55 : .35),
			transparent: true,
			opacity: desktopBoost ? .09 : .05,
			depthWrite: false,
			side: 1
		}));
		shell.renderOrder = 0;
		group.add(shell);
	}
	if (isActive || isHover) {
		const tube = radius * .014;
		const ring = new Mesh(new TorusGeometry(radius * 1.08, tube, 12, full ? 88 : 64), new MeshPhysicalMaterial({
			color: accent.clone().lerp(new Color(13687012), .3),
			metalness: .92,
			roughness: .14,
			emissive: accent.clone(),
			emissiveIntensity: isHover && !isActive ? .32 : .24,
			envMapIntensity: 1.25
		}));
		ring.rotation.x = Math.PI / 2;
		ring.renderOrder = 2;
		group.add(ring);
	}
	if (showLabel) group.add(makeLabel(truncateLabel(node.name, full ? 24 : 18), {
		active: isActive,
		hover: isHover,
		dim,
		full,
		radius
	}));
	return group;
}
/** W5: mutate materials on existing orbs — avoids full nodeThreeObject rebuild on hover */
function tintOrbHover(obj, on, accent) {
	if (!obj) return;
	obj.traverse((child) => {
		const mesh = child;
		if (!mesh.isMesh) return;
		const mat = mesh.material;
		if (!mat || typeof mat.emissiveIntensity !== "number") return;
		if (on) {
			if (mat.userData.__w5HoverBase == null) mat.userData.__w5HoverBase = {
				ei: mat.emissiveIntensity,
				rough: mat.roughness,
				er: mat.emissive?.r ?? 0,
				eg: mat.emissive?.g ?? 0,
				eb: mat.emissive?.b ?? 0
			};
			mat.emissiveIntensity = Math.max(mat.emissiveIntensity, .14);
			if (mat.emissive) mat.emissive.copy(accent);
			if (typeof mat.roughness === "number") mat.roughness = Math.min(mat.roughness, .16);
			mat.needsUpdate = true;
		} else {
			const b = mat.userData.__w5HoverBase;
			if (!b) return;
			mat.emissiveIntensity = b.ei;
			if (mat.emissive) mat.emissive.setRGB(b.er, b.eg, b.eb);
			if (typeof mat.roughness === "number") mat.roughness = b.rough;
			delete mat.userData.__w5HoverBase;
			mat.needsUpdate = true;
		}
	});
}
/** Soft spatial clustering by folder (no visible links required). */
function forceFolderCluster(strength = .055) {
	let nodes = [];
	function force(alpha) {
		if (!nodes.length) return;
		const groups = /* @__PURE__ */ new Map();
		for (const n of nodes) {
			const key = n.folder || "";
			if (!key) continue;
			let g = groups.get(key);
			if (!g) {
				g = [];
				groups.set(key, g);
			}
			g.push(n);
		}
		const k = strength * alpha;
		for (const group of groups.values()) {
			if (group.length < 2) continue;
			let cx = 0, cy = 0, cz = 0;
			for (const n of group) {
				cx += n.x ?? 0;
				cy += n.y ?? 0;
				cz += n.z ?? 0;
			}
			const inv = 1 / group.length;
			cx *= inv;
			cy *= inv;
			cz *= inv;
			for (const n of group) {
				n.vx = (n.vx ?? 0) + (cx - (n.x ?? 0)) * k;
				n.vy = (n.vy ?? 0) + (cy - (n.y ?? 0)) * k;
				n.vz = (n.vz ?? 0) + (cz - (n.z ?? 0)) * k;
			}
		}
	}
	force.initialize = (initNodes) => {
		nodes = initNodes;
	};
	return force;
}
/** G2 Soft 1-hop: keep all nodes, filter edges to neighborhood, dim outsiders */
function softNeighborhood(data, mode, activeNoteId, neighborMap) {
	if (mode !== "1hop" || !activeNoteId) return {
		nodes: data.nodes,
		links: data.links,
		hopKeep: null
	};
	const neigh = neighborMap.get(activeNoteId);
	const keep = /* @__PURE__ */ new Set([activeNoteId, ...neigh ?? []]);
	const links = data.links.filter((l) => {
		const [s, t] = linkIds(l);
		return keep.has(s) && keep.has(t);
	});
	return {
		nodes: data.nodes,
		links,
		hopKeep: keep
	};
}
/** G5 LOD: max 400 highest-degree notes + active + neighbors */
function applyLodCap(data, activeNoteId, neighborMap) {
	const real = data.nodes.filter((n) => !n.ghost);
	const lowDetail = real.length > LOD_SEGMENT_THRESHOLD;
	if (real.length <= LOD_CAP) return {
		nodes: data.nodes,
		links: data.links,
		lowDetail
	};
	const must = /* @__PURE__ */ new Set();
	if (activeNoteId) {
		must.add(activeNoteId);
		const neigh = neighborMap.get(activeNoteId);
		if (neigh) for (const id of neigh) must.add(id);
	}
	const sorted = [...real].sort((a, b) => b.degree - a.degree);
	const keep = new Set(must);
	for (const n of sorted) {
		if (keep.size >= LOD_CAP) break;
		keep.add(n.id);
	}
	for (const l of data.links) {
		const [s, t] = linkIds(l);
		if (s.startsWith("ghost:") && keep.has(t)) keep.add(s);
		if (t.startsWith("ghost:") && keep.has(s)) keep.add(t);
	}
	return {
		nodes: data.nodes.filter((n) => keep.has(n.id)),
		links: data.links.filter((l) => {
			const [s, t] = linkIds(l);
			return keep.has(s) && keep.has(t);
		}),
		lowDetail: true
	};
}
function GraphView({ mode, className }) {
	const hostRef = (0, import_react.useRef)(null);
	const graphRef = (0, import_react.useRef)(null);
	const activeRef = (0, import_react.useRef)(null);
	const hoverRef = (0, import_react.useRef)(null);
	const neighborMapRef = (0, import_react.useRef)(/* @__PURE__ */ new Map());
	const nodes = useVaultStore((s) => s.nodes);
	const deferredNodes = (0, import_react.useDeferredValue)(nodes);
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const setGraphMode = useVaultStore((s) => s.setGraphMode);
	const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
	const setRightOpen = useVaultStore((s) => s.setRightOpen);
	const graphParticles = usePrefsStore((s) => s.graphParticles);
	const physicsIntensity = usePrefsStore((s) => s.physicsIntensity);
	const accentPreset = usePrefsStore((s) => s.accentPreset);
	const accentCustom = usePrefsStore((s) => s.accentCustom);
	const [hoverName, setHoverName] = (0, import_react.useState)(null);
	const [hintVisible, setHintVisible] = (0, import_react.useState)(true);
	const [neighborhood, setNeighborhood] = (0, import_react.useState)("all");
	const [showGhosts, setShowGhosts] = (0, import_react.useState)(true);
	const hopKeepRef = (0, import_react.useRef)(null);
	const neighborhoodRef = (0, import_react.useRef)("all");
	const lowDetailRef = (0, import_react.useRef)(false);
	/** W5: nodeId → last Object3D from paintOrb (for hover material mutation) */
	const nodeObjMapRef = (0, import_react.useRef)(/* @__PURE__ */ new Map());
	const hoverAppliedRef = (0, import_react.useRef)(null);
	const hoverThrottleRef = (0, import_react.useRef)(null);
	const prevActiveFlyRef = (0, import_react.useRef)(void 0);
	const createNote = useVaultStore((s) => s.createNote);
	activeRef.current = activeNoteId;
	neighborhoodRef.current = neighborhood;
	const desktopBoost = isDesktopShell();
	const linkStructureKey = (0, import_react.useMemo)(() => {
		const parts = [];
		for (const n of Object.values(deferredNodes)) if (n.kind === "note") parts.push(`${n.id}\0${n.path}\0${n.name}\0${getContentLinkSig(n.content ?? "")}`);
		else parts.push(`${n.id}\0${n.path}\0folder`);
		parts.sort();
		return parts.join("\n");
	}, [deferredNodes]);
	const data = (0, import_react.useMemo)(() => {
		const g = buildGraph(deferredNodes);
		return {
			nodes: g.nodes.map((n) => ({
				id: n.id,
				name: n.title,
				val: Math.max(1, n.degree + 1),
				preview: n.preview,
				path: n.path,
				degree: n.degree,
				folder: n.folder ?? "",
				ghost: n.ghost,
				ghostTarget: n.ghostTarget
			})),
			links: g.edges.map((e) => ({
				source: e.source,
				target: e.target
			}))
		};
	}, [linkStructureKey]);
	(0, import_react.useEffect)(() => {
		neighborMapRef.current = buildNeighbors(data.links);
	}, [data]);
	const realNoteCount = (0, import_react.useMemo)(() => data.nodes.filter((n) => !n.ghost).length, [data.nodes]);
	const realLinkCount = (0, import_react.useMemo)(() => data.links.filter((l) => {
		const [s, t] = linkIds(l);
		return !s.startsWith("ghost:") && !t.startsWith("ghost:");
	}).length, [data.links]);
	const ghostCount = (0, import_react.useMemo)(() => data.nodes.filter((n) => n.ghost).length, [data.nodes]);
	const topFolders = (0, import_react.useMemo)(() => {
		const counts = /* @__PURE__ */ new Map();
		for (const n of data.nodes) {
			if (n.ghost) continue;
			const key = n.folder || "";
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		return [...counts.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([folder, count]) => ({
			folder,
			label: folder ? folder.split("/").pop() || folder : "Root",
			count,
			color: folderColorHex(folder, desktopBoost)
		}));
	}, [data.nodes, desktopBoost]);
	const displayData = (0, import_react.useMemo)(() => {
		let base = data;
		if (!showGhosts) base = {
			nodes: data.nodes.filter((n) => !n.ghost),
			links: data.links.filter((l) => {
				const [s, t] = linkIds(l);
				return !s.startsWith("ghost:") && !t.startsWith("ghost:");
			})
		};
		const lod = applyLodCap(base, activeNoteId, neighborMapRef.current);
		lowDetailRef.current = lod.lowDetail;
		const soft = softNeighborhood({
			nodes: lod.nodes,
			links: lod.links
		}, neighborhood, activeNoteId, neighborMapRef.current);
		hopKeepRef.current = soft.hopKeep;
		return {
			nodes: soft.nodes,
			links: soft.links
		};
	}, [
		data,
		neighborhood,
		activeNoteId,
		showGhosts
	]);
	const shownNoteCount = (0, import_react.useMemo)(() => displayData.nodes.filter((n) => !n.ghost).length, [displayData.nodes]);
	/** G1: 2x export with footer */
	const exportPng = (0, import_react.useCallback)(() => {
		const g = graphRef.current;
		const host = hostRef.current;
		if (!g || !host) return;
		try {
			const renderer = g.renderer();
			const { width, height } = host.getBoundingClientRect();
			if (width < 2 || height < 2) return;
			const prevPr = renderer.getPixelRatio();
			const exportW = Math.round(width * 2);
			const exportH = Math.round(height * 2);
			renderer.setPixelRatio(1);
			renderer.setSize(exportW, exportH, false);
			g.width(exportW).height(exportH);
			renderer.render(g.scene(), g.camera());
			const src = renderer.domElement;
			const out = document.createElement("canvas");
			out.width = src.width;
			out.height = src.height;
			const ctx = out.getContext("2d");
			if (!ctx) throw new Error("2d");
			ctx.drawImage(src, 0, 0);
			const footerH = Math.max(32, Math.round(out.height * .04));
			ctx.fillStyle = "rgba(3, 5, 10, 0.78)";
			ctx.fillRect(0, out.height - footerH, out.width, footerH);
			ctx.fillStyle = "rgba(210, 218, 230, 0.92)";
			ctx.font = `500 ${Math.max(13, Math.round(footerH * .42))}px system-ui, -apple-system, Segoe UI, Arial, sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(`Nexus · ${realNoteCount} notes · ${realLinkCount} links`, out.width / 2, out.height - footerH / 2);
			const url = out.toDataURL("image/png");
			const a = document.createElement("a");
			a.href = url;
			a.download = "nexus-graph.png";
			a.rel = "noopener";
			document.body.appendChild(a);
			a.click();
			a.remove();
			renderer.setPixelRatio(prevPr);
			g.width(width).height(height);
			renderer.setSize(width, height, false);
			renderer.render(g.scene(), g.camera());
		} catch {
			try {
				const { width, height } = host.getBoundingClientRect();
				g.width(width).height(height);
			} catch {}
		}
	}, [realNoteCount, realLinkCount]);
	(0, import_react.useEffect)(() => {
		setHintVisible(true);
		const t = window.setTimeout(() => setHintVisible(false), 4500);
		return () => window.clearTimeout(t);
	}, [mode]);
	(0, import_react.useEffect)(() => {
		if (!hostRef.current) return;
		const el = hostRef.current;
		el.innerHTML = "";
		const { r: ar, g: ag, b: ab } = accentRgb();
		const accent = new Color(ar / 255, ag / 255, ab / 255);
		const phys = physicsParams(physicsIntensity);
		const particleCount = graphParticles ? mode === "panel" ? 1 : 3 : 0;
		const focusId = () => hoverRef.current || activeRef.current;
		const dimStrength = () => {
			if (hoverRef.current) return 1;
			if (neighborhoodRef.current === "1hop" && activeRef.current) return .9;
			if (activeRef.current) return .35;
			return 0;
		};
		const neighborSet = (id) => {
			if (!id) return null;
			if (neighborhoodRef.current === "1hop" && hopKeepRef.current) return hopKeepRef.current;
			return neighborMapRef.current.get(id) ?? /* @__PURE__ */ new Set();
		};
		const shouldShowLabel = (n) => {
			const f = focusId();
			const ns = neighborSet(f);
			if (n.id === activeRef.current || n.id === hoverRef.current) return true;
			if (f && ns?.has(n.id) && n.id !== f) return true;
			if (hoverRef.current) return false;
			if (n.ghost) return false;
			if (neighborhoodRef.current === "1hop" && hopKeepRef.current && !hopKeepRef.current.has(n.id)) return false;
			return n.degree >= 3;
		};
		const paintOrb = (n) => {
			const f = focusId();
			const obj = createOrb(n, activeRef.current, hoverRef.current, f, neighborSet(f), dimStrength(), mode, accent, shouldShowLabel(n), desktopBoost, lowDetailRef.current);
			nodeObjMapRef.current.set(n.id, obj);
			return obj;
		};
		const edgeStyle = (link) => {
			const [s, t] = linkIds(link);
			const hover = hoverRef.current;
			const active = activeRef.current;
			if (hover) {
				if (s === hover || t === hover) return {
					color: `rgba(${ar},${ag},${ab},0.92)`,
					width: mode === "fullscreen" ? 1.35 : 1,
					particles: particleCount > 0 ? particleCount + 1 : 0
				};
				return {
					color: `rgba(${ar},${ag},${ab},0.05)`,
					width: mode === "fullscreen" ? .2 : .14,
					particles: 0
				};
			}
			if (active) {
				if (s === active || t === active) return {
					color: `rgba(${ar},${ag},${ab},0.62)`,
					width: mode === "fullscreen" ? .9 : .65,
					particles: particleCount
				};
				return {
					color: mode === "fullscreen" ? `rgba(${ar},${ag},${ab},0.14)` : `rgba(${ar},${ag},${ab},0.11)`,
					width: mode === "fullscreen" ? .36 : .28,
					particles: 0
				};
			}
			return {
				color: mode === "fullscreen" ? `rgba(${ar},${ag},${ab},0.28)` : `rgba(${ar},${ag},${ab},0.2)`,
				width: mode === "fullscreen" ? .48 : .36,
				particles: 0
			};
		};
		const applyEdgeStyles = (g) => {
			g.linkColor((link) => edgeStyle(link).color).linkWidth((link) => edgeStyle(link).width).linkDirectionalParticles((link) => edgeStyle(link).particles).linkDirectionalParticleWidth(.55).linkDirectionalParticleSpeed(.004).linkDirectionalParticleColor(() => {
				const mix = (c) => Math.round(c * .45 + 140.25);
				return `rgb(${mix(ar)},${mix(ag)},${mix(ab)})`;
			});
		};
		const graph = new _3dForceGraph(el, {
			controlType: "orbit",
			rendererConfig: {
				antialias: true,
				alpha: true,
				powerPreference: "high-performance",
				logarithmicDepthBuffer: false
			}
		}).backgroundColor("#03050a").showNavInfo(false).enableNodeDrag(true).enableNavigationControls(true).nodeId("id").nodeLabel(() => "").nodeVal("val").nodeRelSize(4).nodeOpacity(1).nodeThreeObject((n) => paintOrb(n)).nodeThreeObjectExtend(false).linkOpacity(.95).onNodeClick((n) => {
			const node = n;
			if (!node?.id) return;
			setHintVisible(false);
			if (node.ghost) {
				const title = node.ghostTarget || node.name;
				createNote(null, title);
				return;
			}
			setGraphMode("panel");
			setLeftOpen(true);
			if (typeof window !== "undefined" && window.innerWidth >= 1200) setRightOpen(true);
			setActiveNote(node.id);
		}).onNodeHover((n) => {
			const node = n;
			const nextId = node?.id ?? null;
			if (nextId === hoverRef.current) return;
			hoverRef.current = nextId;
			setHoverName(node?.name ?? null);
			el.style.cursor = node ? "pointer" : "grab";
			const flushHover = () => {
				hoverThrottleRef.current = null;
				const g = graphRef.current;
				if (!g) return;
				const id = hoverRef.current;
				if (id === hoverAppliedRef.current) return;
				const prev = hoverAppliedRef.current;
				hoverAppliedRef.current = id;
				const resolveObj = (nid) => {
					const mapped = nodeObjMapRef.current.get(nid);
					if (mapped) return mapped;
					const obj = (g.graphData()?.nodes ?? []).find((x) => x.id === nid)?.__threeObj;
					if (obj) nodeObjMapRef.current.set(nid, obj);
					return obj;
				};
				const clearIds = /* @__PURE__ */ new Set();
				if (prev) {
					clearIds.add(prev);
					const pn = neighborMapRef.current.get(prev);
					if (pn) for (const x of pn) clearIds.add(x);
				}
				for (const cid of clearIds) tintOrbHover(resolveObj(cid), false, accent);
				if (id) {
					tintOrbHover(resolveObj(id), true, accent);
					const ns = neighborMapRef.current.get(id);
					if (ns) for (const nid of ns) {
						if (nid === id) continue;
						tintOrbHover(resolveObj(nid), true, accent);
					}
				}
				applyEdgeStyles(g);
			};
			if (hoverThrottleRef.current != null) window.clearTimeout(hoverThrottleRef.current);
			hoverThrottleRef.current = window.setTimeout(flushHover, 50);
		}).onBackgroundClick(() => setHintVisible(false));
		applyEdgeStyles(graph);
		let envMap = null;
		try {
			const renderer = graph.renderer();
			renderer.toneMapping = 4;
			renderer.toneMappingExposure = desktopBoost ? 1.32 : 1.12;
			renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio || 1, desktopBoost ? 1.5 : 1), 2.5));
			if ("outputColorSpace" in renderer) renderer.outputColorSpace = SRGBColorSpace;
			envMap = buildStudioEnv(renderer);
			graph.scene().environment = envMap;
		} catch {}
		try {
			const cam = graph.camera();
			if (cam) {
				cam.near = .1;
				cam.far = 8e3;
				cam.updateProjectionMatrix();
			}
		} catch {}
		let spaceRoot = null;
		let parallaxLayers = [];
		try {
			const scene = graph.scene();
			const remove = [];
			scene.traverse((obj) => {
				if (obj.isLight) remove.push(obj);
			});
			remove.forEach((l) => scene.remove(l));
			const ambI = desktopBoost ? .28 : .14;
			const hemiI = desktopBoost ? .55 : .38;
			const keyI = desktopBoost ? 1.45 : 1.15;
			const ambient = new AmbientLight(5923956, ambI);
			const hemi = new HemisphereLight(2767440, 197898, hemiI);
			const key = new DirectionalLight(15791352, keyI);
			key.position.set(60, 95, 45);
			const fill = new DirectionalLight(4872816, desktopBoost ? .58 : .42);
			fill.position.set(-55, 10, -40);
			const rim = new DirectionalLight(11585760, desktopBoost ? .48 : .32);
			rim.position.set(-40, 30, -60);
			scene.add(ambient, hemi, key, fill, rim);
			graph.lights([
				ambient,
				hemi,
				key,
				fill,
				rim
			]);
			const space = buildSpaceBackdrop(scene, mode);
			spaceRoot = space.root;
			parallaxLayers = space.layers;
		} catch {}
		try {
			graph.d3Force("charge")?.strength?.(phys.charge);
			graph.d3Force("link")?.distance?.(phys.distance);
			graph.d3Force("folder", forceFolderCluster(mode === "fullscreen" ? .055 : .07));
			graph.d3AlphaDecay(phys.alpha);
			graph.d3VelocityDecay(phys.velocity);
		} catch {}
		try {
			const controls = graph.controls();
			if (controls) {
				controls.enableDamping = true;
				controls.dampingFactor = .07;
				controls.rotateSpeed = .55;
				controls.zoomSpeed = .9;
				controls.panSpeed = .5;
				controls.minDistance = 10;
				controls.maxDistance = 900;
			}
		} catch {}
		let raf = 0;
		let cancelled = false;
		const t0 = performance.now();
		const drift = () => {
			if (cancelled) return;
			const t = (performance.now() - t0) * .001;
			for (const layer of parallaxLayers) layer.obj.rotation.y = t * layer.speed;
			raf = requestAnimationFrame(drift);
		};
		raf = requestAnimationFrame(drift);
		const hideHint = () => setHintVisible(false);
		el.addEventListener("pointerdown", hideHint, { once: true });
		graphRef.current = graph;
		const ro = new ResizeObserver(() => {
			if (!hostRef.current || !graphRef.current) return;
			const { width, height } = hostRef.current.getBoundingClientRect();
			graphRef.current.width(width).height(height);
		});
		ro.observe(el);
		const { width, height } = el.getBoundingClientRect();
		graph.width(width).height(height);
		graph.graphData(displayData);
		window.setTimeout(() => {
			try {
				graph.zoomToFit(650, mode === "fullscreen" ? 70 : 48);
			} catch {}
		}, 900);
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
			if (hoverThrottleRef.current != null) {
				window.clearTimeout(hoverThrottleRef.current);
				hoverThrottleRef.current = null;
			}
			hoverAppliedRef.current = null;
			nodeObjMapRef.current.clear();
			el.removeEventListener("pointerdown", hideHint);
			ro.disconnect();
			try {
				if (envMap) {
					graph.scene().environment = null;
					envMap.dispose();
				}
			} catch {}
			try {
				if (spaceRoot) {
					graph.scene().remove(spaceRoot);
					spaceRoot.traverse((obj) => {
						const mesh = obj;
						if (mesh.geometry) mesh.geometry.dispose();
						const mat = mesh.material;
						if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
						else if (mat) mat.dispose();
					});
				}
			} catch {}
			try {
				graph._destructor();
			} catch {}
			graphRef.current = null;
			el.innerHTML = "";
		};
	}, [
		mode,
		graphParticles,
		physicsIntensity,
		accentPreset,
		accentCustom,
		setActiveNote,
		setGraphMode,
		setLeftOpen,
		setRightOpen,
		createNote
	]);
	(0, import_react.useEffect)(() => {
		if (!graphRef.current) return;
		graphRef.current.graphData(displayData);
	}, [displayData]);
	/** W5: camera fly-to when activeNoteId changes (not on hover) */
	(0, import_react.useEffect)(() => {
		if (!graphRef.current || !activeNoteId) {
			prevActiveFlyRef.current = activeNoteId;
			return;
		}
		if (prevActiveFlyRef.current === void 0) {
			prevActiveFlyRef.current = activeNoteId;
			return;
		}
		if (prevActiveFlyRef.current === activeNoteId) return;
		prevActiveFlyRef.current = activeNoteId;
		const fly = () => {
			const graph = graphRef.current;
			if (!graph) return;
			const node = (graph.graphData()?.nodes ?? []).find((n) => n.id === activeNoteId);
			if (!node || node.x == null || node.y == null || node.z == null) return;
			const lookAt = {
				x: node.x,
				y: node.y,
				z: node.z
			};
			let cam;
			try {
				cam = graph.cameraPosition();
			} catch {
				return;
			}
			const dx = cam.x - lookAt.x;
			const dy = cam.y - lookAt.y;
			const dz = cam.z - lookAt.z;
			const scale = (mode === "fullscreen" ? 160 : 110) / (Math.hypot(dx, dy, dz) || 1);
			try {
				graph.cameraPosition({
					x: lookAt.x + dx * scale,
					y: lookAt.y + dy * scale,
					z: lookAt.z + dz * scale
				}, lookAt, 750);
			} catch {}
		};
		const t = window.setTimeout(fly, 80);
		return () => window.clearTimeout(t);
	}, [activeNoteId, mode]);
	(0, import_react.useEffect)(() => {
		if (!graphRef.current) return;
		const { r: ar, g: ag, b: ab } = accentRgb();
		const accent = new Color(ar / 255, ag / 255, ab / 255);
		const particleCount = graphParticles ? mode === "panel" ? 1 : 3 : 0;
		const focusId = () => hoverRef.current || activeNoteId;
		const dimStrength = () => {
			if (hoverRef.current) return 1;
			if (neighborhood === "1hop" && activeNoteId) return .9;
			if (activeNoteId) return .35;
			return 0;
		};
		const neighborSet = (id) => {
			if (!id) return null;
			if (neighborhood === "1hop" && hopKeepRef.current) return hopKeepRef.current;
			return neighborMapRef.current.get(id) ?? /* @__PURE__ */ new Set();
		};
		const shouldShowLabel = (n) => {
			const f = focusId();
			const ns = neighborSet(f);
			if (n.id === activeNoteId || n.id === hoverRef.current) return true;
			if (f && ns?.has(n.id) && n.id !== f) return true;
			if (hoverRef.current) return false;
			if (n.ghost) return false;
			if (neighborhood === "1hop" && hopKeepRef.current && !hopKeepRef.current.has(n.id)) return false;
			return n.degree >= 3;
		};
		const paintOrb = (n) => {
			const f = focusId();
			const obj = createOrb(n, activeNoteId, hoverRef.current, f, neighborSet(f), dimStrength(), mode, accent, shouldShowLabel(n), desktopBoost, lowDetailRef.current);
			nodeObjMapRef.current.set(n.id, obj);
			return obj;
		};
		const edgeStyle = (link) => {
			const [s, t] = linkIds(link);
			const hover = hoverRef.current;
			if (hover) {
				if (s === hover || t === hover) return {
					color: `rgba(${ar},${ag},${ab},0.92)`,
					width: mode === "fullscreen" ? 1.35 : 1,
					particles: particleCount > 0 ? particleCount + 1 : 0
				};
				return {
					color: `rgba(${ar},${ag},${ab},0.05)`,
					width: mode === "fullscreen" ? .2 : .14,
					particles: 0
				};
			}
			if (activeNoteId) {
				if (s === activeNoteId || t === activeNoteId) return {
					color: `rgba(${ar},${ag},${ab},0.62)`,
					width: mode === "fullscreen" ? .9 : .65,
					particles: particleCount
				};
				return {
					color: mode === "fullscreen" ? `rgba(${ar},${ag},${ab},0.14)` : `rgba(${ar},${ag},${ab},0.11)`,
					width: mode === "fullscreen" ? .36 : .28,
					particles: 0
				};
			}
			return {
				color: mode === "fullscreen" ? `rgba(${ar},${ag},${ab},0.28)` : `rgba(${ar},${ag},${ab},0.2)`,
				width: mode === "fullscreen" ? .48 : .36,
				particles: 0
			};
		};
		hoverAppliedRef.current = null;
		graphRef.current.nodeThreeObject((n) => paintOrb(n)).linkColor((link) => edgeStyle(link).color).linkWidth((link) => edgeStyle(link).width).linkDirectionalParticles((link) => edgeStyle(link).particles).refresh();
	}, [
		activeNoteId,
		mode,
		accentPreset,
		accentCustom,
		graphParticles,
		desktopBoost,
		neighborhood,
		showGhosts
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("graph-host relative flex min-h-0 flex-col overflow-hidden bg-[#03050a]", className),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute inset-0",
				style: { background: `
            radial-gradient(ellipse 90% 75% at 50% 40%, #0e1622 0%, #0a1018 40%, #05080e 68%, #03050a 100%)
          ` }
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "absolute left-3 right-3 top-3 z-10 flex items-center justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex min-w-0 flex-col gap-1.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex min-w-0 items-center gap-2 rounded-full border border-white/[0.06] bg-black/40 px-3 py-1.5 backdrop-blur-sm",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, {
								size: 12,
								className: "shrink-0 text-[var(--accent)] opacity-70"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "truncate text-[11px] font-medium tracking-wide text-[var(--text-muted)]",
								children: [
									realNoteCount,
									" notes",
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mx-1.5 opacity-50",
										children: "·"
									}),
									realLinkCount,
									" links",
									ghostCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mx-1.5 opacity-50",
										children: "·"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "opacity-70",
										children: [
											showGhosts ? ghostCount : 0,
											"/",
											ghostCount,
											" missing"
										]
									})] }) : null,
									neighborhood === "1hop" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mx-1.5 opacity-50",
										children: "·"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[var(--accent)] opacity-80",
										children: "1-hop"
									})] }) : null,
									hoverName ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "mx-1.5 opacity-50",
										children: "·"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "text-[var(--text-secondary)] transition-opacity duration-200",
										children: hoverName
									})] }) : null
								]
							})]
						}),
						realNoteCount > LOD_CAP ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "pointer-events-none px-1 text-[10px] tracking-wide text-[var(--text-muted)] opacity-70",
							children: [
								"Showing ",
								shownNoteCount,
								" of ",
								realNoteCount,
								" notes"
							]
						}) : null,
						topFolders.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "pointer-events-none flex flex-wrap items-center gap-1.5 px-1",
							children: topFolders.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-black/35 px-2 py-0.5 text-[10px] tracking-wide text-[var(--text-muted)] backdrop-blur-sm",
								title: `${f.label} · ${f.count} notes`,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "inline-block h-2 w-2 shrink-0 rounded-full",
									style: { backgroundColor: f.color }
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "max-w-[72px] truncate",
									children: f.label
								})]
							}, f.folder || "__root__"))
						}) : null
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex shrink-0 items-center gap-1.5",
					children: [
						ghostCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn("icon-btn pointer-events-auto h-8 w-8 shrink-0 border border-white/[0.06] bg-black/40", !showGhosts && "border-[var(--accent)]/40 text-[var(--accent)]"),
							title: showGhosts ? "Hide missing (ghost) nodes" : "Show missing (ghost) nodes",
							onClick: () => setShowGhosts((v) => !v),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ghost, {
								size: 14,
								className: cn(!showGhosts && "opacity-50")
							})
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: cn("icon-btn pointer-events-auto h-8 w-8 shrink-0 border border-white/[0.06] bg-black/40", neighborhood === "1hop" && "border-[var(--accent)]/40 text-[var(--accent)]"),
							title: neighborhood === "1hop" ? "Show full graph" : "Neighborhood: soft 1-hop (dim outsiders)",
							onClick: () => setNeighborhood((m) => m === "all" ? "1hop" : "all"),
							children: neighborhood === "1hop" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Focus, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Earth, { size: 14 })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "icon-btn pointer-events-auto h-8 w-8 shrink-0 border border-white/[0.06] bg-black/40",
							title: "Export graph PNG",
							onClick: exportPng,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { size: 14 })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "icon-btn pointer-events-auto h-8 w-8 shrink-0 border border-white/[0.06] bg-black/40",
							title: mode === "fullscreen" ? "Exit fullscreen graph" : "Expand graph",
							onClick: () => setGraphMode(mode === "fullscreen" ? "panel" : "fullscreen"),
							children: mode === "fullscreen" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minimize2, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Maximize2, { size: 14 })
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: hostRef,
				className: "relative z-[1] min-h-0 flex-1 touch-none"
			}),
			hintVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center px-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[10px] tracking-wide text-[var(--text-muted)] opacity-50",
					children: "Orbit · Zoom · Pan · Hover links · Click to open"
				})
			}) : null,
			realNoteCount === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
					icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, { size: 16 }),
					title: "No linked notes",
					description: "Add [[wikilinks]] between notes to map structure.",
					className: "max-w-[280px] border-white/[0.06] bg-black/40"
				})
			}) : null
		]
	});
}
/**
* Wave 3 — compact pulse activity stream for the right rail.
*/
var MAX_VISIBLE = 12;
var KIND_META = {
	create: {
		label: "Created",
		icon: FilePlus,
		tone: "text-[var(--accent)] bg-[var(--accent-dim)]"
	},
	update: {
		label: "Updated",
		icon: Pencil,
		tone: "text-[var(--text-secondary)] bg-white/[0.06]"
	},
	delete: {
		label: "Deleted",
		icon: Trash2,
		tone: "text-[var(--danger)] bg-[rgba(255,69,58,0.12)]"
	},
	external: {
		label: "External",
		icon: HardDrive,
		tone: "text-[var(--warning)] bg-[rgba(255,159,10,0.12)]"
	},
	conflict: {
		label: "Conflict",
		icon: TriangleAlert,
		tone: "text-[var(--danger)] bg-[rgba(255,69,58,0.15)]"
	},
	hermes: {
		label: "Hermes",
		icon: Bot,
		tone: "text-[var(--accent)] bg-[rgba(0,200,255,0.12)]"
	}
};
function formatRelative(at) {
	const sec = Math.max(0, Math.round((Date.now() - at) / 1e3));
	if (sec < 5) return "just now";
	if (sec < 60) return `${sec}s ago`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h ago`;
	return `${Math.round(hr / 24)}d ago`;
}
function displayTitle(ev) {
	if (ev.title?.trim()) return ev.title.trim();
	return (ev.path.split("/").pop() ?? ev.path).replace(/\.md$/i, "") || ev.path;
}
function PulseRail() {
	const events = usePulseEvents();
	const nodes = useVaultStore((s) => s.nodes);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const visible = events.slice(0, MAX_VISIBLE);
	const openPath = (path) => {
		const note = Object.values(nodes).find((n) => n.kind === "note" && n.path === path);
		if (note) setActiveNote(note.id);
	};
	if (visible.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "p-3",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
			compact: true,
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Activity, { size: 18 }),
			title: "No activity yet",
			description: "Creates, disk sync, conflicts, and Hermes writes will appear here."
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-1 p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
			children: "Recent activity"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "flex flex-col gap-1",
			children: visible.map((ev) => {
				const meta = KIND_META[ev.kind];
				const Icon = meta.icon;
				const noteExists = Object.values(nodes).some((n) => n.kind === "note" && n.path === ev.path);
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					disabled: !noteExists,
					className: cn("tree-row flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors", noteExists ? "hover:bg-white/[0.05] cursor-pointer" : "cursor-default opacity-70"),
					onClick: () => {
						if (noteExists) openPath(ev.path);
					},
					title: noteExists ? `Open ${ev.path}` : `${ev.path} (note not in vault)`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: cn("mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md", meta.tone),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { size: 12 })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "min-w-0 flex-1",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "truncate text-[13px] font-medium text-[var(--text-primary)]",
									children: displayTitle(ev)
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)]",
									children: meta.label
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mt-0.5 line-clamp-2 block text-[11.5px] text-[var(--text-muted)]",
								children: ev.message
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "mt-0.5 block text-[10px] text-[var(--text-muted)]/80",
								children: [formatRelative(ev.at), ev.path ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "ml-1.5 opacity-70",
									children: ["· ", ev.path]
								}) : null]
							})
						]
					})]
				}) }, ev.id);
			})
		})]
	});
}
/** Cached Fuse index — rebuilt when vault structure / titles / content change */
var cachedKey = "";
var cachedFuse = null;
var cachedDocs = [];
/** Per-note signature so a single content edit can patch without full key recompute thrash */
var cachedNoteSigs = /* @__PURE__ */ new Map();
function noteSig(n) {
	return `${noteTitle(n)}\0${n.path}\0${n.mtime}\0${(n.content ?? "").length}`;
}
function vaultKey(nodes) {
	return Object.values(nodes).filter((n) => n.kind === "note").map((n) => `${n.id}:${noteSig(n)}`).sort().join("|");
}
function rebuildFuse(docs) {
	return new entry_default(docs, {
		keys: [
			{
				name: "title",
				weight: .6
			},
			{
				name: "path",
				weight: .2
			},
			{
				name: "content",
				weight: .2
			}
		],
		threshold: .34,
		includeScore: true,
		ignoreLocation: true,
		minMatchCharLength: 1
	});
}
function getFuse(nodes) {
	const key = vaultKey(nodes);
	if (cachedFuse && cachedKey === key) return cachedFuse;
	const notes = Object.values(nodes).filter((n) => n.kind === "note");
	const nextSigs = /* @__PURE__ */ new Map();
	for (const n of notes) nextSigs.set(n.id, noteSig(n));
	if (cachedFuse && cachedDocs.length === notes.length && cachedNoteSigs.size === notes.length) {
		const prevIds = new Set(cachedNoteSigs.keys());
		const nextIds = new Set(nextSigs.keys());
		let sameIds = prevIds.size === nextIds.size;
		if (sameIds) {
			for (const id of prevIds) if (!nextIds.has(id)) {
				sameIds = false;
				break;
			}
		}
		if (sameIds) {
			const changed = [];
			for (const [id, sig] of nextSigs) if (cachedNoteSigs.get(id) !== sig) changed.push(id);
			if (changed.length === 1) {
				const id = changed[0];
				const n = nodes[id];
				if (n && n.kind === "note") {
					const idx = cachedDocs.findIndex((d) => d.id === id);
					if (idx >= 0) {
						cachedDocs[idx] = {
							id: n.id,
							path: n.path,
							title: noteTitle(n),
							content: n.content ?? "",
							mtime: n.mtime
						};
						cachedFuse = rebuildFuse(cachedDocs);
						cachedKey = key;
						cachedNoteSigs = nextSigs;
						return cachedFuse;
					}
				}
			}
		}
	}
	cachedDocs = notes.map((n) => ({
		id: n.id,
		path: n.path,
		title: noteTitle(n),
		content: n.content ?? "",
		mtime: n.mtime
	}));
	cachedFuse = rebuildFuse(cachedDocs);
	cachedKey = key;
	cachedNoteSigs = nextSigs;
	return cachedFuse;
}
/**
* Ranking: exact title > title starts-with > path > fuzzy content.
* Recency is a light tie-breaker. `#tag` queries filter by tag.
*/
function searchVault(nodes, query, limit = 20) {
	const q = query.trim();
	if (!q) return Object.values(nodes).filter((n) => n.kind === "note").sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((n) => ({
		noteId: n.id,
		path: n.path,
		title: noteTitle(n),
		snippet: previewSnippet(n.content ?? "", 90),
		score: 1,
		matchType: "title"
	}));
	const tagMatch = /^#([\w/-]+)$/i.exec(q) || /^tag:([\w/-]+)$/i.exec(q);
	if (tagMatch) return notesForTag(nodes, tagMatch[1]).slice(0, limit).map((n) => ({
		noteId: n.id,
		path: n.path,
		title: noteTitle(n),
		snippet: `#${tagMatch[1].toLowerCase()}`,
		score: 1,
		matchType: "title"
	}));
	if (/^is:orphans?$/i.test(q) || /^orphans?$/i.test(q)) return getOrphanNotes(nodes, limit).map((o) => ({
		noteId: o.id,
		path: o.path,
		title: o.title,
		snippet: "orphan",
		score: 1,
		matchType: "title"
	}));
	const lower = q.toLowerCase();
	const notes = Object.values(nodes).filter((n) => n.kind === "note");
	const exact = [];
	const prefix = [];
	for (const n of notes) {
		const title = noteTitle(n);
		const t = title.toLowerCase();
		if (t === lower) exact.push({
			noteId: n.id,
			path: n.path,
			title,
			snippet: previewSnippet(n.content ?? "", 100),
			score: 100,
			matchType: "title"
		});
		else if (t.startsWith(lower)) prefix.push({
			noteId: n.id,
			path: n.path,
			title,
			snippet: previewSnippet(n.content ?? "", 100),
			score: 80 + Math.min(10, n.mtime / 0x9184e72a000),
			matchType: "title"
		});
	}
	prefix.sort((a, b) => b.score - a.score);
	const fuzzy = getFuse(nodes).search(q, { limit: limit * 2 }).map((r) => {
		const score = 1 - (r.score ?? 0);
		const titleHit = r.item.title.toLowerCase().includes(lower);
		const pathHit = r.item.path.toLowerCase().includes(lower);
		const recency = Math.min(.05, r.item.mtime / Date.now() * .05);
		const snippet = titleHit ? previewSnippet(r.item.content, 100) : extractSnippet(r.item.content, q);
		return {
			noteId: r.item.id,
			path: r.item.path,
			title: r.item.title,
			snippet,
			score: score + recency + (titleHit ? .15 : 0) + (pathHit ? .08 : 0),
			matchType: titleHit ? "title" : "content"
		};
	});
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const hit of [
		...exact,
		...prefix,
		...fuzzy.sort((a, b) => b.score - a.score)
	]) {
		if (seen.has(hit.noteId)) continue;
		seen.add(hit.noteId);
		out.push(hit);
		if (out.length >= limit) break;
	}
	return out;
}
function extractSnippet(content, query, radius = 50) {
	const i = content.toLowerCase().indexOf(query.toLowerCase());
	if (i < 0) return previewSnippet(content, 100);
	const from = Math.max(0, i - radius);
	const to = Math.min(content.length, i + query.length + radius);
	let s = content.slice(from, to).replace(/\s+/g, " ").trim();
	if (from > 0) s = "…" + s;
	if (to < content.length) s = s + "…";
	return s;
}
var GROUP_HEADING = "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]";
var ITEM_CLASS = "cmdk-item flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] aria-selected:text-[var(--text-primary)]";
var TEMPLATE_ICONS = {
	daily: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarDays, { size: 15 }),
	meeting: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Users, { size: 15 }),
	idea: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Lightbulb, { size: 15 }),
	project: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderKanban, { size: 15 })
};
/** Open command palette, optionally with a prefilled query. */
function openCommandPalette(query) {
	setPendingCommandQuery(query ?? null);
	useVaultStore.getState().setCommandOpen(true);
}
function matchesQuery(label, keywords, q) {
	if (!q) return true;
	const lower = q.toLowerCase();
	const hay = `${label} ${keywords.join(" ")}`.toLowerCase();
	if (hay.includes(lower)) return true;
	const parts = lower.split(/\s+/).filter(Boolean);
	if (parts.length > 1) return parts.every((p) => hay.includes(p));
	return false;
}
function wrapRun(id, run) {
	return () => {
		trackCommand(id);
		run();
	};
}
/** Parse `path:foo` / `folder:bar` operators; rest is free-text search. */
function parsePathFolderOps(raw) {
	let rest = raw;
	let pathFilter = null;
	let folderFilter = null;
	rest = rest.replace(/\bpath:("([^"]+)"|(\S+))/gi, (_, _all, quoted, bare) => {
		pathFilter = (quoted ?? bare ?? "").trim() || null;
		return " ";
	});
	rest = rest.replace(/\bfolder:("([^"]+)"|(\S+))/gi, (_, _all, quoted, bare) => {
		folderFilter = (quoted ?? bare ?? "").trim() || null;
		return " ";
	});
	return {
		pathFilter,
		folderFilter,
		rest: rest.replace(/\s+/g, " ").trim()
	};
}
function filterHitsByPathOps(hits, pathFilter, folderFilter) {
	let out = hits;
	if (pathFilter) {
		const needle = pathFilter.toLowerCase();
		out = out.filter((h) => h.path.toLowerCase().includes(needle));
	}
	if (folderFilter) {
		const needle = folderFilter.toLowerCase();
		out = out.filter((h) => {
			const p = h.path.toLowerCase();
			if (p.includes(needle)) return true;
			const slash = p.lastIndexOf("/");
			return (slash >= 0 ? p.slice(0, slash) : "").includes(needle);
		});
	}
	return out;
}
/** All notes as hits (for path/folder-only filters). */
function allNotesAsHits(nodes, limit = 40) {
	return Object.values(nodes).filter((n) => n.kind === "note").sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((n) => ({
		noteId: n.id,
		path: n.path,
		title: noteTitle(n),
		snippet: previewSnippet(n.content ?? "", 90),
		score: 1,
		matchType: "title"
	}));
}
/** Top notes by visit MRU, then mtime. */
function topNotesByVisitMtime(nodes, limit) {
	const visits = loadNoteVisits();
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const id of visits) {
		const n = nodes[id];
		if (!n || n.kind !== "note") continue;
		seen.add(id);
		out.push({
			noteId: n.id,
			path: n.path,
			title: noteTitle(n),
			snippet: previewSnippet(n.content ?? "", 90),
			score: 1,
			matchType: "title"
		});
		if (out.length >= limit) return out;
	}
	const rest = Object.values(nodes).filter((n) => n.kind === "note" && !seen.has(n.id)).sort((a, b) => b.mtime - a.mtime);
	for (const n of rest) {
		out.push({
			noteId: n.id,
			path: n.path,
			title: noteTitle(n),
			snippet: previewSnippet(n.content ?? "", 90),
			score: 1,
			matchType: "title"
		});
		if (out.length >= limit) break;
	}
	return out;
}
function CommandPalette() {
	const open = useVaultStore((s) => s.commandOpen);
	const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
	const nodes = useVaultStore((s) => s.nodes);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const createNote = useVaultStore((s) => s.createNote);
	const openDailyNote = useVaultStore((s) => s.openDailyNote);
	const createFromTemplate = useVaultStore((s) => s.createFromTemplate);
	const requestDelete = useVaultStore((s) => s.requestDelete);
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const toggleLeft = useVaultStore((s) => s.toggleLeft);
	const toggleRight = useVaultStore((s) => s.toggleRight);
	const toggleEditorMode = useVaultStore((s) => s.toggleEditorMode);
	const toggleGraphFullscreen = useVaultStore((s) => s.toggleGraphFullscreen);
	const openDemoVault = useVaultStore((s) => s.openDemoVault);
	const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
	const createNewVault = useVaultStore((s) => s.createNewVault);
	const revealVaultInFinder = useVaultStore((s) => s.revealVaultInFinder);
	const flushDirty = useVaultStore((s) => s.flushDirty);
	const setToast = useVaultStore((s) => s.setToast);
	const simulateHermesWrite = useVaultStore((s) => s.simulateHermesWrite);
	const editorMode = useVaultStore((s) => s.settings.editorMode);
	const [query, setQuery] = (0, import_react.useState)("");
	const [recentTick, setRecentTick] = (0, import_react.useState)(0);
	(0, import_react.useEffect)(() => {
		if (open) {
			const pending = takePendingCommandQuery();
			if (pending != null) setQuery(pending);
			else setQuery("");
		} else setQuery("");
	}, [open]);
	const raw = query.trim();
	const isCommandMode = raw.startsWith(">");
	const q = isCommandMode ? raw.slice(1).trim() : raw;
	const pathFolderOps = (0, import_react.useMemo)(() => isCommandMode ? {
		pathFilter: null,
		folderFilter: null,
		rest: q
	} : parsePathFolderOps(raw), [
		isCommandMode,
		q,
		raw
	]);
	const searchText = isCommandMode ? "" : pathFolderOps.rest;
	const qLower = q.toLowerCase();
	const isTagBrowse = searchText.startsWith("#") || !pathFolderOps.pathFilter && !pathFolderOps.folderFilter && q.startsWith("#");
	const tagPartial = isTagBrowse ? (searchText.startsWith("#") ? searchText.slice(1) : q.slice(1)).toLowerCase() : "";
	const exactTagQuery = /^#([\w/-]+)$/i.exec(searchText || raw);
	const wantsOrphans = qLower === "is:orphan" || qLower === "is:orphans" || qLower === "orphan" || qLower === "orphans";
	const wantsBroken = qLower === "is:broken" || qLower === "broken" || qLower === "broken links";
	const hasPathFolderOp = Boolean(pathFolderOps.pathFilter || pathFolderOps.folderFilter);
	const showAllActions = Boolean(raw) || isCommandMode;
	const actionQuery = isCommandMode ? q : searchText || (hasPathFolderOp ? "" : q);
	const isEmptyQuery = !raw && !isCommandMode;
	const hits = (0, import_react.useMemo)(() => {
		if (isEmptyQuery) return topNotesByVisitMtime(nodes, 10);
		if (isTagBrowse && tagPartial === "" && !hasPathFolderOp) return [];
		if (exactTagQuery && !hasPathFolderOp) return notesForTag(nodes, exactTagQuery[1]).map((n) => ({
			noteId: n.id,
			path: n.path,
			title: noteTitle(n),
			snippet: `#${exactTagQuery[1].toLowerCase()}`,
			score: 1,
			matchType: "title"
		}));
		if (wantsOrphans || wantsBroken || isCommandMode) return [];
		let base;
		if (searchText) base = searchVault(nodes, searchText, 24);
		else if (hasPathFolderOp) base = allNotesAsHits(nodes, 48);
		else base = searchVault(nodes, raw, 16);
		return filterHitsByPathOps(base, pathFolderOps.pathFilter, pathFolderOps.folderFilter).slice(0, 16);
	}, [
		nodes,
		raw,
		searchText,
		isEmptyQuery,
		isTagBrowse,
		tagPartial,
		exactTagQuery,
		wantsOrphans,
		wantsBroken,
		isCommandMode,
		hasPathFolderOp,
		pathFolderOps.pathFilter,
		pathFolderOps.folderFilter
	]);
	const tags = (0, import_react.useMemo)(() => {
		if (!isTagBrowse) return [];
		return collectVaultTags(nodes).filter((t) => !tagPartial || t.tag.startsWith(tagPartial) || t.tag.includes(tagPartial)).slice(0, 20);
	}, [
		nodes,
		isTagBrowse,
		tagPartial
	]);
	const orphans = (0, import_react.useMemo)(() => {
		if (!wantsOrphans) return [];
		try {
			return getOrphanNotes(nodes, 24);
		} catch {
			return [];
		}
	}, [nodes, wantsOrphans]);
	const brokenLinks = (0, import_react.useMemo)(() => {
		if (!wantsBroken) return [];
		try {
			return getAllBrokenLinks(nodes, 40);
		} catch {
			return [];
		}
	}, [nodes, wantsBroken]);
	const brokenCreateTargets = (0, import_react.useMemo)(() => {
		if (!wantsBroken) return [];
		const seen = /* @__PURE__ */ new Set();
		const out = [];
		for (const bl of brokenLinks) {
			const key = bl.target.trim().toLowerCase();
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push(bl.target);
			if (out.length >= 12) break;
		}
		return out;
	}, [wantsBroken, brokenLinks]);
	const createActions = (0, import_react.useMemo)(() => [
		{
			id: "new-note",
			label: "New note",
			keywords: [
				"create",
				"add",
				"file"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 15 }),
			shortcut: "⌘N",
			run: wrapRun("new-note", () => {
				createNote(null);
				setCommandOpen(false);
			})
		},
		{
			id: "daily",
			label: "Daily note",
			keywords: [
				"today",
				"journal",
				"daily"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarDays, { size: 15 }),
			shortcut: "⌘D",
			run: wrapRun("daily", () => {
				openDailyNote();
				setCommandOpen(false);
			})
		},
		...NOTE_TEMPLATES.filter((t) => t.id !== "blank" && t.id !== "daily").map((t) => ({
			id: `tpl-${t.id}`,
			label: `New ${t.label.toLowerCase()}`,
			keywords: [
				t.id,
				t.label,
				"template",
				"create"
			],
			icon: TEMPLATE_ICONS[t.id] ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 15 }),
			shortcut: void 0,
			run: wrapRun(`tpl-${t.id}`, () => {
				createFromTemplate(t.id);
				setCommandOpen(false);
			})
		}))
	].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)), [
		actionQuery,
		createNote,
		openDailyNote,
		createFromTemplate,
		setCommandOpen
	]);
	const navigateActions = (0, import_react.useMemo)(() => [
		{
			id: "toggle-left",
			label: "Toggle left sidebar",
			keywords: [
				"sidebar",
				"panel",
				"files",
				"tree"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeft, { size: 15 }),
			shortcut: "⌘\\",
			run: wrapRun("toggle-left", () => {
				toggleLeft();
				setCommandOpen(false);
			})
		},
		{
			id: "toggle-right",
			label: "Toggle right panel",
			keywords: [
				"outline",
				"backlinks",
				"panel"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRight, { size: 15 }),
			shortcut: "⌘⌥\\",
			run: wrapRun("toggle-right", () => {
				toggleRight();
				setCommandOpen(false);
			})
		},
		{
			id: "toggle-editor",
			label: "Toggle Visual / Source",
			keywords: [
				"editor",
				"source",
				"visual",
				"mode",
				"markdown"
			],
			icon: editorMode === "visual" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeXml, { size: 15 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 15 }),
			shortcut: "⌘E",
			run: wrapRun("toggle-editor", () => {
				toggleEditorMode();
				setCommandOpen(false);
			})
		},
		{
			id: "toggle-graph",
			label: "Toggle graph",
			keywords: [
				"graph",
				"fullscreen",
				"network",
				"orbit"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, { size: 15 }),
			shortcut: "⌘G",
			run: wrapRun("toggle-graph", () => {
				toggleGraphFullscreen();
				setCommandOpen(false);
			})
		},
		{
			id: "focus-mode",
			label: "Toggle focus mode",
			keywords: [
				"focus",
				"zen",
				"distraction",
				"fullscreen",
				"calm"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Focus, { size: 15 }),
			shortcut: "⌘.",
			run: wrapRun("focus-mode", () => {
				const next = toggleFocusMode();
				setToast(next ? "Focus mode on" : "Focus mode off");
				setCommandOpen(false);
			})
		},
		{
			id: "settings",
			label: "Settings",
			keywords: [
				"preferences",
				"prefs",
				"options",
				"config"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { size: 15 }),
			shortcut: "⌘,",
			run: wrapRun("settings", () => {
				usePrefsStore.getState().setSettingsOpen(true);
				setCommandOpen(false);
			})
		},
		{
			id: "help",
			label: "Help & shortcuts",
			keywords: [
				"help",
				"shortcuts",
				"keyboard",
				"docs",
				"reference"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleHelp, { size: 15 }),
			shortcut: void 0,
			run: wrapRun("help", () => {
				usePrefsStore.getState().setSettingsOpen(true);
				setCommandOpen(false);
			})
		}
	].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)), [
		actionQuery,
		editorMode,
		toggleLeft,
		toggleRight,
		toggleEditorMode,
		toggleGraphFullscreen,
		setCommandOpen,
		setToast
	]);
	const noteOps = (0, import_react.useMemo)(() => [{
		id: "delete",
		label: "Delete current note",
		keywords: [
			"remove",
			"trash",
			"delete"
		],
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { size: 15 }),
		shortcut: void 0,
		run: wrapRun("delete", () => {
			if (activeNoteId) requestDelete(activeNoteId);
			setCommandOpen(false);
		})
	}, {
		id: "save",
		label: "Flush / save",
		keywords: [
			"save",
			"flush",
			"write",
			"disk"
		],
		icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { size: 15 }),
		shortcut: "⌘S",
		run: wrapRun("save", () => {
			flushDirty();
			setToast("Saved");
			setCommandOpen(false);
		})
	}].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)), [
		actionQuery,
		activeNoteId,
		requestDelete,
		flushDirty,
		setToast,
		setCommandOpen
	]);
	const vaultActions = (0, import_react.useMemo)(() => [
		{
			id: "open-folder",
			label: "Open folder…",
			keywords: [
				"vault",
				"open",
				"folder",
				"disk"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { size: 15 }),
			shortcut: void 0,
			run: wrapRun("open-folder", () => {
				openFolderAsVault();
				setCommandOpen(false);
			})
		},
		{
			id: "new-vault",
			label: "New vault…",
			keywords: [
				"vault",
				"create",
				"new"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderPlus, { size: 15 }),
			shortcut: void 0,
			run: wrapRun("new-vault", () => {
				createNewVault("Nexus Vault");
				setCommandOpen(false);
			})
		},
		{
			id: "reveal",
			label: "Reveal in Finder",
			keywords: [
				"finder",
				"explorer",
				"show",
				"reveal",
				"folder"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ExternalLink, { size: 15 }),
			shortcut: void 0,
			run: wrapRun("reveal", () => {
				revealVaultInFinder();
				setCommandOpen(false);
			})
		},
		{
			id: "demo",
			label: "Demo vault",
			keywords: [
				"demo",
				"sample",
				"example",
				"try"
			],
			icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { size: 15 }),
			shortcut: void 0,
			run: wrapRun("demo", () => {
				openDemoVault();
				setCommandOpen(false);
			})
		},
		...[]
	].filter((a) => matchesQuery(a.label, a.keywords, actionQuery)), [
		actionQuery,
		openFolderAsVault,
		createNewVault,
		revealVaultInFinder,
		openDemoVault,
		simulateHermesWrite,
		setCommandOpen
	]);
	const allActionsById = (0, import_react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const a of [
			...createActions,
			...navigateActions,
			...noteOps,
			...vaultActions
		]) map.set(a.id, a);
		return map;
	}, [
		createActions,
		navigateActions,
		noteOps,
		vaultActions
	]);
	const fullActionCatalog = (0, import_react.useMemo)(() => {
		return [
			{
				id: "new-note",
				label: "New note",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 15 }),
				shortcut: "⌘N",
				run: wrapRun("new-note", () => {
					createNote(null);
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "daily",
				label: "Daily note",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarDays, { size: 15 }),
				shortcut: "⌘D",
				run: wrapRun("daily", () => {
					openDailyNote();
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			...NOTE_TEMPLATES.filter((t) => t.id !== "blank" && t.id !== "daily").map((t) => ({
				id: `tpl-${t.id}`,
				label: `New ${t.label.toLowerCase()}`,
				icon: TEMPLATE_ICONS[t.id] ?? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 15 }),
				shortcut: void 0,
				run: wrapRun(`tpl-${t.id}`, () => {
					createFromTemplate(t.id);
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			})),
			{
				id: "toggle-left",
				label: "Toggle left sidebar",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelLeft, { size: 15 }),
				shortcut: "⌘\\",
				run: wrapRun("toggle-left", () => {
					toggleLeft();
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "toggle-right",
				label: "Toggle right panel",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRight, { size: 15 }),
				shortcut: "⌘⌥\\",
				run: wrapRun("toggle-right", () => {
					toggleRight();
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "toggle-editor",
				label: "Toggle Visual / Source",
				icon: editorMode === "visual" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeXml, { size: 15 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 15 }),
				shortcut: "⌘E",
				run: wrapRun("toggle-editor", () => {
					toggleEditorMode();
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "toggle-graph",
				label: "Toggle graph",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, { size: 15 }),
				shortcut: "⌘G",
				run: wrapRun("toggle-graph", () => {
					toggleGraphFullscreen();
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "focus-mode",
				label: "Toggle focus mode",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Focus, { size: 15 }),
				shortcut: "⌘.",
				run: wrapRun("focus-mode", () => {
					const next = toggleFocusMode();
					setToast(next ? "Focus mode on" : "Focus mode off");
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "settings",
				label: "Settings",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { size: 15 }),
				shortcut: "⌘,",
				run: wrapRun("settings", () => {
					usePrefsStore.getState().setSettingsOpen(true);
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "help",
				label: "Help & shortcuts",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleHelp, { size: 15 }),
				run: wrapRun("help", () => {
					usePrefsStore.getState().setSettingsOpen(true);
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "save",
				label: "Flush / save",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { size: 15 }),
				shortcut: "⌘S",
				run: wrapRun("save", () => {
					flushDirty();
					setToast("Saved");
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			},
			{
				id: "demo",
				label: "Demo vault",
				icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { size: 15 }),
				run: wrapRun("demo", () => {
					openDemoVault();
					setCommandOpen(false);
					setRecentTick((t) => t + 1);
				})
			}
		];
	}, [
		createNote,
		openDailyNote,
		createFromTemplate,
		toggleLeft,
		toggleRight,
		toggleEditorMode,
		toggleGraphFullscreen,
		editorMode,
		flushDirty,
		setToast,
		openDemoVault,
		setCommandOpen
	]);
	const recentCommands = (0, import_react.useMemo)(() => {
		const byId = new Map(fullActionCatalog.map((a) => [a.id, a]));
		for (const a of allActionsById.values()) byId.set(a.id, a);
		return recentCommandIds.map((id) => byId.get(id)).filter((a) => Boolean(a)).slice(0, 8);
	}, [
		fullActionCatalog,
		allActionsById,
		recentTick
	]);
	const showCreateNote = Boolean(searchText || q && !hasPathFolderOp && !isCommandMode) && !isCommandMode && !isTagBrowse && !wantsOrphans && !wantsBroken && hits.length === 0 && !qLower.startsWith("is:") && !hasPathFolderOp;
	const emptyTopActions = (0, import_react.useMemo)(() => {
		return [...createActions, ...navigateActions].slice(0, 4);
	}, [createActions, navigateActions]);
	if (!open) return null;
	const runTracked = (a) => {
		trackCommand(a.id);
		setRecentTick((t) => t + 1);
		a.run();
	};
	const notesHeading = isEmptyQuery ? "Recent notes" : hasPathFolderOp ? [pathFolderOps.pathFilter ? `path:${pathFolderOps.pathFilter}` : null, pathFolderOps.folderFilter ? `folder:${pathFolderOps.folderFilter}` : null].filter(Boolean).join(" · ") : q ? isTagBrowse ? `Tagged #${tagPartial}` : "Notes" : "Recent";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[10vh] backdrop-blur-[8px]",
		onClick: () => setCommandOpen(false),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e, {
			className: "glass-elevated w-full max-w-xl overflow-hidden rounded-[16px] shadow-[0_28px_90px_rgba(0,0,0,0.6),0_0_0_1px_rgba(0,200,255,0.1)]",
			onClick: (e) => e.stopPropagation(),
			label: "Command palette",
			shouldFilter: false,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2.5 border-b border-[var(--border)] px-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
							size: 16,
							className: "shrink-0 text-[var(--accent)]"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Input, {
							value: query,
							onValueChange: setQuery,
							placeholder: "Search notes, path: folder: #tags, is:orphan, or > commands…",
							className: "h-12 w-full bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]",
							autoFocus: true
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
							className: "shrink-0 rounded-md border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]",
							children: "esc"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.List, {
					className: "max-h-[min(480px,56vh)] overflow-y-auto p-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Empty, {
							className: "px-3 py-8 text-center",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[13px] text-[var(--text-muted)]",
								children: Object.keys(nodes).length === 0 ? "No notes yet — create one or open a vault" : "No matching results"
							}), showCreateNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "mt-3 text-[12.5px] text-[var(--accent)] hover:underline",
								onClick: () => {
									createNote(null, searchText || q || "Untitled");
									setCommandOpen(false);
								},
								children: ["Create note: ", searchText || q || "Untitled"]
							}) : null]
						}),
						isEmptyQuery && recentCommands.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
							heading: "Recent commands",
							className: GROUP_HEADING,
							children: recentCommands.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
								value: `recent-${a.id}-${a.label}`,
								onSelect: () => runTracked(a),
								className: ITEM_CLASS,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(History, { size: 14 })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "flex-1",
										children: a.label
									}),
									a.shortcut ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
										className: "rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]",
										children: a.shortcut
									}) : null
								]
							}, `recent-${a.id}`))
						}) : null,
						isTagBrowse && tags.length > 0 && !exactTagQuery ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
							heading: "Tags",
							className: GROUP_HEADING,
							children: tags.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
								value: `tag-${t.tag}`,
								onSelect: () => {
									if (t.noteIds.length === 1) {
										setActiveNote(t.noteIds[0]);
										setCommandOpen(false);
									} else setQuery(`#${t.tag}`);
								},
								className: ITEM_CLASS,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hash, {
										size: 15,
										className: "shrink-0 text-[var(--accent)]"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "flex-1 font-medium text-[var(--text-primary)]",
										children: ["#", t.tag]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-[11px] text-[var(--text-muted)]",
										children: [
											t.count,
											" note",
											t.count === 1 ? "" : "s"
										]
									})
								]
							}, t.tag))
						}) : null,
						exactTagQuery && hits.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
							heading: `Tagged #${exactTagQuery[1].toLowerCase()}`,
							className: GROUP_HEADING,
							children: hits.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
								value: `tag-note-${h.noteId}-${h.title}`,
								onSelect: () => {
									setActiveNote(h.noteId);
									setCommandOpen(false);
								},
								className: cn(ITEM_CLASS, "items-start"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, {
									size: 15,
									className: "mt-0.5 shrink-0 text-[var(--accent)]"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-medium text-[var(--text-primary)]",
										children: h.title
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "truncate text-[11.5px] text-[var(--text-muted)]",
										children: h.path
									})]
								})]
							}, h.noteId))
						}) : null,
						hits.length > 0 && !(exactTagQuery && hits.length > 1) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
							heading: notesHeading,
							className: cn(GROUP_HEADING, tags.length > 0 && "mt-1"),
							children: hits.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
								value: `note-${h.noteId}-${h.title}`,
								onSelect: () => {
									setActiveNote(h.noteId);
									setCommandOpen(false);
								},
								className: cn(ITEM_CLASS, "items-start"),
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FileText, {
										size: 15,
										className: "mt-0.5 shrink-0 text-[var(--accent)]"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "font-medium text-[var(--text-primary)]",
											children: h.title
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "truncate text-[11.5px] text-[var(--text-muted)]",
											children: [h.path, h.snippet ? ` · ${h.snippet}` : ""]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-auto shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)]",
										children: h.matchType
									})
								]
							}, h.noteId))
						}) : null,
						wantsOrphans ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Group, {
							heading: "Orphan notes",
							className: cn(GROUP_HEADING, "mt-1"),
							children: [orphans.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Item, {
								value: "no-orphans",
								className: ITEM_CLASS,
								onSelect: () => {},
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[var(--text-muted)]",
									children: "No orphan notes"
								})
							}) : null, orphans.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
								value: `orphan-${o.id}-${o.title}`,
								onSelect: () => {
									setActiveNote(o.id);
									setCommandOpen(false);
								},
								className: cn(ITEM_CLASS, "items-start"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Unlink, {
									size: 15,
									className: "mt-0.5 shrink-0 text-[var(--text-muted)]"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "font-medium text-[var(--text-primary)]",
										children: o.title
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "truncate text-[11.5px] text-[var(--text-muted)]",
										children: o.path
									})]
								})]
							}, o.id))]
						}) : null,
						wantsBroken ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
							heading: "Broken links",
							className: cn(GROUP_HEADING, "mt-1"),
							children: brokenLinks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Item, {
								value: "no-broken",
								className: ITEM_CLASS,
								onSelect: () => {},
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[var(--text-muted)]",
									children: "No broken links in this vault"
								})
							}) : brokenLinks.map((bl, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
								value: `broken-${bl.noteId}-${bl.target}`,
								onSelect: () => {
									setActiveNote(bl.noteId);
									setCommandOpen(false);
								},
								className: cn(ITEM_CLASS, "items-start"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Unlink, {
									size: 15,
									className: "mt-0.5 shrink-0 text-[var(--warning)]"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "font-medium text-[var(--text-primary)]",
										children: [
											"[[",
											bl.target,
											"]]"
										]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "truncate text-[11.5px] text-[var(--text-muted)]",
										children: [
											"in ",
											bl.noteTitle,
											" · ",
											bl.notePath
										]
									})]
								})]
							}, `${bl.noteId}-${bl.target}-${i}`))
						}) : null,
						wantsBroken && brokenCreateTargets.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
							heading: "Create missing",
							className: cn(GROUP_HEADING, "mt-1"),
							children: brokenCreateTargets.map((target) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
								value: `create-broken-${target}`,
								onSelect: () => {
									createNote(null, target);
									setToast(`Created “${target}”`);
									setCommandOpen(false);
								},
								className: ITEM_CLASS,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 15 })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "flex-1",
									children: [
										"Create:",
										" ",
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-medium text-[var(--text-primary)]",
											children: target
										})
									]
								})]
							}, `create-broken-${target}`))
						}) : null,
						!showAllActions ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: emptyTopActions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionGroup, {
							heading: "Commands",
							actions: emptyTopActions,
							onRun: (a) => {
								trackCommand(a.id);
								setRecentTick((t) => t + 1);
								a.run();
							}
						}) : null }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
							createActions.length > 0 || showCreateNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Group, {
								heading: "Create",
								className: cn(GROUP_HEADING, "mt-1"),
								children: [showCreateNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
									value: `create-note-${searchText || q}`,
									onSelect: () => {
										createNote(null, searchText || q || "Untitled");
										setCommandOpen(false);
									},
									className: ITEM_CLASS,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 15 })
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "flex-1",
										children: [
											"Create note:",
											" ",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "font-medium text-[var(--text-primary)]",
												children: searchText || q
											})
										]
									})]
								}) : null, createActions.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
									value: `Create-${a.id}-${a.label}`,
									onSelect: () => {
										trackCommand(a.id);
										setRecentTick((t) => t + 1);
										a.run();
									},
									className: ITEM_CLASS,
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]",
											children: a.icon
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "flex-1",
											children: a.label
										}),
										a.shortcut ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
											className: "rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]",
											children: a.shortcut
										}) : null
									]
								}, a.id))]
							}) : null,
							navigateActions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionGroup, {
								heading: "Navigate",
								actions: navigateActions,
								onRun: (a) => {
									trackCommand(a.id);
									setRecentTick((t) => t + 1);
									a.run();
								}
							}) : null,
							noteOps.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionGroup, {
								heading: "Note",
								actions: noteOps,
								onRun: (a) => {
									trackCommand(a.id);
									setRecentTick((t) => t + 1);
									a.run();
								}
							}) : null,
							vaultActions.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionGroup, {
								heading: "Vault",
								actions: vaultActions,
								onRun: (a) => {
									trackCommand(a.id);
									setRecentTick((t) => t + 1);
									a.run();
								}
							}) : null
						] })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3.5 border-t border-[var(--border)] px-3.5 py-2 text-[10.5px] text-[var(--text-muted)]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hint, {
							keys: "↑↓",
							label: "navigate"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hint, {
							keys: "↵",
							label: "open"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hint, {
							keys: "esc",
							label: "close"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "ml-auto flex items-center gap-1.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
								className: "rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]",
								children: "⌘K"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "anytime" })]
						})
					]
				})
			]
		})
	});
}
function ActionGroup({ heading, actions, onRun }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
		heading,
		className: cn(GROUP_HEADING, "mt-1"),
		children: actions.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
			value: `${heading}-${a.id}-${a.label}`,
			onSelect: () => onRun ? onRun(a) : a.run(),
			className: ITEM_CLASS,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--accent-dim)] text-[var(--accent)]",
					children: a.icon
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "flex-1",
					children: a.label
				}),
				a.shortcut ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
					className: "rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]",
					children: a.shortcut
				}) : null
			]
		}, a.id))
	});
}
function Hint({ keys, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex items-center gap-1",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
			className: "rounded border border-[var(--border)] bg-white/[0.03] px-1 py-0.5 font-mono text-[10px] text-[var(--text-muted)]",
			children: keys
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label })]
	});
}
var DEFAULT_RIGHT_WIDTH = 340;
function RightPanel() {
	const rightOpen = useVaultStore((s) => s.settings.rightOpen);
	const rightWidth = useVaultStore((s) => s.settings.rightWidth);
	const graphMode = useVaultStore((s) => s.settings.graphMode);
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const nodes = useVaultStore((s) => s.nodes);
	const vaultId = useVaultStore((s) => s.vaultId);
	const mode = useVaultStore((s) => s.mode);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const setRightOpen = useVaultStore((s) => s.setRightOpen);
	const setRightWidth = useVaultStore((s) => s.setRightWidth);
	const setToast = useVaultStore((s) => s.setToast);
	const createNote = useVaultStore((s) => s.createNote);
	const focusMode = usePrefsStore((s) => s.focusMode);
	const [tab, setTab] = (0, import_react.useState)("backlinks");
	const demoGraphPrimed = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (mode === "demo" && vaultId && demoGraphPrimed.current !== vaultId) {
			demoGraphPrimed.current = vaultId;
			setTab("graph");
		}
	}, [mode, vaultId]);
	const dragStartX = (0, import_react.useRef)(0);
	const dragStartWidth = (0, import_react.useRef)(0);
	const note = activeNoteId ? nodes[activeNoteId] : null;
	const backlinks = (0, import_react.useMemo)(() => {
		if (!note || note.kind !== "note") return [];
		return getBacklinks(note, nodes);
	}, [note, nodes]);
	/** Wave 4: group multi-mentions by source note, show count */
	const groupedBacklinks = (0, import_react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const b of backlinks) {
			const existing = map.get(b.fromId);
			if (existing) {
				existing.count += 1;
				if (b.context && !existing.contexts.includes(b.context)) existing.contexts.push(b.context);
			} else map.set(b.fromId, {
				fromId: b.fromId,
				fromPath: b.fromPath,
				fromTitle: b.fromTitle,
				contexts: b.context ? [b.context] : [],
				count: 1
			});
		}
		return Array.from(map.values()).sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
	}, [backlinks]);
	const brokenLinks = (0, import_react.useMemo)(() => {
		if (!note || note.kind !== "note") return [];
		return getBrokenLinksForNote(note, nodes);
	}, [note, nodes]);
	const tags = (0, import_react.useMemo)(() => {
		if (!note || note.kind !== "note") return [];
		return extractTagsFromMarkdown(note.content ?? "");
	}, [note]);
	const outline = (0, import_react.useMemo)(() => {
		if (!note || note.kind !== "note") return [];
		return extractOutline(note.content ?? "");
	}, [note]);
	const handleTagClick = (tag) => {
		const hits = notesForTag(nodes, tag);
		if (hits[0]) setActiveNote(hits[0].id);
		setToast(`#${tag} · ${hits.length} note${hits.length === 1 ? "" : "s"}`);
		if (hits.length > 1) openCommandPalette(`#${tag}`);
	};
	const tabDefs = [
		[
			"backlinks",
			Link2,
			"Backlinks"
		],
		[
			"outline",
			ListTree,
			"Outline"
		],
		[
			"graph",
			Network,
			"Graph"
		],
		[
			"pulse",
			Activity,
			"Pulse"
		]
	];
	if (graphMode === "fullscreen") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-[var(--bg-deepest)]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GraphView, {
			mode: "fullscreen",
			className: "h-full"
		})
	});
	if (focusMode) return null;
	if (!rightOpen) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex w-11 shrink-0 flex-col items-center gap-1 border-l border-[var(--border)] bg-[var(--bg-primary)] py-3 sm:w-12",
		children: tabDefs.map(([id, Icon, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: "icon-btn",
			title: label,
			"aria-label": label,
			onClick: () => {
				setTab(id);
				setRightOpen(true);
			},
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { size: 16 })
		}, id))
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: "fixed inset-0 z-20 bg-black/50 lg:hidden",
		"aria-label": "Close panel",
		onClick: () => setRightOpen(false)
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "panel-slide glass-panel absolute inset-y-0 right-0 z-30 flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[rgba(15,15,18,0.94)] lg:relative lg:z-0 lg:bg-[rgba(15,15,18,0.78)]",
		style: { width: rightWidth },
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				role: "separator",
				"aria-orientation": "vertical",
				"aria-label": "Resize right panel",
				title: "Drag to resize · double-click to reset",
				className: "panel-resize-handle titlebar-no-drag panel-resize-handle--left",
				onPointerDown: (e) => {
					e.preventDefault();
					dragStartX.current = e.clientX;
					dragStartWidth.current = rightWidth;
					e.currentTarget.setPointerCapture(e.pointerId);
				},
				onPointerMove: (e) => {
					if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
					setRightWidth(dragStartWidth.current - (e.clientX - dragStartX.current));
				},
				onPointerUp: (e) => {
					if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
				},
				onDoubleClick: () => setRightWidth(DEFAULT_RIGHT_WIDTH)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-1 border-b border-[var(--border)] p-2",
				children: [tabDefs.map(([id, Icon, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: cn("chip-btn flex-1 justify-center", tab === id && "is-active"),
					onClick: () => setTab(id),
					title: label,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { size: 13 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "hidden xl:inline",
						children: label
					})]
				}, id)), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "icon-btn ml-1 h-7 w-7",
					onClick: () => setRightOpen(false),
					title: "Collapse panel",
					children: "×"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-h-0 flex-1 overflow-y-auto",
				children: [
					tab === "backlinks" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-5 p-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
								children: "Linked mentions"
							}), groupedBacklinks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
								compact: true,
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { size: 18 }),
								title: "No backlinks yet",
								description: "Other notes that [[mention this]] will appear here."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "flex flex-col gap-1",
								children: groupedBacklinks.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "tree-row w-full rounded-[10px] px-2.5 py-2 text-left hover:bg-white/[0.05]",
									onClick: () => setActiveNote(b.fromId),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-center gap-1.5",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]",
											children: b.fromTitle || noteTitle({
												name: b.fromPath,
												kind: "note"
											})
										}), b.count > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "shrink-0 rounded-full bg-[var(--accent-dim)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]",
											title: `${b.count} mentions`,
											children: ["×", b.count]
										}) : null]
									}), b.contexts.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-0.5 flex flex-col gap-0.5",
										children: [b.contexts.slice(0, 3).map((ctx, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "line-clamp-2 text-[11.5px] text-[var(--text-muted)]",
											children: ctx
										}, i)), b.contexts.length > 3 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "text-[10px] text-[var(--text-muted)]",
											children: [
												"+",
												b.contexts.length - 3,
												" more"
											]
										}) : null]
									}) : null]
								}) }, b.fromId))
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Unlink, {
										size: 11,
										className: "opacity-70"
									}),
									"Broken links",
									brokenLinks.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "ml-auto rounded-full bg-[rgba(255,69,58,0.15)] px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[var(--danger)]",
										children: brokenLinks.length
									}) : null
								]
							}), brokenLinks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "px-1 text-[11.5px] text-[var(--text-muted)]",
								children: "All [[wikilinks]] resolve."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
								className: "flex flex-col gap-1",
								children: brokenLinks.map((bl) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "tree-row flex w-full items-start gap-1 rounded-[10px] px-2.5 py-2 hover:bg-white/[0.04]",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0 flex-1 text-left",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "truncate text-[13px] font-medium text-[var(--warning)]",
											children: [
												"[[",
												bl.target,
												"]]"
											]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-0.5 line-clamp-2 text-[11.5px] text-[var(--text-muted)]",
											children: bl.context
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "icon-btn mt-0.5 h-6 w-6 shrink-0",
										title: `Create note “${bl.target}”`,
										onClick: () => {
											createNote(null, bl.target);
											setToast(`Created “${bl.target}”`);
										},
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { size: 12 })
									})]
								}) }, bl.target))
							})] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Hash, {
									size: 11,
									className: "opacity-70"
								}), "Tags"]
							}), tags.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "px-1 text-[11.5px] text-[var(--text-muted)]",
								children: "No #tags in this note."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex flex-wrap gap-1.5",
								children: tags.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "chip-btn",
									onClick: () => handleTagClick(tag),
									title: `Notes tagged #${tag}`,
									children: ["#", tag]
								}, tag))
							})] })
						]
					}) : null,
					tab === "outline" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "p-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
							children: "Outline"
						}), outline.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyState, {
							compact: true,
							title: "No headings",
							description: "Use # headings to structure the note."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "flex flex-col gap-0.5",
							children: outline.map((h, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "tree-row w-full truncate rounded-md px-2 py-1.5 text-left text-[12.5px] text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
								style: { paddingLeft: 8 + (h.level - 1) * 12 },
								onClick: () => jumpToOutlineHeading(h.text, h.level),
								title: `Jump to “${h.text}”`,
								children: h.text
							}) }, i))
						})]
					}) : null,
					tab === "graph" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex h-[min(420px,50vh)] min-h-[280px] flex-col",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GraphView, {
							mode: "panel",
							className: "h-full min-h-[280px]"
						})
					}) : null,
					tab === "pulse" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PulseRail, {}) : null
				]
			})
		]
	})] });
}
function WelcomeScreen() {
	const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
	const createNewVault = useVaultStore((s) => s.createNewVault);
	const openDemoVault = useVaultStore((s) => s.openDemoVault);
	const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
	const connecting = useVaultStore((s) => s.connecting);
	const recentVaults = useVaultStore((s) => s.recentVaults);
	const folderAccessLost = useVaultStore((s) => s.folderAccessLost);
	const [createName, setCreateName] = (0, import_react.useState)("Nexus Vault");
	const [showCreate, setShowCreate] = (0, import_react.useState)(false);
	const topRecent = recentVaults[0] ?? null;
	const hasRecents = recentVaults.length > 0;
	const openTopRecent = () => {
		if (!topRecent) return;
		if (topRecent.mode === "demo") openDemoVault();
		else reopenRecentVault(topRecent.id);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative flex h-full min-h-0 flex-col overflow-auto bg-[var(--bg-deepest)]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute inset-0 opacity-[0.4]",
				style: { backgroundImage: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,200,255,0.14), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 80%, rgba(123,97,255,0.09), transparent 50%)" }
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute inset-0 opacity-[0.035]",
				style: {
					backgroundImage: "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
					backgroundSize: "48px 48px"
				}
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative z-10 mx-auto flex w-full max-w-2xl flex-col px-6 py-12 sm:py-16",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusMark, {
							size: 40,
							className: "text-[var(--text-primary)]"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusWordmark, {
							size: "lg",
							showMark: false
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[12.5px] text-[var(--accent)]",
							children: NEXUS_TAGLINE
						})] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-8 text-[28px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-[32px]",
						children: "Your notes. Your folder."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-4 max-w-lg text-[15px] leading-relaxed text-[var(--text-secondary)]",
						children: [
							"Local-first. Zero accounts. Real",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[var(--text-primary)]",
								children: ".md"
							}),
							" files you own. Visual editor, live graph, progressive power."
						]
					}),
					folderAccessLost ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-6 flex flex-wrap items-center gap-3 rounded-[14px] border border-[rgba(255,159,10,0.35)] bg-[rgba(255,159,10,0.08)] px-4 py-3",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
								size: 16,
								className: "shrink-0 text-[var(--warning,#FF9F0A)]"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "min-w-0 flex-1 text-[13px] text-[var(--text-secondary)]",
								children: "Folder access lost — click to re-open"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "primary-btn min-h-9",
								disabled: connecting,
								onClick: () => void openFolderAsVault(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { size: 14 }), connecting ? "Opening…" : "Re-open folder"]
							})
						]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-8 flex flex-wrap gap-3",
						children: [
							hasRecents && topRecent ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "primary-btn min-h-11",
								disabled: connecting,
								onClick: openTopRecent,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, { size: 16 }), connecting ? "Opening…" : `Open ${topRecent.name}`]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "ghost-btn min-h-11",
								onClick: () => openDemoVault(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { size: 16 }), "Explore demo"]
							})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "primary-btn min-h-11",
								onClick: () => openDemoVault(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { size: 16 }), "Explore demo"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "ghost-btn min-h-11",
								disabled: connecting,
								onClick: () => void openFolderAsVault(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { size: 16 }), connecting ? "Opening…" : "Open folder…"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "ghost-btn min-h-11",
								disabled: connecting,
								onClick: () => setShowCreate(true),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderPlus, { size: 16 }), "New vault…"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-[12.5px] text-[var(--text-muted)]",
						children: isDesktopShell() ? "Desktop: native folder picker · real .md files on disk · zero accounts." : "Your vault is a normal folder. No proprietary database. No sign-in."
					}),
					showCreate ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "glass-panel mt-6 rounded-[16px] p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[13px] font-semibold",
								children: "Create a new vault"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[12px] text-[var(--text-muted)]",
								children: "Name the vault, then choose the parent folder. Nexus creates the folder and a Welcome note."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 flex flex-wrap items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: createName,
										onChange: (e) => setCreateName(e.target.value),
										className: "min-w-[180px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] outline-none focus:ring-1 focus:ring-[var(--accent)]",
										placeholder: "Nexus Vault"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "primary-btn",
										disabled: connecting,
										onClick: () => {
											createNewVault(createName.trim() || "Nexus Vault");
											setShowCreate(false);
										},
										children: "Create…"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "ghost-btn",
										onClick: () => setShowCreate(false),
										children: "Cancel"
									})
								]
							})
						]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-10 grid gap-3 sm:grid-cols-3",
						children: [
							{
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, { size: 16 }),
								title: "Local-first",
								body: "Pick any folder. Notes stay on disk as clean Markdown."
							},
							{
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, { size: 16 }),
								title: "Spatial graph",
								body: "Force-directed map of [[wikilinks]] with glow and physics."
							},
							{
								icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, { size: 16 }),
								title: "Live on disk",
								body: "Edits from other apps appear within about a second."
							}
						].map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "glass-panel rounded-[14px] p-4 transition-[transform,border-color] duration-200 hover:scale-[1.015] hover:border-[rgba(0,200,255,0.22)]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mb-2 text-[var(--accent)]",
									children: f.icon
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "text-[13.5px] font-semibold tracking-tight",
									children: f.title
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-[12.5px] leading-snug text-[var(--text-muted)]",
									children: f.body
								})
							]
						}, f.title))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "glass-panel mt-8 rounded-[16px] p-5",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(123,97,255,0.12)] text-[var(--accent-violet)]",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cloud, { size: 16 })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-[14px] font-semibold",
										children: "Want cloud sync?"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]",
										children: CLOUD_SYNC_HINT
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "chip-btn is-active mt-3",
										onClick: () => void openFolderAsVault(),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { size: 13 }), "Open a synced folder…"]
									})
								]
							})]
						})
					}),
					recentVaults.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-8",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]",
							children: "Recent"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-col gap-1.5",
							children: recentVaults.slice(0, 5).map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-[rgba(0,200,255,0.25)] hover:bg-[rgba(0,200,255,0.05)]",
								onClick: () => {
									if (r.mode === "demo") openDemoVault();
									else reopenRecentVault(r.id);
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, {
									size: 14,
									className: "text-[var(--accent)]"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "truncate text-[13px] font-medium",
										children: r.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "truncate text-[11px] text-[var(--text-muted)]",
										children: r.path
									})]
								})]
							}, r.id))
						})]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-10 text-center text-[11.5px] tracking-wide text-[var(--text-muted)]",
						children: [
							NEXUS_NAME,
							" · ",
							NEXUS_TAGLINE
						]
					})
				]
			})
		]
	});
}
function SettingsPanel() {
	const open = usePrefsStore((s) => s.settingsOpen);
	const setOpen = usePrefsStore((s) => s.setSettingsOpen);
	const prefs = usePrefsStore();
	const updatePrefs = usePrefsStore((s) => s.updatePrefs);
	const resetPrefs = usePrefsStore((s) => s.resetPrefs);
	const vaultName = useVaultStore((s) => s.vaultName);
	const vaultPath = useVaultStore((s) => s.vaultPath);
	const mode = useVaultStore((s) => s.mode);
	const vaultId = useVaultStore((s) => s.vaultId);
	const noteCount = useVaultStore((s) => Object.values(s.nodes).filter((n) => n.kind === "note").length);
	const [customDraft, setCustomDraft] = (0, import_react.useState)(prefs.accentCustom);
	const titleId = (0, import_react.useId)();
	const dialogRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (open) setCustomDraft(prefs.accentCustom);
	}, [open, prefs.accentCustom]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const root = dialogRef.current;
		const prev = document.activeElement;
		if (root) {
			if (!root.hasAttribute("tabindex")) root.tabIndex = -1;
			root.focus({ preventScroll: true });
		}
		const onKey = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				setOpen(false);
				return;
			}
			if (e.key !== "Tab" || !root) return;
			const focusable = root.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])");
			const list = Array.from(focusable).filter((el) => el.offsetParent !== null || el === root);
			if (list.length === 0) {
				e.preventDefault();
				root.focus();
				return;
			}
			const first = list[0];
			const last = list[list.length - 1];
			const active = document.activeElement;
			if (e.shiftKey) {
				if (!active || active === first || !root.contains(active)) {
					e.preventDefault();
					last.focus();
				}
			} else if (!active || active === last || !root.contains(active)) {
				e.preventDefault();
				first.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
			prev?.focus?.({ preventScroll: true });
		};
	}, [open, setOpen]);
	if (!open) return null;
	const activeHex = resolveAccentHex(prefs);
	const setAccent = (preset, custom) => {
		if (preset === "custom" && custom) updatePrefs({
			accentPreset: "custom",
			accentCustom: custom
		});
		else updatePrefs({ accentPreset: preset });
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: "absolute inset-0 bg-black/55 backdrop-blur-[2px]",
			"aria-label": "Close settings",
			onClick: () => setOpen(false)
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			ref: dialogRef,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": titleId,
			tabIndex: -1,
			className: "glass-elevated relative z-10 flex max-h-[min(720px,90dvh)] w-full max-w-[440px] flex-col overflow-hidden rounded-[18px] border border-[var(--border)] shadow-[var(--shadow-elevated)] outline-none",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-white/[0.03] text-[var(--accent)]",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { size: 16 })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							id: titleId,
							className: "text-[15px] font-semibold tracking-tight",
							children: "Settings"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[12px] text-[var(--text-muted)]",
							children: "Preferences for this device"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "icon-btn",
						onClick: () => setOpen(false),
						"aria-label": "Close",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { size: 16 })
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
						title: "Appearance",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Accent color" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-2 flex flex-wrap gap-2",
								children: Object.keys(ACCENT_PRESETS).map((key) => {
									const p = ACCENT_PRESETS[key];
									const selected = prefs.accentPreset === key;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										title: p.label,
										onClick: () => setAccent(key),
										className: cn("flex h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] transition", selected ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text-primary)]" : "border-[var(--border)] bg-white/[0.02] text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.14)]"),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "h-3.5 w-3.5 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.12)]",
											style: { background: p.hex }
										}), p.label]
									}, key);
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 flex items-center gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => {
										const hex = isValidHex(customDraft) ? customDraft : activeHex;
										setAccent("custom", normalize(hex));
										setCustomDraft(normalize(hex));
									},
									className: cn("flex h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] transition", prefs.accentPreset === "custom" ? "border-[var(--accent)] bg-[var(--accent-dim)]" : "border-[var(--border)] bg-white/[0.02] text-[var(--text-secondary)]"),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "h-3.5 w-3.5 rounded-full",
										style: { background: isValidHex(customDraft) ? customDraft : activeHex }
									}), "Custom"]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: "h-9 min-w-0 flex-1 rounded-[10px] border border-[var(--border)] bg-white/[0.03] px-3 font-mono text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]",
									value: customDraft,
									placeholder: "#00C8FF",
									spellCheck: false,
									onChange: (e) => {
										const v = e.target.value;
										setCustomDraft(v);
										if (isValidHex(v)) updatePrefs({
											accentPreset: "custom",
											accentCustom: normalize(v)
										});
									},
									"aria-label": "Custom accent hex"
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								className: "mt-5",
								children: "Interface density"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Segmented, {
								className: "mt-2",
								value: prefs.density,
								options: [{
									value: "comfortable",
									label: "Comfortable"
								}, {
									value: "compact",
									label: "Compact"
								}],
								onChange: (v) => updatePrefs({ density: v })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
								className: "mt-4",
								label: "Graph particles",
								description: "Soft link particles on the graph",
								checked: prefs.graphParticles,
								onChange: (v) => updatePrefs({ graphParticles: v })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
								className: "mt-3",
								label: "Reduced motion",
								description: "Minimize animations and transitions",
								checked: prefs.reducedMotion,
								onChange: (v) => updatePrefs({ reducedMotion: v })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
								className: "mt-3",
								label: "Focus mode",
								description: "Hide side panels for distraction-free writing (⌘.)",
								checked: prefs.focusMode,
								onChange: (v) => {
									setFocusMode(v);
								}
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
						title: "Editor",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Default mode" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Segmented, {
								className: "mt-2",
								value: prefs.defaultEditorMode,
								options: [{
									value: "visual",
									label: "Visual"
								}, {
									value: "source",
									label: "Source"
								}],
								onChange: (v) => updatePrefs({ defaultEditorMode: v })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Label, {
								className: "mt-5",
								children: ["Font size", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "ml-2 font-normal text-[var(--text-muted)]",
									children: [prefs.editorFontSize, "px"]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "range",
								min: 13,
								max: 20,
								step: 1,
								value: prefs.editorFontSize,
								onChange: (e) => updatePrefs({ editorFontSize: Number(e.target.value) }),
								className: "mt-2 w-full accent-[var(--accent)]",
								"aria-label": "Editor font size"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
								className: "mt-4",
								label: "Spell check",
								description: "Browser spellcheck in Source mode",
								checked: prefs.spellCheck,
								onChange: (v) => updatePrefs({ spellCheck: v })
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
						title: "Graph",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, { children: "Default view" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Segmented, {
								className: "mt-2",
								value: prefs.defaultGraphView,
								options: [{
									value: "panel",
									label: "Panel"
								}, {
									value: "hidden",
									label: "Hidden"
								}],
								onChange: (v) => updatePrefs({ defaultGraphView: v })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
								className: "mt-5",
								children: "Physics intensity"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Segmented, {
								className: "mt-2",
								value: prefs.physicsIntensity,
								options: [
									{
										value: "calm",
										label: "Calm"
									},
									{
										value: "standard",
										label: "Standard"
									},
									{
										value: "energetic",
										label: "Energetic"
									}
								],
								onChange: (v) => updatePrefs({ physicsIntensity: v })
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
						title: "Vault & Files",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
								label: "Confirm before delete",
								description: "Ask before removing notes or folders",
								checked: prefs.confirmDelete,
								onChange: (v) => updatePrefs({ confirmDelete: v })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
								className: "mt-3",
								label: "Open last vault on launch",
								description: "Restore your previous local folder when possible",
								checked: prefs.openLastVault,
								onChange: (v) => updatePrefs({ openLastVault: v })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-start justify-between gap-3",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "text-[13px] font-medium text-[var(--text-primary)]",
											children: "Launch note"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]",
											children: "Which note to open when a vault mounts"
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										className: "shrink-0 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]",
										value: prefs.launchNoteMode ?? (prefs.openTodayOnLaunch ? "today" : "last"),
										onChange: (e) => updatePrefs({ launchNoteMode: e.target.value }),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "today",
												children: "Today's daily"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "last",
												children: "Last note"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "smart",
												children: "Smart (daily habit)"
											})
										]
									})]
								})
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Section, {
						title: "Keyboard",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "space-y-1.5",
							children: SHORTCUTS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-[13px]",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[var(--text-secondary)]",
									children: s.action
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
									className: "shrink-0 rounded-md border border-[var(--border)] bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-[var(--text-primary)]",
									children: s.keys
								})]
							}, s.keys))
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
						title: "Help",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "space-y-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelpItem, {
									title: "Vaults",
									body: "A vault is a normal folder of Markdown files. Open… picks an existing folder. New Vault… creates one with a Welcome note."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelpItem, {
									title: "Editing",
									body: "Visual is the rich editor. Source shows clean Markdown. They stay in sync. Type [[ to link notes or folders."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelpItem, {
									title: "Daily notes & templates",
									body: "⌘D opens today's Journal page. Create Meeting, Idea, or Project notes from the command palette or file tree context menu."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelpItem, {
									title: "Graph",
									body: "The graph maps [[wikilinks]] and gently clusters notes that share a folder. Click a node to open it."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelpItem, {
									title: "Cloud",
									body: "Nexus does not host accounts. Use Dropbox / Drive / OneDrive desktop sync, then Open… that local folder."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelpItem, {
									title: "Hermes & agents",
									body: "External apps can edit .md files on disk. Changes appear live. Keep Markdown clean — no proprietary formats."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HelpItem, {
									title: "Desktop",
									body: "On Mac, Show in Finder reveals the vault folder. Open Settings anytime with ⌘,."
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-[11.5px] text-[var(--text-muted)]",
							children: "Everyday reference — deeper guides can grow as the product matures."
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, {
						title: "About",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start gap-3 rounded-[14px] border border-[var(--border)] bg-white/[0.02] p-3.5",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusMark, {
								size: 36,
								className: "text-[var(--text-primary)]"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusWordmark, {
										size: "md",
										showMark: false
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "text-[12.5px] text-[var(--accent)]",
										children: NEXUS_TAGLINE
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1.5 text-[12.5px] leading-snug text-[var(--text-secondary)]",
										children: "Local-first Markdown notes for humans and agents."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-1 text-[12px] text-[var(--text-muted)]",
										children: ["Version ", NEXUS_VERSION]
									})
								]
							})]
						}), vaultId ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-3 space-y-1 text-[12.5px] text-[var(--text-secondary)]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[var(--text-muted)]",
									children: "Vault · "
								}), vaultName || "Untitled"] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "truncate font-mono text-[11px] text-[var(--text-muted)]",
									children: vaultPath || mode
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[var(--text-muted)]",
									children: "Notes · "
								}), noteCount] })
							]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-[12.5px] text-[var(--text-muted)]",
							children: "No vault open"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "ghost-btn w-full justify-center text-[12.5px]",
						onClick: () => {
							resetPrefs();
							setCustomDraft(DEFAULT_CUSTOM);
						},
						children: "Reset to defaults"
					})
				]
			})]
		})]
	});
}
var DEFAULT_CUSTOM = "#00C8FF";
function normalize(hex) {
	const h = hex.trim();
	return h.startsWith("#") ? h.toUpperCase() : `#${h.toUpperCase()}`;
}
function HelpItem({ title, body }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-[12px] border border-[var(--border)] bg-white/[0.02] px-3 py-2.5",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-[12.5px] font-semibold text-[var(--text-primary)]",
			children: title
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-1 text-[12px] leading-snug text-[var(--text-muted)]",
			children: body
		})]
	});
}
function Section({ title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
		className: "mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]",
		children: title
	}), children] });
}
function Label({ children, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("text-[12.5px] font-medium text-[var(--text-secondary)]", className),
		children
	});
}
function Segmented({ value, options, onChange, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("flex rounded-[10px] border border-[var(--border)] bg-white/[0.02] p-0.5", className),
		children: options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => onChange(o.value),
			className: cn("min-h-8 flex-1 rounded-[8px] px-2 text-[12.5px] font-medium transition", value === o.value ? "bg-[var(--accent-dim)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"),
			children: o.label
		}, o.value))
	});
}
function ToggleRow({ label, description, checked, onChange, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: cn("flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-transparent px-0.5 py-1", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[13px] font-medium text-[var(--text-primary)]",
				children: label
			}), description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[12px] text-[var(--text-muted)]",
				children: description
			}) : null]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			role: "switch",
			"aria-checked": checked,
			onClick: () => onChange(!checked),
			className: cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200", checked ? "bg-[var(--accent)]" : "bg-white/[0.12]"),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200", checked && "translate-x-5") })
		})]
	});
}
/**
* Live vault watching — Hermes-ready.
* Prefers FileSystemObserver when available; falls back to ~800ms signature poll.
* Uses incremental rescans to avoid full vault re-reads.
*/
var VaultWatcher = class {
	timer = null;
	lastHash = "";
	lastScan = null;
	lastSigs = {};
	cb = null;
	dir = null;
	scanning = false;
	observer = null;
	suppressUntil = 0;
	/** Memory-mode watch (demo / local) */
	start(getHash, cb, intervalMs = 900) {
		this.stop();
		this.cb = cb;
		this.dir = null;
		this.lastHash = getHash();
		this.timer = setInterval(() => {
			const h = getHash();
			if (h !== this.lastHash) {
				this.lastHash = h;
				this.cb?.({
					type: "change",
					path: "*"
				});
			}
		}, intervalMs);
	}
	/** Real filesystem watch via FSA */
	async startFsa(dir, cb, intervalMs = 900) {
		this.stop();
		this.cb = cb;
		this.dir = dir;
		try {
			const full = await scanVault(dir);
			this.lastScan = full;
			this.lastSigs = full.signatures;
		} catch {
			this.lastSigs = {};
			this.lastScan = null;
		}
		const Obs = window.FileSystemObserver;
		if (typeof Obs === "function") try {
			const observer = new Obs(() => {
				this.pollFsa(true);
			});
			await observer.observe(dir);
			this.observer = observer;
		} catch {
			this.observer = null;
		}
		this.timer = setInterval(() => {
			this.pollFsa(false);
		}, intervalMs);
	}
	async pollFsa(force) {
		if (!this.dir || this.scanning) return;
		if (Date.now() < this.suppressUntil) return;
		this.scanning = true;
		try {
			const next = await scanSignatures(this.dir);
			if (!force && !signaturesChanged(this.lastSigs, next)) return;
			if (this.lastScan) {
				const { scan, changedPaths } = await incrementalRescan(this.dir, this.lastScan);
				this.lastScan = scan;
				this.lastSigs = scan.signatures;
				this.cb?.({
					type: "change",
					path: "*",
					scan,
					changedPaths
				});
			} else {
				const scan = await scanVault(this.dir);
				this.lastScan = scan;
				this.lastSigs = scan.signatures;
				this.cb?.({
					type: "change",
					path: "*",
					scan
				});
			}
		} catch {} finally {
			this.scanning = false;
		}
	}
	/** After app writes, suppress echo + refresh baseline */
	async acknowledgeWrite(dir) {
		this.suppressUntil = Date.now() + 1500;
		try {
			this.lastSigs = await scanSignatures(dir);
		} catch {}
	}
	stop() {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.dir = null;
		try {
			this.observer?.disconnect();
		} catch {}
		this.observer = null;
	}
};
function vaultContentHash(nodes) {
	return Object.values(nodes).map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`).sort().join("|");
}
/**
* Listen for native Tauri menu events and map them to store actions.
*/
async function bindDesktopMenu(handlers) {
	if (!await confirmDesktopShell()) return () => {};
	try {
		const { listen } = await import("../_libs/tauri-apps__api.mjs").then((n) => n.n);
		const un = await listen("nexus-menu", (ev) => {
			switch (String(ev.payload ?? "")) {
				case "open_vault":
					handlers.openVault();
					break;
				case "close_vault":
					handlers.closeVault();
					break;
				case "settings":
					handlers.settings();
					break;
				case "search":
					handlers.search();
					break;
				case "new_note":
					handlers.newNote();
					break;
				case "toggle_graph":
					handlers.toggleGraph();
					break;
				case "toggle_source": handlers.toggleSource();
			}
		});
		return () => {
			un();
		};
	} catch (err) {
		console.warn("[nexus] menu bridge failed", err);
		return () => {};
	}
}
/**
* Persist main window size across sessions (Wave S7).
* Desktop / Tauri only — no-op in the browser shell.
*/
var WINDOW_KEY = "nexus-window-v1";
function loadSaved() {
	try {
		const raw = localStorage.getItem(WINDOW_KEY);
		if (!raw) return null;
		const v = JSON.parse(raw);
		if (typeof v.width === "number" && typeof v.height === "number" && v.width >= 600 && v.height >= 400) return v;
	} catch {}
	return null;
}
function saveSize(width, height) {
	try {
		localStorage.setItem(WINDOW_KEY, JSON.stringify({
			width: Math.round(width),
			height: Math.round(height)
		}));
	} catch {}
}
/**
* Restore last size and save on resize / close.
* Returns an unlisten cleanup.
*/
async function bindWindowState() {
	if (!await confirmDesktopShell()) return () => {};
	try {
		const { getCurrentWindow, LogicalSize } = await import("../_libs/tauri-apps__api.mjs").then((n) => n.t);
		const win = getCurrentWindow();
		const saved = loadSaved();
		if (saved) try {
			await win.setSize(new LogicalSize(saved.width, saved.height));
		} catch {}
		let timer = null;
		const scheduleSave = (w, h) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => saveSize(w, h), 250);
		};
		const unResize = await win.onResized(async () => {
			try {
				const factor = await win.scaleFactor();
				const physical = await win.innerSize();
				scheduleSave(physical.width / factor, physical.height / factor);
			} catch {}
		});
		const unClose = await win.onCloseRequested(async () => {
			try {
				const factor = await win.scaleFactor();
				const physical = await win.innerSize();
				saveSize(physical.width / factor, physical.height / factor);
			} catch {}
		});
		return () => {
			if (timer) clearTimeout(timer);
			unResize();
			unClose();
		};
	} catch (err) {
		console.warn("[nexus] window state bind failed", err);
		return () => {};
	}
}
function AppShell() {
	const bootstrap = useVaultStore((s) => s.bootstrap);
	const ready = useVaultStore((s) => s.ready);
	const vaultId = useVaultStore((s) => s.vaultId);
	const mode = useVaultStore((s) => s.mode);
	const graphMode = useVaultStore((s) => s.settings.graphMode);
	const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
	const setRightOpen = useVaultStore((s) => s.setRightOpen);
	const applyExternalSnapshot = useVaultStore((s) => s.applyExternalSnapshot);
	const watcherRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		applyPrefsToDom(getPrefs());
		bootstrap();
	}, [bootstrap]);
	(0, import_react.useEffect)(() => {
		let un;
		bindWindowState().then((fn) => {
			un = fn;
		});
		return () => un?.();
	}, []);
	(0, import_react.useEffect)(() => {
		let un;
		bindDesktopMenu({
			openVault: () => void useVaultStore.getState().openFolderAsVault(),
			closeVault: () => useVaultStore.getState().closeVault(),
			settings: () => usePrefsStore.getState().setSettingsOpen(true),
			search: () => useVaultStore.getState().setCommandOpen(true),
			newNote: () => {
				useVaultStore.getState().createNote(null, "Untitled");
			},
			toggleGraph: () => useVaultStore.getState().toggleGraphFullscreen(),
			toggleSource: () => useVaultStore.getState().toggleEditorMode()
		}).then((fn) => {
			un = fn;
		});
		return () => un?.();
	}, []);
	(0, import_react.useEffect)(() => {
		if (!vaultId) return;
		if (window.innerWidth < 900) {
			setLeftOpen(false);
			setRightOpen(false);
		}
	}, [vaultId]);
	(0, import_react.useEffect)(() => {
		const watcher = new VaultWatcher();
		watcherRef.current = watcher;
		let desktopStop = null;
		if (mode === "fsa" && getFsaRoot()) {
			const dir = getFsaRoot();
			setWatcherAck((d) => watcher.acknowledgeWrite(d));
			setDesktopWatchAck(null);
			watcher.startFsa(dir, (ev) => {
				if (ev.scan) applyExternalSnapshot(ev.scan.nodes, ev.scan.rootIds);
			});
		} else if (mode === "desktop" && getDesktopRoot()) {
			const root = getDesktopRoot();
			setWatcherAck(null);
			const handle = startDesktopWatch(root, (scan) => {
				applyExternalSnapshot(scan.nodes, scan.rootIds);
			});
			setDesktopWatchAck(() => handle.acknowledge());
			desktopStop = handle.stop;
		} else if (vaultId) {
			setWatcherAck(null);
			setDesktopWatchAck(null);
			watcher.start(() => vaultContentHash(useVaultStore.getState().nodes), () => {}, 1e3);
		}
		return () => {
			setWatcherAck(null);
			setDesktopWatchAck(null);
			desktopStop?.();
			watcher.stop();
			watcherRef.current = null;
		};
	}, [
		vaultId,
		mode,
		applyExternalSnapshot
	]);
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-full items-center justify-center bg-[var(--bg-deepest)]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "text-center",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] shadow-[0_0_28px_rgba(0,200,255,0.15)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusMark, {
					size: 28,
					className: "text-[var(--text-primary)]"
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-[14px] text-[var(--text-secondary)]",
				children: [
					"Starting ",
					NEXUS_NAME,
					"…"
				]
			})]
		})
	});
	if (!vaultId) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col overflow-hidden bg-[var(--bg-deepest)]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TitleBar, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "min-h-0 flex-1",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WelcomeScreen, {})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toast, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsPanel, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeleteConfirmHost, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyboardShortcuts, {})
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full flex-col overflow-hidden bg-[var(--bg-deepest)] text-[var(--text-primary)]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TitleBar, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
				children: [
					graphMode !== "fullscreen" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LeftSidebar, {}) : null,
					graphMode !== "fullscreen" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditorPane, {}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RightPanel, {})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CommandPalette, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyboardShortcuts, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsPanel, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeleteConfirmHost, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toast, {})
		]
	});
}
/** Render children only after mount — avoids SSR issues with TipTap / force-graph / localStorage. */
function ClientOnly({ children, fallback = null }) {
	const [mounted, setMounted] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => setMounted(true), []);
	if (!mounted) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: fallback });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "h-[calc(100dvh-var(--grok-banner-h,0px))] min-h-0 overflow-hidden",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClientOnly, {
			fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-deepest,#050507)] text-[var(--text-secondary,#a1a1aa)]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusMark, {
					size: 32,
					className: "text-[#f2f2f7]"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-[14px]",
					children: [
						"Loading ",
						NEXUS_NAME,
						"…"
					]
				})]
			}),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {})
		})
	});
}
//#endregion
export { Home as component };
