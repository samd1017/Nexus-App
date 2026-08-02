import { n as create, t as persist } from "../_libs/zustand.mjs";
import { t as g } from "../_libs/marked.mjs";
import { t as TurndownService } from "../_libs/turndown.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/store-D0ChvofP.js
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
* Clean Markdown serialization helpers.
* On-disk format: CommonMark + GFM + [[wikilinks]] — never proprietary HTML.
*/
g.setOptions({
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
		const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n");
		return `- [${checked ? "x" : " "}] ${body}`;
	}
});
/** Prefer keeping original markdown if only whitespace/newline noise changed */
function preferCleanWrite(previous, next) {
	const norm = (s) => s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trimEnd() + "\n";
	if (norm(previous) === norm(next)) return previous;
	return norm(next);
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
var IDB_NAME = "noteapp-vault-handles";
var IDB_STORE = "handles";
var HANDLE_KEY = "current";
function isFileSystemAccessSupported() {
	return typeof window !== "undefined" && "showDirectoryPicker" in window;
}
function openIdb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(IDB_NAME, 1);
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
	const opts = { mode };
	if (await handle.queryPermission?.(opts) === "granted") return true;
	return await handle.requestPermission?.(opts) === "granted";
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
/** Recursively scan a directory for folders + .md notes */
async function scanVault(root) {
	const nodes = {};
	const rootIds = [];
	const signatures = {};
	async function walk(dir, relPath, parentId) {
		for await (const [name, handle] of dir.entries()) {
			if (name === ".DS_Store" || name === "Thumbs.db") continue;
			if (handle.kind === "directory") {
				if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
				const path = relPath ? pathJoin(relPath, name) : name;
				const id = nodeId(path);
				nodes[id] = {
					id,
					path,
					name,
					kind: "folder",
					parentId,
					mtime: Date.now()
				};
				if (parentId == null) rootIds.push(id);
				await walk(handle, path, id);
			} else if (handle.kind === "file" && name.toLowerCase().endsWith(".md")) {
				const path = relPath ? pathJoin(relPath, name) : name;
				const file = await handle.getFile();
				const content = await file.text();
				const id = nodeId(path);
				const mtime = file.lastModified;
				nodes[id] = {
					id,
					path,
					name,
					kind: "note",
					parentId,
					mtime,
					content
				};
				signatures[path] = `${mtime}:${file.size}`;
				if (parentId == null) rootIds.push(id);
			}
		}
	}
	await walk(root, "", null);
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
		if (text == null) {
			const parts = oldPath.split("/").filter(Boolean);
			const fileName = parts.pop();
			text = await (await (await (await getDirAtPath(root, parts.join("/"), false)).getFileHandle(fileName)).getFile()).text();
		}
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
	async function walk(dir, relPath) {
		for await (const [name, handle] of dir.entries()) {
			if (name === ".DS_Store") continue;
			if (handle.kind === "directory") {
				if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
				await walk(handle, relPath ? pathJoin(relPath, name) : name);
			} else if (handle.kind === "file" && name.toLowerCase().endsWith(".md")) {
				const path = relPath ? pathJoin(relPath, name) : name;
				const file = await handle.getFile();
				signatures[path] = `${file.lastModified}:${file.size}`;
			}
		}
	}
	await walk(root, "");
	return signatures;
}
function signaturesChanged(a, b) {
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return true;
	for (const k of keysA) if (a[k] !== b[k]) return true;
	return false;
}
var STORAGE_KEY$1 = "noteapp-cloud-session-v1";
var PKCE_KEY = "noteapp-oauth-pkce";
function getCloudConfig(provider) {
	const c = {
		dropbox: {
			clientId: void 0,
			authUrl: "https://www.dropbox.com/oauth2/authorize",
			tokenUrl: "https://api.dropboxapi.com/oauth2/token",
			scopes: ""
		},
		google: {
			clientId: void 0,
			authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
			tokenUrl: "https://oauth2.googleapis.com/token",
			scopes: "https://www.googleapis.com/auth/drive.file"
		},
		onedrive: {
			clientId: void 0,
			authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
			scopes: "Files.ReadWrite offline_access"
		}
	}[provider];
	return {
		...c,
		configured: Boolean(c.clientId)
	};
}
function loadCloudSession() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY$1);
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
function saveCloudSession(session) {
	if (!session) {
		localStorage.removeItem(STORAGE_KEY$1);
		return;
	}
	localStorage.setItem(STORAGE_KEY$1, JSON.stringify(session));
}
function randomString(len = 48) {
	const arr = new Uint8Array(len);
	crypto.getRandomValues(arr);
	return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Base64Url(input) {
	const data = new TextEncoder().encode(input);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const bytes = new Uint8Array(hash);
	let str = "";
	bytes.forEach((b) => {
		str += String.fromCharCode(b);
	});
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function beginCloudOAuth(provider) {
	const cfg = getCloudConfig(provider);
	if (!cfg.clientId) return {
		ok: false,
		reason: `${providerLabel(provider)} client ID not configured. Set VITE_${provider.toUpperCase()}_CLIENT_ID for pure client-side OAuth, or use a local folder / synced cloud drive folder instead.`
	};
	const verifier = randomString(64);
	const challenge = await sha256Base64Url(verifier);
	const state = randomString(16);
	sessionStorage.setItem(PKCE_KEY, JSON.stringify({
		provider,
		verifier,
		state,
		at: Date.now()
	}));
	const redirectUri = `${window.location.origin}/oauth/callback`;
	const url = new URL(cfg.authUrl);
	url.searchParams.set("client_id", cfg.clientId);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("state", state);
	if (cfg.scopes) url.searchParams.set("scope", cfg.scopes);
	if (provider === "dropbox") {
		url.searchParams.set("token_access_type", "offline");
		url.searchParams.set("code_challenge", challenge);
		url.searchParams.set("code_challenge_method", "S256");
	} else if (provider === "google") {
		url.searchParams.set("code_challenge", challenge);
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set("access_type", "offline");
		url.searchParams.set("prompt", "consent");
	} else if (provider === "onedrive") {
		url.searchParams.set("code_challenge", challenge);
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set("response_mode", "query");
	}
	window.location.assign(url.toString());
	return { ok: true };
}
async function completeCloudOAuth(code, state) {
	const raw = sessionStorage.getItem(PKCE_KEY);
	if (!raw) return {
		ok: false,
		reason: "Missing PKCE session"
	};
	const pkce = JSON.parse(raw);
	if (pkce.state !== state) return {
		ok: false,
		reason: "State mismatch"
	};
	const cfg = getCloudConfig(pkce.provider);
	if (!cfg.clientId) return {
		ok: false,
		reason: "Client ID missing"
	};
	const redirectUri = `${window.location.origin}/oauth/callback`;
	const body = new URLSearchParams({
		client_id: cfg.clientId,
		code,
		grant_type: "authorization_code",
		redirect_uri: redirectUri,
		code_verifier: pkce.verifier
	});
	try {
		const res = await fetch(cfg.tokenUrl, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body
		});
		if (!res.ok) return {
			ok: false,
			reason: `Token exchange failed: ${(await res.text()).slice(0, 200)}`
		};
		const data = await res.json();
		const session = {
			provider: pkce.provider,
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: data.expires_in ? Date.now() + data.expires_in * 1e3 : void 0,
			accountLabel: providerLabel(pkce.provider),
			connectedAt: Date.now()
		};
		saveCloudSession(session);
		sessionStorage.removeItem(PKCE_KEY);
		return {
			ok: true,
			session
		};
	} catch (e) {
		return {
			ok: false,
			reason: e instanceof Error ? e.message : "OAuth failed"
		};
	}
}
function disconnectCloud() {
	saveCloudSession(null);
}
function providerLabel(p) {
	if (p === "dropbox") return "Dropbox";
	if (p === "google") return "Google Drive";
	return "OneDrive";
}
/**
* Recommended path when OAuth client IDs aren't set:
* use the provider's desktop sync folder as a local vault (FSA).
*/
var CLOUD_SYNC_HINT = "Tip: Sync Dropbox / Drive / OneDrive to disk, then Open folder as vault — notes stay plain Markdown with zero accounts.";
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
				if (await ensurePermission(saved.handle, "readwrite")) {
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
		const active = get().activeNoteId;
		const activePath = active ? prev[active]?.path : null;
		let nextActive = active && nodes[active] ? active : null;
		if (!nextActive && activePath) nextActive = Object.values(nodes).find((n) => n.path === activePath)?.id ?? null;
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
		if (!result.ok) set({ toast: result.reason || `Connect ${providerLabel(provider)} via synced folder` });
	},
	disconnectCloud: () => {
		disconnectCloud();
		set({
			cloudSession: null,
			toast: "Cloud disconnected"
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
//#endregion
export { signaturesChanged as _, formatRelativeTime as a, getFsaRoot as c, preferCleanWrite as d, previewSnippet as f, setWatcherAck as g, scanVault as h, extractOutline as i, getNoteDisplayTitle as l, scanSignatures as m, cn as n, getBreadcrumbs as o, providerLabel as p, completeCloudOAuth as r, getCloudConfig as s, CLOUD_SYNC_HINT as t, noteTitle as u, useVaultStore as v };
