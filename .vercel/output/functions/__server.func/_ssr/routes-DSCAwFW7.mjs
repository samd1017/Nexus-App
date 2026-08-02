import { r as __toESM } from "../_runtime.mjs";
import { r as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { A as HardDrive, B as Cloud, C as Link2, D as Heading3, E as Image, F as FilePlus, H as ChevronDown, I as FilePlus2, L as Eye, M as FolderPlus, N as FolderOpen, O as Heading2, P as FileText, R as Ellipsis, S as ListChecks, T as Italic, U as Bold, V as ChevronRight, _ as Maximize2, a as Sparkles, b as ListTree, c as Quote, d as PanelRightOpen, f as PanelRightClose, g as Minimize2, h as Minus, i as Table, j as Folder, k as Heading1, l as Plus, m as Network, o as Search, p as PanelLeftClose, r as Trash2, s as Radio, t as Zap, u as Pencil, v as LogOut, w as Keyboard, x as ListOrdered, y as List, z as CodeXml } from "../_libs/lucide-react.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
import { t as marked } from "../_libs/marked.mjs";
import { t as TurndownService } from "../_libs/turndown.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
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
import { t as forceGraph } from "../_libs/force-graph+[...].mjs";
import { t as _e } from "../_libs/cmdk.mjs";
import { t as entry_default } from "../_libs/fuse.js.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-DSCAwFW7.js
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
/** Seed knowledge vault — SpaceX-inspired knowledge OS demo content */
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
	const welcome = add(note("Welcome.md", "Welcome.md", null, `# Welcome to Note App

A personal knowledge vault built for **clarity**, **speed**, and **Hermes-compatible** plain Markdown.

## What this is

- Your vault is a **folder of \`.md\` files** — nothing proprietary
- The default editor is **visual / WYSIWYG** with clean round-trip Markdown
- \`[[wikilinks]]\` render as interactive pills and stay standard on disk
- An interactive **graph** reveals the shape of your thinking

## Quick start

1. Browse the file tree on the left
2. Open [[Knowledge OS]] or [[Graph Thinking]]
3. Press **⌘K** to search · **⌘E** for source mode · **⌘\\\\** to toggle sidebars
4. Explore the graph in the right panel — expand to full canvas

## Hermes-ready

External agents can create, edit, and delete notes in this folder. Changes appear live within ~1–2 seconds.

Try the **Simulate Hermes write** action in the vault menu to watch an external edit land.

---

*This is a demo vault. Open any local folder to use your own files.*
`));
	add(note(pathJoin("Projects", "Knowledge OS.md"), "Knowledge OS.md", projects.id, `# Knowledge OS

The next decade of personal knowledge software is not another notes app — it is a **knowledge operating system**.

## Principles

1. **Files first** — the vault is the source of truth
2. **Agent-native** — [[Hermes Compatibility]] means machines write the same files you do
3. **Spatial memory** — the [[Graph Thinking]] view is first-class, not a gimmick
4. **Calm writing surface** — complexity lives in progressive disclosure

## Architecture sketch

| Layer | Role |
| --- | --- |
| Vault folder | Plain \`.md\` + \`assets/\` |
| Index cache | Optional \`.noteapp/\` only |
| Editor | Visual default, source on demand |
| Graph | Force-directed map of [[wikilinks]] |

## Related

- [[Welcome]]
- [[Design Language]]
- [[Linking Strategy]]
`));
	add(note(pathJoin("Projects", "Linking Strategy.md"), "Linking Strategy.md", projects.id, `# Linking Strategy

Wikilinks are the connective tissue of the vault.

## Syntax

Use standard double-bracket links:

\`\`\`
[[Note Name]]
[[Note Name|display alias]]
\`\`\`

## Rules of thumb

- Prefer **concept notes** over dumping everything in daily logs
- Link **forward** when you introduce a new idea
- Review **backlinks** weekly — they surface unexpected structure

## Map

- [[Knowledge OS]]
- [[Graph Thinking]]
- [[Welcome]]
`));
	add(note(pathJoin("Research", "Graph Thinking.md"), "Graph Thinking.md", research.id, `# Graph Thinking

Graphs make invisible structure **visible**.

## Why force-directed graphs work

Nodes repel; links attract. Over time, tightly related notes cluster. Orphans float. Hubs dominate.

### Visual language

- **Accent cyan** nodes with soft outer glow
- **Size by degree** — highly connected notes read as gravity wells
- **Edges** stay low-opacity so the field stays calm

## Interaction model

- Hover → title + preview
- Click → open note
- Drag / zoom / pan for spatial exploration
- Panel mode for context; fullscreen for deep work

## Seed links

- [[Knowledge OS]]
- [[Linking Strategy]]
- [[Design Language]]
- [[Hermes Compatibility]]
`));
	add(note(pathJoin("Research", "Design Language.md"), "Design Language.md", research.id, `# Design Language

Inspired by high-precision engineering interfaces — dark, confident, technically sophisticated.

## Palette

- Deepest background \`#050507\`
- Surfaces \`#0F0F12\` → \`#1C1C21\`
- Accent electric cyan \`#00C8FF\`
- Soft violet secondary \`#7B61FF\`

## Glass

Floating panels use translucent surfaces with \`backdrop-filter: blur(24px)\` and hairline borders.

## Motion

- 220–280ms ease curves
- Restrained scale on hover (\`1.02\`)
- Graph physics should feel like soft springs — never chaotic

## Related

- [[Knowledge OS]]
- [[Welcome]]
`));
	add(note(pathJoin("Systems", "Hermes Compatibility.md"), "Hermes Compatibility.md", systems.id, `# Hermes Compatibility

Hermes (and any external process) must be able to treat this vault as ordinary files.

## Contract

- Notes = \`.md\` files
- Folders = directories
- Images = relative paths (prefer \`assets/\`)
- No proprietary metadata inside note bodies
- App cache only under \`.noteapp/\`

## Live watching

Creates, edits, renames, and deletes from outside the app must appear in the UI within **1–2 seconds**.

## Clean Markdown

When the app writes a note, the result must remain readable by:

- Any text editor
- \`git diff\`
- Agents and CLI tools

## Linked ideas

- [[Knowledge OS]]
- [[Welcome]]
- [[Graph Thinking]]
`));
	add(note(pathJoin("Systems", "Keyboard Map.md"), "Keyboard Map.md", systems.id, `# Keyboard Map

| Shortcut | Action |
| --- | --- |
| ⌘K | Command palette / search |
| ⌘E | Toggle visual / source |
| ⌘\\\\ | Toggle left sidebar |
| ⌘⌥\\\\ | Toggle right panel |
| ⌘G | Toggle full graph |
| ⌘N | New note |
| ⌘S | Save (auto-save is on) |
| ⌘B / ⌘I | Bold / italic in editor |

## Philosophy

Keyboard is the primary interface for power users. Mouse is always available; shortcuts never required for basics.
`));
	add(note(pathJoin("Journal", "First Light.md"), "First Light.md", journal.id, `# First Light

Opened the vault for the first time.

The graph already shows structure forming between [[Knowledge OS]], [[Graph Thinking]], and [[Hermes Compatibility]]. That feedback loop — write, link, see — is the product.

## Tasks

- [x] Seed demo notes
- [x] Wire wikilinks
- [ ] Capture a real research thread
- [ ] Attach a diagram to assets/

## Log

Felt immediate. Calm center, powerful edges.
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

This note was written by an **external process** (simulated Hermes agent).

Timestamp: \${TS}

## Observation

The filesystem watcher picked this up without manual refresh. The vault remains a plain folder of Markdown.

## Links

- [[Hermes Compatibility]]
- [[Knowledge OS]]
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
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function formatRelativeTime(ts) {
	const diff = Date.now() - ts;
	const sec = Math.floor(diff / 1e3);
	if (sec < 5) return "just now";
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	return `${Math.floor(hr / 24)}d ago`;
}
function slugifyTitle(title) {
	return title.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 120);
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
var PREF_KEY = "noteapp-cloud-pref-v2";
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
var CLOUD_SYNC_HINT = "Best path: enable Dropbox / Drive / OneDrive desktop sync, then Open folder as vault. Zero accounts in Note App. Notes stay ordinary Markdown.";
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
		if (fsaSupported) {
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
				lastNotePath: welcome?.path ?? null
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
			recentVaults: recents
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
					lastNotePath: first?.path ?? null
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
		fsaRoot = null;
		clearDirectoryHandle();
		set({
			vaultId: null,
			vaultName: "",
			vaultPath: "",
			nodes: {},
			rootIds: [],
			activeNoteId: null,
			dirtyNoteIds: [],
			lastExternalSync: null
		});
	},
	setActiveNote: (id) => {
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
	setEditorMode: (mode) => set({ settings: {
		...get().settings,
		editorMode: mode
	} }),
	setGraphMode: (mode) => set({ settings: {
		...get().settings,
		graphMode: mode
	} }),
	toggleEditorMode: () => {
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
		const oldPath = node.path;
		const nodes = { ...get().nodes };
		nodes[id] = {
			...node,
			name,
			path: newPath,
			mtime: Date.now()
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
/** macOS-style window chrome with traffic lights + vault status */
function TitleBar() {
	const vaultName = useVaultStore((s) => s.vaultName);
	const mode = useVaultStore((s) => s.mode);
	const lastExternalSync = useVaultStore((s) => s.lastExternalSync);
	const vaultId = useVaultStore((s) => s.vaultId);
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
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[13px] font-semibold tracking-tight text-[var(--text-primary)]",
						children: "Note App"
					}), vaultName ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[var(--text-muted)]",
						children: "·"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-[12.5px] text-[var(--text-secondary)]",
						children: vaultName
					})] }) : null]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "titlebar-no-drag ml-auto flex items-center gap-2",
				children: !vaultId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
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
				})
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
			if (mod && e.key.toLowerCase() === "k") {
				e.preventDefault();
				store.setCommandOpen(!store.commandOpen);
				return;
			}
			if (e.key === "Escape") {
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
	const onOpen = () => {
		if (node.kind === "folder") toggleFolder(node.id);
		else setActiveNote(node.id);
	};
	const commitRename = () => {
		setRenaming(false);
		if (nameDraft.trim() && nameDraft !== node.name) renameNode(node.id, nameDraft.trim());
		else setNameDraft(node.name);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("tree-item group relative", isActive && "is-active"),
		style: { paddingLeft: 8 + depth * 14 },
		onClick: onOpen,
		onDoubleClick: (e) => {
			e.stopPropagation();
			setRenaming(true);
			setNameDraft(node.kind === "note" ? noteTitle(node) : node.name);
		},
		role: "treeitem",
		"aria-expanded": node.kind === "folder" ? expanded : void 0,
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
				className: "shrink-0 text-[var(--text-muted)]"
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
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "icon-btn h-6 w-6",
					onClick: (e) => {
						e.stopPropagation();
						setMenuOpen((v) => !v);
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
* Visual editor with purity-preserving autosave:
* - Hermes/external content is loaded as-is
* - Disk writes only when user edits change semantic content
* - Serialization noise never rewrites on-disk Markdown
*/
function VisualEditor({ noteId, content }) {
	const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const saveTimer = (0, import_react.useRef)(null);
	const lastNoteId = (0, import_react.useRef)(noteId);
	const applying = (0, import_react.useRef)(false);
	/** Baseline markdown last loaded from store/disk (Hermes-safe) */
	const baselineMd = (0, import_react.useRef)(content);
	const userEdited = (0, import_react.useRef)(false);
	const editor = useEditor({
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
		editorProps: { attributes: { class: "note-editor min-h-[50vh] focus:outline-none" } },
		onUpdate: ({ editor: ed }) => {
			if (applying.current) return;
			userEdited.current = true;
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => {
				const root = ed.view.dom;
				const serialized = htmlDocToMarkdown(root);
				const prev = useVaultStore.getState().nodes[noteId]?.content ?? baselineMd.current;
				if (isOnlySerializationNoise(prev, serialized)) return;
				const md = preferCleanWrite(prev, serialized);
				if (md === prev) return;
				baselineMd.current = md;
				updateNoteContent(noteId, md);
			}, 400);
		}
	});
	(0, import_react.useEffect)(() => {
		if (!editor) return;
		const switched = lastNoteId.current !== noteId;
		lastNoteId.current = noteId;
		if (!switched) {
			if (userEdited.current) {
				const root = editor.view.dom;
				const current = htmlDocToMarkdown(root);
				if (!isOnlySerializationNoise(current, content) && current !== content) {}
				if (isOnlySerializationNoise(baselineMd.current, content)) return;
			}
			if (isOnlySerializationNoise(baselineMd.current, content)) return;
		}
		applying.current = true;
		userEdited.current = false;
		baselineMd.current = content;
		const html = markdownWithWikilinksToHtml(content || "");
		editor.commands.setContent(html, { emitUpdate: false });
		requestAnimationFrame(() => {
			editor.view.dom.querySelectorAll("span[data-wikilink]").forEach((pill) => {
				const hit = resolveWikilink(pill.getAttribute("data-wikilink") || "", useVaultStore.getState().nodes);
				pill.classList.toggle("is-missing", !hit);
			});
			applying.current = false;
		});
	}, [
		editor,
		noteId,
		content
	]);
	(0, import_react.useEffect)(() => {
		return () => {
			if (saveTimer.current) clearTimeout(saveTimer.current);
		};
	}, []);
	if (!editor) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex h-40 items-center justify-center text-[var(--text-muted)]",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-5 w-5 animate-pulse rounded-md bg-[rgba(0,200,255,0.2)]" })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fade-in flex h-full min-h-0 flex-col",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditorToolbar, { editor }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-10 md:py-6",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto max-w-[720px]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditorContent, { editor })
			})
		})]
	});
}
/** Raw Markdown source — writes only when text actually changes */
function SourceEditor({ noteId, content }) {
	const updateNoteContent = useVaultStore((s) => s.updateNoteContent);
	const timer = (0, import_react.useRef)(null);
	const ref = (0, import_react.useRef)(null);
	const lastId = (0, import_react.useRef)(noteId);
	(0, import_react.useEffect)(() => {
		if (!ref.current) return;
		const switched = lastId.current !== noteId;
		lastId.current = noteId;
		if (switched || document.activeElement !== ref.current) ref.current.value = content;
	}, [noteId, content]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fade-in h-full min-h-0 overflow-y-auto px-6 py-4 md:px-10 md:py-6",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mx-auto max-w-[720px]",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
				ref,
				className: "source-editor",
				defaultValue: content,
				spellCheck: false,
				onChange: (e) => {
					const val = e.target.value;
					if (timer.current) clearTimeout(timer.current);
					timer.current = setTimeout(() => {
						const prev = useVaultStore.getState().nodes[noteId]?.content ?? "";
						const next = preferCleanWrite(prev, val);
						if (next !== prev) updateNoteContent(noteId, next);
					}, 220);
				},
				"aria-label": "Markdown source"
			})
		})
	});
}
function EditorPane() {
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const nodes = useVaultStore((s) => s.nodes);
	const editorMode = useVaultStore((s) => s.settings.editorMode);
	const graphMode = useVaultStore((s) => s.settings.graphMode);
	const rightOpen = useVaultStore((s) => s.settings.rightOpen);
	const mode = useVaultStore((s) => s.mode);
	const toggleGraphFullscreen = useVaultStore((s) => s.toggleGraphFullscreen);
	const setRightOpen = useVaultStore((s) => s.setRightOpen);
	const renameNode = useVaultStore((s) => s.renameNode);
	const createNote = useVaultStore((s) => s.createNote);
	const setCommandOpen = useVaultStore((s) => s.setCommandOpen);
	const setEditorMode = useVaultStore((s) => s.setEditorMode);
	const note = activeNoteId ? nodes[activeNoteId] : null;
	const crumbs = (0, import_react.useMemo)(() => getBreadcrumbs(note ?? null, nodes), [note, nodes]);
	if (!note || note.kind !== "note") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fade-in flex h-full flex-col items-center justify-center px-8 text-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.25)] bg-[rgba(0,200,255,0.08)] text-[var(--accent)] shadow-[0_0_40px_rgba(0,200,255,0.12)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Eye, { size: 28 })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "text-[22px] font-semibold tracking-tight",
				children: "Select a note"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 max-w-sm text-[14px] leading-relaxed text-[var(--text-secondary)]",
				children: "Choose a file from the vault, search with ⌘K, or create a note. Writing surface stays calm — power features live in the edges."
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex h-full min-w-0 flex-1 flex-col bg-[var(--bg-deepest)]",
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
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: "w-full bg-transparent text-[15px] font-semibold tracking-tight text-[var(--text-primary)] outline-none",
					defaultValue: getNoteDisplayTitle(note),
					onBlur: (e) => {
						const v = e.target.value.trim();
						if (v && v !== getNoteDisplayTitle(note)) renameNode(note.id, v);
					},
					onKeyDown: (e) => {
						if (e.key === "Enter") e.target.blur();
					},
					"aria-label": "Note title"
				}, note.id)]
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
		}), editorMode === "visual" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VisualEditor, {
			noteId: note.id,
			content: note.content ?? ""
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceEditor, {
			noteId: note.id,
			content: note.content ?? ""
		})]
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
function paintPremiumNode(node, ctx, globalScale, activeId, mode) {
	if (node.x == null || node.y == null) return;
	const isActive = node.id === activeId;
	const isHub = node.degree >= 3;
	const r = 3.2 + Math.sqrt(node.val) * (mode === "fullscreen" ? 3.4 : 2.6);
	const fontSize = Math.max((mode === "fullscreen" ? 12 : 10.5) / globalScale, 2.2);
	const outerR = r * (isActive ? 4.2 : isHub ? 3.4 : 2.8);
	const bloom = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, outerR);
	if (isActive) {
		bloom.addColorStop(0, "rgba(0,200,255,0.55)");
		bloom.addColorStop(.35, "rgba(0,200,255,0.18)");
		bloom.addColorStop(.7, "rgba(123,97,255,0.08)");
		bloom.addColorStop(1, "rgba(0,200,255,0)");
	} else if (isHub) {
		bloom.addColorStop(0, "rgba(123,97,255,0.28)");
		bloom.addColorStop(.5, "rgba(0,200,255,0.1)");
		bloom.addColorStop(1, "rgba(0,0,0,0)");
	} else {
		bloom.addColorStop(0, "rgba(0,200,255,0.22)");
		bloom.addColorStop(.55, "rgba(0,200,255,0.06)");
		bloom.addColorStop(1, "rgba(0,0,0,0)");
	}
	ctx.fillStyle = bloom;
	ctx.beginPath();
	ctx.arc(node.x, node.y, outerR, 0, Math.PI * 2);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(node.x, node.y, r + 1.6 / globalScale, 0, Math.PI * 2);
	ctx.strokeStyle = isActive ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)";
	ctx.lineWidth = 1 / globalScale;
	ctx.stroke();
	const core = ctx.createRadialGradient(node.x - r * .3, node.y - r * .35, 0, node.x, node.y, r);
	if (isActive) {
		core.addColorStop(0, "#c8f7ff");
		core.addColorStop(.4, "#00d4ff");
		core.addColorStop(1, "#0088b8");
	} else if (isHub) {
		core.addColorStop(0, "#b8a8ff");
		core.addColorStop(.45, "#7b61ff");
		core.addColorStop(1, "#4a38b0");
	} else {
		core.addColorStop(0, "#7ae8ff");
		core.addColorStop(.5, "#00b4e6");
		core.addColorStop(1, "#007a9e");
	}
	ctx.beginPath();
	ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
	ctx.fillStyle = core;
	ctx.shadowColor = isActive ? "rgba(0,200,255,0.9)" : isHub ? "rgba(123,97,255,0.55)" : "rgba(0,200,255,0.45)";
	ctx.shadowBlur = isActive ? 26 : isHub ? 16 : 10;
	ctx.fill();
	ctx.shadowBlur = 0;
	ctx.beginPath();
	ctx.arc(node.x - r * .28, node.y - r * .3, r * .28, 0, Math.PI * 2);
	ctx.fillStyle = "rgba(255,255,255,0.35)";
	ctx.fill();
	if (globalScale > .45 || isActive || mode === "fullscreen") {
		ctx.font = `${isActive ? 600 : 500} ${fontSize}px Inter, system-ui, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		ctx.fillStyle = isActive ? "rgba(248,248,252,0.98)" : "rgba(230,230,238,0.82)";
		ctx.shadowColor = "rgba(0,0,0,0.65)";
		ctx.shadowBlur = 4;
		ctx.fillText(node.name, node.x, node.y + r + 3.5);
		ctx.shadowBlur = 0;
	}
}
function linkIds(link) {
	return [typeof link.source === "object" ? link.source.id : String(link.source), typeof link.target === "object" ? link.target.id : String(link.target)];
}
function GraphView({ mode, className }) {
	const hostRef = (0, import_react.useRef)(null);
	const graphRef = (0, import_react.useRef)(null);
	const activeRef = (0, import_react.useRef)(null);
	const nodes = useVaultStore((s) => s.nodes);
	const activeNoteId = useVaultStore((s) => s.activeNoteId);
	const setActiveNote = useVaultStore((s) => s.setActiveNote);
	const setGraphMode = useVaultStore((s) => s.setGraphMode);
	const [tooltip, setTooltip] = (0, import_react.useState)(null);
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
		if (!hostRef.current) return;
		const graph = new forceGraph(hostRef.current).backgroundColor("rgba(0,0,0,0)").nodeId("id").nodeLabel(() => "").nodeVal("val").nodeRelSize(5).linkColor((link) => {
			const [s, t] = linkIds(link);
			const active = activeRef.current;
			if (active && (s === active || t === active)) return "rgba(0, 200, 255, 0.5)";
			return mode === "fullscreen" ? "rgba(0, 200, 255, 0.18)" : "rgba(0, 200, 255, 0.12)";
		}).linkWidth((link) => {
			const [s, t] = linkIds(link);
			const active = activeRef.current;
			if (active && (s === active || t === active)) return mode === "fullscreen" ? 1.8 : 1.4;
			return mode === "fullscreen" ? 1.05 : .85;
		}).linkDirectionalParticles(mode === "fullscreen" ? 2 : 1).linkDirectionalParticleWidth(1.6).linkDirectionalParticleSpeed(.0055).linkDirectionalParticleColor(() => "rgba(0,220,255,0.7)").enableNodeDrag(true).cooldownTicks(140).d3AlphaDecay(.022).d3VelocityDecay(.32).nodeCanvasObject((node, ctx, globalScale) => {
			paintPremiumNode(node, ctx, globalScale, activeRef.current, mode);
		}).nodePointerAreaPaint((node, color, ctx) => {
			const n = node;
			if (n.x == null || n.y == null) return;
			const r = 6 + Math.sqrt(n.val) * 3;
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
			ctx.fill();
		}).onNodeHover((node) => {
			if (!hostRef.current) return;
			if (!node) {
				setTooltip(null);
				hostRef.current.style.cursor = "grab";
				return;
			}
			const n = node;
			hostRef.current.style.cursor = "pointer";
			if (n.x == null || n.y == null) return;
			const coords = graph.graph2ScreenCoords(n.x, n.y);
			setTooltip({
				x: coords.x,
				y: coords.y,
				title: n.name,
				path: n.path,
				preview: n.preview,
				degree: n.degree
			});
		}).onNodeClick((node) => {
			if (!node) return;
			setActiveNote(node.id);
		}).onBackgroundClick(() => setTooltip(null));
		try {
			graph.d3Force("charge")?.strength?.(mode === "fullscreen" ? -180 : -120);
			graph.d3Force("link")?.distance?.(mode === "fullscreen" ? 72 : 48);
		} catch {}
		graphRef.current = graph;
		const ro = new ResizeObserver(() => {
			if (!hostRef.current || !graphRef.current) return;
			const { width, height } = hostRef.current.getBoundingClientRect();
			graphRef.current.width(width).height(height);
		});
		ro.observe(hostRef.current);
		const { width, height } = hostRef.current.getBoundingClientRect();
		graph.width(width).height(height);
		return () => {
			ro.disconnect();
			if (hostRef.current) hostRef.current.innerHTML = "";
			graphRef.current = null;
		};
	}, [setActiveNote, mode]);
	(0, import_react.useEffect)(() => {
		if (!graphRef.current) return;
		graphRef.current.graphData(data);
	}, [data]);
	(0, import_react.useEffect)(() => {
		if (!graphRef.current) return;
		graphRef.current.nodeCanvasObject((node, ctx, globalScale) => {
			paintPremiumNode(node, ctx, globalScale, activeNoteId, mode);
		}).linkColor((link) => {
			const [s, t] = linkIds(link);
			if (activeNoteId && (s === activeNoteId || t === activeNoteId)) return "rgba(0, 200, 255, 0.5)";
			return mode === "fullscreen" ? "rgba(0, 200, 255, 0.18)" : "rgba(0, 200, 255, 0.12)";
		});
	}, [activeNoteId, mode]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("graph-host relative flex min-h-0 flex-col", mode === "fullscreen" && "bg-[radial-gradient(ellipse_at_center,rgba(12,16,22)_0%,#050507_68%)]", className),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "pointer-events-none absolute inset-0 opacity-[0.04]",
				style: {
					backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
					backgroundSize: "28px 28px"
				}
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "absolute left-3 right-3 top-3 z-10 flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(10,10,12,0.82)] px-3 py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.35)] backdrop-blur-md",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Network, {
						size: 13,
						className: "text-[var(--accent)]"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[11px] font-medium tracking-wide text-[var(--text-secondary)]",
						children: [
							data.nodes.length,
							" notes",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mx-1.5 text-[var(--text-muted)]",
								children: "·"
							}),
							data.links.length,
							" links"
						]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "icon-btn glass-panel pointer-events-auto h-8 w-8",
					title: mode === "fullscreen" ? "Exit fullscreen graph" : "Expand graph",
					onClick: () => setGraphMode(mode === "fullscreen" ? "panel" : "fullscreen"),
					children: mode === "fullscreen" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minimize2, { size: 14 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Maximize2, { size: 14 })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: hostRef,
				className: "min-h-0 flex-1"
			}),
			tooltip ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "graph-tooltip",
				style: {
					left: Math.min(tooltip.x + 16, (hostRef.current?.clientWidth ?? 320) - 220),
					top: Math.max(12, tooltip.y - 12)
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-start justify-between gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[13px] font-semibold tracking-tight text-[var(--text-primary)]",
							children: tooltip.title
						}), tooltip.degree > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "shrink-0 rounded-full bg-[rgba(0,200,255,0.12)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]",
							children: [tooltip.degree, "×"]
						}) : null]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-0.5 truncate font-mono text-[10px] text-[var(--text-muted)]",
						children: tooltip.path
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 text-[12px] leading-snug text-[var(--text-secondary)]",
						children: tooltip.preview || "Empty note"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 text-[10px] text-[var(--text-muted)]",
						children: "Click to open"
					})
				]
			}) : null,
			data.nodes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(0,200,255,0.2)] bg-[rgba(0,200,255,0.08)] text-[var(--accent)]",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sparkles, { size: 20 })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[14px] font-medium text-[var(--text-primary)]",
						children: "Graph is waiting for links"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 max-w-[240px] text-[12.5px] leading-snug text-[var(--text-muted)]",
						children: [
							"Connect notes with ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-[var(--accent)]",
								children: "[[wikilinks]]"
							}),
							" to grow the map."
						]
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
	const fsaSupported = useVaultStore((s) => s.fsaSupported);
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
						className: "mb-2 flex items-center gap-2 text-[var(--accent)]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(0,200,255,0.3)] bg-[rgba(0,200,255,0.1)] shadow-[0_0_28px_rgba(0,200,255,0.22)]",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { size: 18 })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]",
							children: "Note App"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-4 max-w-xl text-[clamp(1.85rem,4vw,2.65rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--text-primary)]",
						children: "A knowledge OS for plain Markdown."
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
					!fsaSupported ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-[12.5px] text-[var(--warning)]",
						children: "Full local vault access works best in Chrome or Edge. You can still explore the demo."
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
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
					}) : null
				]
			})
		]
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
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-auto mb-4 h-10 w-10 animate-pulse rounded-xl bg-[rgba(0,200,255,0.2)]" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[14px] text-[var(--text-secondary)]",
				children: "Starting Note App…"
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
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toast, {})
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
			fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex h-full items-center justify-center bg-[#050507] text-[#a1a1aa]",
				children: "Loading Note App…"
			}),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {})
		})
	});
}
//#endregion
export { Home as component };
