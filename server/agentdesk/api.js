import { contextStats } from "./agents/context.js";
import { createAgent, deleteAgent, listAgents } from "./agents/roles.js";
import {
  cancelRun,
  decideApproval,
  getAutoApprovals,
  startRun,
} from "./agents/runtime.js";
import { newId } from "./crypto.js";
import { q } from "./db.js";
import { emit, recentEvents, replayEvents, subscribe } from "./events.js";
import { createRouter, HttpError, sse } from "./http.js";
import {
  activateInstalledPlugins,
  installPlugin,
  listInstalledPlugins,
  listLocalModules,
  MARKETPLACE,
  setPluginEnabled,
  uninstallPlugin,
  activatePlugin,
} from "./plugins.js";
import {
  configureProvider,
  listProviders,
  resolveModel,
} from "./providers/index.js";
import { registerBuiltinTools } from "./tools/builtin.js";
import { toolSpecs } from "./tools/index.js";

const AUTO_TITLE_LEN = 60;

function touchThread(threadId, { title } = {}) {
  q.run(
    "UPDATE threads SET updated_at = datetime('now'), title = COALESCE(?, title) WHERE id = ?",
    title ?? null, threadId
  );
}

function serializeMessage(r) {
  return {
    id: r.id, threadId: r.thread_id, runId: r.run_id, role: r.role,
    content: r.content, toolCalls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : null,
    toolCallId: r.tool_call_id, name: r.name, createdAt: r.created_at,
  };
}

