# Contributing to Nexus

Thank you for considering a contribution.

This project was started by a non-professional developer directing AI tools. The goal is a focused, retrieval-first local knowledge system that other developers can respect and improve. Clear, kind, practical contributions are valued.

## License

By contributing you agree that your contributions are licensed under the **MIT License**. See [LICENSE](LICENSE).

## How to run the project

### Web

```bash
git clone https://github.com/samd1017/Nexus-App.git
cd Nexus-App
npm install
npm run dev
```

### Desktop (Tauri)

See [DESKTOP.md](DESKTOP.md) for full requirements.

```bash
npm install
npm run tauri:dev
```

## Tests and quality checks

Useful commands (run from repo root):

```bash
npm run typecheck
npm run lint
npm run format
npm run qa:gate          # broader local QA suite
npm run test:fixture-integrity
npm run bench:scale
npm run bench:indexes
```

There is a large test vault under `public/large-test-vault/` for stress-testing search, graph, and indexing. Prefer exercising real flows against it when changing search or vault code.

Visual checks: the preferred path is the web version with Playwright + screenshots. Native Tauri screenshots are also useful for desktop-specific UI.

## Coding expectations

- Prefer extension over rewrite of the existing architecture (Tauri 2 + React/TypeScript + DurableIndex).
- Markdown files on disk remain the only source of truth. The search index stays disposable.
- Keep changes focused and reviewable.
- Prefer clear, readable code. Run `npm run format` and `npm run lint` before opening a PR.
- Do not introduce accounts, required cloud services, or proprietary note formats for core functionality.

## Pull requests

1. Fork and create a branch from `main`.
2. Make focused changes.
3. Open a PR against `main` with a short description of *why* the change exists.
4. The maintainer reviews together with Grok. Feedback will be left on the PR.

Large unrelated changes are harder to review and may be asked to be split.

## Proposing larger ideas

Open an issue first for significant architecture or product direction changes (hybrid ranking design, grounded Ask interface, major scaling work, etc.). Discussion before a large PR saves everyone time.

## Questions

Open an issue or discussion. Straightforward questions are welcome.
