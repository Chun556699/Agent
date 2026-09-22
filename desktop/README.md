# AgentDesk Desktop

Electron shell for the AgentDesk local server. The window is frameless — the
titlebar is part of the web UI (`web/src/components/Titlebar.tsx`), so the
desktop app and the web app share one design system.

## Run

```bash
npm --prefix web install && npm run build   # build the UI once
npm --prefix desktop install                # downloads Electron (~100MB, once)
npm --prefix desktop start
```

`main.mjs` spawns `server/index.js` (needs `node` on PATH), waits for
`/api/health`, then opens a frameless `BrowserWindow` at `http://127.0.0.1:8787`.
`preload.mjs` exposes `window.agentdeskDesktop` (`minimize`, `toggleMaximize`,
`close`, `onMaximized`, `platform`) — the web UI shows its custom titlebar only
when that bridge exists, so browser usage stays clean.

## Design

- Frameless window, `backgroundColor` = paper `#f5f3ee` to avoid a white flash.
- Titlebar: 40px, draggable region across the top, bolt mark + "AgentDesk"
  wordmark left, Windows-style controls (min / maximize-restore / close) right.
  On macOS the same bar renders for traffic-light spacing (`platform` bridge
  tells the UI which side to put controls on).
- Same design tokens as the web app — one system, two shells.

## Notes

- Electron is a devDependency here and is NOT vendored — `npm --prefix desktop
  install` downloads the binary once.
- `desktop:dev` also opens detached DevTools.
- The web UI works fully in a browser without this shell; the desktop app only
  adds native window chrome.
