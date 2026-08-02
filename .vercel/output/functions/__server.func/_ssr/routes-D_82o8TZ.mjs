import { r as __toESM } from "../_runtime.mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { a as cn, i as NexusWordmark, n as NEXUS_TAGLINE, o as formatRelativeTime, r as NexusMark, s as slugifyTitle, t as NEXUS_NAME } from "./NexusLogo-DEtBYVdt.mjs";
import { r as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { A as Heading1, B as CodeXml, C as ListChecks, D as Image, E as Italic, F as FileText, H as ChevronRight, I as FilePlus, L as FilePlus2, M as Folder, N as FolderPlus, O as Heading3, P as FolderOpen, R as Eye, S as ListOrdered, T as Keyboard, U as ChevronDown, V as Cloud, W as Bold, _ as Minimize2, a as Sparkles, b as List, c as Radio, d as Pencil, f as PanelRightOpen, g as Minus, h as Network, i as Table, j as HardDrive, k as Heading2, l as Quote, m as PanelLeftClose, o as Settings, p as PanelRightClose, r as Trash2, s as Search, t as X, u as Plus, v as Maximize2, w as Link2, x as ListTree, y as LogOut, z as Ellipsis } from "../_libs/lucide-react.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
import { t as marked } from "../_libs/marked.mjs";
import { t as TurndownService } from "../_libs/turndown.mjs";
import { O as mergeAttributes, R as Plugin, a as Mark, i as InputRule, z as PluginKey } from "../_libs/@tiptap/core+[...].mjs";
import { n as useEditor, t as EditorContent } from "../_libs/fast-equals+tiptap__react.mjs";
import { n as index_default } from "../_libs/@tiptap/extension-link+[...].mjs";
import { t as index_default$1 } from "../_libs/@tiptap/extension-placeholder+[...].mjs";
import { t as index_default$2 } from "../_libs/tiptap__starter-kit.mjs";
import { t as index_default$3 } from "../_libs/tiptap__extension-task-list.mjs";
import { t as index_default$4 } from "../_libs/tiptap__extension-task-item.mjs";
import { t as index_default$5 } from "../_libs/tiptap__extension-image.mjs";
import { i as TableRow, n as TableCell, r as TableHeader, t as Table$1 } from "../_libs/@tiptap/extension-table+[...].mjs";
import "../_libs/tiptap__extension-table-row.mjs";
import "../_libs/tiptap__extension-table-cell.mjs";
import "../_libs/tiptap__extension-table-header.mjs";
import { a as CanvasTexture, c as Group, d as MeshBasicMaterial, f as MeshPhysicalMaterial, g as SphereGeometry, h as Scene, i as BufferAttribute, l as HemisphereLight, m as SRGBColorSpace, n as PMREMGenerator, o as Color, p as PlaneGeometry, r as AmbientLight, s as DirectionalLight, t as _3dForceGraph, u as Mesh, y as TorusGeometry } from "../_libs/3d-force-graph+[...].mjs";
import { t as _default } from "../_libs/three-spritetext.mjs";
import { t as _e } from "../_libs/cmdk.mjs";
import { t as entry_default } from "../_libs/fuse.js.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-D_82o8TZ.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
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
*/
function markdownFingerprint(s) {
	return normalizeMarkdown(s).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().toLowerCase();
}
/**
* Prefer previous on-disk markdown when next is only a formatter rewrite.
* Returns previous if fingerprints match; otherwise normalized next.
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
/**
* Clean Markdown serialization helpers.
* On-disk format: CommonMark + GFM + [[wikilinks]] — never proprietary HTML.
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
	filter: (node) => node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem",
	replacement: (content, node) => {
		const checked = node.getAttribute("data-checked") === "true";
		const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").trim();
		return `- [${checked ? "x" : " "}] ${body}\n`;
	}
});
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
function registerVisualFlush(fn) {
	visualFlush = fn;
}
function registerSourceFlush(fn) {
	sourceFlush = fn;
}
/** Flush active editors — must run before mode or note switches */
function flushActiveEditors() {
	try {
		visualFlush?.();
	} catch {}
	try {
		sourceFlush?.();
	} catch {}
}
var IDB_NAME = "noteapp-vault-handles-v2";
var IDB_STORE = "handles";
var HANDLE_KEY = "current";
var RECENTS_KEY = "recents";
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
		const getReq = tx.objectStore(IDB_STORE).get(RECENTS_KEY);
		getReq.onsuccess = () => {
			const map = getReq.result || {};
			map[meta.id] = {
				handle,
				meta
			};
			tx.objectStore(IDB_STORE).put(map, RECENTS_KEY);
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
			const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(RECENTS_KEY);
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
function nodeId(path) {
	return "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_");
}
var SKIP_DIRS = /* @__PURE__ */ new Set([
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
				if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
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
		const id = nodeId(path);
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
	openLastVault: true
};
var NEXUS_VERSION = "1.0.0";
var SHORTCUTS = [
	{
		keys: "⌘ K",
		action: "Search / command palette"
	},
	{
		keys: "⌘ ,",
		action: "Open Settings"
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
		keys: "Esc",
		action: "Close overlay / exit graph"
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
	root.style.setProperty("--color-accent", hex.toLowerCase());
}
var usePrefsStore = create()(persist((set, get) => ({
	...DEFAULT_PREFS,
	settingsOpen: false,
	setSettingsOpen: (open) => set({ settingsOpen: open }),
	toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),
	updatePrefs: (patch) => {
		set(patch);
		applyPrefsToDom({
			...get(),
			...patch
		});
	},
	resetPrefs: () => {
		set({ ...DEFAULT_PREFS });
		applyPrefsToDom(DEFAULT_PREFS);
	}
}), {
	name: "nexus-prefs-v1",
	partialize: (s) => ({
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
		openLastVault: s.openLastVault
	}),
	onRehydrateStorage: () => (state) => {
		if (state) applyPrefsToDom(state);
	}
}));
/** Snapshot helpers for non-React code */
function getPrefs() {
	const s = usePrefsStore.getState();
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
		openLastVault: s.openLastVault
	};
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
var STORAGE_KEY = "noteapp-vault-v2";
var RECENT_KEY = "noteapp-recent-v2";
var fsaRoot = null;
var writeQueue = Promise.resolve();
var watcherAck = null;
var lastExternalToastAt = 0;
function getFsaRoot() {
	return fsaRoot;
}
function setWatcherAck(fn) {
	watcherAck = fn;
}
function loadRecents() {
	try {
		const raw = localStorage.getItem(RECENT_KEY);
		if (!raw) return [];
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
function stableId(path) {
	return "n_" + path.replace(/[^a-zA-Z0-9]+/g, "_");
}
function queueDiskWrite(fn) {
	writeQueue = writeQueue.then(fn).catch((err) => {
		console.error("[vault] disk write failed", err);
	});
	return writeQueue;
}
async function persistNoteIfFsa(path, content) {
	if (!fsaRoot) return;
	await writeNoteFile(fsaRoot, path, content);
	if (watcherAck) await watcherAck(fsaRoot);
}
function pushRecent(entry) {
	const list = loadRecents().filter((r) => r.id !== entry.id);
	list.unshift(entry);
	saveRecents(list);
	return list;
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
	bootstrap: async () => {
		const recents = loadRecents();
		const fsaSupported = isFileSystemAccessSupported();
		set({
			recentVaults: recents,
			fsaSupported,
			cloudSession: loadCloudSession(),
			ready: true
		});
		if (fsaSupported && getPrefs().openLastVault) {
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
							expandedFolders: Object.values(scan.nodes).filter((n) => n.kind === "folder").map((n) => n.id),
							recentVaults: recents2,
							connecting: false,
							dirtyNoteIds: []
						});
						return;
					} catch {
						fsaRoot = null;
						set({ connecting: false });
					}
				}
			}
		}
		const state = get();
		if (state.vaultId && state.mode !== "fsa" && Object.keys(state.nodes).length > 0) return;
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
				graphMode: getPrefs().defaultGraphView,
				rightOpen: getPrefs().defaultGraphView === "panel"
			}
		});
	},
	openLocalVault: (name, seed) => {
		fsaRoot = null;
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
			expandedFolders: Object.values(data.nodes).filter((n) => n.kind === "folder").map((n) => n.id),
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
	},
	openFolderAsVault: async () => {
		set({ connecting: true });
		try {
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
				expandedFolders: Object.values(scan.nodes).filter((n) => n.kind === "folder").map((n) => n.id),
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
		} catch (e) {
			set({
				connecting: false,
				toast: e instanceof Error ? e.message : "Failed to open folder"
			});
		}
	},
	reopenRecentVault: async (id) => {
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
				expandedFolders: Object.values(scan.nodes).filter((n) => n.kind === "folder").map((n) => n.id),
				dirtyNoteIds: [],
				recentVaults: recents,
				connecting: false,
				toast: `Reopened vault: ${handle.name}`
			});
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
			settings: {
				...get().settings,
				graphMode: "panel",
				editorMode: "visual"
			}
		});
	},
	setActiveNote: (id) => {
		flushActiveEditors();
		if (id === get().activeNoteId) return;
		const note = id ? get().nodes[id] : null;
		set({
			activeNoteId: id,
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
		const node = get().nodes[id];
		if (!node || node.kind !== "note") return;
		const prev = node.content ?? "";
		const next = opts?.external ? content : preferCleanWrite(prev, content);
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
		if (!opts?.external && get().mode === "fsa") queueDiskWrite(() => persistNoteIfFsa(node.path, next));
	},
	renameNode: (id, newName) => {
		const node = get().nodes[id];
		if (!node) return;
		let name = newName.trim();
		if (!name) return;
		if (node.kind === "note" && !name.endsWith(".md")) name += ".md";
		const parent = parentPath(node.path);
		const newPath = parent ? pathJoin(parent, name) : name;
		if (newPath === node.path && name === node.name) return;
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
		if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await renamePathOnDisk(root, oldPath, newPath, node.kind, node.kind === "note" ? nodes[id].content ?? "" : void 0);
				if (watcherAck) await watcherAck(root);
			});
		}
	},
	createNote: (parentId, title = "Untitled") => {
		const parent = parentId ? get().nodes[parentId] : null;
		const base = slugifyTitle(title) || "Untitled";
		let name = base.endsWith(".md") ? base : `${base}.md`;
		let path = parent ? pathJoin(parent.path, name) : name;
		let i = 1;
		const paths = new Set(Object.values(get().nodes).map((n) => n.path));
		while (paths.has(path)) {
			name = `${base.replace(/\.md$/i, "")} ${i}.md`;
			path = parent ? pathJoin(parent.path, name) : name;
			i++;
		}
		const id = get().mode === "fsa" ? "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_") : makeId(path);
		const content = `# ${title.replace(/\.md$/i, "")}\n\n`;
		const node = {
			id,
			path,
			name,
			kind: "note",
			parentId,
			mtime: Date.now(),
			content
		};
		const rootIds = parentId == null ? [...get().rootIds, id] : get().rootIds;
		const expanded = parentId ? get().expandedFolders.includes(parentId) ? get().expandedFolders : [...get().expandedFolders, parentId] : get().expandedFolders;
		set({
			nodes: {
				...get().nodes,
				[id]: node
			},
			rootIds,
			activeNoteId: id,
			expandedFolders: expanded,
			dirtyNoteIds: [...get().dirtyNoteIds, id]
		});
		if (get().mode === "fsa" && fsaRoot) queueDiskWrite(() => persistNoteIfFsa(path, content));
		return id;
	},
	createFolder: (parentId, name = "New Folder") => {
		const parent = parentId ? get().nodes[parentId] : null;
		let folderName = slugifyTitle(name) || "New Folder";
		let path = parent ? pathJoin(parent.path, folderName) : folderName;
		const paths = new Set(Object.values(get().nodes).map((n) => n.path));
		let i = 1;
		while (paths.has(path)) {
			folderName = `${name} ${i}`;
			path = parent ? pathJoin(parent.path, folderName) : folderName;
			i++;
		}
		const id = get().mode === "fsa" ? "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_") : stableId(path) + "_" + Math.random().toString(36).slice(2, 6);
		const node = {
			id,
			path,
			name: folderName,
			kind: "folder",
			parentId,
			mtime: Date.now()
		};
		const rootIds = parentId == null ? [...get().rootIds, id] : get().rootIds;
		set({
			nodes: {
				...get().nodes,
				[id]: node
			},
			rootIds,
			expandedFolders: [...get().expandedFolders, id]
		});
		if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await createFolderOnDisk(root, path);
				if (watcherAck) await watcherAck(root);
			});
		}
		return id;
	},
	deleteNode: (id) => {
		const nodes = { ...get().nodes };
		const target = nodes[id];
		if (!target) return;
		if (getPrefs().confirmDelete) {
			const label = target.kind === "note" ? noteTitle(target) : target.name;
			if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
		}
		const toDelete = /* @__PURE__ */ new Set();
		const walk = (nid) => {
			toDelete.add(nid);
			for (const n of Object.values(nodes)) if (n.parentId === nid) walk(n.id);
		};
		walk(id);
		for (const d of toDelete) delete nodes[d];
		set({
			nodes,
			rootIds: get().rootIds.filter((r) => !toDelete.has(r)),
			activeNoteId: toDelete.has(get().activeNoteId ?? "") ? null : get().activeNoteId,
			expandedFolders: get().expandedFolders.filter((x) => !toDelete.has(x))
		});
		if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await deletePathOnDisk(root, target.path, target.kind);
				if (watcherAck) await watcherAck(root);
			});
		}
	},
	moveNode: (id, newParentId) => {
		const node = get().nodes[id];
		if (!node || id === newParentId) return;
		if (newParentId) {
			let p = newParentId;
			while (p) {
				if (p === id) return;
				p = get().nodes[p]?.parentId ?? null;
			}
		}
		const parent = newParentId ? get().nodes[newParentId] : null;
		if (newParentId && parent?.kind !== "folder") return;
		const newPath = parent ? pathJoin(parent.path, node.name) : node.name;
		const oldPath = node.path;
		const nodes = { ...get().nodes };
		nodes[id] = {
			...node,
			parentId: newParentId,
			path: newPath,
			mtime: Date.now()
		};
		if (node.kind === "folder") {
			const oldPrefix = oldPath + "/";
			for (const n of Object.values(nodes)) if (n.path.startsWith(oldPrefix)) nodes[n.id] = {
				...n,
				path: newPath + n.path.slice(oldPath.length)
			};
		}
		let rootIds = get().rootIds.filter((r) => r !== id);
		if (newParentId == null) rootIds = [...rootIds, id];
		set({
			nodes,
			rootIds
		});
		if (get().mode === "fsa" && fsaRoot) {
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
			if (mode === "fsa" && fsaRoot) queueDiskWrite(() => persistNoteIfFsa(path, content));
			set({
				lastExternalSync: Date.now(),
				hermesTick: get().hermesTick + 1,
				toast: "Hermes updated Systems/Hermes Pulse.md",
				activeNoteId: existing.id
			});
			return;
		}
		const id = mode === "fsa" ? "fsa_" + path.replace(/[^a-zA-Z0-9._/-]+/g, "_") : stableId(path);
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
		if (mode === "fsa" && fsaRoot) queueDiskWrite(() => persistNoteIfFsa(path, content));
	},
	applyExternalSnapshot: (nodes, rootIds) => {
		const prev = get().nodes;
		if (Object.values(prev).filter((n) => n.kind === "note").map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`).sort().join("|") === Object.values(nodes).filter((n) => n.kind === "note").map((n) => `${n.path}:${n.mtime}:${(n.content ?? "").length}`).sort().join("|") && get().rootIds.join() === rootIds.join()) return;
		const active = get().activeNoteId;
		const activePath = active ? prev[active]?.path : null;
		let nextActive = active && nodes[active] ? active : null;
		if (!nextActive && activePath) nextActive = Object.values(nodes).find((n) => n.path === activePath)?.id ?? null;
		if (nextActive && prev[nextActive]?.content != null && nodes[nextActive] && get().dirtyNoteIds.includes(nextActive)) {
			const disk = nodes[nextActive];
			const local = prev[nextActive];
			nodes = {
				...nodes,
				[nextActive]: {
					...disk,
					content: local.content,
					mtime: local.mtime
				}
			};
		}
		const now = Date.now();
		const shouldToast = now - lastExternalToastAt > 2500;
		if (shouldToast) lastExternalToastAt = now;
		set({
			nodes,
			rootIds,
			lastExternalSync: now,
			activeNoteId: nextActive,
			toast: shouldToast ? "Vault updated from disk" : get().toast,
			expandedFolders: [.../* @__PURE__ */ new Set([...get().expandedFolders.filter((id) => nodes[id]), ...Object.values(nodes).filter((n) => n.kind === "folder").map((n) => n.id).filter((id) => get().expandedFolders.includes(id))])]
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
		set({ dirtyNoteIds: [] });
		get().setToast("Saved");
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
	partialize: (s) => ({
		vaultId: s.mode === "fsa" ? null : s.vaultId,
		vaultName: s.mode === "fsa" ? "" : s.vaultName,
		vaultPath: s.mode === "fsa" ? "" : s.vaultPath,
		mode: s.mode === "fsa" ? "demo" : s.mode,
		nodes: s.mode === "fsa" ? {} : s.nodes,
		rootIds: s.mode === "fsa" ? [] : s.rootIds,
		activeNoteId: s.mode === "fsa" ? null : s.activeNoteId,
		settings: s.settings,
		expandedFolders: s.mode === "fsa" ? [] : s.expandedFolders
	})
}));
if (typeof window !== "undefined") window.__NOTEAPP__ = { store: useVaultStore };
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
/** macOS-style window chrome with traffic lights + Nexus branding */
function TitleBar() {
	const vaultName = useVaultStore((s) => s.vaultName);
	const mode = useVaultStore((s) => s.mode);
	const lastExternalSync = useVaultStore((s) => s.lastExternalSync);
	const vaultId = useVaultStore((s) => s.vaultId);
	const setSettingsOpen = usePrefsStore((s) => s.setSettingsOpen);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "titlebar-drag relative z-40 flex h-11 shrink-0 items-center border-b border-[var(--border)] bg-[rgba(8,8,10,0.94)] px-3 backdrop-blur-xl",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "titlebar-no-drag flex items-center gap-2 pl-1",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "traffic-light bg-[#ff5f57] shadow-[0_0_0_0.5px_rgba(0,0,0,0.35)]",
						title: "Close"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "traffic-light bg-[#febc2e] shadow-[0_0_0_0.5px_rgba(0,0,0,0.35)]",
						title: "Minimize"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "traffic-light bg-[#28c840] shadow-[0_0_0_0.5px_rgba(0,0,0,0.35)]",
						title: "Zoom"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute inset-0 flex items-center justify-center",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusWordmark, {
						size: "sm",
						className: "text-[var(--text-primary)]"
					}), vaultName ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
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
				children: [!vaultId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]",
					children: "No vault"
				}) : lastExternalSync ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "rounded-full border border-[rgba(48,209,88,0.3)] bg-[rgba(48,209,88,0.1)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)]",
					title: new Date(lastExternalSync).toLocaleString(),
					children: ["Live · ", formatRelativeTime(lastExternalSync)]
				}) : mode === "fsa" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-full border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent)]",
					children: "Watching disk"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-[var(--text-muted)]",
					children: "Local · offline"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "icon-btn h-8 w-8",
					title: "Settings (⌘,)",
					"aria-label": "Open settings",
					onClick: () => setSettingsOpen(true),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { size: 15 })
				})]
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
			}
			if (mod && e.key.toLowerCase() === "e") {
				e.preventDefault();
				store.toggleEditorMode();
				return;
			}
			if (mod && e.key === "\\") {
				e.preventDefault();
				if (e.altKey) store.toggleRight();
				else store.toggleLeft();
				return;
			}
			if (mod && e.key.toLowerCase() === "g") {
				e.preventDefault();
				store.toggleGraphFullscreen();
				return;
			}
			if (mod && e.key.toLowerCase() === "n") {
				e.preventDefault();
				store.createNote(null);
				return;
			}
			if (mod && e.key.toLowerCase() === "s") {
				e.preventDefault();
				store.flushDirty();
				store.setToast("Saved");
				return;
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
function VaultSwitcher() {
	const vaultName = useVaultStore((s) => s.vaultName);
	const mode = useVaultStore((s) => s.mode);
	const recentVaults = useVaultStore((s) => s.recentVaults);
	const openDemoVault = useVaultStore((s) => s.openDemoVault);
	const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
	const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
	const closeVault = useVaultStore((s) => s.closeVault);
	const simulateHermesWrite = useVaultStore((s) => s.simulateHermesWrite);
	const cloudSession = useVaultStore((s) => s.cloudSession);
	const lastExternalSync = useVaultStore((s) => s.lastExternalSync);
	const setToast = useVaultStore((s) => s.setToast);
	const refreshCloudSession = useVaultStore((s) => s.refreshCloudSession);
	const disconnectCloudSession = useVaultStore((s) => s.disconnectCloud);
	const [open, setOpen] = (0, import_react.useState)(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative px-3 pt-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
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
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "truncate text-[11px] text-[var(--text-muted)]",
						children: [mode === "fsa" ? "Local folder · live watch" : mode === "demo" ? "Demo vault · in-browser" : "Plain Markdown folder", lastExternalSync ? " · synced" : ""]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
					size: 15,
					className: cn("shrink-0 text-[var(--text-muted)] transition-transform duration-200", open && "rotate-180")
				})
			]
		}), open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "glass-elevated absolute left-3 right-3 top-[calc(100%+6px)] z-50 max-h-[min(70vh,480px)] overflow-y-auto rounded-[14px] p-1.5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
					onClick: () => {
						openFolderAsVault();
						setOpen(false);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, {
						size: 15,
						className: "text-[var(--accent)]"
					}), "Open folder as vault…"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
					onClick: () => {
						openDemoVault();
						setOpen(false);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, {
						size: 15,
						className: "text-[var(--accent-violet)]"
					}), "Open demo vault"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
					onClick: () => {
						simulateHermesWrite();
						setOpen(false);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, {
						size: 15,
						className: "text-[var(--success)]"
					}), "Simulate Hermes write"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-2 my-1.5 h-px bg-[var(--border)]" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]",
					children: "Cloud (synced folders)"
				}),
				[
					"dropbox",
					"google",
					"onedrive"
				].map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.05] hover:text-[var(--text-primary)]",
					onClick: () => {
						preferSyncedProvider(p);
						refreshCloudSession();
						setToast(providerSyncHint(p));
						setOpen(false);
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cloud, {
							size: 15,
							className: "text-[var(--accent-violet)]"
						}),
						providerLabel(p),
						" folder…"
					]
				}, p)),
				cloudSession ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.05]",
					onClick: () => {
						disconnectCloudSession();
						setOpen(false);
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { size: 15 }),
						"Clear ",
						providerLabel(cloudSession.provider),
						" preference"
					]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "px-2.5 py-1.5 text-[11px] leading-snug text-[var(--text-muted)]",
					children: CLOUD_SYNC_HINT
				}),
				recentVaults.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-2 my-1.5 h-px bg-[var(--border)]" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]",
						children: "Recent"
					}),
					recentVaults.slice(0, 5).map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "flex w-full flex-col rounded-[10px] px-2.5 py-2 text-left hover:bg-white/[0.05]",
						onClick: () => {
							if (r.mode === "demo") openDemoVault();
							else if (r.mode === "fsa") reopenRecentVault(r.id);
							else openDemoVault();
							setOpen(false);
						},
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[12.5px] text-[var(--text-primary)]",
							children: r.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "truncate text-[11px] text-[var(--text-muted)]",
							children: r.path
						})]
					}, r.id))
				] }) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-2 my-1.5 h-px bg-[var(--border)]" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-[var(--text-muted)] hover:bg-white/[0.05] hover:text-[var(--text-secondary)]",
					onClick: () => {
						closeVault();
						setOpen(false);
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LogOut, { size: 15 }), "Close vault"]
				})
			]
		}) : null]
	});
}
function TreeNode({ node, depth }) {
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const expandedFolders = useVaultStore((s) => s.expandedFolders);
	const toggleFolder = useVaultStore((s) => s.toggleFolder);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const getChildren = useVaultStore((s) => s.getChildren);
	const renameNode = useVaultStore((s) => s.renameNode);
	const deleteNode = useVaultStore((s) => s.deleteNode);
	const createNote = useVaultStore((s) => s.createNote);
	const createFolder = useVaultStore((s) => s.createFolder);
	const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
	const [renaming, setRenaming] = (0, import_react.useState)(false);
	const [nameDraft, setNameDraft] = (0, import_react.useState)(node.name);
	const expanded = expandedFolders.includes(node.id);
	const children = node.kind === "folder" && expanded ? getChildren(node.id) : [];
	const isActive = node.kind === "note" && node.id === activeNoteId;
	const commitRename = () => {
		setRenaming(false);
		if (nameDraft.trim() && nameDraft !== node.name) renameNode(node.id, nameDraft.trim());
		else setNameDraft(node.name);
	};
	const openNote = (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (node.kind === "folder") {
			toggleFolder(node.id);
			return;
		}
		setActiveNote(node.id);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: cn("tree-item group relative flex w-full items-center gap-1.5 text-left", isActive && "is-active"),
		style: { paddingLeft: 8 + depth * 14 },
		onClick: openNote,
		onDoubleClick: (e) => {
			e.preventDefault();
			e.stopPropagation();
			setRenaming(true);
			setNameDraft(node.kind === "note" ? noteTitle(node) : node.name);
		},
		role: "treeitem",
		"aria-selected": isActive,
		"aria-expanded": node.kind === "folder" ? expanded : void 0,
		"data-node-id": node.id,
		"data-node-kind": node.kind,
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
				autoFocus: true,
				className: "min-w-0 flex-1 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[13px] text-[var(--text-primary)] outline-none ring-1 ring-[var(--accent)]",
				value: nameDraft,
				onChange: (e) => setNameDraft(e.target.value),
				onBlur: commitRename,
				onKeyDown: (e) => {
					if (e.key === "Enter") commitRename();
					if (e.key === "Escape") {
						setRenaming(false);
						setNameDraft(node.name);
					}
				},
				onClick: (e) => e.stopPropagation()
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "min-w-0 flex-1 truncate",
				children: node.kind === "note" ? noteTitle(node) : node.name
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "titlebar-no-drag relative ml-auto hidden shrink-0 group-hover:flex",
				onClick: (e) => e.stopPropagation(),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					role: "button",
					tabIndex: 0,
					className: "icon-btn flex h-6 w-6 items-center justify-center",
					onClick: (e) => {
						e.stopPropagation();
						setMenuOpen((v) => !v);
					},
					onKeyDown: (e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							setMenuOpen((v) => !v);
						}
					},
					"aria-label": "Item actions",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, { size: 14 })
				}), menuOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "glass-elevated absolute right-0 top-7 z-50 min-w-[150px] rounded-[12px] p-1",
					onClick: (e) => e.stopPropagation(),
					children: [
						node.kind === "folder" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { size: 13 }),
							label: "New note",
							onClick: () => {
								createNote(node.id);
								setMenuOpen(false);
							}
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Folder, { size: 13 }),
							label: "New folder",
							onClick: () => {
								createFolder(node.id);
								setMenuOpen(false);
							}
						})] }) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { size: 13 }),
							label: "Rename",
							onClick: () => {
								setRenaming(true);
								setNameDraft(node.kind === "note" ? noteTitle(node) : node.name);
								setMenuOpen(false);
							}
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MenuBtn, {
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { size: 13 }),
							label: "Delete",
							danger: true,
							onClick: () => {
								deleteNode(node.id);
								setMenuOpen(false);
							}
						})
					]
				}) : null]
			})
		]
	}), node.kind === "folder" && expanded ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		role: "group",
		children: children.map((child) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeNode, {
			node: child,
			depth: depth + 1
		}, child.id))
	}) : null] });
}
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
	const roots = (0, import_react.useMemo)(() => {
		return rootIds.map((id) => nodes[id]).filter(Boolean).sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}, [rootIds, nodes]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "px-2 pb-3",
		role: "tree",
		"aria-label": "Vault files",
		children: [roots.map((node) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TreeNode, {
			node,
			depth: 0
		}, node.id)), roots.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "px-2 py-6 text-center text-[12.5px] text-[var(--text-muted)]",
			children: "Empty vault — create a note to begin."
		}) : null]
	});
}
function LeftSidebar() {
	const leftOpen = useVaultStore((s) => s.settings.leftOpen);
	const leftWidth = useVaultStore((s) => s.settings.leftWidth);
	const setLeftOpen = useVaultStore((s) => s.setLeftOpen);
	const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
	const createNote = useVaultStore((s) => s.createNote);
	const createFolder = useVaultStore((s) => s.createFolder);
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
		className: "panel-slide glass-panel absolute inset-y-0 left-0 z-30 flex h-full w-[min(280px,86vw)] shrink-0 flex-col border-r border-[var(--border)] bg-[rgba(15,15,18,0.94)] md:relative md:z-0 md:bg-[rgba(15,15,18,0.78)]",
		style: { width: leftWidth },
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(VaultSwitcher, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex items-center gap-1.5 px-3",
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
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "icon-btn",
						title: "New note",
						onClick: () => createNote(null, "Untitled"),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 16 })
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
				className: "mt-2 flex items-center justify-between px-4 pb-1",
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
			})
		]
	})] });
}
/**
* Wikilink mark — renders as pill in visual mode, serializes to [[target]] / [[target|alias]].
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
		return [new Plugin({
			key: new PluginKey("wikilink-click"),
			props: { handleClick: (_view, _pos, event) => {
				const el = event.target?.closest?.("span[data-wikilink]");
				if (!el) return false;
				const target = el.getAttribute("data-wikilink");
				if (target && onOpen) {
					event.preventDefault();
					onOpen(target);
					return true;
				}
				return false;
			} }
		})];
	}
});
var AMP = "&amp;";
var LT = "&lt;";
var GT = "&gt;";
var QUOT = "&quot;";
function escapeAttr(s) {
	return s.split("&").join(AMP).split("\"").join(QUOT).split("<").join(LT);
}
function escapeText(s) {
	return s.split("&").join(AMP).split("<").join(LT).split(">").join(GT);
}
function escapeCode(s) {
	return s.split("&").join(AMP).split("<").join(LT);
}
/** Convert markdown with [[wikilinks]] into HTML TipTap can parse */
function markdownWithWikilinksToHtml(md) {
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	const htmlParts = [];
	let inCode = false;
	let codeBuf = [];
	let listType = null;
	const flushList = () => {
		if (listType) {
			htmlParts.push(`</${listType}>`);
			listType = null;
		}
	};
	const inline = (text) => {
		let t = escapeText(text);
		t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
		t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
		t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
		t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "<img src=\"$2\" alt=\"$1\" />");
		t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\">$1</a>");
		t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
			const a = (alias ?? target).trim();
			return `<span data-wikilink="${escapeAttr(target.trim())}" data-alias="${escapeAttr(a)}" class="wikilink-pill">${escapeText(a)}</span>`;
		});
		return t;
	};
	for (const line of lines) {
		if (line.startsWith("```")) {
			if (inCode) {
				htmlParts.push(`<pre><code>${escapeCode(codeBuf.join("\n"))}</code></pre>`);
				codeBuf = [];
				inCode = false;
			} else {
				flushList();
				inCode = true;
			}
			continue;
		}
		if (inCode) {
			codeBuf.push(line);
			continue;
		}
		if (/^---+$/.test(line.trim())) {
			flushList();
			htmlParts.push("<hr>");
			continue;
		}
		const heading = /^(#{1,6})\s+(.+)$/.exec(line);
		if (heading) {
			flushList();
			const level = heading[1].length;
			htmlParts.push(`<h${level}>${inline(heading[2])}</h${level}>`);
			continue;
		}
		const task = /^[-*]\s+\[([ xX])\]\s+(.+)$/.exec(line);
		if (task) {
			if (listType !== "ul") {
				flushList();
				htmlParts.push("<ul>");
				listType = "ul";
			}
			const checked = task[1].toLowerCase() === "x";
			htmlParts.push(`<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox" ${checked ? "checked" : ""}/></label><div>${inline(task[2])}</div></li>`);
			continue;
		}
		const ul = /^[-*]\s+(.+)$/.exec(line);
		if (ul) {
			if (listType !== "ul") {
				flushList();
				htmlParts.push("<ul>");
				listType = "ul";
			}
			htmlParts.push(`<li><p>${inline(ul[1])}</p></li>`);
			continue;
		}
		const ol = /^(\d+)\.\s+(.+)$/.exec(line);
		if (ol) {
			if (listType !== "ol") {
				flushList();
				htmlParts.push("<ol>");
				listType = "ol";
			}
			htmlParts.push(`<li><p>${inline(ol[2])}</p></li>`);
			continue;
		}
		if (line.startsWith("> ")) {
			flushList();
			htmlParts.push(`<blockquote><p>${inline(line.slice(2))}</p></blockquote>`);
			continue;
		}
		if (!line.trim()) {
			flushList();
			continue;
		}
		flushList();
		htmlParts.push(`<p>${inline(line)}</p>`);
	}
	flushList();
	if (inCode) htmlParts.push(`<pre><code>${escapeCode(codeBuf.join("\n"))}</code></pre>`);
	return htmlParts.join("") || "<p></p>";
}
/** Serialize TipTap HTML-ish document content back to clean markdown */
function htmlDocToMarkdown(root) {
	const parts = [];
	const walkInline = (node) => {
		if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
		if (node.nodeType !== Node.ELEMENT_NODE) return "";
		const el = node;
		const tag = el.tagName.toLowerCase();
		const inner = Array.from(el.childNodes).map(walkInline).join("");
		if (el.hasAttribute("data-wikilink")) {
			const target = el.getAttribute("data-wikilink") || inner;
			const alias = el.getAttribute("data-alias");
			if (alias && alias !== target) return `[[${target}|${alias}]]`;
			return `[[${target}]]`;
		}
		if (tag === "strong" || tag === "b") return `**${inner}**`;
		if (tag === "em" || tag === "i") return `*${inner}*`;
		if (tag === "code") return "`" + inner + "`";
		if (tag === "a") return `[${inner}](${el.getAttribute("href") || ""})`;
		if (tag === "br") return "\n";
		return inner;
	};
	const walkBlock = (el) => {
		const tag = el.tagName.toLowerCase();
		if (tag === "h1") parts.push(`# ${walkInline(el)}`);
		else if (tag === "h2") parts.push(`## ${walkInline(el)}`);
		else if (tag === "h3") parts.push(`### ${walkInline(el)}`);
		else if (tag === "h4") parts.push(`#### ${walkInline(el)}`);
		else if (tag === "h5") parts.push(`##### ${walkInline(el)}`);
		else if (tag === "h6") parts.push(`###### ${walkInline(el)}`);
		else if (tag === "p") parts.push(walkInline(el));
		else if (tag === "blockquote") {
			const text = walkInline(el);
			parts.push(text.split("\n").map((l) => `> ${l}`).join("\n"));
		} else if (tag === "pre") {
			const code = el.textContent ?? "";
			parts.push("```\n" + code.replace(/\n$/, "") + "\n```");
		} else if (tag === "hr") parts.push("---");
		else if (tag === "ul" || tag === "ol") {
			let i = 1;
			for (const child of Array.from(el.children)) {
				if (child.tagName.toLowerCase() !== "li") continue;
				const li = child;
				if (li.getAttribute("data-type") === "taskItem") {
					const checked = li.getAttribute("data-checked") === "true";
					const text = walkInline(li).replace(/^\s*/, "");
					parts.push(`- [${checked ? "x" : " "}] ${text}`);
				} else {
					const prefix = tag === "ol" ? `${i}. ` : "- ";
					parts.push(prefix + walkInline(li).trim());
					i++;
				}
			}
		} else if (tag === "table") Array.from(el.querySelectorAll("tr")).forEach((row, ri) => {
			const cells = Array.from(row.querySelectorAll("th,td")).map((c) => (c.textContent ?? "").trim());
			parts.push("| " + cells.join(" | ") + " |");
			if (ri === 0) parts.push("| " + cells.map(() => "---").join(" | ") + " |");
		});
		else if (tag === "img") {
			const alt = el.getAttribute("alt") || "";
			const src = el.getAttribute("src") || "";
			parts.push(`![${alt}](${src})`);
		} else for (const child of Array.from(el.children)) walkBlock(child);
	};
	for (const child of Array.from(root.childNodes)) if (child.nodeType === Node.ELEMENT_NODE) walkBlock(child);
	const out = [];
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		out.push(p);
		const next = parts[i + 1];
		if (!next) continue;
		const listish = (s) => /^(- |\d+\. )/.test(s);
		if (listish(p) && listish(next)) continue;
		out.push("");
	}
	return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
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
function buildGraph(nodes) {
	const notes = Object.values(nodes).filter((n) => n.kind === "note");
	const byNorm = /* @__PURE__ */ new Map();
	for (const n of notes) {
		byNorm.set(normalizeLinkTarget(noteTitle(n)), n);
		byNorm.set(normalizeLinkTarget(n.path.replace(/\.md$/i, "")), n);
		byNorm.set(normalizeLinkTarget(n.path), n);
	}
	const degree = /* @__PURE__ */ new Map();
	const edgeSet = /* @__PURE__ */ new Set();
	const edges = [];
	const bump = (id) => degree.set(id, (degree.get(id) ?? 0) + 1);
	for (const n of notes) {
		const targets = extractWikilinkTargets(n.content ?? "");
		for (const t of targets) {
			const dest = byNorm.get(normalizeLinkTarget(t));
			if (!dest || dest.id === n.id) continue;
			const key = [n.id, dest.id].sort().join("→");
			if (edgeSet.has(key)) continue;
			edgeSet.add(key);
			edges.push({
				source: n.id,
				target: dest.id
			});
			bump(n.id);
			bump(dest.id);
		}
	}
	return {
		nodes: notes.map((n) => ({
			id: n.id,
			title: noteTitle(n),
			path: n.path,
			degree: degree.get(n.id) ?? 0,
			preview: previewSnippet(n.content ?? "", 100)
		})),
		edges
	};
}
function resolveWikilink(target, nodes) {
	const notes = Object.values(nodes).filter((n) => n.kind === "note");
	const norm = normalizeLinkTarget(target);
	for (const n of notes) {
		if (normalizeLinkTarget(noteTitle(n)) === norm) return n;
		if (normalizeLinkTarget(n.path.replace(/\.md$/i, "")) === norm) return n;
		if (normalizeLinkTarget(n.path) === norm) return n;
		if (normalizeLinkTarget(n.name) === norm) return n;
	}
	for (const n of notes) {
		if (normalizeLinkTarget(n.path).endsWith("/" + norm)) return n;
		if (normalizeLinkTarget(n.path).endsWith(norm + ".md")) return n;
	}
	return null;
}
function EditorToolbar({ editor }) {
	const btn = (active, onClick, icon, title) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		title,
		onMouseDown: (e) => {
			e.preventDefault();
			onClick();
		},
		className: cn("icon-btn h-7 w-7", active && "is-active"),
		children: icon
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] px-3 py-1.5",
		children: [
			btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bold, { size: 14 }), "Bold"),
			btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Italic, { size: 14 }), "Italic"),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
			btn(editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading1, { size: 14 }), "Heading 1"),
			btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading2, { size: 14 }), "Heading 2"),
			btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Heading3, { size: 14 }), "Heading 3"),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
			btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(List, { size: 14 }), "Bullet list"),
			btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListOrdered, { size: 14 }), "Ordered list"),
			btn(editor.isActive("taskList"), () => editor.chain().focus().toggleTaskList().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ListChecks, { size: 14 }), "Task list"),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
			btn(editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeXml, { size: 14 }), "Code block"),
			btn(editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Quote, { size: 14 }), "Quote"),
			btn(false, () => editor.chain().focus().setHorizontalRule().run(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minus, { size: 14 }), "Divider"),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sep, {}),
			btn(editor.isActive("link"), () => {
				const prev = editor.getAttributes("link").href;
				const url = window.prompt("URL", prev || "https://");
				if (url === null) return;
				if (url === "") {
					editor.chain().focus().extendMarkRange("link").unsetLink().run();
					return;
				}
				editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
			}, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, { size: 14 }), "Link"),
			btn(false, () => {
				const src = window.prompt("Image path (relative, e.g. assets/photo.png)", "assets/");
				if (!src) return;
				editor.chain().focus().setImage({ src }).run();
			}, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Image, { size: 14 }), "Image"),
			btn(false, () => {
				editor.chain().focus().insertTable({
					rows: 3,
					cols: 3,
					withHeaderRow: true
				}).run();
			}, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Table, { size: 14 }), "Table")
		]
	});
}
function Sep() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-1 h-4 w-px bg-[var(--border)]" });
}
/**
* Visual view of a single note. Parent remounts via key when note/mode changes.
* Flush always compares live TipTap DOM → store so Source never sees stale Markdown.
*/
function VisualEditor({ noteId, content }) {
	const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const saveTimer = (0, import_react.useRef)(null);
	const applying = (0, import_react.useRef)(false);
	const userEdited = (0, import_react.useRef)(false);
	const baselineMd = (0, import_react.useRef)(content);
	const noteIdRef = (0, import_react.useRef)(noteId);
	const contentRef = (0, import_react.useRef)(content);
	noteIdRef.current = noteId;
	contentRef.current = content;
	const commit = (0, import_react.useCallback)((ed, opts) => {
		if (applying.current) return;
		const id = noteIdRef.current;
		let serialized;
		try {
			serialized = htmlDocToMarkdown(ed.view.dom);
		} catch {
			return;
		}
		const prev = useVaultStore.getState().nodes[id]?.content ?? baselineMd.current;
		if (!opts?.force && isOnlySerializationNoise(prev, serialized) && !userEdited.current) return;
		if (isOnlySerializationNoise(prev, serialized)) {
			userEdited.current = false;
			return;
		}
		const md = preferCleanWrite(prev, serialized);
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
			index_default$2.configure({
				heading: { levels: [
					1,
					2,
					3,
					4
				] },
				codeBlock: { HTMLAttributes: { class: "note-code" } }
			}),
			index_default$1.configure({ placeholder: "Start writing… Use [[wikilinks]] to connect ideas." }),
			index_default$3,
			index_default$4.configure({ nested: true }),
			index_default$5.configure({
				inline: false,
				allowBase64: true
			}),
			index_default.configure({
				openOnClick: false,
				autolink: true
			}),
			Table$1.configure({ resizable: false }),
			TableRow,
			TableHeader,
			TableCell,
			Wikilink.configure({ onOpen: (target) => {
				const hit = resolveWikilink(target, useVaultStore.getState().nodes);
				if (hit) setActiveNote(hit.id);
			} })
		],
		content: markdownWithWikilinksToHtml(content || ""),
		editorProps: { attributes: {
			class: "note-editor min-h-[50vh] focus:outline-none",
			"data-note-id": noteId
		} },
		onCreate: ({ editor: ed }) => {
			applying.current = true;
			const html = markdownWithWikilinksToHtml(contentRef.current || "");
			ed.commands.setContent(html, { emitUpdate: false });
			baselineMd.current = contentRef.current;
			userEdited.current = false;
			requestAnimationFrame(() => {
				ed.view.dom.querySelectorAll("span[data-wikilink]").forEach((pill) => {
					const hit = resolveWikilink(pill.getAttribute("data-wikilink") || "", useVaultStore.getState().nodes);
					pill.classList.toggle("is-missing", !hit);
				});
				applying.current = false;
			});
		},
		onUpdate: ({ editor: ed }) => {
			if (applying.current) return;
			userEdited.current = true;
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => commit(ed), 250);
		}
	}, [noteId]);
	(0, import_react.useEffect)(() => {
		if (!editor) return;
		if (userEdited.current) return;
		if (isOnlySerializationNoise(baselineMd.current, content)) return;
		applying.current = true;
		baselineMd.current = content;
		contentRef.current = content;
		editor.commands.setContent(markdownWithWikilinksToHtml(content || ""), { emitUpdate: false });
		requestAnimationFrame(() => {
			applying.current = false;
		});
	}, [editor, content]);
	(0, import_react.useEffect)(() => {
		if (!editor) return;
		const flushNow = () => {
			if (saveTimer.current) {
				clearTimeout(saveTimer.current);
				saveTimer.current = null;
			}
			try {
				commit(editor, { force: true });
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
	if (!editor) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-40 items-center justify-center text-[var(--text-muted)]",
		"data-note-id": noteId,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-5 w-5 animate-pulse rounded-md bg-[rgba(0,200,255,0.2)]" })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fade-in flex h-full min-h-0 flex-col",
		"data-note-id": noteId,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditorToolbar, { editor }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-10 md:py-6",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto max-w-[720px]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditorContent, { editor })
			})
		})]
	});
}
/**
* Source view of the same note. Always seeds from the latest store content so
* Visual → Source never opens on an empty/stale buffer.
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
	noteIdRef.current = noteId;
	(0, import_react.useEffect)(() => {
		const live = useVaultStore.getState().nodes[noteId]?.content ?? content ?? "";
		if (dirtyRef.current) return;
		if (live === valueRef.current) return;
		setValue(live);
		valueRef.current = live;
	}, [noteId, content]);
	(0, import_react.useEffect)(() => {
		const flushNow = () => {
			if (timer.current) {
				clearTimeout(timer.current);
				timer.current = null;
			}
			const id = noteIdRef.current;
			const val = valueRef.current;
			dirtyRef.current = false;
			const prev = useVaultStore.getState().nodes[id]?.content ?? "";
			const next = preferCleanWrite(prev, val);
			if (next !== prev) updateNoteContent(id, next);
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
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				className: "source-editor min-h-[50vh] w-full flex-1",
				value,
				spellCheck,
				style: { fontSize: editorFontSize },
				onChange: (e) => {
					const val = e.target.value;
					dirtyRef.current = true;
					setValue(val);
					valueRef.current = val;
					if (timer.current) clearTimeout(timer.current);
					timer.current = setTimeout(() => {
						const id = noteIdRef.current;
						const prev = useVaultStore.getState().nodes[id]?.content ?? "";
						const next = preferCleanWrite(prev, val);
						dirtyRef.current = false;
						if (next !== prev) updateNoteContent(id, next);
					}, 200);
				},
				"aria-label": "Markdown source"
			})
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
		className: "w-full bg-transparent text-[15px] font-semibold tracking-tight text-[var(--text-primary)] outline-none titlebar-no-drag",
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
	const createNote = useVaultStore((s) => s.createNote);
	const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
	const setEditorMode = useVaultStore((s) => s.setEditorMode);
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
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "primary-btn",
					onClick: () => createNote(null, "Untitled"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus2, { size: 16 }), "New note"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "ghost-btn",
					onClick: () => setCommandOpen(true),
					children: "Search ⌘K"
				})]
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
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex shrink-0 items-center gap-1",
				children: [
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
				]
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
function getBacklinks(targetNote, nodes) {
	const targets = /* @__PURE__ */ new Set([
		normalizeLinkTarget(noteTitle(targetNote)),
		normalizeLinkTarget(targetNote.path.replace(/\.md$/i, "")),
		normalizeLinkTarget(targetNote.path),
		normalizeLinkTarget(targetNote.name)
	]);
	const out = [];
	for (const n of Object.values(nodes)) {
		if (n.kind !== "note" || n.id === targetNote.id) continue;
		const content = n.content ?? "";
		const links = extractWikilinks(content);
		for (const link of links) {
			if (!targets.has(normalizeLinkTarget(link.target))) continue;
			out.push({
				fromId: n.id,
				fromPath: n.path,
				fromTitle: noteTitle(n),
				context: wikilinkContext(content, link.start, link.end)
			});
			break;
		}
	}
	return out.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
}
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
function createOrb(node, activeId, hoverId, focusId, neighbors, dimStrength, mode, accent, showLabel) {
	const group = new Group();
	const isActive = node.id === activeId;
	const isHover = node.id === hoverId;
	const isHub = node.degree >= 3;
	const inFocus = !focusId || node.id === focusId || (neighbors?.has(node.id) ?? false);
	const dim = !!focusId && !inFocus && dimStrength > 0;
	const full = mode === "fullscreen";
	const panel = mode === "panel";
	const segs = full ? 72 : 56;
	const base = full ? 3 : panel ? 2.4 : 2.3;
	const rank = isActive || isHover ? 1 : isHub ? .82 : .62;
	const radius = base + Math.pow(Math.max(1, node.val), .55) * (full ? 1.7 : 1.35) * rank + (isActive || isHover ? .45 : 0);
	const bodyColor = isActive || isHover ? new Color(4870752) : isHub ? new Color(3949650) : new Color(3423304);
	if (dim) {
		const mul = 1 - dimStrength * .55;
		bodyColor.multiplyScalar(mul);
	}
	const bodyOpacity = dim ? 1 - dimStrength * .55 : 1;
	const body = new Mesh(new SphereGeometry(radius, segs, segs), new MeshPhysicalMaterial({
		color: bodyColor,
		metalness: .96,
		roughness: isActive || isHover ? .12 : isHub ? .2 : .28,
		clearcoat: isActive || isHover ? .8 : .45,
		clearcoatRoughness: isActive || isHover ? .05 : .14,
		transparent: dim && dimStrength > .5,
		opacity: bodyOpacity,
		depthWrite: !(dim && dimStrength > .5),
		transmission: 0,
		specularIntensity: isActive || isHover ? 1.45 : 1.15,
		specularColor: new Color(15265526),
		emissive: isActive || isHover ? accent.clone() : neighbors?.has(node.id) ? accent.clone().multiplyScalar(.35) : new Color(0),
		emissiveIntensity: isActive || isHover ? .08 : neighbors?.has(node.id) ? .04 : 0,
		envMapIntensity: isActive || isHover ? 1.55 : isHub ? 1.2 : 1.05,
		side: 0
	}));
	body.renderOrder = dim && dimStrength > .5 ? 0 : 1;
	group.add(body);
	if (isActive || isHover) {
		const tube = radius * .013;
		const ring = new Mesh(new TorusGeometry(radius * 1.08, tube, 12, full ? 88 : 64), new MeshPhysicalMaterial({
			color: accent.clone().lerp(new Color(13687012), .3),
			metalness: .95,
			roughness: .14,
			emissive: accent.clone(),
			emissiveIntensity: isHover && !isActive ? .28 : .2,
			envMapIntensity: 1.2
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
function GraphView({ mode, className }) {
	const hostRef = (0, import_react.useRef)(null);
	const graphRef = (0, import_react.useRef)(null);
	const activeRef = (0, import_react.useRef)(null);
	const hoverRef = (0, import_react.useRef)(null);
	const neighborMapRef = (0, import_react.useRef)(/* @__PURE__ */ new Map());
	const nodes = useVaultStore((s) => s.nodes);
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
	activeRef.current = activeNoteId;
	const data = (0, import_react.useMemo)(() => {
		const g = buildGraph(nodes);
		return {
			nodes: g.nodes.map((n) => ({
				id: n.id,
				name: n.title,
				val: Math.max(1, n.degree + 1),
				preview: n.preview,
				path: n.path,
				degree: n.degree
			})),
			links: g.edges.map((e) => ({
				source: e.source,
				target: e.target
			}))
		};
	}, [nodes]);
	(0, import_react.useEffect)(() => {
		neighborMapRef.current = buildNeighbors(data.links);
	}, [data]);
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
		const dimStrength = () => hoverRef.current ? 1 : activeRef.current ? .35 : 0;
		const neighborSet = (id) => {
			if (!id) return null;
			return neighborMapRef.current.get(id) ?? /* @__PURE__ */ new Set();
		};
		const shouldShowLabel = (n) => {
			const f = focusId();
			const ns = neighborSet(f);
			if (n.id === activeRef.current || n.id === hoverRef.current) return true;
			if (f && ns?.has(n.id)) return true;
			if (hoverRef.current) return false;
			return n.degree >= 3;
		};
		const paintOrb = (n) => {
			const f = focusId();
			return createOrb(n, activeRef.current, hoverRef.current, f, neighborSet(f), dimStrength(), mode, accent, shouldShowLabel(n));
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
			setGraphMode("panel");
			setLeftOpen(true);
			if (typeof window !== "undefined" && window.innerWidth >= 1200) setRightOpen(true);
			setActiveNote(node.id);
		}).onNodeHover((n) => {
			const node = n;
			hoverRef.current = node?.id ?? null;
			setHoverName(node?.name ?? null);
			el.style.cursor = node ? "pointer" : "grab";
			if (graphRef.current) {
				applyEdgeStyles(graphRef.current);
				graphRef.current.nodeThreeObject((nn) => paintOrb(nn)).refresh();
			}
		}).onBackgroundClick(() => setHintVisible(false));
		applyEdgeStyles(graph);
		let envMap = null;
		try {
			const renderer = graph.renderer();
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.toneMapping = 4;
			renderer.toneMappingExposure = 1.12;
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
			const ambient = new AmbientLight(4870752, .14);
			const hemi = new HemisphereLight(1845820, 197898, .38);
			const key = new DirectionalLight(15791352, 1.15);
			key.position.set(60, 95, 45);
			const fill = new DirectionalLight(3820124, .42);
			fill.position.set(-55, 10, -40);
			const rim = new DirectionalLight(11585760, .32);
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
		graph.graphData(data);
		window.setTimeout(() => {
			try {
				graph.zoomToFit(650, mode === "fullscreen" ? 70 : 48);
			} catch {}
		}, 900);
		return () => {
			cancelled = true;
			cancelAnimationFrame(raf);
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
		setRightOpen
	]);
	(0, import_react.useEffect)(() => {
		if (!graphRef.current) return;
		graphRef.current.graphData(data);
	}, [data]);
	(0, import_react.useEffect)(() => {
		if (!graphRef.current) return;
		const { r: ar, g: ag, b: ab } = accentRgb();
		const accent = new Color(ar / 255, ag / 255, ab / 255);
		const particleCount = graphParticles ? mode === "panel" ? 1 : 3 : 0;
		const focusId = () => hoverRef.current || activeNoteId;
		const dimStrength = () => hoverRef.current ? 1 : activeNoteId ? .35 : 0;
		const neighborSet = (id) => {
			if (!id) return null;
			return neighborMapRef.current.get(id) ?? /* @__PURE__ */ new Set();
		};
		const shouldShowLabel = (n) => {
			const f = focusId();
			const ns = neighborSet(f);
			if (n.id === activeNoteId || n.id === hoverRef.current) return true;
			if (f && ns?.has(n.id)) return true;
			if (hoverRef.current) return false;
			return n.degree >= 3;
		};
		const paintOrb = (n) => {
			const f = focusId();
			return createOrb(n, activeNoteId, hoverRef.current, f, neighborSet(f), dimStrength(), mode, accent, shouldShowLabel(n));
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
		graphRef.current.nodeThreeObject((n) => paintOrb(n)).linkColor((link) => edgeStyle(link).color).linkWidth((link) => edgeStyle(link).width).linkDirectionalParticles((link) => edgeStyle(link).particles).refresh();
	}, [
		activeNoteId,
		mode,
		accentPreset,
		accentCustom,
		graphParticles
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
					className: "flex min-w-0 items-center gap-2 rounded-full border border-white/[0.06] bg-black/40 px-3 py-1.5 backdrop-blur-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, {
						size: 12,
						className: "shrink-0 text-[var(--accent)] opacity-70"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "truncate text-[11px] font-medium tracking-wide text-[var(--text-muted)]",
						children: [
							data.nodes.length,
							" notes",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mx-1.5 opacity-50",
								children: "·"
							}),
							data.links.length,
							" links",
							hoverName ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mx-1.5 opacity-50",
								children: "·"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[var(--text-secondary)] transition-opacity duration-200",
								children: hoverName
							})] }) : null
						]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "icon-btn pointer-events-auto h-8 w-8 shrink-0 border border-white/[0.06] bg-black/40",
					title: mode === "fullscreen" ? "Exit fullscreen graph" : "Expand graph",
					onClick: () => setGraphMode(mode === "fullscreen" ? "panel" : "fullscreen"),
					children: mode === "fullscreen" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minimize2, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Maximize2, { size: 14 })
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
			data.nodes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, {
						size: 16,
						className: "mb-3 text-[var(--text-muted)] opacity-40"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[13px] font-medium text-[var(--text-secondary)]",
						children: "No linked notes"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 max-w-[240px] text-[12px] leading-snug text-[var(--text-muted)]",
						children: "Add [[wikilinks]] between notes to map structure."
					})
				]
			}) : null
		]
	});
}
function RightPanel() {
	const rightOpen = useVaultStore((s) => s.settings.rightOpen);
	const rightWidth = useVaultStore((s) => s.settings.rightWidth);
	const graphMode = useVaultStore((s) => s.settings.graphMode);
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const nodes = useVaultStore((s) => s.nodes);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const setRightOpen = useVaultStore((s) => s.setRightOpen);
	const [tab, setTab] = (0, import_react.useState)("backlinks");
	const note = activeNoteId ? nodes[activeNoteId] : null;
	const backlinks = (0, import_react.useMemo)(() => {
		if (!note || note.kind !== "note") return [];
		return getBacklinks(note, nodes);
	}, [note, nodes]);
	const outline = (0, import_react.useMemo)(() => {
		if (!note || note.kind !== "note") return [];
		return extractOutline(note.content ?? "");
	}, [note]);
	if (graphMode === "fullscreen") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-[var(--bg-deepest)]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GraphView, {
			mode: "fullscreen",
			className: "h-full"
		})
	});
	if (!rightOpen) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		className: "fixed inset-0 z-20 bg-black/50 lg:hidden",
		"aria-label": "Close panel",
		onClick: () => setRightOpen(false)
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "panel-slide glass-panel absolute inset-y-0 right-0 z-30 flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[rgba(15,15,18,0.94)] lg:relative lg:z-0 lg:bg-[rgba(15,15,18,0.78)]",
		style: { width: Math.min(rightWidth, 360) },
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-1 border-b border-[var(--border)] p-2",
			children: [[
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
				]
			].map(([id, Icon, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: cn("chip-btn flex-1 justify-center", tab === id && "is-active"),
				onClick: () => setTab(id),
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
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-h-0 flex-1 overflow-y-auto",
			children: [
				tab === "backlinks" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
						children: "Linked mentions"
					}), backlinks.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-[12px] border border-dashed border-[var(--border)] px-3 py-6 text-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] text-[var(--text-secondary)]",
							children: "No backlinks yet"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[11.5px] leading-snug text-[var(--text-muted)]",
							children: "Other notes that [[mention this]] will appear here."
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "flex flex-col gap-1",
						children: backlinks.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "tree-row w-full rounded-[10px] px-2.5 py-2 text-left hover:bg-white/[0.05]",
							onClick: () => setActiveNote(b.fromId),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[13px] font-medium text-[var(--text-primary)]",
								children: b.fromTitle || noteTitle({
									name: b.fromPath,
									kind: "note"
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-0.5 line-clamp-2 text-[11.5px] text-[var(--text-muted)]",
								children: b.context
							})]
						}) }, b.fromId))
					})]
				}) : null,
				tab === "outline" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "p-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]",
						children: "Outline"
					}), outline.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-[12px] border border-dashed border-[var(--border)] px-3 py-6 text-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[13px] text-[var(--text-secondary)]",
							children: "No headings"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-[11.5px] text-[var(--text-muted)]",
							children: "Use # headings to structure the note."
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "flex flex-col gap-0.5",
						children: outline.map((h, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "truncate rounded-md px-2 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
							style: { paddingLeft: 8 + (h.level - 1) * 12 },
							children: h.text
						}, i))
					})]
				}) : null,
				tab === "graph" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex h-[min(420px,50vh)] min-h-[280px] flex-col",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GraphView, {
						mode: "panel",
						className: "h-full min-h-[280px]"
					})
				}) : null
			]
		})]
	})] });
}
/** Cached Fuse index — rebuilt only when vault note set changes */
var cachedKey = "";
var cachedFuse = null;
var cachedDocs = [];
function vaultKey(nodes) {
	return Object.values(nodes).filter((n) => n.kind === "note").map((n) => `${n.id}:${n.mtime}:${(n.content ?? "").length}`).sort().join("|");
}
function getFuse(nodes) {
	const key = vaultKey(nodes);
	if (cachedFuse && cachedKey === key) return cachedFuse;
	cachedDocs = Object.values(nodes).filter((n) => n.kind === "note").map((n) => ({
		id: n.id,
		path: n.path,
		title: noteTitle(n),
		content: n.content ?? ""
	}));
	cachedFuse = new entry_default(cachedDocs, {
		keys: [
			{
				name: "title",
				weight: .55
			},
			{
				name: "path",
				weight: .2
			},
			{
				name: "content",
				weight: .25
			}
		],
		threshold: .38,
		includeScore: true,
		ignoreLocation: true,
		minMatchCharLength: 1
	});
	cachedKey = key;
	return cachedFuse;
}
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
	return getFuse(nodes).search(q, { limit }).map((r) => {
		const score = 1 - (r.score ?? 0);
		const titleHit = r.item.title.toLowerCase().includes(q.toLowerCase());
		const snippet = titleHit ? previewSnippet(r.item.content, 100) : extractSnippet(r.item.content, q);
		return {
			noteId: r.item.id,
			path: r.item.path,
			title: r.item.title,
			snippet,
			score,
			matchType: titleHit ? "title" : "content"
		};
	});
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
function CommandPalette() {
	const open = useVaultStore((s) => s.commandOpen);
	const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
	const nodes = useVaultStore((s) => s.nodes);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const createNote = useVaultStore((s) => s.createNote);
	const toggleEditorMode = useVaultStore((s) => s.toggleEditorMode);
	const toggleGraphFullscreen = useVaultStore((s) => s.toggleGraphFullscreen);
	const openDemoVault = useVaultStore((s) => s.openDemoVault);
	const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
	const simulateHermesWrite = useVaultStore((s) => s.simulateHermesWrite);
	const editorMode = useVaultStore((s) => s.settings.editorMode);
	const [query, setQuery] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		if (!open) setQuery("");
	}, [open]);
	const hits = (0, import_react.useMemo)(() => searchVault(nodes, query, 16), [nodes, query]);
	if (!open) return null;
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
							className: "text-[var(--accent)]"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Input, {
							value: query,
							onValueChange: setQuery,
							placeholder: "Search notes or run a command…",
							className: "h-12 w-full bg-transparent text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]",
							autoFocus: true
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
							className: "rounded-md border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]",
							children: "ESC"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.List, {
					className: "max-h-[min(460px,54vh)] overflow-y-auto p-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Empty, {
							className: "px-3 py-10 text-center",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "text-[13px] text-[var(--text-muted)]",
								children: "No matching notes"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "mt-3 text-[12.5px] text-[var(--accent)] hover:underline",
								onClick: () => {
									createNote(null, query || "Untitled");
									setCommandOpen(false);
								},
								children: [
									"Create “",
									query || "Untitled",
									"”"
								]
							})]
						}),
						hits.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
							heading: query ? "Notes" : "Recent",
							className: "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]",
							children: hits.map((h) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
								value: h.noteId + h.title,
								onSelect: () => {
									setActiveNote(h.noteId);
									setCommandOpen(false);
								},
								className: cn("cmdk-item flex cursor-pointer items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] aria-selected:text-[var(--text-primary)]"),
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
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Group, {
							heading: "Actions",
							className: "mt-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Action, {
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePlus, { size: 15 }),
									label: "New note",
									shortcut: "⌘N",
									onSelect: () => {
										createNote(null);
										setCommandOpen(false);
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Action, {
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { size: 15 }),
									label: "Open folder as vault",
									onSelect: () => {
										openFolderAsVault();
										setCommandOpen(false);
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Action, {
									icon: editorMode === "visual" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodeXml, { size: 15 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 15 }),
									label: editorMode === "visual" ? "Switch to source mode" : "Switch to visual mode",
									shortcut: "⌘E",
									onSelect: () => {
										toggleEditorMode();
										setCommandOpen(false);
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Action, {
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, { size: 15 }),
									label: "Toggle full graph",
									shortcut: "⌘G",
									onSelect: () => {
										toggleGraphFullscreen();
										setCommandOpen(false);
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Action, {
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { size: 15 }),
									label: "Open demo vault",
									onSelect: () => {
										openDemoVault();
										setCommandOpen(false);
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Action, {
									icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, { size: 15 }),
									label: "Simulate Hermes write",
									onSelect: () => {
										simulateHermesWrite();
										setCommandOpen(false);
									}
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3 border-t border-[var(--border)] px-3 py-2 text-[10.5px] text-[var(--text-muted)]",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Keyboard, {
							size: 12,
							className: "text-[var(--text-muted)]"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "↑↓ navigate" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "↵ open" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "ml-auto",
							children: "⌘K anytime"
						})
					]
				})
			]
		})
	});
}
function Action({ icon, label, onSelect, shortcut }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(_e.Item, {
		onSelect,
		className: "cmdk-item flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] text-[var(--text-secondary)] aria-selected:text-[var(--text-primary)]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[var(--text-muted)]",
				children: icon
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "flex-1",
				children: label
			}),
			shortcut ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", {
				className: "rounded border border-[var(--border)] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]",
				children: shortcut
			}) : null
		]
	});
}
var PROVIDERS = [
	"dropbox",
	"google",
	"onedrive"
];
function WelcomeScreen() {
	const openFolderAsVault = useVaultStore((s) => s.openFolderAsVault);
	const openDemoVault = useVaultStore((s) => s.openDemoVault);
	const reopenRecentVault = useVaultStore((s) => s.reopenRecentVault);
	const connecting = useVaultStore((s) => s.connecting);
	const recentVaults = useVaultStore((s) => s.recentVaults);
	const cloudSession = useVaultStore((s) => s.cloudSession);
	const setToast = useVaultStore((s) => s.setToast);
	const refreshCloudSession = useVaultStore((s) => s.refreshCloudSession);
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
				className: "relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-1 flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.28)] bg-[linear-gradient(145deg,#1a1e28_0%,#0a0c12_55%,#05070c_100%)] shadow-[0_4px_16px_rgba(0,0,0,0.45),0_0_28px_rgba(0,200,255,0.16)]",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusMark, {
								size: 36,
								className: "text-[var(--text-primary)]"
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusWordmark, {
								size: "md",
								showMark: false
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-0.5 text-[12.5px] font-medium tracking-[0.02em] text-[var(--accent)]",
								children: NEXUS_TAGLINE
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-6 max-w-xl text-[clamp(1.85rem,4vw,2.65rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--text-primary)]",
						children: "Your second brain, in plain Markdown."
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
							" files Hermes can edit. Visual editor, live graph, progressive power."
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-8 flex flex-wrap gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "primary-btn min-h-11",
							disabled: connecting,
							onClick: () => void openFolderAsVault(),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { size: 16 }), connecting ? "Opening…" : "Open folder as vault"]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "ghost-btn min-h-11",
							onClick: () => openDemoVault(),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, {
								size: 16,
								className: "text-[var(--accent-violet)]"
							}), "Explore demo vault"]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-[12.5px] text-[var(--text-muted)]",
						children: "Your vault is a normal folder. No proprietary database. No sign-in."
					}),
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
								title: "Hermes-ready",
								body: "External writes appear within ~1 second via live watch."
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
										children: "Cloud via synced folders"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]",
										children: CLOUD_SYNC_HINT
									}),
									cloudSession ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-2 text-[12px] text-[var(--success)]",
										children: ["Preference: ", cloudSession.label]
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 flex flex-wrap gap-2",
										children: [PROVIDERS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "chip-btn",
											onClick: () => {
												preferSyncedProvider(p);
												refreshCloudSession();
												setToast(providerSyncHint(p));
											},
											title: providerSyncHint(p),
											children: providerLabel(p)
										}, p)), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											className: "chip-btn is-active",
											onClick: () => void openFolderAsVault(),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { size: 13 }), "Open synced folder"]
										})]
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
									else if (r.mode === "fsa") reopenRecentVault(r.id);
									else openDemoVault();
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardDrive, {
									size: 14,
									className: "text-[var(--accent)]"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "truncate text-[13px] font-medium",
										children: r.name
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "truncate text-[11px] text-[var(--text-muted)]",
										children: [
											r.path,
											" · ",
											r.mode === "fsa" ? "local folder" : r.mode
										]
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
	(0, import_react.useEffect)(() => {
		if (open) setCustomDraft(prefs.accentCustom);
	}, [open, prefs.accentCustom]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		const onKey = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				setOpen(false);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
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
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": titleId,
			className: "glass-elevated relative z-10 flex max-h-[min(720px,90dvh)] w-full max-w-[440px] flex-col overflow-hidden rounded-[18px] border border-[var(--border)] shadow-[var(--shadow-elevated)]",
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
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
							label: "Confirm before delete",
							description: "Ask before removing notes or folders",
							checked: prefs.confirmDelete,
							onChange: (v) => updatePrefs({ confirmDelete: v })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, {
							className: "mt-3",
							label: "Open last vault on launch",
							description: "Restore your previous local folder when possible",
							checked: prefs.openLastVault,
							onChange: (v) => updatePrefs({ openLastVault: v })
						})]
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
		this.suppressUntil = Date.now() + 600;
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
		if (!vaultId) return;
		const apply = () => {
			const w = window.innerWidth;
			if (w < 900) {
				setLeftOpen(false);
				setRightOpen(false);
			} else if (w < 1200) {
				setRightOpen(false);
				setLeftOpen(true);
			} else {
				setLeftOpen(true);
				setRightOpen(true);
			}
		};
		apply();
	}, [vaultId]);
	(0, import_react.useEffect)(() => {
		const watcher = new VaultWatcher();
		watcherRef.current = watcher;
		if (mode === "fsa" && getFsaRoot()) {
			const dir = getFsaRoot();
			setWatcherAck((d) => watcher.acknowledgeWrite(d));
			watcher.startFsa(dir, (ev) => {
				if (ev.scan) applyExternalSnapshot(ev.scan.nodes, ev.scan.rootIds);
			});
		} else if (vaultId) {
			setWatcherAck(null);
			watcher.start(() => vaultContentHash(useVaultStore.getState().nodes), () => {}, 1e3);
		}
		return () => {
			setWatcherAck(null);
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
