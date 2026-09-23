# Vault contract

One vault. Plain Markdown folders on disk. Every client reads and writes those files. A catalog is a disposable cache that a client may rebuild. Nexus does not host the notes.

This is the law for desktop, mobile, and the local browser. The desktop shell pages are in [SHELL-CATALOG.md](./SHELL-CATALOG.md). No timed open of a 500,000-note vault is claimed here. Mobile is specified, not shipped.

## Truth

- A note is a `.md` file. A folder is a directory. The path is the identity people sync.
- The file on disk wins. Clients do not keep a second copy that can override the file after a sync.
- YAML frontmatter, `#tags`, and `[[wikilinks]]` are Markdown. They are not a private database format.
- Attachments are files next to the notes. Trash is files under `.trash/` in the same folder.

## Sync

Cloud is optional and never Nexus-hosted. A person may open a folder on the local disk, or the same folder living in a provider they already use (iCloud, Drive, Dropbox, Syncthing, or another file sync). Nexus does not require an account to open notes.

Sync is the provider's job. Nexus watches the folder and re-reads what changed.

**Conflict default:** last writer of the file wins, as the sync tool left it. Nexus does not merge two bodies. If a provider writes a conflicted copy beside the original, both files stay in the folder and show up as two notes. A client that sees a newer mtime reloads that file. It does not push a stale in-memory body back over the file.

## Clients

| Client | Role | Catalog | Renderer |
| --- | --- | --- | --- |
| Desktop (Tauri) | Flagship. The 500k feel bar. | SQLite next to app data. Disposable. | A window. Under 400 notes, every note. At and above that, pages. |
| Mobile | Same vault, same commands, native shell. Not built in this tree yet. | Same SQLite shell as desktop, on device. | The same window contract as desktop. |
| Local web | Convenience. A browser tab against a folder the user granted. | IndexedDB in that browser. Disposable. | The same page size. Still refuses past the Chrome cap. |

No client puts the whole vault into the renderer in order to paint a click, a scroll, or a keystroke.

### Desktop must

- Read and write the folder the user picked.
- Ask `vault_shell_*` for a page, a map level, a neighborhood, one note, backlinks, tags, a title prefix, and recent notes.
- Keep bodies in a small LRU.
- Retry a busy catalog briefly and still return the page while search fill runs.

### Desktop must not

- Copy `note_meta` or `link_edge` into the WebView on open.
- Require a Nexus account.
- Upload the folder to a Nexus server.

### Web must

- Open only a folder the user granted (File System Access, or the desktop app when the browser cannot).
- Page the tree, the map level, title prefix, and recent list from the local catalog once the folder is at or above 400 notes.
- Keep the Chrome cap: warn near 15,000 notes, refuse above 25,000. That cap is the walk and the browser, not a claim that the tab matches desktop at 500,000.
- Under 400 notes, materialize the folder so the full note graph still draws.

### Web must not

- Put every note of a large folder into the renderer.
- Pretend the tab is the 500k product.
- Require a Nexus account, or send notes to a Nexus host.
- Fall back to a full in-memory scan when the local catalog cannot be opened. Open fails instead.

### Web gaps still open

These are real. The browser is paged. It is not desktop.

- Backlinks and the tag rail on a paged web vault stay empty until a later pass writes links and tags into the local catalog. The tab does not scan every body to fill them.
- The map neighborhood is the open note only. Link edges are not in the browser catalog yet.
- Search still indexes the window the renderer holds, not the whole folder.
- The browser does not yet drop a deleted file from an open page on notify. A full folder rescan is skipped on purpose, because that scan was the thing that put the vault back into the tab. Deletes show up on the next open.
- Recent modification times depend on reading file metadata during the open walk. The renderer does not keep those file objects.
- There is no 500k browser measurement, and there will not be one inside this cap.

## Mobile target

Do not invent a second note format. The next mobile run is a Tauri iOS/Android shell around the Rust catalog that desktop already calls.

- Shared core: `src-tauri` commands `vault_shell_mount`, `vault_shell_children`, `vault_shell_level`, `vault_shell_ego`, `vault_shell_note`, `vault_shell_backlinks`, `vault_shell_tags`, `vault_shell_tag_notes`, `vault_shell_suggest`, `vault_shell_recent`, `vault_shell_forget`.
- Shared UI contract: the React shell already branches on `shellCatalog`. Mobile sets that the same way desktop does. Page size stays 200. Map caps stay 320 and 400.
- On-device SQLite is disposable. The folder of Markdown is the vault. Sync is still the user's provider, including whatever folder sync the phone already has.
- Out of scope until a device build exists: a store listing, a Nexus account, a hosted note API, and any claim that a phone has opened 500,000 notes.

A binary is not part of this change. The boundary above is the starting point so the next run does not guess a new data model.
