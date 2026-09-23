---
name: testing-agentdesk
description: How to run and end-to-end test the AgentDesk app on this Windows box (backend restart, mock-provider keywords, browser choice, DB recovery).
---

# Testing AgentDesk (Chun556699/Agent)

## Run the app
- Backend: `AGENTDESK_DATA_DIR=/tmp/agentdesk-data /c/hostedtoolcache/node/24.0.1/x64/node.exe server/index.js` from the repo root → http://127.0.0.1:8787 (serves built `web/dist`; no dev server needed). Log: `/tmp/agentdesk.log`. Health: `GET /api/health`.
- Only Node 24 exists at that path; npm/npx **bash shims are broken** — call `node.exe` with `node_modules/npm/bin/npm-cli.js` for npm ops.
- Data dir on Windows resolves to `C:\Users\Administrator\AppData\Local\Temp\agentdesk-data` (NOT `/tmp` for tools that need a real path — e.g. `node:sqlite` cannot open POSIX `/tmp/...`; use the `C:/...` form).
- DB file: `<datadir>/agentdesk.db` (node:sqlite). Inspect/recover with `node.exe -e "const {DatabaseSync}=require('node:sqlite'); ..."`.

## Browser / Desktop shell
- Only **Edge** is installed (no Chrome/Firefox). `read_dom`/`browser_console` are unavailable — rely on screenshots/zoom.
- The app's `Ctrl+N` shortcut is hijacked by Edge (new window); use the sidebar `+` next to THREADS instead. The `Ctrl N new thread` hint is intentionally rendered ONLY inside the Electron shell (`window.agentdeskDesktop` gate) — seeing it means you're in Electron, not a bug.
- The **Electron shell may already be running** (check `tasklist electron.exe`) — it has no address bar; custom titlebar (bolt + AgentDesk + thin Min/Max/Close) is inside the page.
- Launch it: `./desktop/node_modules/electron/dist/electron.exe ./desktop` from repo root (electron is preinstalled under `desktop/node_modules`; `desktop/package.json` devDep `electron@^33`).
- **Frameless Electron has no reload shortcut** — to remount/reload a thread, click another thread then back (equivalent to F5).
- Window-controls test: titlebar Min/Max-Restore(Square↔Copy tooltip flip)/Close. Default geometry is 1280×840 > the 1024×768 display, so a "restored" window still fills the screen — judge the toggle by the tooltip/state flip, not size.
- Embedded-server lifecycle test: kill the running backend, launch electron with `AGENTDESK_NODE=C:/hostedtoolcache/node/24.0.1/x64/node.exe AGENTDESK_DATA_DIR=/tmp/agentdesk-data` → it spawns its own server → close window → port 8787 must die (killServer on window-all-closed/before-quit). Without `AGENTDESK_NODE` it spawns PATH `node` (v20 → `node:sqlite` import fails) → ~15s → `dialog.showErrorBox` + quit — the intended failure path.
- **Splash screen is <1s** — too fast for tool screenshots. Capture it with a PowerShell loop: relaunch electron, then in PS `Add-Type -AssemblyName System.Drawing; $bmp=New-Object System.Drawing.Bitmap 1024,768; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save("cap.png")` every ~250ms. The recording itself usually catches a few frames too.
- **Tray icon hunt**: the AgentDesk bolt sits in the overflow flyout (click `^` chevron ~884,745) among look-alikes — Docker whale and Azure icons look similar at 16px. Dead icons from killed instances linger until hovered/clicked (they evaporate). The live one right-clicks to "Show AgentDesk/Quit"; left-click toggles hide/show.
- **Single-instance relaunch restores a hidden window**: `win.hide()` leaves no taskbar button; relaunching electron.exe triggers the second-instance handler → first window show+focus. Deterministic way to un-hide if tray-icon hunting fails.
- **Notification test**: `document.hidden` is true when minimized — send `spawn a subagent team` (runs ~4s), minimize within ~1s, toast "Run finished · N tokens" appears bottom-right. Short `hello` runs race the hide. Direct probe: `window.agentdeskDesktop.notify("t","b")` in devtools fires a toast immediately.
- Window-state file: `%APPDATA%/agentdesk-desktop/window-state.json` — `{x,y,width,height,maximized}`; persisted on window close.
- Mock provider is the default and needs no keys.

## Exercising the agent (offline mock keywords, last user msg)
- `hello`/anything → plain echo reply. `calc 21*2` → calculator (safe). `fetch ...`/`http`/`url`/`web` → http_fetch (confirm approval). `file`/`write` → write_file (confirm). `shell`/`command`/`terminal` → run_shell_command (dangerous approval). `remember`/`memory` → memory_save (safe). `search`/`knowledge` → knowledge_search (safe). `subagent`/`delegate` → spawn_agent ×1; add `team`/`parallel` → ×2 (researcher+writer).
- Approval cards pause the run; Approve/Always allow/Deny. "Always allow" or the Inspector's per-tool `auto` checkbox whitelists via `PUT /api/settings/auto-approve`.
- Keyword matching is ordered — earlier regexes win (subagent > shell > fetch > file > remember > search > calc > help), so avoid accidental earlier keywords in test messages.

## Useful probes
- Thread detail incl. runs: `GET /api/threads/:id` (run.status, depth, parent_run_id, tokens). Pending approvals: `GET /api/approvals`. Activity feed: `GET /api/activity?limit=200`.
- SSE replay: `GET /api/runs/:id/events` streams persisted events even for finished runs — quick way to verify event history without UI.

## Previously-fixed pitfalls (kept as regression tests to re-check)
- A custom MCP plugin whose `command` doesn't exist used to crash the server and brick every boot — now: `spawn` 'error' is handled, and rows are only enabled after successful activation. Regression check: connect a bogus MCP, expect a clean error + no row.
- Zombie runs/stranded approvals are reconciled at boot: `running`/`awaiting_approval` → `failed`, pending approvals → `expired`. Mid-session stranded approvals are decidable via `pendingApprovals` on `GET /api/threads/:id`.
- On Windows, MCP commands ending `.cmd`/`.bat` must spawn via `shell:true` — the `cmd.exe /d /s /c` + quoting alternative was tried and broke every install: a fully-quote-wrapped line hits `network path not found`, quoting the bare command breaks PATH lookup, and quoted args leak literally into batch `%*`. Reproduce spawns outside the app with a small node script capturing stdout+stderr — the MCP client swallows stderr, so the log only says `MCP server exited`.
