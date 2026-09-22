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

## Browser
- Only **Edge** is installed (no Chrome/Firefox). `read_dom`/`browser_console` are unavailable — rely on screenshots/zoom.
- The app's `Ctrl+N` shortcut is hijacked by Edge (new window); use the sidebar `+` next to THREADS instead.
- Mock provider is the default and needs no keys.

## Exercising the agent (offline mock keywords, last user msg)
- `hello`/anything → plain echo reply. `calc 21*2` → calculator (safe). `fetch ...`/`http`/`url`/`web` → http_fetch (confirm approval). `file`/`write` → write_file (confirm). `shell`/`command`/`terminal` → run_shell_command (dangerous approval). `remember`/`memory` → memory_save (safe). `search`/`knowledge` → knowledge_search (safe). `subagent`/`delegate` → spawn_agent ×1; add `team`/`parallel` → ×2 (researcher+writer).
- Approval cards pause the run; Approve/Always allow/Deny. "Always allow" or the Inspector's per-tool `auto` checkbox whitelists via `PUT /api/settings/auto-approve`.
- Keyword matching is ordered — earlier regexes win (subagent > shell > fetch > file > remember > search > calc > help), so avoid accidental earlier keywords in test messages.

## Useful probes
- Thread detail incl. runs: `GET /api/threads/:id` (run.status, depth, parent_run_id, tokens). Pending approvals: `GET /api/approvals`. Activity feed: `GET /api/activity?limit=200`.
- SSE replay: `GET /api/runs/:id/events` streams persisted events even for finished runs — quick way to verify event history without UI.

## Known pitfalls discovered while testing (verify before reuse)
- A custom MCP plugin whose `command` doesn't exist can crash the server (unhandled spawn 'error') and the plugin row may persist enabled=1 → every boot retries and crashes. Recovery: `DELETE FROM plugins WHERE id='<pid>'` in agentdesk.db, then restart.
- Runs in-flight during a crash stay `running` forever (no boot reconciliation); pending approvals become unresumable after restart (resolver map is in-memory).
- On Windows, `spawn('npx.cmd')` without `shell:true` fails EINVAL — bundled MCP marketplace entries can't activate there.
