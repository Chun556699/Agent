<div align="center">

# AgentDesk

**A local-first agent work platform — and a readable, end-to-end demo of how agents actually work.**

Multi-provider model gateway · tool/plugin system with human approval gates · sub-agents with isolated contexts · durable threads — all in one dependency-light app.

[English](README.md) · [简体中文](README.zh-CN.md)

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)
![Backend deps](https://img.shields.io/badge/server%20deps-0-orange)

![Chat — tool calls and a delegated sub-agent team](docs/screenshots/chat.png)

</div>

## Why this repo

Most agent frameworks hide the interesting parts behind abstractions. AgentDesk
implements the whole agent loop in a **zero-runtime-dependency Node backend**
(~2k lines) — provider drivers, tool registry, approval gates, sub-agent
contexts, context compaction, SSE event replay — small enough to read in an
evening, real enough to use daily.

If you want to learn how a coding-style agent works under the hood, read
[`server/agentdesk/agents/runtime.js`](server/agentdesk/agents/runtime.js) — the
entire run loop is one function.

## Highlights

- **Multi-provider model gateway** — 17 vendors over 3 wire drivers
  (OpenAI-compatible, Anthropic, Gemini) plus an offline **mock** provider so
  the whole app runs with zero API keys: OpenAI, Anthropic, Google, DeepSeek,
  Moonshot (Kimi), Qwen, Zhipu (GLM), MiniMax, Doubao, Mistral, Groq, xAI,
  OpenRouter, Ollama, LM Studio, and a custom OpenAI-compatible endpoint.
- **Human approval gates** — `http_fetch`, `write_file`, `run_shell_command`
  and every MCP tool pause the run for an explicit decision (approve once /
  always allow / deny); a denial is fed back to the model.
- **Sub-agents** — `spawn_agent` delegates a self-contained task to a
  specialist (researcher, coder, writer, analyst, or your own) with an isolated
  context; the UI renders the child run tree inline, depth ≤ 3.
- **Context management** — per-run token budget accounting, automatic
  compaction of older turns into a rolling thread summary, and an inspector
  panel that shows exactly what the model saw.
- **Plugin marketplace** — bundled module plugins (weather, web search, GitHub
  read-only) plus **MCP stdio servers**: connect any MCP server and its tools
  appear as `plugin:tool`, all approval-gated. Drop `.mjs` modules into
  `~/.agentdesk/plugins/` for your own.
- **Durable threads** — SQLite (WAL) persistence; every run is a replayable
  event stream consumed live over SSE, so a reload (or crash) loses nothing.
- **Desktop shell** — optional Electron wrapper in `desktop/` with an embedded
  server lifecycle.

## Screenshots

| Approval gate | Run inspector |
|---|---|
| ![Approval gate](docs/screenshots/approval.png) | ![Run inspector](docs/screenshots/inspector.png) |

| Providers | Plugin marketplace | Agents |
|---|---|---|
| ![Providers](docs/screenshots/providers.png) | ![Plugins](docs/screenshots/plugins.png) | ![Agents](docs/screenshots/agents.png) |

## Quickstart

Requires **Node ≥ 22** (uses `node:sqlite`).

```bash
npm install
npm --prefix web install
npm run build        # builds web/dist
npm run dev          # http://127.0.0.1:8787
```

Everything works offline with the built-in **mock** provider — no keys needed.
Try these prompts to exercise every subsystem:

| Prompt | What it exercises |
|---|---|
| `calc 21*2` | the `calculator` tool |
| `fetch example.com` | `http_fetch` + **approval gate** |
| `write a file` | `write_file` (workspace sandbox + approval) |
| `run a shell command` | `run_shell_command` (dangerous approval tier) |
| `remember I like oolong` | `memory_save` — shared agent memory |
| `search the knowledge base` | `knowledge_search` over past messages |
| `spawn a subagent team` | two delegated child runs (researcher + writer) |

For frontend dev with HMR: `npm --prefix web run dev` (Vite on :5173, proxies
`/api` → :8787).

Data lives in `~/.agentdesk/` (`agentdesk.db`, `plugins/`, `workspace/`,
`.master-key`). Override with `AGENTDESK_DATA_DIR`; port via `AGENTDESK_PORT`.

## How the agent loop works

```
user message
   │
   ▼
build context ──► chat.completions stream ──► text? → persist → reply
   │  (thread history,                     │
   │   summary, memories,                  ▼
   │   tool schemas)                tool_call → approval-gated?
   │                                  │        yes → pause run, wait for human
   │                                  ▼
   └──────────── tool result ── execute in sandbox
                                  │
                       spawn_agent → child run (isolated context, depth ≤ 3)
```

Every step emits a persisted event (`run_started`, `assistant_delta`,
`tool_call`, `approval_requested`, `subagent_started`, `run_completed`, …) —
`GET /api/runs/:id/events` replays any run, finished or live.

Reading order for the core: `agents/runtime.js` (the loop) →
`agents/context.js` (context assembly + compaction) → `tools/` (registry,
builtins, sandbox) → `providers/` (the three wire drivers).

## Architecture

```
web/            React 19 + Vite + Tailwind v4 — chat, run inspector, plugins, settings
server/
  index.js      node:http server — security headers, API router, static SPA
  agentdesk/
    api.js      REST + SSE routes, boot wiring
    db.js       node:sqlite (WAL): threads, runs, messages, events, approvals, plugins, memories
    events.js   event bus — persist + fan out to SSE subscribers
    crypto.js   AES-256-GCM secret store (master key file)
    providers/  driver contract + openai / anthropic / gemini / mock, vendor catalog
    tools/      registry + builtin tools (calc, http_fetch, files, shell, memory, knowledge)
    agents/     roles, context builder/compactor, runtime (loop, approvals, sub-agents)
    plugins.js  marketplace catalog, module + MCP plugin activation
    mcp.js      stdio JSON-RPC MCP client
plugins/        bundled module plugins (weather, web-search, github)
desktop/        Electron shell (optional)
tests/          node:test — providers, context, runtime/approvals, security
```

The **server has zero runtime dependencies** — only Node ≥22 (`node:http`,
`node:sqlite`, `node:crypto`). Vite/React/Tailwind exist only under `web/` for
the UI build.

## API sketch

```
GET  /api/health
GET/PUT/POST/DELETE  /api/providers[...]      vendor config + connectivity test
GET/POST/DELETE      /api/agents[...]         builtin + custom agents
GET/POST/DELETE      /api/threads[...]        threads + messages + runs
POST /api/threads/:id/runs                    start a run → { runId }
GET  /api/runs/:id/events                     SSE event stream (replay + live)
POST /api/runs/:id/cancel
GET  /api/runs/:id/context                    token budget / compaction stats
GET  /api/approvals · POST /api/approvals/:id pending tool approvals
PUT  /api/settings/auto-approve               per-tool "always allow"
GET/POST/DELETE      /api/plugins[...]        marketplace, install, MCP connect
GET/DELETE           /api/memory[...]         shared agent memory
GET  /api/activity                            recent event feed
```

## Testing

```bash
npm test     # node:test — provider parsers, context compaction,
             # approval gate, sub-agents, SSRF/sandbox/crypto
```

## Security

See [SECURITY.md](SECURITY.md) — encrypted provider keys (AES-256-GCM), SSRF
guard, per-tool approval gates, workspace sandboxing, CSP/security headers, and
the threat model for module plugins.

## Contributing

This is a learning-oriented codebase — small, dependency-free, and meant to be
read. Issues and PRs welcome.

## License

Apache-2.0 — see [LICENSE](LICENSE).
