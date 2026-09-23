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
- FTS stays a SQLite query

Shell reads use a short busy timeout. If the fill writer is in a transaction, the gesture keeps the current frame instead of waiting out a long lock.

## What leaves the interactive path

- Shipping `vault_meta_walk` into the Zustand note map on desktop open, when the shell command is present
- Rebuilding a structural index of every note in order to paint the tree or the map
- Copying `link_edge` into the WebView while the shell window is active
- The desktop watcher signature walk and full-scan snapshot while the shell window is active. OS notify refreshes the affected page only.

If the shell command is missing, desktop open still falls back to the full meta walk. That fallback is not the large-vault path.

## Acceptance

Same gestures on a small vault and a large one. Vault size must not add work to the gesture.

| Gesture | Budget |
| --- | --- |
| Keystroke in the open note | No catalog walk on the UI thread. Frame time stays in the same band as a small vault. |
| Tree scroll | Virtual rows only. The row model grows with opened pages, not with the vault. |
| Expand a folder, or “more” | One page. At most 200 rows. The UI thread does not scan the catalog. |
| Open search | The palette paints without a JavaScript scan of every note. Hits are an FTS result. |
| Switch notes | One body read. At most one catalog row when the note is outside the window. |
| Map level or neighborhood | At most 320 folder nodes or 400 ego nodes, from a query. Selecting a node does not build a node per note. |
| While search fill is running | Those gestures stay on the page or the query. A busy catalog keeps the current frame. It does not freeze the shell for the length of a fill batch. |

Re-test by repeating those gestures on a small folder and on a large folder, including during fill. The large folder should not get a slower click, scroll, or keystroke as the note count climbs.

## Still in the way

These are real gaps. They are why a large vault is not yet the same product as a small one.

- The first catalog build and the FTS fill still walk the vault in the native process. That cost is not part of a click, and it has not been timed at 500,000 notes.
- A shell read that finds the database busy returns no new page. The frame stays up, but the gesture does not complete until a later try.
- Backlinks, the tag rail, wikilink suggestions, and title search outside FTS still read the in-memory window. On a large vault that window is incomplete until those panels become per-note or per-query calls.
- “Recent” by modification time is the window, not the catalog.
- A loaded tree page does not drop a file that disappeared until the vault is opened again.
- Adding folder rows to an older note-only index streams paths inside the native process once.
- The browser folder path is unchanged and still refuses far below this budget.
