import "./helpers/env.js";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { q } from "../server/agentdesk/db.js";
import { newId } from "../server/agentdesk/crypto.js";
import { registerBuiltinTools } from "../server/agentdesk/tools/builtin.js";
import { startRun, decideApproval } from "../server/agentdesk/agents/runtime.js";

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
