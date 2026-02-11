# Architecture

This document describes the runtime architecture of Battly Launcher 1.1.0, the responsibilities of each layer, and safe extension patterns.

---

## 1. Process Model

Battly uses Electron with strict separation:

- Main process: privileged orchestration (`src/main.js`)
- Preload bridge: controlled API surface (`src/preload.js`)
- Renderer process: UI state and interactions (`src/renderer.js`)

Renderer never accesses Node primitives directly. All privileged work moves through IPC.

---

## 2. Main Process Responsibilities

`src/main.js` is responsible for:

- creating and managing splash and main windows
- registering all `ipcMain.handle` and `ipcMain.on` channels
- routing UI actions to services
- enforcing external-link behavior and window controls
- update checks and lifecycle hooks

Main delegates domain logic to `src/services/*`.

---

## 3. Preload and Security Contract

`src/preload.js` exposes `window.electronAPI` and `window.fileSystem` with allowlists:

- allowed events for `send`
- allowed methods for `invoke`
- allowed channels for listeners

This is the security boundary for renderer access. Every new IPC channel must be explicitly whitelisted here.

---

## 4. Renderer Responsibilities

`src/renderer.js` coordinates:

- view switching (`Home`, `Mods`, overlays)
- account picker and onboarding state
- translation loading and runtime string replacement
- version channel and version select UI
- settings modal and game logs modal
- news cards and external links

Renderer should stay focused on view state and user actions, not filesystem/network internals.

---

## 5. Service Layer

Key services in `src/services/`:

- `game.js`: full launch pipeline orchestration
- `javaManager.js`: runtime resolution and install checks
- `patcher.js`: `.pwr` patch download/apply/validation
- `serverPatcher.js`: server jar patching
- `mods.js`: CurseForge search/install/toggle/remove
- `news.js`: news feed retrieval and normalization
- `updater.js`: launcher update checks
- `versionManager.js`: channel/version resolution and cache
- `gameLogs.js`: session log capture and retrieval
- `config.js`: launcher settings persistence
- `playerManager.js`: account and player identity helpers

---

## 6. Version and Patch Flow

Current policy:

- versions are resolved by API/CDN metadata and fallback maps
- launcher supports channel-based browsing (`release` / `pre-release`)
- patch files are validated before use
- empty patch files (0 bytes) are rejected

Execution path:

1. UI requests available channels and versions.
2. Main queries `versionManager`.
3. Selected patch is downloaded to cache.
4. `patcher.js` validates file integrity and size.
5. Butler apply is executed with staging dir.
6. Executable discovery is revalidated before launch.

---

## 7. Game Launch Pipeline

High-level sequence in `game.js`:

1. receive launch request and selected version
2. ensure java runtime
3. ensure game payload via patch pipeline
4. patch client and server binaries if needed
5. request/build auth tokens
6. start log session and spawn game process
7. stream stdout/stderr to logger and `gameLogs`
8. report launch status to renderer

Error handling includes dedicated responses for:

- Java setup failures
- patch apply failures
- missing executable after patch
- process spawn/exit failures
- Linux GLIBC mismatch hints

---

## 8. IPC Surface

Common invoke channels:

- `get-settings`, `save-settings`
- `get-news`
- `get-available-versions`
- `get-version-channels`
- `get-selected-version`, `set-selected-version`
- `search-mods`, `install-mod`, `toggle-mod`, `delete-mod`, `list-installed-mods`
- `get-game-logs`

Common event channels:

- `launch-game`
- `open-external`
- `repair-game`
- `open-game-location`
- `minimize-window`, `close-window`

Any IPC expansion must update:

1. `main.js` registration
2. `preload.js` allowlist
3. renderer integration
4. docs (this file)

---

## 9. Data and Persistence

Launcher settings:

- `%AppData%/Battly4Hytale/user-settings.json`

Game/runtime data:

- `%AppData%/Hytale/instances/...`
- `%AppData%/Hytale/cache/...`
- `%AppData%/Hytale/logs/...`
- `%AppData%/Hytale/version-config.json`

Renderer local state typically uses `localStorage` for transient UI preferences.

---

## 10. UI Composition

The UI is split across:

- structure: `src/index.html`
- state logic: `src/renderer.js`
- visual system: `src/style.css`, `src/style-match.css`, `src/styles/*`

Primary windows:

- splash (`src/splash.html`)
- launcher main window (`src/index.html`)

Main sections:

- Home (hero + news + version + play)
- Mods (discover + installed)
- Settings modal
- Game logs modal
- onboarding/account modals

---

## 11. Extension Guidelines

When adding a feature:

1. define domain logic in the service layer
2. expose a minimal IPC contract in main
3. whitelist channel in preload
4. bind UI controls in renderer
5. add/update locale keys in all languages
6. update docs (`README.md`, this file, styles doc if needed)

Avoid placing business logic in renderer-only code.

---

## 12. Known Risks and Ongoing Work

- Legacy CSS modules still coexist with match modules; avoid regressions when editing shared selectors.
- Renderer remains a large file; gradual modularization should continue.
- Linux runtime compatibility is sensitive to GLIBC and bundled native libs; keep fallbacks explicit.
- Patch reliability depends on upstream CDN behavior; retry/fallback logic must stay strict.
