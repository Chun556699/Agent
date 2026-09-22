# Security review — AgentDesk

Scope: the whole platform (server API, agent runtime, tool/plugin system, web UI).
Reviewed against OWASP-style risks for a local agent desktop: secret storage,
SSRF via agent tools, code execution, path traversal, injection, and transport/UI
hardening. Findings and the controls that address them are listed below.

## Deployment posture

AgentDesk binds to `127.0.0.1:8787` by default — a local-first app, not a public
service. `AGENTDESK_HOST` can widen that; if you ever expose it beyond localhost
you MUST put it behind authentication — the API currently has none (single-user
local trust model). CSRF is not a vector for a localhost JSON API served without
cookies.

## Threat model → controls

| Threat | Control | Where |
|---|---|---|
| Provider API keys at rest | AES-256-GCM with a random 32-byte master key file (`~/.agentdesk/.master-key`, mode `0600`). Ciphertext stored in SQLite; keys never leave the server, never logged, UI only reports `hasKey`. | `server/agentdesk/crypto.js`, `providers/index.js` |
| SSRF via `http_fetch` | Scheme allowlist (http/https only), hostname blocklist (localhost etc.), DNS resolution + private-IP rejection covering loopback, RFC-1918, link-local, CGNAT, all IPv6. Re-resolution at request time. | `tools/builtin.js` (`assertPublicUrl`) |
| Shell execution | `run_shell_command` is `danger` = dangerous → requires explicit per-call approval; runs in `cmd.exe`/`/bin/sh` with a scrubbed env, inside the workspace dir, 30s timeout, 64KB output cap. | `tools/builtin.js`, approval gate in `agents/runtime.js` |
| Path traversal | File tools resolve against `WORKSPACE_DIR` and reject anything escaping it (`resolveInWorkspace`). | `tools/builtin.js` |
| Prompt-injection tool abuse | Every non-safe tool (`http_fetch`, `write_file`, `run_shell_command`, MCP tools) pauses the run and requires a user decision in the UI; "Always allow" is per-tool opt-in and stored as a setting, never default. Denial returns a denial tool-result to the model rather than executing. | `agents/runtime.js` (`requestApproval`, `decideApproval`) |
| Arbitrary code via plugins | Module plugins are `.mjs` files imported in-process — they are trusted code by design; only files the operator drops in `~/.agentdesk/plugins/` load, tool-name collisions are rejected, and activation failures are logged without crashing boot. MCP plugins spawn local stdio processes; their tools are all `danger` = confirm (approval-gated). | `plugins.js`, `mcp.js` |
| Static-file path traversal | The SPA handler canonicalizes and rejects `..`; unknown paths fall back to `index.html`. | `http.js` |
| XSS / injection in UI | React-escaped rendering only (no `dangerouslySetInnerHTML`); CSP `default-src 'self'` blocks inline scripts and foreign origins; `nosniff`, `frame-ancestors 'none'`, `referrer-policy`. | `http.js` (`securityHeaders`), `web/` |
| SQL injection | All queries are parameterized through `q.get/all/run`; the only LIKE-based search (`knowledge_search`, `memory_search`) binds values. | `db.js`, `tools/builtin.js` |
| Sub-agent runaway | `MAX_DEPTH` = 3 and `MAX_ITERATIONS` = 12 per run bound recursion; child runs share the thread's tool surface but with the agent's own allowlist. | `agents/runtime.js` |
| Secrets in events/messages | API keys are never included in tool args the model can see (they live in provider config); events persist only tool name + args, and args go through no secret-bearing path today. | `events.js`, `providers/*` |

## Findings fixed during build

1. **Message ordering race (found by flaky test):** messages were ordered by
   `created_at` (second precision) with a random-id tiebreak, so a tool result
   could sort before its assistant call and re-trigger an approval-gated tool.
   Now ordered by `rowid` (insertion order) in context loading and the API.
2. **Approval deadlock:** `POST /threads/:id/runs` awaited `startRun`, so a run
   waiting on an approval never returned. Runs now start in the background and
   stream state over SSE.

## Known limitations / recommendations

- **No auth on the API** — acceptable for `127.0.0.1`; add a token or OS-level
  auth before any non-localhost deployment.
- **Master key is a local file** — a host compromise yields provider keys.
  Acceptable for a desktop threat model; a future improvement is OS keychain
  storage (e.g. `keytar`).
- **Module plugins run in-process with full privileges** — treat them like
  application code; there is no sandbox boundary. Only install plugins you
  trust; prefer the MCP (separate-process) plugin kind when available.
- **`knowledge_search`/`memory_search` are substring matches** — an agent can
  read anything previously persisted in the thread/memory store by design
  (memory is a shared feature). Do not paste secrets into prompts.
- **npm dependencies are web-build-time only** (Vite/React); the server itself
  has zero runtime dependencies, shrinking the supply-chain surface.
