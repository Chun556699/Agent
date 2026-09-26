import "./helpers/env.js";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { q } from "../server/agentdesk/db.js";
import { newId } from "../server/agentdesk/crypto.js";
import { registerBuiltinTools } from "../server/agentdesk/tools/builtin.js";
import { startRun, decideApproval, cancelRunsForThread, assertStartable } from "../server/agentdesk/agents/runtime.js";

before(() => {
  registerBuiltinTools();
});

function makeThread() {
  const threadId = newId("thr");
  q.run("INSERT INTO threads (id) VALUES (?)", threadId);
  return threadId;
}

async function waitRun(runId, ms = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = q.get("SELECT status FROM runs WHERE id = ?", runId);
    if (r && ["completed", "failed", "cancelled"].includes(r.status)) return r.status;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("run did not finish");
}

test("mock run completes and persists messages", async () => {
  const threadId = makeThread();
  const { runId } = await startRun({ threadId, providerId: "mock", model: "mock", task: "hello there" });
  assert.equal(await waitRun(runId), "completed");
  const msgs = q.all("SELECT role FROM messages WHERE thread_id = ? ORDER BY created_at", threadId);
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant"]);
});

test("tool loop: calculator executes without approval", async () => {
  const threadId = makeThread();
  const { runId } = await startRun({ threadId, providerId: "mock", model: "mock", task: "calc 21*2" });
  assert.equal(await waitRun(runId), "completed");
  const toolMsg = q.get("SELECT content FROM messages WHERE thread_id = ? AND role = 'tool'", threadId);
  assert.ok(toolMsg.content.includes("42"));
});

test("mock provider computes the expression actually asked", async () => {
  const threadId = makeThread();
  const { runId } = await startRun({ threadId, providerId: "mock", model: "mock", task: "calc 6*8" });
  assert.equal(await waitRun(runId), "completed");
  const toolMsg = q.get("SELECT content FROM messages WHERE thread_id = ? AND role = 'tool'", threadId);
  assert.ok(toolMsg.content.includes("48"));
});

test("approval gate pauses confirm-level tools until decided", async () => {
  const threadId = makeThread();
  const runId = newId("run");
  const runPromise = startRun({ threadId, runId, providerId: "mock", model: "mock", task: "fetch example.com" });
  // wait for the pending approval row
  let approval;
  for (let i = 0; i < 100; i++) {
    approval = q.get("SELECT * FROM approvals WHERE run_id = ? AND status = 'pending'", runId);
    if (approval) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(approval, "expected pending approval");
  assert.equal(approval.tool, "http_fetch");
  decideApproval(approval.id, { approved: false });
  assert.equal(await waitRun(runId), "completed");
  await runPromise;
  const denied = q.get("SELECT content FROM messages WHERE thread_id = ? AND role = 'tool'", threadId);
  assert.match(denied.content, /denied|Denied/);
});

test("spawn_agent creates a child run at depth+1", async () => {
  const threadId = makeThread();
  const { runId } = await startRun({ threadId, providerId: "mock", model: "mock", task: "delegate this task please" });
  assert.equal(await waitRun(runId), "completed");
  const child = q.get("SELECT * FROM runs WHERE parent_run_id = ?", runId);
  assert.ok(child);
  assert.equal(child.depth, 1);
  assert.equal(child.agent_id, "researcher");
  assert.equal(await waitRun(child.id), "completed");
});

test("unknown agent is rejected", async () => {
  const threadId = makeThread();
  await assert.rejects(() =>
    startRun({ threadId, agentId: "nope", providerId: "mock", model: "mock", task: "x" })
  );
});

test("provider-resolution failure leaves a failed run, not an orphaned runId", async () => {
  // Regression: startRun used to resolve the provider before inserting the
  // runs row — a throw there meant /api/runs/:id/events 404'd forever and the
  // user's message vanished.
  const threadId = makeThread();
  const runId = newId("run");
  // 'openai' has no API key configured in the test data dir → resolveModel throws.
  const res = await startRun({ threadId, runId, providerId: "openai", model: "gpt-x", task: "hi" });
  assert.equal(res.status, "failed");
  assert.equal(q.get("SELECT status FROM runs WHERE id = ?", runId).status, "failed");
  assert.deepEqual(
    q.all("SELECT role FROM messages WHERE thread_id = ?", threadId).map((m) => m.role),
    ["user"]
  );
  const types = q.all("SELECT type FROM events WHERE run_id = ?", runId).map((e) => e.type);
  assert.ok(types.includes("run_started") && types.includes("run_completed"));
});

test("assertStartable rejects bad runs before a runId exists", () => {
  const threadId = makeThread();
  assert.throws(() => assertStartable({ agentId: "nope", depth: 0 }), /Unknown agent/);
  // 'openai' has no API key configured in the test data dir.
  assert.throws(() => assertStartable({ agentId: "orchestrator", providerId: "openai", depth: 0 }), /no API key|disabled/);
  assert.doesNotThrow(() => assertStartable({ agentId: "orchestrator", providerId: "mock", depth: 0 }));
  assert.ok(threadId);
});

test("decideApproval does not flip a non-pending approval", async () => {
  const threadId = makeThread();
  const runId = newId("run");
  const apprId = newId("appr");
  q.run(
    "INSERT INTO runs (id, thread_id, agent_id, status) VALUES (?, ?, 'orchestrator', 'failed')",
    runId, threadId
  );
  q.run(
    "INSERT INTO approvals (id, run_id, tool, status) VALUES (?, ?, 'http_fetch', 'expired')",
    apprId, runId
  );
  assert.equal(decideApproval(apprId, { approved: true }), false);
  assert.equal(q.get("SELECT status FROM approvals WHERE id = ?", apprId).status, "expired");
});

test("cancelRunsForThread stops a run waiting on approval", async () => {
  const threadId = makeThread();
  const runId = newId("run");
  const runPromise = startRun({ threadId, runId, providerId: "mock", model: "mock", task: "fetch example.com" });
  for (let i = 0; i < 100; i++) {
    if (q.get("SELECT 1 FROM approvals WHERE run_id = ? AND status = 'pending'", runId)) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const cancelled = await cancelRunsForThread(threadId);
  assert.deepEqual(cancelled, [runId]);
  assert.equal(await waitRun(runId), "cancelled");
  await runPromise;
  // the pending approval row was resolved away with the run
  assert.equal(q.get("SELECT COUNT(*) AS n FROM approvals WHERE run_id = ? AND status = 'pending'", runId).n, 0);
});
