import "./helpers/env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { q } from "../server/agentdesk/db.js";
import { buildContext, contextStats, estimateTokens } from "../server/agentdesk/agents/context.js";
import { newId } from "../server/agentdesk/crypto.js";

function seedThread(n = 40) {
  const threadId = newId("thr");
  const runId = newId("run");
  q.run("INSERT INTO threads (id) VALUES (?)", threadId);
  q.run(
    "INSERT INTO runs (id, thread_id, agent_id, status) VALUES (?, ?, 'orchestrator', 'completed')",
    runId, threadId
  );
  for (let i = 0; i < n; i++) {
    q.run(
      "INSERT INTO messages (id, thread_id, run_id, role, content) VALUES (?, ?, NULL, ?, ?)",
      newId("msg"), threadId, i % 2 ? "assistant" : "user",
      `Message ${i}: ${"lorem ipsum dolor sit amet ".repeat(20)}`
    );
  }
  return { threadId, runId };
}

test("estimateTokens is roughly len/4", () => {
  assert.equal(estimateTokens(""), 0);
  assert.ok(Math.abs(estimateTokens("a".repeat(400)) - 100) <= 2);
});

test("buildContext keeps everything under budget", () => {
  const { threadId, runId } = seedThread(4);
  const { messages, compacted } = buildContext({
    threadId, runId, depth: 0, systemPrompt: "sys",
  });
  assert.equal(compacted, false);
  assert.equal(messages[0].role, "system");
  assert.equal(messages.filter((m) => m.role === "user").length, 2);
});

test("buildContext compacts older turns into thread summary", () => {
  const { threadId, runId } = seedThread(40);
  const { messages, compacted, usage } = buildContext({
    threadId, runId, depth: 0, systemPrompt: "sys", budget: 3_000,
  });
  assert.equal(compacted, true);
  assert.ok(usage.droppedCount > 0);
  const summary = q.get("SELECT summary FROM threads WHERE id = ?", threadId).summary;
  assert.ok(summary.includes("[user]"));
  // second call folds new messages onto the prior summary
  const again = buildContext({ threadId, runId, depth: 0, systemPrompt: "sys", budget: 3_000 });
  assert.ok(again.messages.some((m) => m.role === "system" && m.content.includes("Summary of earlier")));
});

test("sub-agent view only sees its own run messages", () => {
  const { threadId } = seedThread(6);
  const childRun = newId("run");
  q.run(
    "INSERT INTO runs (id, thread_id, agent_id, parent_run_id, depth, status) VALUES (?, ?, 'researcher', NULL, 1, 'running')",
    childRun, threadId
  );
  q.run(
    "INSERT INTO messages (id, thread_id, run_id, role, content) VALUES (?, ?, ?, 'user', 'child task')",
    newId("msg"), threadId, childRun
  );
  const stats = contextStats({ threadId, runId: childRun, depth: 1 });
  assert.equal(stats.messageCount, 1);
});
