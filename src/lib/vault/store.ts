/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — recovered store; typed API surface re-exported below
/**
 * Vault store — session state for the open vault.
 * Recovered from build artifact after accidental checkout; hierarchical graph fields added.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  EditorMode,
  GraphMode,
  GraphScopeMode,
  RecentVault,
  VaultMode,
  VaultNode,
  VaultSettings,
} from "./types";
import { DEFAULT_SETTINGS, noteTitle, parentPath, pathJoin } from "./types";
import { buildDemoVault, HERMES_SAMPLE_NOTE } from "./demo-vault";
import { buildLargeTestVault, LARGE_TEST_VAULT_ID } from "./large-test-vault";
import { preferCleanWrite } from "@/lib/markdown/serialize";
import { flushActiveEditors } from "@/lib/editor/flush";
import { slugifyTitle } from "@/lib/utils";
import {
  clearDirectoryHandle,
  createFolderOnDisk,
  deletePathOnDisk,
  ensurePermission,
  isFileSystemAccessSupported,
  loadDirectoryHandle,
  loadRecentHandle,
  pickVaultFolder,
  renamePathOnDisk,
  saveDirectoryHandle,
  scanVault,
  scanVaultMeta,
  writeNoteFile,
  readNoteFile,
  listFsaTrash,
  fsaNodeId,
} from "./fs-adapter";
import {
  createDesktopFolder,
  createNewDesktopVault,
  deleteDesktopPath,
  getDesktopVaultRoot,
  openDesktopVaultAt,
  pickDesktopVaultFolder,
  renameDesktopPath,
  revealDesktopPath,
  setDesktopVaultRoot,
  writeDesktopNote,
  readDesktopNote,
  listDesktopTrash,
  deskNodeId,
} from "./tauri-adapter";
import { isDesktopShell, canOpenLocalVaultFolder, confirmDesktopShell } from "@/lib/platform";
import type { CloudProvider, CloudSession } from "@/lib/cloud/oauth";
import {
  buildPathIndex,
  collectFolderPaths,
  defaultNoteContent,
  ensureMdPath,
  pathToName,
  titleFromPath,
  uniquePath,
  type BulkImportInput,
  type BulkImportResult,
} from "./bulk";
import { getPrefs } from "@/lib/prefs/preferences";
import {
  beginCloudOAuth,
  disconnectCloud,
  loadCloudSession,
  providerLabel,
} from "@/lib/cloud/oauth";
import {
  buildDailyNoteContent,
  buildTemplateContent,
  dailyNotePath,
  dailyNoteTitle,
  formatDateISO,
  getTemplate,
  type NoteTemplateId,
} from "./templates";
import { loadNoteVisits, pushNoteVisit } from "./note-visits";
import {
  isOnlySerializationNoise,
  markdownFingerprint,
} from "@/lib/markdown/purity";
import { recordNoteVisit, recentNoteIdsForVault } from "./visit-history";
import { trackVisit } from "./session-recents";
import { pushNav, resetNavHistory } from "./nav-history";
import { clearPulse, pushPulse } from "./pulse";
import { ensureVaultIndex, vaultIndex } from "./indexes";
import {
  clearBodyTouches,
  getBodyCacheStats,
  pickEvictions,
  removeBodyTouch,
  touchBody,
  type BodyCacheStats,
} from "./body-cache";
import {
  archiveBodiesFromNodes,
  clearBodyArchive,
  hasBodyArchive,
  rekeyBodyArchive,
  rekeyBodyArchivePrefix,
  removeBodyFromArchive,
  setBodyInArchive,
} from "./body-archive";
import { shouldLazyBodies, shouldUseDurableIndex, shouldUseFolderGraph } from "./scale-flags";
import {
  closeDurableIndex,
  openDurableIndexForVault,
  upsertDurableNoteFromNode,
  syncDurableIndexFromNodes,
  removeDurableNote,
} from "./durable-index";
import { vaultLinkIndex, resetLinkIndex, rebuildLinkIndex } from "./link-index";
import { invalidateSearchCache } from "@/lib/search/fuse-search";
import { invalidateIndexedSearch, upsertIndexedNote } from "@/lib/search/indexed-search";
import {
  setActiveBackend,
  getActiveBackend,
  backendFromMode,
  stripBodies,
  contentForDiskWrite,
} from "./backend";
import {
  detectConflictPairs,
  flattenConflictItems,
  filterDismissed,
  conflictItemKey,
  makeConflictSiblingPath,
  type ConflictPair,
  type ConflictListItem,
} from "./conflicts";
import type { TrashEntry } from "./trash";
import { trashEntryFromRel } from "./trash";
import { assertBodyLoaded } from "./content";
import {
  nativeMetaWalk,
  vaultScanFromNodeMeta,
  setOpenProgress,
} from "./native-index";
import { invalidateVaultTagsCache } from "./tags";

export type RightTab = "backlinks" | "outline" | "graph" | "pulse";
export type ToastAction = { label: string; kind: "open-pulse" };
export type PendingDelete = { id: string; kind: "note" | "folder"; label: string };

/** Loose store surface — full typing deferred; runtime API is complete. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VaultStore = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  nodes: Record<string, VaultNode>;
  rootIds: string[];
  activeNoteId: string | null;
  vaultId: string | null;
  mode: VaultMode;
  settings: VaultSettings;
  ready: boolean;
  vaultName: string;
  vaultPath: string;
  dirtyNoteIds: string[];
  expandedFolders: string[];
  recentVaults: RecentVault[];
  commandOpen: boolean;
  toast: string | null;
  toastAction: ToastAction | null;
  rightTab: RightTab;
  pendingDelete: PendingDelete | null;
  conflictStudioOpen: boolean;
  graphScopeMode: GraphScopeMode;
  graphBrowsePath: string;
  graphEgoReturnPath: string | null;
};

/** Reset hierarchical folder graph session on every vault open/close. */
const GRAPH_SCOPE_DEFAULTS = {
  graphScopeMode: "vault" as GraphScopeMode,
  graphBrowsePath: "",
  graphEgoReturnPath: null as string | null,
};