export function createApi() {
  const router = createRouter();

  router.get("/api/health", () => ({ ok: true, name: "agentdesk", version: "0.1.0" }));

  /* -------- providers -------- */
  router.get("/api/providers", () => ({ providers: listProviders() }));
  router.put("/api/providers/:id", ({ params, body }) => {
    configureProvider(params.id, body ?? {});
    return { ok: true, providers: listProviders() };
  });
  router.delete("/api/providers/:id/key", ({ params }) => {
    configureProvider(params.id, { apiKey: "" });
    return { ok: true };
  });
  router.post("/api/providers/:id/test", async ({ params, body }) => {
    const resolved = resolveModel({ providerId: params.id, model: body?.model });
    let text = "";
    for await (const ev of resolved.run({
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      tools: [],
      signal: AbortSignal.timeout(20_000),
    })) {
      if (ev.type === "text_delta") text += ev.delta;
    }
    return { ok: true, reply: text.slice(0, 200) };
  });

  /* -------- agents -------- */
  router.get("/api/agents", () => ({ agents: listAgents() }));
  router.post("/api/agents", ({ body }) => {
    if (!body?.name || !body?.systemPrompt) {
      throw new HttpError(400, "name and systemPrompt are required");
    }
    return { agent: createAgent(body) };
  });
  router.delete("/api/agents/:id", ({ params }) => {
    deleteAgent(params.id);
    return { ok: true };
  });

  /* -------- tools -------- */
  router.get("/api/tools", () => ({ tools: toolSpecs(), autoApprove: getAutoApprovals() }));

  /* -------- threads & messages -------- */
  router.get("/api/threads", () => ({
    threads: q.all(
      `SELECT t.*, (SELECT COUNT(*) FROM runs r WHERE r.thread_id = t.id) AS run_count
       FROM threads t ORDER BY t.updated_at DESC LIMIT 500`
    ).map((t) => ({
      id: t.id, title: t.title, agentId: t.agent_id, runCount: t.run_count,
      hasSummary: !!t.summary, createdAt: t.created_at, updatedAt: t.updated_at,
    })),
  }));

  router.post("/api/threads", ({ body }) => {
    const id = newId("thr");
    q.run(
      "INSERT INTO threads (id, title, agent_id) VALUES (?, ?, ?)",
      id, body?.title?.slice(0, 120) || "New thread", body?.agentId || "orchestrator"
    );
    return { thread: q.get("SELECT * FROM threads WHERE id = ?", id) };
  });

  router.get("/api/threads/:id", ({ params }) => {
    const thread = q.get("SELECT * FROM threads WHERE id = ?", params.id);
    if (!thread) throw new HttpError(404, "Thread not found");
    // Top-level view mirrors the orchestrator's context (depth-0 messages only).
    const messages = q.all(
      `SELECT m.* FROM messages m
       LEFT JOIN runs r ON r.id = m.run_id
       WHERE m.thread_id = ? AND (m.run_id IS NULL OR COALESCE(r.depth, 0) = 0)
       ORDER BY m.rowid`,
      params.id
    ).map(serializeMessage);
    const runs = q.all(
      `SELECT id, parent_run_id, depth, agent_id, status, provider_id, model,
              input_tokens, output_tokens, created_at, ended_at
       FROM runs WHERE thread_id = ? ORDER BY created_at`,
      params.id
    );
    return { thread, messages, runs };
  });

  router.delete("/api/threads/:id", ({ params }) => {
    q.run("DELETE FROM messages WHERE thread_id = ?", params.id);
    q.run("DELETE FROM runs WHERE thread_id = ?", params.id);
    q.run("DELETE FROM threads WHERE id = ?", params.id);
    return { ok: true };
  });

  /* -------- runs -------- */
  router.post("/api/threads/:id/runs", async ({ params, body }) => {
    const thread = q.get("SELECT * FROM threads WHERE id = ?", params.id);
    if (!thread) throw new HttpError(404, "Thread not found");
    const prompt = body?.message;
    if (typeof prompt !== "string" || !prompt.trim()) throw new HttpError(400, "message is required");
    if (prompt.length > 100_000) throw new HttpError(400, "message too long");

    const isFirst = !q.get("SELECT id FROM messages WHERE thread_id = ? LIMIT 1", params.id);
    const title = isFirst ? prompt.replace(/\s+/g, " ").slice(0, AUTO_TITLE_LEN) : null;
    touchThread(params.id, { title });

    const runId = newId("run");
    // Run in the background; events stream over /api/runs/:id/events.
    startRun({
      runId,
      threadId: params.id,
      agentId: body?.agentId ?? thread.agent_id ?? "orchestrator",
      providerId: body?.providerId,
      model: body?.model,
      task: prompt,
      depth: 0,
    }).catch((err) => {
      console.error(`[run ${runId}]`, err);
      q.run(
        "UPDATE runs SET status = 'failed', error = ?, ended_at = datetime('now') WHERE id = ?",
        err.message, runId
      );
      emit(runId, "run_completed", { runId, status: "failed", error: err.message });
    });
    return { runId };
  });

  router.get("/api/runs/:id", ({ params }) => {
    const run = q.get("SELECT * FROM runs WHERE id = ?", params.id);
    if (!run) throw new HttpError(404, "Run not found");
    const children = q.all(
      "SELECT id, agent_id, status, model, created_at FROM runs WHERE parent_run_id = ?",
      params.id
    );
    const messages = q.all(
      "SELECT * FROM messages WHERE run_id = ? ORDER BY rowid", params.id
    ).map(serializeMessage);
    return { run, children, messages };
  });

  router.get("/api/runs/:id/events", ({ req, res, params }) => {
    const run = q.get("SELECT id, status FROM runs WHERE id = ?", params.id);
    if (!run) throw new HttpError(404, "Run not found");
    const stream = sse(res);
    for (const ev of replayEvents(params.id)) stream.send(ev.type, ev);
    if (!["running", "awaiting_approval"].includes(run.status)) {
      stream.close();
      return;
    }
    const unsub = subscribe(params.id, (ev) => stream.send(ev.type, ev));
    const heartbeat = setInterval(() => stream.send("ping", {}), 15_000);
    req.on("close", () => { clearInterval(heartbeat); unsub(); });
  });

  router.post("/api/runs/:id/cancel", ({ params }) => {
    cancelRun(params.id);
    q.run(
      "UPDATE runs SET status = 'cancelled', ended_at = datetime('now') WHERE id = ? AND status IN ('running','awaiting_approval')",
      params.id
    );
    emit(params.id, "run_completed", { runId: params.id, status: "cancelled" });
    return { ok: true };
  });

  router.get("/api/runs/:id/context", ({ params }) => {
    const run = q.get("SELECT * FROM runs WHERE id = ?", params.id);
    if (!run) throw new HttpError(404, "Run not found");
    return contextStats({ threadId: run.thread_id, runId: run.id, depth: run.depth });
  });

  /* -------- approvals -------- */
  router.get("/api/approvals", () => ({
    approvals: q.all(
      "SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 100"
    ).map((a) => ({
      id: a.id, runId: a.run_id, toolCallId: a.tool_call_id, tool: a.tool,
      args: JSON.parse(a.args_json), danger: a.danger, createdAt: a.created_at,
    })),
  }));

  router.post("/api/approvals/:id", ({ params, body }) => {
    if (typeof body?.approved !== "boolean") {
      throw new HttpError(400, "approved (boolean) is required");
    }
    const existed = decideApproval(params.id, {
      approved: body.approved,
      alwaysAllow: !!body.alwaysAllow,
    });
    return { ok: true, wasPending: existed };
  });

  router.put("/api/settings/auto-approve", ({ body }) => {
    if (!body?.tool) throw new HttpError(400, "tool is required");
    const map = getAutoApprovals();
    if (body.enabled) map[body.tool] = true;
    else delete map[body.tool];
    q.run(
      "INSERT INTO settings (key, value_json) VALUES ('autoApprove', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
      JSON.stringify(map)
    );
    return { autoApprove: map };
  });

  /* -------- plugins & marketplace -------- */
  router.get("/api/plugins/marketplace", () => ({
    marketplace: MARKETPLACE,
    installed: listInstalledPlugins(),
    localModules: listLocalModules(),
  }));
  router.get("/api/plugins", () => ({ plugins: listInstalledPlugins() }));
  router.post("/api/plugins/:id/install", async ({ params }) => ({
    ok: true, tools: await installPlugin(params.id),
  }));
  router.post("/api/plugins/:id/toggle", async ({ params, body }) => {
    await setPluginEnabled(params.id, !!body?.enabled);
    return { ok: true };
  });
  router.delete("/api/plugins/:id", async ({ params }) => {
    await uninstallPlugin(params.id);
    return { ok: true };
  });
  // Connect an ad-hoc MCP stdio server without a marketplace entry.
  router.post("/api/plugins/mcp", async ({ body }) => {
    if (!body?.id || !body?.command) throw new HttpError(400, "id and command are required");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(body.id)) {
      throw new HttpError(400, "id must be lowercase alphanumerics/hyphens");
    }
    q.run(
      `INSERT INTO plugins (id, name, kind, spec_json, enabled) VALUES (?, ?, 'mcp', ?, 1)
       ON CONFLICT(id) DO UPDATE SET spec_json = excluded.spec_json, enabled = 1`,
      body.id, body.name ?? body.id,
      JSON.stringify({ command: body.command, args: body.args ?? [], env: body.env ?? {} })
    );
    const tools = await activatePlugin(body.id);
    return { ok: true, tools };
  });

  /* -------- memory & activity -------- */
  router.get("/api/memory", () => ({
    memories: q.all("SELECT * FROM memories ORDER BY created_at DESC LIMIT 500"),
  }));
  router.delete("/api/memory/:id", ({ params }) => {
    q.run("DELETE FROM memories WHERE id = ?", params.id);
    return { ok: true };
  });

  router.get("/api/activity", ({ query }) => {
    const limit = Math.min(Number(query.get("limit") ?? 100), 500);
    return { events: recentEvents(limit) };
  });

  return router;
}

export async function boot() {
  registerBuiltinTools();
  await activateInstalledPlugins();
}
