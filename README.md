# Battly Launcher for Hytale

Battly Launcher is an open source launcher for Hytale focused on patch-based updates, mod management, and a modern desktop UX.

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Status](https://img.shields.io/badge/status-beta-3b82f6)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)

---

## What Is Included

- Patch pipeline with `.pwr` files (download, validate, apply, recover).
- Version channels (`release` and `pre-release`) with API/CDN fallback support.
- Custom client/server patching for community auth and server compatibility.
- In-app mods browser and installer (CurseForge integration).
- News feed with safe fallback behavior.
- Full i18n runtime with locale JSON files.
- Rotating launcher backgrounds with fade transitions.
- In-app game logs viewer (tail 100/200/500, full log, realtime mode).

---

## Runtime Stack

- Electron + Node.js 20+
- Renderer: vanilla HTML/CSS/JS
- IPC bridge: `src/preload.js`
- Build flow: `build.js` + `electron-builder`

Main external endpoints in current architecture:

- API config and metadata: `https://api.battlylauncher.com/hytale/config`
- Patch CDN: `https://cdn.battlylauncher.com/hytale/patches/...`
- Auth session service: `https://sessions.battly.org`

---

## Requirements

- Windows 10/11 x64
- Node.js 20+
- Internet connection for first setup and patch delivery

Notes for Linux development/testing:

- The launcher supports Linux workflows in services, but game binary compatibility depends on GLIBC and build target.
- If a patch file is downloaded as 0 bytes, the launcher now treats it as invalid and retries/fallbacks.

---

## Local Development

```bash
git clone https://github.com/1ly4s0/Battly4Hytale.git
cd Battly4Hytale
npm install
npm start
```

Build package:

```bash
npm run build
```

---

## Project Structure

```text
src/
|- main.js                    # Electron main process
|- preload.js                 # Safe renderer bridge
|- renderer.js                # Main UI state and interactions
|- index.html                 # Main launcher window
|- splash.html                # Splash screen window
|- scripts/                   # UI helper modules (i18n, navigation, bg rotator)
|- services/                  # Domain services (game, patcher, mods, news, logs, versions)
|- styles/                    # CSS modules (match, legacy, splash)
|- locales/                   # Translation files
|- assets/                    # Images, icons, bundled ui libs
|- utils/                     # Helpers (logger, sanitizer, integrity)

docs/
|- ARCHITECTURE.md
|- STYLES.md
```

---

## Version Channels and Patch Selection

The launcher now works with explicit channels:

- `release` (official/stable)
- `pre-release` (beta)

Selection flow:

1. Renderer asks `versionManager` for available channels and versions.
2. Main process reads API metadata.
3. If metadata cannot be resolved, fallback mapping is used.
4. Selected patch is validated before apply.
5. Empty or invalid patch files are rejected and retried.

This prevents stale fallback text such as "manifest unavailable" from blocking channel-based selection.

---

## Game Launch Flow

Launch flow (high level):

1. Resolve selected version/channel.
2. Ensure Java runtime (`services/javaManager.js`).
3. Ensure game files and apply `.pwr` patch if required (`services/patcher.js`).
4. Patch client/server binaries (`patchClient` / `patchServer`).
5. Build auth tokens and launch process (`services/game.js`).
6. Stream stdout/stderr into `services/gameLogs.js`.

If launch fails, the user can inspect logs directly from Settings.

---

## Settings and Logs

Settings include:

- player/account management
- language selection
- GPU preference
- hide launcher on play
- java override
- open game location
- repair game
- open game logs

Game logs modal modes:

- last 100 lines
- last 200 lines
- last 500 lines
- full log (slow on large sessions)
- realtime stream

---

## Troubleshooting

### Patch fails with 403 or empty `.pwr`

- Check CDN availability and selected channel.
- Confirm fallback map entries include your platform and target version.
- Delete invalid cached patch (`0 bytes`) and retry.

### "Game executable not found after patching"

- Trigger Repair Game.
- Verify game path inside `%AppData%/Hytale/instances/...`.
- Confirm patch apply finished without interruption.

### Linux GLIBC mismatch

Typical error pattern: `GLIBC_2.xx not found`.

- Run on a newer distro/runtime with compatible GLIBC.
- Ensure target binary matches your runtime expectations.

### News openExternal error

If you see `Cannot read properties of undefined (reading 'openExternal')`, verify preload API exposure and renderer usage for external links.

---

## Documentation

- Architecture internals: `docs/ARCHITECTURE.md`
- CSS architecture and conventions: `docs/STYLES.md`

---

## Contributing

When opening a PR:

1. Keep IPC changes mirrored in `main.js` and `preload.js`.
2. Add/update i18n keys in all locale files when UI text changes.
3. Do not add new inline styles when a module CSS file is available.
4. Update documentation when behavior changes (especially launch/patch/version flow).

---

## License

ISC

Hytale is a trademark of Hypixel Studios. This launcher is an independent community project and is not affiliated with Hypixel Studios.
