# AgentDesk Desktop

Electron shell for the AgentDesk local server. The window is frameless — the
titlebar is part of the web UI (`web/src/components/Titlebar.tsx`), so the
desktop app and the web app share one design system.

## Run

```bash
npm --prefix web install && npm run build   # build the UI once
npm --prefix desktop install                # downloads Electron (~100MB, once)
npm --prefix desktop start                  # add --dev for detached DevTools
```

`main.mjs` shows a splash screen, spawns `server/index.js` (needs `node` on
PATH, or `AGENTDESK_NODE` pointing at a Node ≥22 binary), waits for
`/api/health`, then swaps the splash for the app at `http://127.0.0.1:8787`.
Packaged builds reuse the Electron binary itself in `ELECTRON_RUN_AS_NODE`
mode, so installers have no Node dependency.

## Desktop features

- **Single instance** — a second launch focuses the existing window and
  forwards its `agentdesk://` deep link (`agentdesk://thread/<id>` opens a
  thread).
- **Window state** — size/position/maximized persisted in
  `userData/window-state.json`; off-screen positions are discarded.
- **Splash** — `splash.html` (paper bg, pulsing bolt) renders while the
  server boots; the window appears on `ready-to-show`.
- **System tray** — bolt icon; click toggles the window, menu has Show/Quit.
- **Native notifications** — finishing a run while the window is unfocused
  posts an OS notification; clicking it focuses the app.
- **Navigation guards** — `http(s)` links open in the system browser;
  in-window navigation is pinned to the app origin.
- **Context menu** — edit roles on inputs (undo/cut/copy/paste/select all),
  copy/select-all + Inspect elsewhere.
- **Shortcuts** — F12 DevTools, Ctrl+R / Ctrl+Shift+R reload, Ctrl+= / − / 0
  zoom, plus the web app's own Ctrl+N / Ctrl+K.
- **Custom titlebar** — draggable, double-click toggles maximize,
  Windows-style min/restore/close buttons (red hover on close).
- **Logging** — embedded server stdout/stderr → `userData/logs/server.log`.
- **macOS** — minimal app/edit/window menu so Cmd+C/V work; Cmd+Q also
  kills the child server (`before-quit`).

## Packaging

```bash
npm --prefix desktop run dist       # NSIS installer + portable exe (win)
npm --prefix desktop run dist:dir   # unpacked dir only — fast sanity check
```

electron-builder packs the repo root (`directories.app = ".."`): the main
process, splash and assets go into `app.asar`; `server/`, `web/dist/` and
`plugins/` are `asarUnpack`ed so the spawned server process can read them.
In packaged mode the server data dir defaults to `userData/data`.

The `agentdesk` protocol is registered by the installer (`build.protocols`).

## Design

- Frameless window, `backgroundColor` = paper `#f5f3ee` to avoid a white flash.
- Titlebar: 40px, draggable region across the top, bolt mark + "AgentDesk"
  wordmark left, Windows-style controls (min / maximize-restore / close) right.
  On macOS the same bar renders for traffic-light spacing (`platform` bridge
  tells the UI which side to put controls on).
- Same design tokens as the web app — one system, two shells.

## Preload bridge

`preload.mjs` exposes `window.agentdeskDesktop`: `minimize`,
`toggleMaximize`, `close`, `isMaximized()`, `onMaximized`, `notify`,
`openExternal`, `onDeepLink`, `platform`, `versions`. The web UI shows its
custom titlebar only when that bridge exists, so browser usage stays clean.

## Notes

- Electron + electron-builder are devDependencies here and are NOT vendored —
  `npm --prefix desktop install` downloads them once.
- The web UI works fully in a browser without this shell; the desktop app
  only adds native window chrome and the features above.
