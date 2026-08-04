# Test fixtures

## large-test-vault.zip

45,000-note PARA-style stress vault (seed 42). Used for scale testing.

### In-app (web / live preview)

Welcome screen → **Open 45k test vault**

Loads the prebuilt seed under `public/large-test-vault/` into the real Nexus shell (tree, graph, search, editor).

### Desktop (Tauri)

1. Unzip this archive to a local folder.
2. Nexus → **Open folder…** → select `large-test-vault`.

That path exercises DurableIndex + native SQLite + meta-only open (desktop scale path).
