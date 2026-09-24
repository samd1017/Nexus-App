# Shell catalog

A vault of hundreds of thousands of notes has to answer a click the same way a vault of a few dozen notes does. The interactive shell is a window. The catalog is not in the window.

This is the desktop path. The browser stays a capped demo. No timed open of a 500,000-note vault is claimed here.

## Runtime

Stay on Tauri, Rust, and SQLite. The editor stays TypeScript and React. A new language is not the roadblock. The roadblock is the contract that copied every note, every structural index, and every link edge into the WebView and then walked them on click, scroll, and graph select.

The native process may spend time and memory building the catalog. The UI process may not. Interactive work is a page or a query result.

## What stays in the renderer

- The open note (and the second pane), bodies in a small LRU
- The visible file-tree window, fed by pages
- Search hits (the existing FTS limit)
- The graph draw list: at most 320 folder-map nodes, or 400 ego nodes
- Chrome that does not subscribe to the catalog

Small vaults (fewer than 400 notes) still materialize every note so the full note graph remains the small-vault picture.

## What is native

- `note_meta` is the catalog. Markdown on disk stays canonical.
- `vault_shell_mount` writes or reuses that catalog and returns either the small vault or one window (root page, the open note, and the folders on its path)
- `vault_shell_children` returns one page of a folder
- `vault_shell_level` returns one map level inside the draw cap
- `vault_shell_ego` returns a 2-hop neighborhood inside the draw cap
- `vault_shell_note` returns one row when a search hit is not already in the window
- `vault_shell_backlinks` returns incoming notes for one id (at most 80 rows, plus the count)
- `vault_shell_tags` and `vault_shell_tag_notes` read `tag_map`
- `vault_shell_suggest` returns a title/path prefix page (at most 40)
- `vault_shell_recent` returns notes ordered by modification time
- `vault_shell_forget` marks rows deleted when a watched path is gone, so the open tree page can drop them
- `vault_shell_paths` resolves pinned paths (at most 24)
- `vault_shell_path_page` answers `path:` and `folder:` with one page (at most 40)
- `vault_shell_orphans` and `vault_shell_broken` are bounded catalog pages
- `vault_shell_known_norms` checks outgoing link targets against the catalog
- `vault_shell_mentions` returns a few indexed heads for a title phrase
- FTS stays a SQLite query

A cold open commits the root page, and the open note's folder page, before the rest of the vault is walked. Expanding a folder that is not in the catalog yet lists that directory and commits its first page. While the fill walks, each path batch also commits title/path search rows, and a short run of note heads (tags included) commits early, on a separate connection from the clicks.

Shell reads use a short busy timeout (40ms, three tries, about 156ms) and drop the process lock before sleeping. The UI tries twice. If the lock is still held, the command returns `shell_busy`. The screen keeps the last page, or stays empty when nothing has loaded, and refreshes when the next fill batch commits. A gesture does not sit on a long lock.

## What leaves the interactive path

- Shipping `vault_meta_walk` into the Zustand note map on desktop open, when the shell command is present
- Rebuilding a structural index of every note in order to paint the tree or the map
- Copying `link_edge` into the WebView while the shell window is active
- The desktop watcher signature walk and full-scan snapshot while the shell window is active. OS notify refreshes the affected page and drops paths that are no longer on disk. It does not remount the vault.
- Backlinks, the tag rail, wikilink suggestions, title lookup outside FTS, Recent-by-mtime, pinned notes, `path:` / `folder:` filters, orphans, broken links, and unlinked mentions reading the in-memory window. Those are per-note or per-query catalog calls. The window stays a page. Unlinked mentions see indexed heads, not every full body.

If the shell command is missing, desktop open still falls back to the full meta walk. That fallback is not the large-vault path.

## Acceptance

Same gestures on a small vault and a large one. Vault size must not add work to the gesture.

| Gesture | Budget |
| --- | --- |
| Keystroke in the open note | No catalog walk on the UI thread. Frame time stays in the same band as a small vault. |
| Tree scroll | Virtual rows only. The row model grows with opened pages, not with the vault. |
| Expand a folder, or “more” | One page. At most 200 rows. The UI thread does not scan the catalog. |
| Open search | The palette paints without a JavaScript scan of every note. Hits are an FTS result, or a bounded title prefix when FTS is not ready. |
| Switch notes | One body read. At most one catalog row when the note is outside the window. |
| Backlinks, tags, wikilink suggest, Recent | One catalog query. The result is a page, not the note map. |
| Map level or neighborhood | At most 320 folder nodes or 400 ego nodes, from a query. Selecting a node does not build a node per note. |
| While search fill is running | Those gestures stay on the page or the query. A busy catalog gives up inside a fraction of a second, keeps the last page, and refreshes when the catalog is free. It does not freeze the shell for the length of a fill batch. |
| Tag rail and prefix suggestions | Paint from heads already in the catalog. They do not wait for the deep fill to finish. |

Re-test by repeating those gestures on a small folder and on a large folder, including during fill. The large folder should not get a slower click, scroll, or keystroke as the note count climbs.

## Still in the way

These are real gaps. They are why a large vault is not yet the same product as a small one.

- Title search for the first page is announced before the rest of the folder is listed. Folders are visited in name order, so the top of the vault (including `00-Inbox`) is in that page. That page stays the same size as the folder grows: Ready does not load the catalog into memory, and a fat folder is not held in memory before the page is searchable. The banner does not wait to count every file, and it does not show the full vault at 100%. The rest of the names are listed afterward, yielding between batches and checkpointing so search does not slow down as the listing gets longer. A title in a folder the listing has not reached yet is missing until that batch lands. Note text is still only read for the open window. A word in a note you have not opened is still missing, and so is a word past the deep head of a note you have opened. A 500,000-note open is not claimed here.
- If a fill transaction outlasts the short retry budget, the gesture keeps the last page (or an empty one) and refreshes later. It does not hang. A folder the walker has not reached can still open its first page from disk.
- Older note-only catalogs gain their root folder page from one directory listing. Nested folder rows appear when that folder is opened, or as the fill walk reaches it. Open does not read every note path to invent folders.
- The tag rail reads `tag_map` for heads already written. It stays empty until the first head batch, then paints those tags without waiting for the rest of the vault. It does not scan bodies in the window.
- Wikilink suggestions on this path match a prefix of the title or path already in the catalog. A substring in the middle of every title is not a keystroke query.
- Backlink rows are capped. The count is the reverse-index total for that note. Snippets are not loaded for every source.
- Unlinked mentions read a page of indexed heads (the short head while fill is partial, a deeper head later), not every full body.
- Orphan detection treats a note as linked when an edge names its title. A link that only matches a path can still look unlinked.
- A single directory with more entries than one page is still listed once, so the first page is the real folders-then-name window. Only that page is ordered, and modification time is read only for those rows. The listing does not read note bodies and does not enter subfolders.
- The browser does not implement the desktop pin, path, orphan, broken-link, or mention commands. Those panels stay on the window the browser already pages.
- The browser pages a granted folder through a disposable local catalog, including backlinks, tags, neighborhood, and search, and still refuses above its cap. After the window paints, it indexes the rest of each note and picks up a new file in an open folder. What that client still lacks is listed in [VAULT-CONTRACT.md](./VAULT-CONTRACT.md).