/** Nexus keys (Wave S5). Dual-read legacy noteapp-* on load; always write nexus-*. */
const STORAGE_KEY = "nexus-vault-v1";
const STORAGE_KEY_LEGACY = "noteapp-vault-v2";
const RECENT_KEY = "nexus-recent-v1";
const RECENT_KEY_LEGACY = "noteapp-recent-v2";
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
let fsaRoot = null;
let desktopRoot = null;
/** In-flight body hydrates — dedupe concurrent ensureNoteBody */
let bodyHydrateInflight = new Map();
/** Conflict pair cache — invalidated by structureGeneration / nodes ref */
let _conflictPairsCache = null;
let _conflictPairsStructGen = -1;
let _conflictPairsNodesRef = null;
let desktopWatchAck = null;
let writeQueue = Promise.resolve();
let watcherAck = null;
let lastExternalToastAt = 0;
let lastDiskResyncAt = 0;
let diskWriteError = null;
/** Bumped on every vault open/close so queued disk ops can self-cancel */
let vaultGen = 0;
/** Coalesce rapid create/import storms (agent bulk writes). */
let CREATE_BATCH_MS = 48;
let DISK_ACK_MS = 120;
let EXTERNAL_DEBOUNCE_MS = 80;
/** Burst window for agent dump coalescing (Wave 4) */
let BURST_WINDOW_MS = 2500;
let BURST_MIN_COUNT = 4;
let burstCount = 0;
let burstTimer = null;
let burstPaths = [];
let pendingDiskOps = [];
let diskFlushTimer = null;
let externalSnapTimer = null;
let pendingExternal = null;
/** Demo/in-memory autosave calm timers — keyed by note id */
const demoSaveTimers = new Map();
/** path → fingerprint of external body already shelved as .conflict-* */
let shelvedConflicts = new Map();
let stageBuf = null;
let stageTimer = null;
async function resyncFromDiskAfterError() {
	const now = Date.now();
	if (now - lastDiskResyncAt < 1500) return;
	lastDiskResyncAt = now;
	try {
		if (desktopRoot) {
			const { scan } = await loadDiskVaultScan("desktop");
			useVaultStore.getState().applyExternalSnapshot(scan.nodes, scan.rootIds);
		} else if (fsaRoot) {
			const { scan } = await loadDiskVaultScan("fsa");
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
	const gen = vaultGen;
	writeQueue = writeQueue.then(async () => {
		if (gen !== vaultGen) return;
		await fn();
	}).catch((err) => reportDiskError(label, err));
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
	const gen = vaultGen;
	return queueDiskWrite(async () => {
		const failed = [];
		for (const op of ops) {
			if (gen !== vaultGen) return;
			try {
				await op();
			} catch (err) {
				reportDiskError("update vault files", err);
				failed.push(op);
			}
		}
		if (failed.length && gen === vaultGen) pendingDiskOps.push(...failed);
		if (gen !== vaultGen) return;
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
/** Cancel module-level vault timers/buffers (close or switch vault). */
function cancelVaultModuleState() {
	vaultGen += 1;
	if (stageTimer) {
		clearTimeout(stageTimer);
		stageTimer = null;
	}
	stageBuf = null;
	if (diskFlushTimer) {
		clearTimeout(diskFlushTimer);
		diskFlushTimer = null;
	}
	pendingDiskOps = [];
	if (externalSnapTimer) {
		clearTimeout(externalSnapTimer);
		externalSnapTimer = null;
	}
	pendingExternal = null;
	shelvedConflicts.clear();
	bodyHydrateInflight.clear();
	_conflictPairsCache = null;
	_conflictPairsStructGen = -1;
	_conflictPairsNodesRef = null;
	clearBodyTouches();
	if (burstTimer) {
		clearTimeout(burstTimer);
		burstTimer = null;
	}
	burstCount = 0;
	burstPaths = [];
	writeQueue = Promise.resolve();
	diskWriteError = null;
}
/** Soft-trash path: .trash/<stamp>__<original path with / → __> — unique, no collisions */
function trashRelativePath(originalPath) {
	const safe = originalPath.replace(/[/\\]+/g, "__");
	return `.trash/${`${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`}__${safe}`;
}
export function getFsaRoot() {
	return fsaRoot;
}
export function getDesktopRoot() {
	return desktopRoot;
}
export function setWatcherAck(fn) {
	watcherAck = fn;
}
export function setDesktopWatchAck(fn) {
	desktopWatchAck = fn;
}
function isDiskVault(mode) {
	return mode === "fsa" || mode === "desktop" || mode === "sandbox";
}
function readExpandedFolders(get) {
	return stageBuf ? stageBuf.expandedFolders : get().expandedFolders;
}
function writeExpandedFolders(set, next) {
	if (stageBuf) stageBuf.expandedFolders = next;
	set({ expandedFolders: next });
}
/** Wave A: after mount rebuild link maps; meta-only opens omit bodies. */
function prepareMountedNodes(nodes, mode, keepIds = [], opts) {
	rebuildLinkIndex(nodes);
	clearBodyTouches();
	const keep = new Set(keepIds.filter(Boolean));
	const lazy = shouldLazyBodies(mode, opts?.vaultId);
	let result;
	if (lazy) {
		for (const id of keep) touchBody(id);
		if (opts?.metaOnly) {
			for (const n of Object.values(nodes)) if (n.kind === "note" && n.content !== undefined) touchBody(n.id);
			result = nodes;
		} else result = stripBodies(nodes, keep);
	} else {
		for (const n of Object.values(nodes)) if (n.kind === "note" && n.content !== undefined) touchBody(n.id);
		result = nodes;
	}
	return result;
}
function maybeSyncDurableIndex(vaultId, mode, nodes) {
	try {
		syncDurableIndexFromNodes(vaultId, nodes, shouldUseDurableIndex(mode, vaultId));
	} catch {}
}
/** Prefer SQLite on desktop; memory on FSA/sandbox. Large-test local uses memory FTS. */
async function prepareDurableIndex(vaultId, mode) {
	if (!vaultId || !shouldUseDurableIndex(mode, vaultId)) {
		closeDurableIndex();
		return;
	}
	try {
		const root = mode === "desktop" ? getDesktopRoot() : null;
		await openDurableIndexForVault({
			vaultId,
			mode,
			vaultRoot: root
		});
	} catch {}
}
/** Single-path disk open: always meta-only for disk vaults (bodies on demand). */
async function loadDiskVaultScan(mode) {
	const metaOnly = shouldLazyBodies(mode) || mode === "desktop" || mode === "fsa";
	setOpenProgress({
		phase: "walking",
		scanned: 0,
		totalHint: null,
		message: metaOnly ? "Scanning vault metadata…" : "Opening vault…"
	});
	const onProgress = (scanned) => {
		setOpenProgress({
			phase: "walking",
			scanned,
			totalHint: null,
			message: metaOnly ? `Scanning metadata… ${scanned.toLocaleString()} notes` : `Opening vault… ${scanned.toLocaleString()} notes`
		});
	};
	try {
		if (mode === "desktop") {
			if (!desktopRoot) throw new Error("No desktop vault root");
			if (metaOnly) {
				const native = await nativeMetaWalk(desktopRoot);
				if (native && native.length > 0) {
					onProgress(native.length);
					const scan = vaultScanFromNodeMeta(native);
					const n = Object.keys(scan.nodes).length;
					setOpenProgress({
						phase: "indexing",
						scanned: n,
						totalHint: n,
						message: "Building indexes…"
					});
					setOpenProgress({
						phase: "ready",
						scanned: n,
						totalHint: n,
						message: ""
					});
					return {
						scan,
						metaOnly: true
					};
				}
			}
			const scan = await openDesktopVaultAt(desktopRoot, {
				metaOnly,
				onProgress
			});
			const n = Object.keys(scan.nodes).length;
			setOpenProgress({
				phase: "indexing",
				scanned: n,
				totalHint: n,
				message: "Building indexes…"
			});
			setOpenProgress({
				phase: "ready",
				scanned: n,
				totalHint: n,
				message: ""
			});
			return {
				scan,
				metaOnly
			};
		}
		if (!fsaRoot) throw new Error("No FSA vault root");
		const scan = metaOnly ? await scanVaultMeta(fsaRoot, onProgress) : await scanVault(fsaRoot);
		const n = Object.keys(scan.nodes).length;
		setOpenProgress({
			phase: "indexing",
			scanned: n,
			totalHint: n,
			message: "Building indexes…"
		});
		setOpenProgress({
			phase: "ready",
			scanned: n,
			totalHint: n,
			message: ""
		});
		return {
			scan,
			metaOnly
		};
	} catch (e) {
		setOpenProgress({
			phase: "error",
			scanned: 0,
			totalHint: null,
			message: e instanceof Error ? e.message : "Open failed"
		});
		throw e;
	}
}
function syncActiveBackend(mode) {
	setActiveBackend(backendFromMode(mode, fsaRoot, desktopRoot, () => ({
		nodes: useVaultStore.getState().nodes,
		rootIds: useVaultStore.getState().rootIds,
		signatures: {}
	})));
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
/** Path-stable id matching disk adapters so remount/watch keep the same id. */
function makeId(path, mode) {
	if (mode === "fsa") return fsaNodeId(path);
	if (mode === "desktop") return deskNodeId(path);
	return stableId(path);
}
/** Wave 6: expand only ancestors of active note (+ top-level Journal) — not every folder */
function smartExpandedFolders(nodes, activeId) {
	const out = new Set();
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
/** Seed store MRU from vault-scoped visits (path-remap for remount). */
function recentsForOpenVault(vaultId, nodes, limit = 12) {
	return recentNoteIdsForVault(vaultId, nodes, limit);
}
/** Reset nav stack and seed with launch note (browser-like: ⌘[ inactive until second open). */
function resetAndSeedNav(activeNoteId) {
	resetNavHistory();
	if (activeNoteId) pushNav(activeNoteId);
}
/** Record open in vault-scoped visits + nav + store MRU list. */
function recordNoteOpen(get, set, id) {
	const note = get().nodes[id];
	if (!note || note.kind !== "note") return;
	const vaultId = get().vaultId;
	if (vaultId && note.path) recordNoteVisit(vaultId, id, note.path);
	trackVisit(id);
	pushNav(id);
	const recentNoteVisits = vaultId
		? recentNoteIdsForVault(vaultId, get().nodes, 12)
		: [id, ...(get().recentNoteVisits || []).filter((x) => x !== id)].slice(0, 12);
	set({ recentNoteVisits });
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
			const todayPath = dailyNotePath(new Date());
			if (active?.kind === "note" && active.path === todayPath) return;
			if (active?.kind === "note" && active.path && !/^Journal\/\d{4}-\d{2}-\d{2}\.md$/.test(active.path)) return;
			st.openDailyNote({ silent: true });
			return;
		}
		st.openDailyNote({ silent: true });
	} catch {}
}
export const useVaultStore = create<VaultStore>()(
  persist((set: any, get: any) => ({
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
	lastSavedAt: null as number | null,
	recentVaults: [],
	commandOpen: false,
	toast: null,
	toastAction: null,
	rightTab: "backlinks",
	hermesTick: 0,
	cloudSession: null,
	fsaSupported: false,
	connecting: false,
	pendingDelete: null,
	recentNoteVisits: loadNoteVisits(),
	folderAccessLost: false,
	conflictStudioOpen: false,
	conflictStudioFocus: null,
	dismissedConflictKeys: [],
	// Hierarchical folder graph session (not settings.graphMode)
	graphScopeMode: "vault",
	graphBrowsePath: "",
	graphEgoReturnPath: null,
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
					const { scan, metaOnly } = await loadDiskVaultScan("desktop");
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
						nodes: prepareMountedNodes(scan.nodes, "desktop", [active ?? ""], { metaOnly }),
						rootIds: scan.rootIds,
						activeNoteId: active,
						expandedFolders: smartExpandedFolders(scan.nodes, active),
						recentVaults: recents2,
						connecting: false,
						dirtyNoteIds: [],
						...GRAPH_SCOPE_DEFAULTS,
					});
					syncActiveBackend("desktop");
					{
						const st = useVaultStore.getState();
						if (st.activeNoteId) st.ensureNoteBody(st.activeNoteId);
						await prepareDurableIndex(st.vaultId, st.mode);
						maybeSyncDurableIndex(st.vaultId, st.mode, st.nodes);
					}
					applyLaunchNotePreference();
		set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
		resetAndSeedNav(get().activeNoteId);
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
						const { scan, metaOnly } = await loadDiskVaultScan("fsa");
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
							nodes: prepareMountedNodes(scan.nodes, "fsa", [active ?? ""], { metaOnly }),
							rootIds: scan.rootIds,
							activeNoteId: active,
							expandedFolders: smartExpandedFolders(scan.nodes, active),
							recentVaults: recents2,
							connecting: false,
							dirtyNoteIds: [],
							...GRAPH_SCOPE_DEFAULTS,
						});
						syncActiveBackend("fsa");
						{
							const st = useVaultStore.getState();
							if (st.activeNoteId) st.ensureNoteBody(st.activeNoteId);
							await prepareDurableIndex(st.vaultId, st.mode);
							maybeSyncDurableIndex(st.vaultId, st.mode, st.nodes);
						}
						applyLaunchNotePreference();
		set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
		resetAndSeedNav(get().activeNoteId);
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
		set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
		resetAndSeedNav(get().activeNoteId);
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
		// Don't clobber an in-flight vault open (e.g. large test vault)
		if (get().connecting) return;
		cancelVaultModuleState();
		clearBodyArchive();
		invalidateVaultTagsCache();
		resetNavHistory();
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
		const nodes = prepareMountedNodes(demo.nodes, "demo", [welcome?.id ?? ""]);
		set({
			vaultId,
			vaultName: demo.vaultName,
			vaultPath: "Demo Vault",
			mode: "demo",
			nodes,
			rootIds: demo.rootIds,
			activeNoteId: welcome?.id ?? null,
			expandedFolders: expanded,
			...GRAPH_SCOPE_DEFAULTS,
			dirtyNoteIds: [],
			lastSavedAt: null,
			lastExternalSync: null,
			recentVaults: recents,
			connecting: false,
			// Keep rightTab at default (backlinks). Do NOT auto-open Graph —
			// GraphView must be user-initiated (see RightPanel R1.1).
			settings: {
				...get().settings,
				lastNotePath: welcome?.path ?? null,
				editorMode: getPrefs().defaultEditorMode,
				graphMode: "panel",
				rightOpen: true
			}
		});
		syncActiveBackend("demo");
		maybeSyncDurableIndex(vaultId, "demo", nodes);
		set({ recentNoteVisits: recentsForOpenVault(vaultId, nodes) });
		resetAndSeedNav(get().activeNoteId);
	},
	openLargeTestVault: async () => {
		if (import.meta.env.PROD) {
			get().setToast("Large test vault is not available in production");
			return;
		}
		// Single-flight: one concurrent open; connecting stays true until done/fail
		if (get().connecting) return;
		set({
			connecting: true,
			folderAccessLost: false
		});
		// Bump gen so in-flight disk/hydrate ops cancel. Do NOT clear body archive
		// here — if re-open fails, stripped large-test nodes must still rehydrate.
		cancelVaultModuleState();
		const gen = vaultGen;
		resetNavHistory();
		try {
			fsaRoot = null;
			desktopRoot = null;
			setDesktopVaultRoot(null);
			setOpenProgress({
				phase: "walking",
				scanned: 0,
				totalHint: 45000,
				message: "Loading large test vault seed…"
			});
			const data = await buildLargeTestVault({
				onProgress: (loaded, total, phase) => {
					if (gen !== vaultGen) return;
					setOpenProgress({
						phase: "walking",
						scanned: loaded,
						totalHint: total,
						message:
							phase === "notes"
								? `Loading notes… ${loaded.toLocaleString()} / ${total.toLocaleString()}`
								: phase === "folders"
									? "Building folder tree…"
									: "Loading large test vault…"
					});
				}
			});
			// Stale open — another vault switch bumped gen; do not clobber
			if (gen !== vaultGen) return;

			const vaultId = LARGE_TEST_VAULT_ID;
			const firstNote =
				Object.values(data.nodes).find((n) => n.kind === "note" && n.path.startsWith("00-Inbox/")) ||
				Object.values(data.nodes).find((n) => n.kind === "note");
			// Only expand ancestors of active note — not all top-level roots
			const expanded = smartExpandedFolders(data.nodes, firstNote?.id ?? null);
			const recents = pushRecent({
				id: vaultId,
				name: data.vaultName,
				path: "Large Test Vault (in-browser 45k)",
				lastOpened: Date.now(),
				mode: "local"
			});

			setOpenProgress({
				phase: "indexing",
				scanned: data.noteCount,
				totalHint: data.noteCount,
				message: "Building indexes…"
			});

			// Archive full bodies → durable FTS on full bodies → strip for store.
			// Mode stays "local"; partialize skips LARGE_TEST_VAULT_ID from localStorage.
			archiveBodiesFromNodes(data.nodes);
			syncActiveBackend("local");
			await prepareDurableIndex(vaultId, "local");
			if (gen !== vaultGen) return;
			maybeSyncDurableIndex(vaultId, "local", data.nodes);
			const nodes = prepareMountedNodes(data.nodes, "local", [firstNote?.id ?? ""], {
				vaultId
			});
			if (gen !== vaultGen) return;
			invalidateVaultTagsCache();
			set({
				vaultId,
				vaultName: data.vaultName,
				vaultPath: "Large Test Vault · 45,000 notes",
				mode: "local",
				nodes,
				rootIds: data.rootIds,
				activeNoteId: firstNote?.id ?? null,
				expandedFolders: expanded,
				dirtyNoteIds: [],
				lastExternalSync: null,
				recentVaults: recents,
				connecting: false,
				...GRAPH_SCOPE_DEFAULTS,
				settings: {
					...get().settings,
					lastNotePath: firstNote?.path ?? null,
					editorMode: getPrefs().defaultEditorMode,
					graphMode: "panel",
					rightOpen: true
				},
				toast: `Large Test Vault ready — ${data.noteCount.toLocaleString()} notes`
			});
			setOpenProgress({
				phase: "ready",
				scanned: data.noteCount,
				totalHint: data.noteCount,
				message: "Ready"
			});
			window.setTimeout(() => {
				setOpenProgress({
					phase: "idle",
					scanned: 0,
					totalHint: null,
					message: ""
				});
			}, 1400);
		} catch (err) {
			if (gen !== vaultGen) return;
			console.error("[vault] openLargeTestVault failed", err);
			const msg = err instanceof Error ? err.message : String(err);
			set({
				connecting: false,
				toast: `Could not open large test vault: ${msg}`
			});
			setOpenProgress({
				phase: "error",
				scanned: 0,
				totalHint: null,
				message: msg
			});
		}
	},
	openLocalVault: (name, seed) => {
		cancelVaultModuleState();
		clearBodyArchive();
		invalidateVaultTagsCache();
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
		const nodes = prepareMountedNodes(data.nodes, "local", [first?.id ?? ""]);
		syncActiveBackend("local");
		maybeSyncDurableIndex(vaultId, "local", nodes);
		set({
			vaultId,
			vaultName: name,
			vaultPath: name,
			mode: "local",
			nodes,
			rootIds: data.rootIds,
			activeNoteId: first?.id ?? null,
			expandedFolders: smartExpandedFolders(data.nodes, first?.id ?? null),
			dirtyNoteIds: [],
			recentVaults: recents,
			...GRAPH_SCOPE_DEFAULTS,
			settings: {
				...get().settings,
				editorMode: prefs.defaultEditorMode,
				graphMode: prefs.defaultGraphView,
				rightOpen: prefs.defaultGraphView === "panel",
				lastNotePath: first?.path ?? null
			}
		});
		applyLaunchNotePreference();
		set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
		resetAndSeedNav(get().activeNoteId);
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
				cancelVaultModuleState();
				clearBodyArchive();
				invalidateVaultTagsCache();
				desktopRoot = root;
				fsaRoot = null;
				const { scan, metaOnly } = await loadDiskVaultScan("desktop");
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
					nodes: prepareMountedNodes(scan.nodes, "desktop", [first?.id ?? ""], { metaOnly }),
					rootIds: scan.rootIds,
					activeNoteId: first?.id ?? null,
					expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
					dirtyNoteIds: [],
					recentVaults: recents,
					connecting: false,
					toast: `Opened vault: ${name}`,
					...GRAPH_SCOPE_DEFAULTS,
					settings: {
						...get().settings,
						lastNotePath: first?.path ?? null,
						editorMode: getPrefs().defaultEditorMode,
						graphMode: getPrefs().defaultGraphView,
						rightOpen: getPrefs().defaultGraphView === "panel"
					}
				});
				syncActiveBackend("desktop");
				{
					const st = useVaultStore.getState();
					if (st.activeNoteId) st.ensureNoteBody(st.activeNoteId);
					await prepareDurableIndex(st.vaultId, st.mode);
					maybeSyncDurableIndex(st.vaultId, st.mode, st.nodes);
				}
				applyLaunchNotePreference();
				set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
				resetAndSeedNav(get().activeNoteId);
				return;
			}
			const handle = await pickVaultFolder();
			if (!handle) {
				if (!isFileSystemAccessSupported()) set({
					connecting: false,
					toast: "Open folder needs Chrome or Edge — or the desktop app"
				});
				else set({ connecting: false });
				return;
			}
			if (!await ensurePermission(handle, "readwrite")) {
				set({
					connecting: false,
					toast: "Permission denied — cannot read vault folder"
				});
				return;
			}
			cancelVaultModuleState();
			clearBodyArchive();
			invalidateVaultTagsCache();
			fsaRoot = handle;
			const vaultId = "fsa-" + handle.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
			await saveDirectoryHandle(handle, {
				id: vaultId,
				name: handle.name
			});
			const { scan, metaOnly } = await loadDiskVaultScan("fsa");
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
				nodes: prepareMountedNodes(scan.nodes, "fsa", [first?.id ?? ""], { metaOnly }),
				rootIds: scan.rootIds,
				activeNoteId: first?.id ?? null,
				expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
				dirtyNoteIds: [],
				recentVaults: recents,
				connecting: false,
				toast: `Opened vault: ${handle.name}`,
				...GRAPH_SCOPE_DEFAULTS,
				settings: {
					...get().settings,
					lastNotePath: first?.path ?? null,
					editorMode: getPrefs().defaultEditorMode,
					graphMode: getPrefs().defaultGraphView,
					rightOpen: getPrefs().defaultGraphView === "panel"
				}
			});
			syncActiveBackend("fsa");
			{
				const st = useVaultStore.getState();
				if (st.activeNoteId) st.ensureNoteBody(st.activeNoteId);
				await prepareDurableIndex(st.vaultId, st.mode);
				maybeSyncDurableIndex(st.vaultId, st.mode, st.nodes);
			}
			applyLaunchNotePreference();
			set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
			resetAndSeedNav(get().activeNoteId);
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
				const { scan, metaOnly } = await loadDiskVaultScan("desktop");
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
					nodes: prepareMountedNodes(scan.nodes, "desktop", [first?.id ?? ""], { metaOnly }),
					rootIds: scan.rootIds,
					activeNoteId: first?.id ?? null,
					expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
					dirtyNoteIds: [],
					recentVaults: recents,
					connecting: false,
					toast: `Created vault: ${nameOut}`,
					...GRAPH_SCOPE_DEFAULTS,
					settings: {
						...get().settings,
						lastNotePath: first?.path ?? null,
						editorMode: getPrefs().defaultEditorMode,
						graphMode: getPrefs().defaultGraphView,
						rightOpen: getPrefs().defaultGraphView === "panel"
					}
				});
				syncActiveBackend("desktop");
				{
					const st = useVaultStore.getState();
					if (st.activeNoteId) st.ensureNoteBody(st.activeNoteId);
					await prepareDurableIndex(st.vaultId, st.mode);
					maybeSyncDurableIndex(st.vaultId, st.mode, st.nodes);
				}
				applyLaunchNotePreference();
		set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
		resetAndSeedNav(get().activeNoteId);
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
			const { scan, metaOnly } = await loadDiskVaultScan("fsa");
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
				nodes: prepareMountedNodes(scan.nodes, "fsa", [first?.id ?? ""], { metaOnly }),
				rootIds: scan.rootIds,
				activeNoteId: first?.id ?? null,
				expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
				dirtyNoteIds: [],
				recentVaults: recents,
				connecting: false,
				toast: `Created vault: ${childName}`,
				...GRAPH_SCOPE_DEFAULTS,
				settings: {
					...get().settings,
					lastNotePath: first?.path ?? null,
					editorMode: getPrefs().defaultEditorMode,
					graphMode: getPrefs().defaultGraphView,
					rightOpen: getPrefs().defaultGraphView === "panel"
				}
			});
			syncActiveBackend("fsa");
			{
				const st = useVaultStore.getState();
				if (st.activeNoteId) st.ensureNoteBody(st.activeNoteId);
				await prepareDurableIndex(st.vaultId, st.mode);
				maybeSyncDurableIndex(st.vaultId, st.mode, st.nodes);
			}
			applyLaunchNotePreference();
		set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
		resetAndSeedNav(get().activeNoteId);
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
		const recentEarly = get().recentVaults.find((r) => r.id === id);
		if (
			id === LARGE_TEST_VAULT_ID ||
			recentEarly?.id === LARGE_TEST_VAULT_ID ||
			(recentEarly?.path && String(recentEarly.path).includes("Large Test Vault"))
		) {
			await get().openLargeTestVault();
			return;
		}
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
				cancelVaultModuleState();
				clearBodyArchive();
				invalidateVaultTagsCache();
				desktopRoot = root;
				fsaRoot = null;
				const { scan, metaOnly } = await loadDiskVaultScan("desktop");
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
					nodes: prepareMountedNodes(scan.nodes, "desktop", [first?.id ?? ""], { metaOnly }),
					rootIds: scan.rootIds,
					activeNoteId: first?.id ?? null,
					expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
					dirtyNoteIds: [],
					recentVaults: recents,
					connecting: false,
					toast: `Reopened vault: ${name}`,
					...GRAPH_SCOPE_DEFAULTS,
				});
				syncActiveBackend("desktop");
				{
					const st = useVaultStore.getState();
					if (st.activeNoteId) st.ensureNoteBody(st.activeNoteId);
					await prepareDurableIndex(st.vaultId, st.mode);
					maybeSyncDurableIndex(st.vaultId, st.mode, st.nodes);
				}
				applyLaunchNotePreference();
		set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
		resetAndSeedNav(get().activeNoteId);
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
			cancelVaultModuleState();
			clearBodyArchive();
			invalidateVaultTagsCache();
			fsaRoot = handle;
			const vaultId = id;
			await saveDirectoryHandle(handle, {
				id: vaultId,
				name: handle.name
			});
			const { scan, metaOnly } = await loadDiskVaultScan("fsa");
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
				nodes: prepareMountedNodes(scan.nodes, "fsa", [first?.id ?? ""], { metaOnly }),
				rootIds: scan.rootIds,
				activeNoteId: first?.id ?? null,
				expandedFolders: smartExpandedFolders(scan.nodes, first?.id ?? null),
				dirtyNoteIds: [],
				recentVaults: recents,
				connecting: false,
				toast: `Reopened vault: ${handle.name}`,
				...GRAPH_SCOPE_DEFAULTS,
			});
			syncActiveBackend("fsa");
			{
				const st = useVaultStore.getState();
				if (st.activeNoteId) st.ensureNoteBody(st.activeNoteId);
				await prepareDurableIndex(st.vaultId, st.mode);
				maybeSyncDurableIndex(st.vaultId, st.mode, st.nodes);
			}
			applyLaunchNotePreference();
		set({ recentNoteVisits: recentsForOpenVault(get().vaultId, get().nodes) });
		resetAndSeedNav(get().activeNoteId);
		} catch (e) {
			set({
				connecting: false,
				toast: e instanceof Error ? e.message : "Failed to reopen vault"
			});
		}
	},
	closeVault: async () => {
		flushActiveEditors();
		flushStageNow(set);
		const mode = get().mode;
		if (isDiskVault(mode) && (desktopRoot || fsaRoot)) try {
			await get().flushDirty();
		} catch (err) {
			console.error("[vault] closeVault flushDirty failed", err);
		}
		cancelVaultModuleState();
		clearBodyArchive();
		invalidateVaultTagsCache();
		resetNavHistory();
		clearPulse();
		closeDurableIndex();
		invalidateIndexedSearch();
		invalidateSearchCache();
		fsaRoot = null;
		desktopRoot = null;
		setDesktopVaultRoot(null);
		clearDirectoryHandle();
		resetLinkIndex();
		clearBodyTouches();
		setActiveBackend(null);
		setOpenProgress({
			phase: "idle",
			scanned: 0,
			totalHint: null,
			message: ""
		});
		set({
			vaultId: null,
			vaultName: "",
			vaultPath: "",
			mode: "demo",
			nodes: {},
			rootIds: [],
			activeNoteId: null,
			recentNoteVisits: [],
			dirtyNoteIds: [],
			lastExternalSync: null,
			expandedFolders: [],
			pendingDelete: null,
			connecting: false,
			...GRAPH_SCOPE_DEFAULTS,
			conflictStudioOpen: false,
			conflictStudioFocus: null,
			dismissedConflictKeys: [],
			rightTab: "backlinks",
			toastAction: null,
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
		const expanded = new Set([...get().expandedFolders, ...pathExpand]);
		let recentNoteVisits = get().recentNoteVisits;
		if (typeof id === "string" && note?.kind === "note") {
			const vaultId = get().vaultId;
			if (vaultId && note.path) recordNoteVisit(vaultId, id, note.path);
			trackVisit(id);
			pushNav(id);
			recentNoteVisits = vaultId
				? recentNoteIdsForVault(vaultId, get().nodes, 12)
				: pushNoteVisit(id, get().recentNoteVisits);
			// legacy dual-write for one release
			if (vaultId) pushNoteVisit(id, get().recentNoteVisits);
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
		if (id && note?.kind === "note" && note.content === undefined) get().ensureNoteBody(id);
		else if (id) touchBody(id);
	},

	toggleFolder: (id) => {
		const cur = readExpandedFolders(get);
		const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
		writeExpandedFolders(set, next);
	},
	setExpandedFolders: (ids) => {
		writeExpandedFolders(set, Array.from(new Set(ids)));
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
		if (!opts?.external && node.content === undefined) {
			if (!assertBodyLoaded(node, "updateNoteContent")) return;
		}
		const prev = node.content ?? "";
		const next = opts?.external ? content : opts?.source ? content : preferCleanWrite(prev, content);
		if (prev === next) return;
		// Keep body archive in sync for large-test lazy mounts
		if (hasBodyArchive() && node.path) setBodyInArchive(node.path, next);
		try { ensureVaultIndex(get().nodes).markDirty([id]); } catch {}
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
		vaultLinkIndex.setNoteLinks(id, next);
		touchBody(id);
		const updated = get().nodes[id];
		if (updated?.kind === "note") {
			upsertDurableNoteFromNode(updated);
			upsertIndexedNote(updated);
		}
		if (!opts?.external && isDiskVault(get().mode)) {
			const noteId = id;
			const contentSnap = next;
			queueDiskWrite(async () => {
				const live = useVaultStore.getState().nodes[noteId];
				if (!live || live.kind !== "note") return;
				await persistNoteIfFsa(live.path, contentSnap);
				// Autosave landed on disk — clear dirty for this note so the UI says Saved
				const st = useVaultStore.getState();
				const cur = st.nodes[noteId];
				if (cur?.kind === "note" && cur.content === contentSnap) {
					useVaultStore.setState({
						dirtyNoteIds: st.dirtyNoteIds.filter((x) => x !== noteId),
						lastSavedAt: Date.now(),
					});
				}
			});
		} else if (!opts?.external && !isDiskVault(get().mode)) {
			// Demo / in-memory: treat settled edits as saved after a short calm period
			const noteId = id;
			const contentSnap = next;
			const prevTimer = demoSaveTimers.get(noteId);
			if (prevTimer) clearTimeout(prevTimer);
			demoSaveTimers.set(
				noteId,
				window.setTimeout(() => {
					demoSaveTimers.delete(noteId);
					const st = useVaultStore.getState();
					const cur = st.nodes[noteId];
					if (
						cur?.kind === "note" &&
						cur.content === contentSnap &&
						st.dirtyNoteIds.includes(noteId)
					) {
						useVaultStore.setState({
							dirtyNoteIds: st.dirtyNoteIds.filter((x) => x !== noteId),
							lastSavedAt: Date.now(),
						});
					}
				}, 450),
			);
		}
	},
	renameNode: (id, newName) => {
		flushStageNow(set);
		flushActiveEditors();
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
			if (hasBodyArchive()) rekeyBodyArchivePrefix(oldPath, newPath);
		} else if (node.kind === "note" && hasBodyArchive()) {
			rekeyBodyArchive(oldPath, newPath);
			if (typeof content === "string") setBodyInArchive(newPath, content);
		}
		set({ nodes });
		// Keep durable FTS path/title in sync after rename
		{
			const n = nodes[id];
			if (n?.kind === "note") {
				removeDurableNote(id);
				upsertDurableNoteFromNode(n);
			} else if (n?.kind === "folder") {
				for (const child of Object.values(nodes)) {
					if (child.kind === "note" && (child.path === newPath || child.path.startsWith(newPath + "/"))) {
						removeDurableNote(child.id);
						upsertDurableNoteFromNode(child);
					}
				}
			}
		}
		if (get().mode === "desktop" && desktopRoot) {
			const root = desktopRoot;
			queueDiskWrite(async () => {
				await renameDesktopPath(root, oldPath, newPath, node.kind, node.kind === "note" ? contentForDiskWrite(nodes[id]) : undefined);
				desktopWatchAck?.();
			});
		} else if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await renamePathOnDisk(root, oldPath, newPath, node.kind, node.kind === "note" ? contentForDiskWrite(nodes[id]) : undefined);
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
		let id = makeId(path, get().mode);
		let idN = 1;
		while (stage.nodes[id] && stage.nodes[id].path !== path) {
			id = makeId(path, get().mode) + "__" + idN;
			idN++;
		}
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
		vaultLinkIndex.setNoteLinks(id, content);
		touchBody(id);
		if (hasBodyArchive()) setBodyInArchive(path, content);
		const created = stage.nodes[id];
		if (created?.kind === "note") {
			upsertDurableNoteFromNode(created);
			try { upsertIndexedNote(created); } catch {}
		}
		if (hasBodyArchive() && typeof content === "string") setBodyInArchive(path, content);
		if (parentId == null && !stage.rootIds.includes(id)) stage.rootIds = [...stage.rootIds, id];
		if (parentId && !stage.expandedFolders.includes(parentId)) stage.expandedFolders = [...stage.expandedFolders, parentId];
		if (activate) {
			stage.activeNoteId = id;
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
		// Always materialize so activate:false callers (wikilink create) see nodes[id]
		flushStageNow(set);
		if (activate) {
			pushPulse({
				kind: "create",
				path,
				title: titleClean,
				message: `Created ${path}`,
				vaultId: get().vaultId
			});
			recordNoteOpen(get, set, id);
		}
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
		let id = makeId(path, get().mode);
		let idN = 1;
		while (stage.nodes[id] && stage.nodes[id].path !== path) {
			id = makeId(path, get().mode) + "__" + idN;
			idN++;
		}
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
		const date = new Date();
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
		return get().openDailyNoteForDate(new Date(), opts);
	},
	openDailyNoteForDate: async (date, opts) => {
		const silent = opts?.silent === true;
		const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const path = dailyNotePath(target);
		const existing = Object.values(get().nodes).find((n) => n.kind === "note" && n.path === path);
		const today = new Date();
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
			const yNote = Object.values(get().nodes).find((n) => n.kind === "note" && n.path === yPath);
			if (yNote) if (yNote.content !== undefined) yesterdayMarkdown = yNote.content;
			else yesterdayMarkdown = await get().ensureNoteBody(yNote.id);
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
		const allFolderPaths = Array.from(new Set([...implied, ...folderSpecs.map((f) => f.path.replace(/\\/g, "/").replace(/^\/+/, ""))])).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
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
			const id = makeId(fpath, get().mode);
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
					if (hasBodyArchive()) setBodyInArchive(path, content);
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
			const id = makeId(path, get().mode);
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
			dirtyNoteIds: activateLast && lastNote ? Array.from(new Set([...get().dirtyNoteIds, lastNote])) : get().dirtyNoteIds,
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
		flushActiveEditors();
		const nodes = { ...get().nodes };
		const target = nodes[id];
		if (!target) return;
		const toDelete = new Set();
		const idx = ensureVaultIndex(nodes);
		const walk = (nid) => {
			toDelete.add(nid);
			for (const c of idx.getChildIds(nid)) walk(c);
		};
		walk(id);
		const trashPayload = [];
		for (const d of toDelete) {
			const n = nodes[d];
			if (!n) continue;
			if (n.kind === "note") trashPayload.push({
				path: n.path,
				content: typeof n.content === "string" ? n.content : null,
				kind: "note"
			});
			else trashPayload.push({
				path: n.path,
				content: null,
				kind: "folder"
			});
		}
		for (const d of toDelete) {
			const gone = nodes[d];
			if (gone?.kind === "note" && hasBodyArchive()) removeBodyFromArchive(gone.path);
			delete nodes[d];
			vaultLinkIndex.removeNote(d);
			removeBodyTouch(d);
			removeDurableNote(d);
		}
		const diskTrash = isDiskVault(get().mode);
		pushPulse({
			kind: "delete",
			path: target.path,
			title: target.kind === "note" ? noteTitle(target) : target.name,
			message: diskTrash ? `Moved to trash: ${target.path}` : `Deleted ${target.path}`,
			vaultId: get().vaultId
		});
		set({
			nodes,
			rootIds: get().rootIds.filter((r) => !toDelete.has(r)),
			activeNoteId: toDelete.has(get().activeNoteId ?? "") ? null : get().activeNoteId,
			expandedFolders: get().expandedFolders.filter((x) => !toDelete.has(x)),
			dirtyNoteIds: get().dirtyNoteIds.filter((x) => !toDelete.has(x))
		});
		if (diskTrash) get().setToast("Moved to trash");
		if (get().mode === "desktop" && desktopRoot) {
			const root = desktopRoot;
			queueDiskWrite(async () => {
				for (const item of trashPayload) if (item.kind === "note") {
					const dest = trashRelativePath(item.path);
					try {
						try {
							await renameDesktopPath(root, item.path, dest, "note", item.content ?? undefined);
						} catch {
							let body = item.content;
							if (body === null) {
								console.warn("[vault] trash rename failed and body unloaded; leaving note", item.path);
								continue;
							}
							await writeDesktopNote(root, dest, body);
							await deleteDesktopPath(root, item.path, "note");
						}
					} catch (err) {
						console.warn("[vault] trash move failed", item.path, err);
						if (item.content !== null) try {
							await deleteDesktopPath(root, item.path, "note");
						} catch {}
					}
				}
				for (const item of trashPayload) if (item.kind === "folder") try {
					await deleteDesktopPath(root, item.path, "folder");
				} catch {}
				desktopWatchAck?.();
			});
		} else if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				for (const item of trashPayload) if (item.kind === "note") {
					const dest = trashRelativePath(item.path);
					try {
						let body = item.content;
						if (body === null) try {
							body = await readNoteFile(root, item.path);
						} catch (err) {
							console.warn("[vault] FSA trash hydrate failed; not deleting", item.path, err);
							continue;
						}
						await writeNoteFile(root, dest, body);
						await deletePathOnDisk(root, item.path, "note");
					} catch (err) {
						console.warn("[vault] FSA trash failed; not hard-deleting without copy", item.path, err);
					}
				}
				for (const item of trashPayload) if (item.kind === "folder") try {
					await deletePathOnDisk(root, item.path, "folder");
				} catch {}
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
		flushActiveEditors();
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
			if (hasBodyArchive()) rekeyBodyArchivePrefix(oldPath, newPath);
		} else if (node.kind === "note" && hasBodyArchive()) {
			rekeyBodyArchive(oldPath, newPath);
			if (typeof node.content === "string") setBodyInArchive(newPath, node.content);
		}
		// Keep durable FTS path/title in sync after move
		{
			const n = nodes[id];
			if (n?.kind === "note") {
				removeDurableNote(id);
				upsertDurableNoteFromNode(n);
			} else if (n?.kind === "folder") {
				for (const child of Object.values(nodes)) {
					if (child.kind === "note" && (child.path === newPath || child.path.startsWith(newPath + "/"))) {
						removeDurableNote(child.id);
						upsertDurableNoteFromNode(child);
					}
				}
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
				await renameDesktopPath(root, oldPath, newPath, node.kind, node.kind === "note" ? contentForDiskWrite(nodes[id]) : undefined);
				desktopWatchAck?.();
			});
		} else if (get().mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await renamePathOnDisk(root, oldPath, newPath, node.kind, node.kind === "note" ? contentForDiskWrite(nodes[id]) : undefined);
				if (watcherAck) await watcherAck(root);
			});
		}
	},
	setCommandOpen: (open) => set({ commandOpen: open }),
	setToast: (msg, action = null) => set({
		toast: msg,
		toastAction: msg ? action ?? null : null
	}),
	setRightTab: (tab) => set({ rightTab: tab }),
	openPulseRail: () => {
		set({
			settings: {
				...get().settings,
				rightOpen: true
			},
			rightTab: "pulse"
		});
	},
	listTrash: async () => {
		try {
			if (get().mode === "desktop" && desktopRoot) return (await listDesktopTrash(desktopRoot)).map((r) => trashEntryFromRel(r.relPath, r.mtime)).filter((e) => e != null);
			if (get().mode === "fsa" && fsaRoot) return (await listFsaTrash(fsaRoot)).map((r) => trashEntryFromRel(r.relPath, r.mtime)).filter((e) => e != null);
		} catch (err) {
			console.warn("[vault] listTrash failed", err);
		}
		return [];
	},
	restoreTrash: async (trashPath) => {
		flushStageNow(set);
		flushActiveEditors();
		const entry = trashEntryFromRel(trashPath, Date.now());
		if (!entry) {
			get().setToast("Could not restore — invalid trash path");
			return false;
		}
		const mode = get().mode;
		if (!isDiskVault(mode) || !desktopRoot && !fsaRoot) {
			get().setToast("Restore requires an open folder vault");
			return false;
		}
		let body;
		try {
			if (mode === "desktop" && desktopRoot) body = await readDesktopNote(desktopRoot, trashPath);
			else if (mode === "fsa" && fsaRoot) body = await readNoteFile(fsaRoot, trashPath);
			else return false;
		} catch (err) {
			console.warn("[vault] restoreTrash read failed", trashPath, err);
			get().setToast("Could not read trash item");
			return false;
		}
		const occupied = new Set(Object.values(get().nodes).map((n) => n.path));
		let destPath = entry.originalPath;
		if (occupied.has(destPath)) {
			const restoredFolder = `Restored/${entry.name}`;
			if (!occupied.has(restoredFolder)) destPath = restoredFolder;
			else {
				const base = entry.name.replace(/\.md$/i, "");
				let i = 1;
				destPath = `${base}-restored.md`;
				while (occupied.has(destPath)) {
					destPath = `${base}-restored ${i}.md`;
					i++;
				}
			}
		}
		const parts = destPath.split("/").filter(Boolean);
		const fileName = parts.pop();
		let parentId = null;
		let acc = "";
		for (const part of parts) {
			acc = acc ? `${acc}/${part}` : part;
			const hit = Object.values(get().nodes).find((n) => n.kind === "folder" && n.path === acc);
			if (hit) parentId = hit.id;
			else parentId = get().createFolder(parentId, part, { expand: true });
		}
		const stage = beginStage(get);
		if (parts.length) {
			const parentPathStr = parts.join("/");
			parentId = Object.values(stage.nodes).find((n) => n.kind === "folder" && n.path === parentPathStr)?.id ?? parentId;
		}
		const id = makeId(destPath, get().mode);
		const titleClean = fileName.replace(/\.md$/i, "");
		stage.nodes[id] = {
			id,
			path: destPath,
			name: fileName,
			kind: "note",
			parentId,
			mtime: Date.now(),
			content: body
		};
		vaultLinkIndex.setNoteLinks(id, body);
		touchBody(id);
		if (parentId == null && !stage.rootIds.includes(id)) stage.rootIds = [...stage.rootIds, id];
		if (parentId && !stage.expandedFolders.includes(parentId)) stage.expandedFolders = [...stage.expandedFolders, parentId];
		stage.activeNoteId = id;
		pushNoteVisit(id);
		if (!stage.dirtyNoteIds.includes(id)) stage.dirtyNoteIds = [...stage.dirtyNoteIds, id];
		scheduleStageFlush(set);
		flushStageNow(set);
		const restoredNode = get().nodes[id];
		if (restoredNode) upsertDurableNoteFromNode(restoredNode);
		const pth = destPath;
		const trashP = trashPath;
		if (mode === "desktop" && desktopRoot) {
			const root = desktopRoot;
			queueDiskWrite(async () => {
				await writeDesktopNote(root, pth, body);
				try {
					await deleteDesktopPath(root, trashP, "note");
				} catch {}
				desktopWatchAck?.();
			}, "restore");
		} else if (mode === "fsa" && fsaRoot) {
			const root = fsaRoot;
			queueDiskWrite(async () => {
				await writeNoteFile(root, pth, body);
				try {
					await deletePathOnDisk(root, trashP, "note");
				} catch {}
				if (watcherAck) await watcherAck(root);
			}, "restore");
		}
		pushPulse({
			kind: "create",
			path: destPath,
			title: titleClean,
			message: `Restored ${destPath}`,
			vaultId: get().vaultId
		});
		get().setToast(`Restored ${titleClean}`);
		return true;
	},
	simulateHermesWrite: () => {
		const { nodes, rootIds, mode } = get();
		const systems = Object.values(nodes).find((n) => n.kind === "folder" && n.path === "Systems");
		const path = HERMES_SAMPLE_NOTE.path;
		const existing = Object.values(nodes).find((n) => n.path === path);
		const content = HERMES_SAMPLE_NOTE.content.replace("${TS}", (new Date()).toISOString());
		if (existing) {
			get().updateNoteContent(existing.id, content, { external: true });
			if (isDiskVault(mode)) queueDiskWrite(() => persistNoteIfFsa(path, content));
			pushPulse({
				kind: "hermes",
				path,
				title: "Hermes Pulse",
				message: "Hermes updated Systems/Hermes Pulse.md",
				vaultId: get().vaultId
			});
			set({
				lastExternalSync: Date.now(),
				hermesTick: get().hermesTick + 1,
				toast: "Hermes updated Systems/Hermes Pulse.md",
				toastAction: null,
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
			toastAction: null,
			activeNoteId: id
		});
		pushPulse({
			kind: "hermes",
			path,
			title: "Hermes Pulse",
			message: "Hermes created Systems/Hermes Pulse.md",
			vaultId: get().vaultId
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
	_applyExternalSnapshotNow: (nodesIn, rootIds) => {
		flushStageNow(set);
		let nodes = nodesIn;
		const prev = get().nodes;
		const fingerprint = (map) => {
			let notes = 0;
			let mtimeXor = 0;
			let unloaded = 0;
			let bodyChars = 0;
			let pathHash = 0;
			for (const n of Object.values(map)) {
				if (n.kind !== "note") {
					for (let i = 0; i < n.path.length; i++) pathHash = pathHash * 31 + n.path.charCodeAt(i) | 0;
					continue;
				}
				notes += 1;
				mtimeXor ^= n.mtime | 0;
				if (n.content === undefined) unloaded += 1;
				else bodyChars += n.content.length;
				for (let i = 0; i < n.path.length; i++) pathHash = pathHash * 31 + n.path.charCodeAt(i) | 0;
			}
			return `${notes}:${unloaded}:${mtimeXor}:${bodyChars}:${pathHash}`;
		};
		if (fingerprint(prev) === fingerprint(nodes) && get().rootIds.length === rootIds.length && get().rootIds.every((id, i) => id === rootIds[i] || prev[id]?.path === nodes[rootIds[i]]?.path)) return;
		const active = get().activeNoteId;
		const activePath = active ? prev[active]?.path : null;
		let nextActive = active && nodes[active] ? active : null;
		if (!nextActive && activePath) nextActive = Object.values(nodes).find((n) => n.path === activePath)?.id ?? null;
		const pathToNewId = new Map();
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
				const restoredId = makeId(local.path, get().mode);
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
			if (local.content === undefined && disk.content === undefined) continue;
			if (local.content !== undefined && disk.content === undefined) {
				nodes = {
					...nodes,
					[diskId]: {
						...disk,
						content: local.content,
						mtime: local.mtime
					}
				};
				continue;
			}
			if (local.content === undefined && disk.content !== undefined) continue;
			const localBody = local.content;
			const diskBody = disk.content;
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
			const stamp = (new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
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
			const siblingId = makeId(sibling, get().mode);
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
				const primaryPath = local.path;
				const primaryBody = localBody;
				enqueueDiskOp(async () => {
					await persistNoteIfFsa(siblingPath, body, { ack: false });
					await persistNoteIfFsa(primaryPath, primaryBody, { ack: false });
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
		if (shouldLazyBodies(get().mode, get().vaultId)) {
			const keep = new Set([...remappedDirty]);
			if (nextActive) keep.add(nextActive);
			for (const id of dirty) {
				const p = prev[id]?.path;
				if (!p) continue;
				const nid = pathToNewId.get(p);
				if (nid) keep.add(nid);
			}
			let stripped = stripBodies(nodes, keep);
			for (const id of keep) {
				const cur = stripped[id];
				if (cur?.kind !== "note") continue;
				if (cur.content !== undefined) continue;
				const path = cur.path;
				const oldId = Object.keys(prev).find((k) => prev[k]?.path === path);
				const local = oldId ? prev[oldId] : prev[id];
				if (local?.kind === "note" && local.content !== undefined) stripped = {
					...stripped,
					[id]: {
						...cur,
						content: local.content
					}
				};
			}
			nodes = stripped;
			rebuildLinkIndex(nodes);
		}
		const noteDelta = Object.values(nodes).filter((n) => n.kind === "note").length - Object.values(prev).filter((n) => n.kind === "note").length;
		if (!conflictToast && noteDelta >= 2) {
			burstCount += Math.abs(noteDelta);
			burstPaths.push(activePath || "vault");
			if (burstTimer) clearTimeout(burstTimer);
			burstTimer = setTimeout(() => {
				burstTimer = null;
				if (burstCount >= BURST_MIN_COUNT) {
					const n = burstCount;
					burstCount = 0;
					burstPaths = [];
					const st = useVaultStore.getState();
					pushPulse({
						kind: "hermes",
						path: "vault",
						title: "Agent dump",
						message: `External writers changed ~${n} notes — review in Pulse`,
						vaultId: st.vaultId
					});
					st.setToast(`Agent activity: ~${n} notes changed — open Pulse to review`, {
						label: "Open Pulse",
						kind: "open-pulse"
					});
				} else {
					burstCount = 0;
					burstPaths = [];
				}
			}, BURST_WINDOW_MS);
		}
		const nextToast = conflictToast ? conflictToast : shouldToast && burstCount < BURST_MIN_COUNT ? "Vault updated from disk" : get().toast;
		set({
			nodes,
			rootIds: nextRootIds,
			lastExternalSync: now,
			activeNoteId: nextActive,
			dirtyNoteIds: remappedDirty,
			toast: nextToast,
			toastAction: nextToast === get().toast ? get().toastAction : null,
			expandedFolders: [...new Set([...remappedExpanded, ...expandPathToNote(nodes, nextActive)])]
		});
		maybeSyncDurableIndex(get().vaultId, get().mode, nodes);
		if (conflictToast) {
			const activeP = nextActive && nodes[nextActive]?.path || activePath || "vault";
			pushPulse({
				kind: "conflict",
				path: activeP,
				title: pathToName(activeP).replace(/\.md$/i, ""),
				message: conflictToast,
				vaultId: get().vaultId
			});
		} else if (shouldToast) pushPulse({
			kind: "external",
			path: activePath || "vault",
			title: activePath ? pathToName(activePath).replace(/\.md$/i, "") : "Vault",
			message: "Vault updated from disk",
			vaultId: get().vaultId
		});
	},
	getActiveNote: () => {
		const id = get().activeNoteId;
		if (!id) return null;
		return get().nodes[id] ?? null;
	},
	getChildren: (parentId) => {
		const nodes = get().nodes;
		return ensureVaultIndex(nodes).getChildren(nodes, parentId);
	},
	ensureNoteBody: async (id) => {
		const node = get().nodes[id];
		if (!node || node.kind !== "note") return null;
		if (node.content !== undefined) {
			touchBody(id);
			return node.content;
		}
		const inflight = bodyHydrateInflight.get(id);
		if (inflight) return inflight;
		const run = (async () => {
			const mode = get().mode;
			// Module vaultGen — bumped by cancelVaultModuleState on vault switch
			const genAtStart = vaultGen;
			const path = node.path;
			const backend = getActiveBackend() ?? backendFromMode(mode, fsaRoot, desktopRoot, () => ({
				nodes: get().nodes,
				rootIds: get().rootIds,
				signatures: {}
			}));
			if (!backend?.readNote) return null;
			try {
				const content = await backend.readNote(path);
				if (genAtStart !== vaultGen) return null;
				const cur = get().nodes[id];
				if (!cur || cur.kind !== "note") return null;
				// Path may have changed during await (rename) — refuse stale write
				if (cur.path !== path) return null;
				if (cur.content !== undefined) {
					touchBody(id);
					return cur.content;
				}
				const protectedIds = new Set([id, ...get().dirtyNoteIds]);
				const act = get().activeNoteId;
				if (act) protectedIds.add(act);
				touchBody(id);
				const victims = pickEvictions(protectedIds);
				const next = { ...get().nodes };
				next[id] = {
					...cur,
					content,
					mtime: cur.mtime
				};
				for (const v of victims) {
					if (v === id) continue;
					const n = next[v];
					if (n?.kind === "note" && n.content !== undefined) {
						if (hasBodyArchive()) setBodyInArchive(n.path, n.content);
						next[v] = {
							id: n.id,
							path: n.path,
							name: n.name,
							kind: n.kind,
							parentId: n.parentId,
							mtime: n.mtime
						};
					}
				}
				const dirtyIds = [id, ...victims.filter((v) => v !== id)];
				try {
					ensureVaultIndex(get().nodes).markDirty(dirtyIds);
				} catch {}
				set({ nodes: next });
				vaultLinkIndex.setNoteLinks(id, content);
				upsertDurableNoteFromNode({
					...cur,
					content
				});
				try {
					upsertIndexedNote({
						...cur,
						content
					});
				} catch {}
				return content;
			} catch (e) {
				console.warn("[nexus] ensureNoteBody failed", id, e);
				return null;
			} finally {
				bodyHydrateInflight.delete(id);
			}
		})();
		bodyHydrateInflight.set(id, run);
		return run;
	},
	flushDirty: () => {
		flushActiveEditors();
		diskWriteError = null;
		flushDiskOps();
		const disk = isDiskVault(get().mode);
		if (disk) for (const id of get().dirtyNoteIds) {
			const n = get().nodes[id];
			if (n?.kind === "note" && typeof n.content === "string") {
				const noteId = id;
				const body = n.content;
				queueDiskWrite(async () => {
					const live = useVaultStore.getState().nodes[noteId];
					if (!live || live.kind !== "note") return;
					await persistNoteIfFsa(live.path, body);
				});
			}
		}
		return writeQueue.then(() => {
			if (diskWriteError) return;
			for (const id of get().dirtyNoteIds) {
				const p = get().nodes[id]?.path;
				if (p) shelvedConflicts.delete(p);
			}
			set({ dirtyNoteIds: [], lastSavedAt: Date.now() });
			get().setToast(disk ? "Saved to disk" : "Saved");
			get().trimBodyCache();
		});
	},
	getBodyMemoryStats: () => {
		const st = get();
		if (!shouldLazyBodies(st.mode, st.vaultId)) return {
			loaded: 0,
			max: 0,
			protected: 0,
			underPressure: false,
			evictedSession: 0
		};
		const protectedIds = new Set(st.dirtyNoteIds);
		if (st.activeNoteId) protectedIds.add(st.activeNoteId);
		return getBodyCacheStats(protectedIds);
	},
	trimBodyCache: (opts) => {
		if (!shouldLazyBodies(get().mode, get().vaultId)) return 0;
		const protectedIds = new Set(get().dirtyNoteIds);
		const act = get().activeNoteId;
		if (act) protectedIds.add(act);
		const stats = getBodyCacheStats(protectedIds);
		const victims = pickEvictions(protectedIds, { aggressive: opts?.aggressive ?? stats.underPressure });
		if (!victims.length) return 0;
		const next = { ...get().nodes };
		for (const v of victims) {
			const n = next[v];
			if (n?.kind === "note" && n.content !== undefined) {
				if (hasBodyArchive()) setBodyInArchive(n.path, n.content);
				next[v] = {
					id: n.id,
					path: n.path,
					name: n.name,
					kind: n.kind,
					parentId: n.parentId,
					mtime: n.mtime
				};
				removeBodyTouch(v);
			}
		}
		try {
			ensureVaultIndex(get().nodes).markDirty(victims);
		} catch {}
		set({ nodes: next });
		return victims.length;
	},
	getConflictPairs: () => {
		const nodes = get().nodes;
		const idx = ensureVaultIndex(nodes);
		// Cache by structure generation — conflict siblings only appear via external shelving
		if (
			_conflictPairsCache &&
			_conflictPairsStructGen === idx.structureGeneration &&
			_conflictPairsNodesRef === nodes
		) {
			return _conflictPairsCache;
		}
		const pairs = detectConflictPairs(nodes);
		_conflictPairsCache = pairs;
		_conflictPairsStructGen = idx.structureGeneration;
		_conflictPairsNodesRef = nodes;
		return pairs;
	},
	getConflictItems: () => {
		const pairs = get().getConflictPairs();
		if (!pairs.length) return [];
		return filterDismissed(flattenConflictItems(pairs), new Set(get().dismissedConflictKeys));
	},
	getOpenConflictCount: () => get().getConflictItems().length,
	openConflictStudio: (focus) => {
		const items = get().getConflictItems();
		set({
			conflictStudioOpen: true,
			conflictStudioFocus: focus ?? (items[0] ? {
				primaryPath: items[0].primaryPath,
				siblingPath: items[0].sibling.path
			} : null)
		});
		set({ settings: {
			...get().settings,
			rightOpen: true
		} });
	},
	closeConflictStudio: () => {
		set({
			conflictStudioOpen: false,
			conflictStudioFocus: null
		});
	},
	setConflictStudioFocus: (focus) => {
		set({
			conflictStudioFocus: focus,
			conflictStudioOpen: true
		});
	},
	resolveConflictKeepMine: async (primaryPath, siblingPath) => {
		flushStageNow(set);
		flushActiveEditors();
		const pair = detectConflictPairs(get().nodes).find((p) => p.primaryPath === primaryPath);
		if (!pair) {
			get().setToast("Conflict no longer present");
			return;
		}
		const targets = siblingPath ? pair.siblings.filter((s) => s.path === siblingPath) : pair.siblings;
		if (!targets.length) {
			get().setToast("Conflict copy not found");
			return;
		}
		const primaryId = pair.primaryId;
		for (const sib of targets) get().deleteNode(sib.id);
		shelvedConflicts.delete(primaryPath);
		if (get().activeNoteId && targets.some((t) => t.id === get().activeNoteId)) get().setActiveNote(primaryId);
		pushPulse({
			kind: "update",
			path: primaryPath,
			title: pathToName(primaryPath).replace(/\.md$/i, ""),
			message: `Kept your version · removed ${targets.length} conflict cop${targets.length === 1 ? "y" : "ies"}`,
			vaultId: get().vaultId
		});
		get().setToast(targets.length === 1 ? "Kept your edits · conflict copy removed" : `Kept your edits · removed ${targets.length} conflict copies`);
		const remaining = get().getConflictItems();
		if (!remaining.length) get().closeConflictStudio();
		else set({ conflictStudioFocus: {
			primaryPath: remaining[0].primaryPath,
			siblingPath: remaining[0].sibling.path
		} });
	},
	resolveConflictTakeTheirs: async (primaryPath, siblingPath) => {
		flushStageNow(set);
		flushActiveEditors();
		const nodes = get().nodes;
		const pair = detectConflictPairs(nodes).find((p) => p.primaryPath === primaryPath);
		const sibling = pair?.siblings.find((s) => s.path === siblingPath);
		if (!pair || !sibling) {
			get().setToast("Conflict no longer present");
			return;
		}
		if (!pair.primaryId) {
			get().setToast("Primary note missing — keep mine to remove orphan");
			return;
		}
		const primaryId = pair.primaryId;
		await get().ensureNoteBody(primaryId);
		await get().ensureNoteBody(sibling.id);
		const primary = get().nodes[primaryId];
		const sibNode = get().nodes[sibling.id];
		if (!primary || primary.kind !== "note" || !sibNode || sibNode.kind !== "note") {
			get().setToast("Could not load conflict versions");
			return;
		}
		const localBody = primary.content ?? "";
		const theirsBody = sibNode.content ?? "";
		if (get().dirtyNoteIds.includes(primaryId) && localBody !== theirsBody) {
			const existing = new Set(Object.values(get().nodes).map((n) => n.path));
			const minePath = makeConflictSiblingPath(primaryPath, existing, "mine");
			existing.add(minePath);
			const mineId = makeId(minePath, get().mode);
			const parentId = primary.parentId;
			set({ nodes: {
				...get().nodes,
				[mineId]: {
					id: mineId,
					path: minePath,
					name: pathToName(minePath),
					kind: "note",
					parentId,
					mtime: Date.now(),
					content: localBody
				}
			} });
			if (isDiskVault(get().mode)) await queueDiskWrite(() => persistNoteIfFsa(minePath, localBody, { ack: false }));
			get().setToast(`Your edits saved as ${pathToName(minePath).replace(/\.md$/i, "")}`);
		}
		get().updateNoteContent(primaryId, theirsBody, { external: true });
		if (isDiskVault(get().mode)) await queueDiskWrite(() => persistNoteIfFsa(primaryPath, theirsBody, { ack: false }));
		get().deleteNode(sibling.id);
		shelvedConflicts.delete(primaryPath);
		get().setActiveNote(primaryId);
		pushPulse({
			kind: "update",
			path: primaryPath,
			title: pathToName(primaryPath).replace(/\.md$/i, ""),
			message: "Took external version",
			vaultId: get().vaultId
		});
		get().setToast("Took external version");
		const remaining = get().getConflictItems();
		if (!remaining.length) get().closeConflictStudio();
		else set({ conflictStudioFocus: {
			primaryPath: remaining[0].primaryPath,
			siblingPath: remaining[0].sibling.path
		} });
	},
	openConflictPair: (primaryPath, siblingPath) => {
		const nodes = get().nodes;
		const primaryId = Object.values(nodes).find((n) => n.kind === "note" && n.path === primaryPath)?.id ?? null;
		if (primaryId) get().setActiveNote(primaryId);
		else {
			const sibId = Object.values(nodes).find((n) => n.kind === "note" && n.path === siblingPath)?.id;
			if (sibId) get().setActiveNote(sibId);
		}
		get().openConflictStudio({
			primaryPath,
			siblingPath
		});
		(async () => {
			if (primaryId) await get().ensureNoteBody(primaryId);
			const sib = Object.values(get().nodes).find((n) => n.kind === "note" && n.path === siblingPath);
			if (sib) await get().ensureNoteBody(sib.id);
		})();
	},
	dismissConflictFromList: (primaryPath, siblingPath) => {
		const key = conflictItemKey(primaryPath, siblingPath);
		const keys = get().dismissedConflictKeys;
		if (keys.includes(key)) return;
		set({ dismissedConflictKeys: [...keys, key] });
		const focus = get().conflictStudioFocus;
		if (focus && focus.primaryPath === primaryPath && focus.siblingPath === siblingPath) {
			const remaining = get().getConflictItems();
			if (!remaining.length) get().closeConflictStudio();
			else set({ conflictStudioFocus: {
				primaryPath: remaining[0].primaryPath,
				siblingPath: remaining[0].sibling.path
			} });
		}
	},
	clearConflictDismissals: () => set({ dismissedConflictKeys: [] }),
	enterGraphFolder: (path) => {
		const p = (path || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
		set({
			graphScopeMode: p ? "folder" : "vault",
			graphBrowsePath: p,
			graphEgoReturnPath: null,
		});
	},
	exitGraphFolder: () => {
		const cur = get().graphBrowsePath || "";
		if (!cur) {
			if (get().graphScopeMode === "ego") {
				const ret = get().graphEgoReturnPath;
				set({
					graphScopeMode: ret ? "folder" : "vault",
					graphBrowsePath: ret || "",
					graphEgoReturnPath: null,
				});
				return true;
			}
			return false;
		}
		const parts = cur.split("/").filter(Boolean);
		parts.pop();
		const next = parts.join("/");
		set({
			graphScopeMode: next ? "folder" : "vault",
			graphBrowsePath: next,
		});
		return true;
	},
	resetGraphBrowse: () => {
		set({
			graphScopeMode: "vault",
			graphBrowsePath: "",
			graphEgoReturnPath: null,
		});
	},
	enterGraphEgo: (opts) => {
		const ret =
			opts && "returnPath" in opts
				? opts.returnPath
				: get().graphBrowsePath || null;
		set({
			graphScopeMode: "ego",
			graphEgoReturnPath: ret ?? null,
		});
	},
	returnFromGraphEgo: () => {
		const ret = get().graphEgoReturnPath;
		set({
			graphScopeMode: ret ? "folder" : "vault",
			graphBrowsePath: ret || "",
			graphEgoReturnPath: null,
		});
	},
	/** Wave 5 — show graph panel/fullscreen so folder map is visible. */
	ensureGraphVisible: () => {
		const s = get().settings;
		if (s.graphMode === "hidden" || !s.rightOpen) {
			set({
				settings: {
					...s,
					graphMode: s.graphMode === "hidden" ? "panel" : s.graphMode,
					rightOpen: true,
				},
			});
		}
	},
	/**
	 * Wave 5 — reveal a tree/CmdK node in the graph.
	 * Folders enter folder map; notes open ego on large vaults (no scope thrash via setActiveNote alone).
	 */
	revealInGraph: (nodeId) => {
		const n = get().nodes[nodeId];
		if (!n) return;
		get().ensureGraphVisible();
		const noteCount = Object.values(get().nodes).filter((x) => x.kind === "note").length;
		if (n.kind === "folder") {
			get().enterGraphFolder(n.path || "");
			return;
		}
		if (n.kind === "note") {
			if (shouldUseFolderGraph(noteCount)) {
				const parent = (n.path || "").replace(/\\/g, "/").split("/").filter(Boolean);
				parent.pop();
				get().enterGraphEgo({ returnPath: parent.join("/") });
			}
			if (get().activeNoteId !== nodeId) get().setActiveNote(nodeId);
		}
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
		// Never write the 45k seed (or any huge mount) to localStorage — QuotaExceededError.
		const isLargeTest = s.vaultId === LARGE_TEST_VAULT_ID;
		const nodeCount = s.nodes ? Object.keys(s.nodes).length : 0;
		const tooBig = isLargeTest || nodeCount > 2500;
		if (disk || tooBig) {
			return {
				vaultId: null,
				vaultName: "",
				vaultPath: "",
				mode: "demo",
				nodes: {},
				rootIds: [],
				activeNoteId: null,
				settings: s.settings,
				expandedFolders: []
			};
		}
		return {
			vaultId: s.vaultId,
			vaultName: s.vaultName,
			vaultPath: s.vaultPath,
			mode: s.mode,
			nodes: s.nodes,
			rootIds: s.rootIds,
			activeNoteId: s.activeNoteId,
			settings: s.settings,
			expandedFolders: s.expandedFolders
		};
	}
})
) as unknown as import("zustand").UseBoundStore<import("zustand").StoreApi<VaultStore>>;
export function getNoteDisplayTitle(node: VaultNode | null | undefined) {
	if (!node) return "";
	return noteTitle(node);
}
/** Parent folder path only — note title is shown separately in the editor chrome. */
export function getBreadcrumbs(node: VaultNode | null | undefined, nodes: Record<string, VaultNode>) {
	if (!node) return [];
	const parts: string[] = [];
	let cur = node.parentId ? nodes[node.parentId] : undefined;
	while (cur) {
		parts.unshift(cur.kind === "note" ? noteTitle(cur) : cur.name);
		cur = cur.parentId ? nodes[cur.parentId] : undefined;
	}
	return parts;
}
