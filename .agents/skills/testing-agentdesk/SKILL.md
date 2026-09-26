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
- Mock provider is the default and needs no keys.

## Exercising the agent (offline mock keywords, last user msg)
- `hello`/anything → plain echo reply. `calc 21*2` → calculator (safe). `fetch ...`/`http`/`url`/`web` → http_fetch (confirm approval). `file`/`write` → write_file (confirm). `shell`/`command`/`terminal` → run_shell_command (dangerous approval). `remember`/`memory` → memory_save (safe). `search`/`knowledge` → knowledge_search (safe). `subagent`/`delegate` → spawn_agent ×1; add `team`/`parallel` → ×2 (researcher+writer).
- Approval cards pause the run; Approve/Always allow/Deny. "Always allow" or the Inspector's per-tool `auto` checkbox whitelists via `PUT /api/settings/auto-approve`.
- Keyword matching is ordered — earlier regexes win (subagent > shell > fetch > file > remember > search > calc > help), so avoid accidental earlier keywords in test messages.

## Useful probes
- Thread detail incl. runs: `GET /api/threads/:id` (run.status, depth, parent_run_id, tokens). Pending approvals: `GET /api/approvals`. Activity feed: `GET /api/activity?limit=200`.
- SSE replay: `GET /api/runs/:id/events` streams persisted events even for finished runs — quick way to verify event history without UI.

## macOS variant (Chun556699/Agent on macOS boxes)
- Plain `npm --prefix web run build` and `node server/index.js` work — Node 24 via homebrew; no broken shims. Use `AGENTDESK_DATA_DIR=/tmp/agentdesk-test` for a throwaway DB.
- Browser: **Chrome** is installed (Safari too). `read_dom`/`browser_console` require Chrome foreground — quit any overlapping app (e.g. iOS Simulator) or the tools report "Chrome is not in the foreground". Maximize via `osascript -e 'tell application "Google Chrome" to set bounds of front window to {0,25,1024,768}'`.
- Check for a stale server first: `lsof -i :8787`; an old server with a different AGENTDESK_DATA_DIR will mask fresh-state tests.
- Orphaned runIds (run row never inserted) wedge the UI: `GET /api/runs/:id/events` returns 404 → EventSource closes permanently (browsers do NOT retry 4xx) → the client-side error cap never fires → composer stuck on "agent working"; Stop doesn't help. Repro: pick "Custom (OpenAI-compatible)" provider + default model → send.
- The "completed/failed · N tokens" status line in RunStream is transient by design — Chat.tsx unmounts the stream the instant a terminal status arrives, so it paints ~1 frame; don't chase it in screenshots, verify tokens via `GET /api/threads/:id` runs.

## Previously-fixed pitfalls (kept as regression tests to re-check)
- A custom MCP plugin whose `command` doesn't exist used to crash the server and brick every boot — now: `spawn` 'error' is handled, and rows are only enabled after successful activation. Regression check: connect a bogus MCP, expect a clean error + no row.
- Zombie runs/stranded approvals are reconciled at boot: `running`/`awaiting_approval` → `failed`, pending approvals → `expired`. Mid-session stranded approvals are decidable via `pendingApprovals` on `GET /api/threads/:id`.
- On Windows, MCP commands ending `.cmd`/`.bat` spawn via `shell:true` — bundled `npx.cmd` entries can activate (still needs npx installed).
