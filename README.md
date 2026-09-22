# AgentDesk

A local-first **agent work platform**: multi-provider model gateway, tool/plugin
system with an approval layer, sub-agents with isolated contexts, and durable
threads — all in one dependency-light desktop app.

## Features

- **Multi-provider model gateway** — 17 vendors via 3 wire drivers
  (OpenAI-compatible, Anthropic, Gemini) plus an offline **mock** provider so the
  whole app works with zero keys: OpenAI, Anthropic, Google, DeepSeek, Moonshot
  (Kimi), Qwen, Zhipu (GLM), MiniMax, Doubao, Mistral, Groq, xAI, OpenRouter,
  Ollama, LM Studio, and a custom OpenAI-compatible endpoint. Per-provider base
  URL, model list, and a live connectivity test.
- **Sub-agents** — `spawn_agent` delegates a self-contained task to a specialist
  agent (researcher, coder, writer, analyst, or your own custom agent) running
  its own isolated context; the UI renders the child run tree inline, depth ≤ 3.
- **Context management** — per-run context view, token-budget accounting
  (~4 chars/token estimate), automatic compaction of older turns into a
  rolling thread summary, and an inspector panel showing usage.
- **Plugin marketplace** — bundled module plugins (weather, web search, GitHub
  read-only) plus **MCP stdio servers**: connect any MCP server (e.g.
  `@modelcontextprotocol/server-filesystem`) and its tools appear as
  `plugin:tool`, all approval-gated. Drop `.mjs` modules in
  `~/.agentdesk/plugins/` for your own.
- **Approval gates** — `http_fetch`, `write_file`, `run_shell_command`, and all
  MCP tools pause the run for a human decision (approve once / always allow /
  deny); denial is fed back to the model.
- **Durable threads** — SQLite (WAL) persistence; every run is a replayable
  event stream consumed live over SSE.

## Quickstart

```bash
npm install
npm --prefix web install
npm run build        # builds web/dist
npm run dev          # http://127.0.0.1:8787
```

Everything works offline with the built-in **mock** provider — try
`calc 21*2`, `fetch example.com`, `remember this`, `spawn a subagent team`,
`write file`, or `run a shell command` to exercise tools, approvals and
sub-agents without an API key.

For frontend dev with HMR: `npm --prefix web run dev` (Vite on :5173,
proxies `/api` → :8787).

Data lives in `~/.agentdesk/` (`agentdesk.db`, `plugins/`, `workspace/`,
`.master-key`). Override with `AGENTDESK_DATA_DIR`; port via `AGENTDESK_PORT`.

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
    config.js   data dir, ports, paths
    providers/  driver contract + openai / anthropic / gemini / mock, vendor catalog
    tools/      registry + builtin tools (calc, http_fetch, files, shell, memory, knowledge)
    agents/     roles, context builder/compactor, runtime (loop, approvals, sub-agents)
    plugins.js  marketplace catalog, module + MCP plugin activation
    mcp.js      stdio JSON-RPC MCP client
plugins/        bundled module plugins (weather, web-search, github)
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
npm test     # 18 tests: provider parsers, context compaction,
             # approval gate, sub-agents, SSRF/sandbox/crypto
```

## Security

See [SECURITY.md](SECURITY.md) — encrypted provider keys, SSRF guard, per-tool
approval gates, workspace sandboxing, CSP/security headers, and the threat
model for module plugins.

## License

Apache-2.0
