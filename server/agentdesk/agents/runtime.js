import { newId } from "../crypto.js";
import { q } from "../db.js";
import { emit } from "../events.js";
import { HttpError } from "../http.js";
import { resolveModel } from "../providers/index.js";
import { getTool, registerTool, toolSpecs } from "../tools/index.js";
import { buildContext, contextStats } from "./context.js";
import { getAgent } from "./roles.js";

const MAX_ITERATIONS = 12;
const MAX_DEPTH = 3;

const running = new Map(); // runId -> { controller, settled }
const pendingApprovals = new Map(); // approvalId -> { resolve, runId }

/** Cancel an in-flight run. Returns true when the run was tracked here
 * (its finally block will emit run_completed); false when no such live run
 * exists in this process. */
export function cancelRun(runId) {
  let wasLive = running.has(runId);
  // Resolve this run's pending approvals first: without it the awaiting
  // run's Promise never settles on abort, and the approval row stays
  // 'pending' — an actionable card on a dead run.
  for (const [id, p] of pendingApprovals) {
    if (p.runId !== runId) continue;
    wasLive = true;
    q.run(
      "UPDATE approvals SET status = 'cancelled', decided_at = datetime('now') WHERE id = ?",
      id
    );
    pendingApprovals.delete(id);
    p.resolve(false);
    emit(runId, "approval_resolved", { approvalId: id, approved: false });
  }
  running.get(runId)?.controller.abort();
  return wasLive;
}

/** Cancel every in-flight run belonging to a thread (thread delete, etc.).
 * Awaits each run's finally block — its last writes land before the caller
 * deletes the rows, so nothing is orphaned mid-flight. */
export async function cancelRunsForThread(threadId) {
  const ids = q
    .all("SELECT id FROM runs WHERE thread_id = ? AND status IN ('running','awaiting_approval')", threadId)
    .map((r) => r.id);
  const waits = ids.map((id) => running.get(id)?.settled).filter(Boolean);
  for (const id of ids) cancelRun(id);
  await Promise.all(waits);
  return ids;
}

function autoApproveMap() {
  const row = q.get("SELECT value_json FROM settings WHERE key = 'autoApprove'");
  try { return JSON.parse(row?.value_json ?? "{}"); } catch { return {}; }
}

function setAutoApprove(toolName, value) {
  const map = autoApproveMap();
  if (value) map[toolName] = true;
  else delete map[toolName];
  q.run(
    "INSERT INTO settings (key, value_json) VALUES ('autoApprove', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    JSON.stringify(map)
  );
}

export function getAutoApprovals() {
  return autoApproveMap();
}

/** Resolve a pending approval. `alwaysAllow` whitelists the tool going forward. */
export function decideApproval(approvalId, { approved, alwaysAllow = false }) {
  const pending = pendingApprovals.get(approvalId);
  if (alwaysAllow && approved) {
    const row = q.get("SELECT tool FROM approvals WHERE id = ?", approvalId);
    if (row) setAutoApprove(row.tool, true);
  }
  // Only a still-pending approval may transition — decided/expired/cancelled
  // rows are history, not actions waiting to be flipped.
  const info = q.run(
    "UPDATE approvals SET status = ?, decided_at = datetime('now') WHERE id = ? AND status = 'pending'",
    approved ? "approved" : "denied", approvalId
  );
  pending?.resolve(!!approved);
  pendingApprovals.delete(approvalId);
  return !!pending || info.changes > 0;
}

function requestApproval({ runId, toolCallId, tool, args, danger }) {
  const id = newId("appr");
  q.run(
    "INSERT INTO approvals (id, run_id, tool_call_id, tool, args_json, danger) VALUES (?, ?, ?, ?, ?, ?)",
    id, runId, toolCallId, tool, JSON.stringify(args ?? {}), danger
  );
  q.run("UPDATE runs SET status = 'awaiting_approval' WHERE id = ?", runId);
  emit(runId, "approval_request", { approvalId: id, toolCallId, tool, args, danger });
  return { id, decision: new Promise((resolve) => pendingApprovals.set(id, { resolve, runId })) };
}

function persistMessage({ threadId, runId, role, content, toolCalls, toolCallId, name }) {
  const id = newId("msg");
  q.run(
    `INSERT INTO messages (id, thread_id, run_id, role, content, tool_calls_json, tool_call_id, name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, threadId, runId ?? null, role, content ?? null,
    toolCalls?.length ? JSON.stringify(toolCalls) : null,
    toolCallId ?? null, name ?? null
  );
  return id;
}

async function executeToolCall(tc, ctx) {
  const tool = getTool(tc.name);
  if (!tool) {
    return { ok: false, error: `Unknown tool '${tc.name}'` };
  }
  const auto = autoApproveMap();
  if (tool.danger !== "safe" && !auto[tool.name]) {
    const { id: approvalId, decision } = requestApproval({
      runId: ctx.runId, toolCallId: tc.id, tool: tc.name, args: tc.arguments, danger: tool.danger,
    });
    const approved = await decision;
    // approvalId must ride along — the client matches the pending approval
    // card by it, and without it the card stays pulsing after the run resumes.
    emit(ctx.runId, "approval_resolved", { approvalId, toolCallId: tc.id, tool: tc.name, approved });
    q.run("UPDATE runs SET status = 'running' WHERE id = ? AND status = 'awaiting_approval'", ctx.runId);
    if (!approved) return { ok: false, error: "Tool call denied by user", denied: true };
    if (ctx.signal.aborted) throw new DOMException("aborted", "AbortError");
  }
  const started = Date.now();
  try {
    const result = await tool.handler(tc.arguments ?? {}, ctx);
    return { ok: true, result, durationMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err.message || "Tool failed", status: err.status, durationMs: Date.now() - started };
  }
}

function toolsFor(agent) {
  return toolSpecs(agent.tools?.length ? agent.tools : undefined);
}

/** Pre-flight validation for a would-be run — throws HttpError (400/404)
 * synchronously so the API can reject the request instead of returning a
 * runId for a run that instantly fails off-stream. */
export function assertStartable({ agentId = "orchestrator", providerId, model, depth = 0 }) {
  if (!getAgent(agentId)) throw new HttpError(404, `Unknown agent '${agentId}'`);
  if (depth > MAX_DEPTH) throw new HttpError(400, "Maximum sub-agent depth reached");
  resolveModel({ providerId: providerId ?? "mock", model });
}

/** Run a full agent loop for one run. Returns { runId, text, usage, status }. */
export async function startRun({
  threadId, agentId = "orchestrator", providerId, model,
  parentRunId = null, depth = 0, task = null, runId: presetRunId = null,
}) {
  const agent = getAgent(agentId);
  if (!agent) throw new HttpError(404, `Unknown agent '${agentId}'`);
  if (depth > MAX_DEPTH) throw new HttpError(400, "Maximum sub-agent depth reached");

  const resolved = resolveModel({
    providerId: providerId ?? agent.model?.providerId ?? "mock",
    model: model ?? agent.model?.model,
  });

  const runId = presetRunId ?? newId("run");
  const controller = new AbortController();
  const entry = { controller };
  entry.settled = new Promise((res) => (entry.resolve = res));
  running.set(runId, entry);

  q.run(
    `INSERT INTO runs (id, thread_id, agent_id, parent_run_id, depth, status, provider_id, model)
     VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
    runId, threadId, agentId, parentRunId, depth, resolved.providerId, resolved.model
  );

  if (task != null) {
    // Sub-agent tasks belong to the child's own context view.
    persistMessage({ threadId, runId: depth > 0 ? runId : null, role: "user", content: task });
  }

  emit(runId, "run_started", {
    runId, threadId, agentId, agentName: agent.name, parentRunId, depth,
    providerId: resolved.providerId, model: resolved.model, task,
  });
  if (parentRunId) {
    emit(parentRunId, "subagent_started", {
      childRunId: runId, agentId, agentName: agent.name, task, depth,
    });
  }

  let finalText = "";
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let status = "completed";
  let error = null;

  try {
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      if (controller.signal.aborted) { status = "cancelled"; break; }

      const { messages, compacted, usage } = buildContext({
        threadId, runId, depth, systemPrompt: agent.systemPrompt,
      });
      if (compacted) emit(runId, "context_compacted", { droppedCount: usage.droppedCount });
      emit(runId, "context", contextStats({ threadId, runId, depth }));

      let text = "";
      let toolCalls = [];

      for await (const ev of resolved.run({
        messages,
        tools: toolsFor(agent),
        signal: controller.signal,
        meta: { depth, agentId, runId },
      })) {
        if (ev.type === "text_delta") {
          text += ev.delta;
          emit(runId, "message_delta", { delta: ev.delta });
        } else if (ev.type === "tool_calls") {
          toolCalls = ev.toolCalls;
        } else if (ev.type === "usage") {
          totalUsage.inputTokens += ev.usage.inputTokens ?? 0;
          totalUsage.outputTokens += ev.usage.outputTokens ?? 0;
        }
      }

      persistMessage({
        threadId, runId, role: "assistant", content: text,
        toolCalls: toolCalls.length ? toolCalls : undefined,
      });
      emit(runId, "message_complete", { content: text, toolCalls });
      if (text) finalText = text;

      if (!toolCalls.length) break;

      // Tool calls run concurrently (parallel sub-agents fan out here).
      await Promise.all(toolCalls.map(async (tc) => {
        emit(runId, "tool_call", { toolCallId: tc.id, name: tc.name, args: tc.arguments });
        const out = await executeToolCall(tc, {
          runId, threadId, agentId, depth, signal: controller.signal,
        });
        emit(runId, "tool_result", { toolCallId: tc.id, name: tc.name, ...out });
        const content = out.ok
          ? (typeof out.result === "string" ? out.result : JSON.stringify(out.result))
          : `Error: ${out.error}`;
        persistMessage({
          threadId, runId, role: "tool", content, toolCallId: tc.id, name: tc.name,
        });
      }));
    }
  } catch (err) {
    if (controller.signal.aborted || err.name === "AbortError") {
      status = "cancelled";
    } else {
      status = "failed";
      error = err.message || "Run failed";
    }
  } finally {
    running.delete(runId);
    entry.resolve();
    q.run(
      `UPDATE runs SET status = ?, error = ?, input_tokens = ?, output_tokens = ?, ended_at = datetime('now')
       WHERE id = ?`,
      status, error, totalUsage.inputTokens, totalUsage.outputTokens, runId
    );
    emit(runId, "run_completed", { runId, status, error, usage: totalUsage });
  }

  return { runId, text: finalText, usage: totalUsage, status, error };
}

// spawn_agent lives here (not in builtin) because it needs startRun.
registerTool({
  name: "spawn_agent",
  description:
    "Delegate a subtask to a specialist sub-agent (researcher, coder, writer, analyst, or a custom agent id). Runs its own isolated context; returns its final answer.",
  danger: "safe",
  parameters: {
    type: "object",
    properties: {
      agent: { type: "string", description: "Agent id, e.g. 'researcher'" },
      task: { type: "string", description: "Self-contained task for the sub-agent" },
    },
    required: ["agent", "task"],
  },
  handler: async ({ agent, task }, ctx) => {
    if (ctx.depth + 1 > MAX_DEPTH) throw new HttpError(400, "Max sub-agent depth reached");
    const child = await startRun({
      threadId: ctx.threadId,
      agentId: agent ?? "orchestrator",
      parentRunId: ctx.runId,
      depth: ctx.depth + 1,
      task: task ?? "",
    });
    emit(ctx.runId, "subagent_finished", {
      childRunId: child.runId, agentId: agent, status: child.status,
    });
    return { runId: child.runId, status: child.status, output: child.text };
  },
});
