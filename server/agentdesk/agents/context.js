import { q } from "../db.js";

/**
 * Context manager. Estimates tokens (chars/4 heuristic — avoids shipping a
 * tokenizer), keeps the newest turns inside the model's budget, and folds
 * everything older into an extractive summary stored on the thread.
 */

export const DEFAULT_CONTEXT_BUDGET = 24_000; // tokens, conservative default

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function messageTokens(m) {
  let n = estimateTokens(m.content);
  if (m.tool_calls_json) n += estimateTokens(m.tool_calls_json);
  return n + 4; // role overhead
}

/** Messages belonging to a run's own conversation view. */
export function loadViewMessages({ threadId, runId, depth }) {
  if (depth === 0) {
    // Top-level view: messages of depth-0 runs in this thread.
    return q.all(
      `SELECT m.* FROM messages m
       LEFT JOIN runs r ON r.id = m.run_id
       WHERE m.thread_id = ? AND (m.run_id IS NULL OR COALESCE(r.depth, 0) = 0)
       ORDER BY m.rowid`,
      threadId
    );
  }
  // Sub-agent view: only its own run's messages (plus none before it started).
  return q.all(
    `SELECT * FROM messages WHERE thread_id = ? AND run_id = ? ORDER BY rowid`,
    threadId, runId
  );
}

export function toChatMessages(rows) {
  return rows.map((r) => ({
    role: r.role,
    content: r.content,
    tool_calls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : undefined,
    tool_call_id: r.tool_call_id ?? undefined,
    name: r.name ?? undefined,
  }));
}

/**
 * Build the message list for a provider call. Returns
 * { messages, compacted, usage } where usage describes the context window.
 */
export function buildContext({ threadId, runId, depth, systemPrompt, budget = DEFAULT_CONTEXT_BUDGET }) {
  // Sub-agent contexts are isolated: they never read the parent thread's
  // rolling summary, and their own compaction must not overwrite it.
  const thread = depth === 0
    ? q.get("SELECT summary FROM threads WHERE id = ?", threadId)
    : null;
  const rows = loadViewMessages({ threadId, runId, depth });
  const all = toChatMessages(rows);
  const tokens = rows.map(messageTokens);
  const total = tokens.reduce((a, b) => a + b, 0);
  const systemTokens = estimateTokens(systemPrompt);
  const usable = Math.max(1_000, budget - systemTokens - 1_000);

  const messages = [{ role: "system", content: systemPrompt }];
  let compacted = false;

  if (total <= usable) {
    if (thread?.summary) {
      messages.push({
        role: "system",
        content: `Summary of earlier conversation:\n${thread.summary}`,
      });
    }
    messages.push(...all);
    return { messages, compacted, usage: { estimatedTokens: total + systemTokens, budget } };
  }

  // Over budget: fold older turns into the summary, keep the newest ~60%.
  compacted = true;
  const keepBudget = Math.floor(usable * 0.6);
  let keep = 0;
  let cut = rows.length;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (keep + tokens[i] > keepBudget) break;
    keep += tokens[i];
    cut = i;
  }
  // Don't cut mid tool-call chain: walk back to a non-tool boundary.
  while (cut < rows.length && rows[cut].role === "tool") cut++;
  const dropped = rows.slice(0, cut);
  const kept = toChatMessages(rows.slice(cut));

  const summary = mergeSummary(thread?.summary, dropped);
  if (depth === 0) {
    q.run("UPDATE threads SET summary = ? WHERE id = ?", summary, threadId);
  }

  messages.push({ role: "system", content: `Summary of earlier conversation:\n${summary}` });
  messages.push(...kept);
  const estimated = kept.reduce((a, m) => a + estimateTokens(m.content) + 4, systemTokens + estimateTokens(summary));
  return { messages, compacted, usage: { estimatedTokens: estimated, budget, droppedCount: dropped.length } };
}

/** Extractive merge: keep prior summary + first line of each dropped message. */
function mergeSummary(prior, droppedRows) {
  const lines = (prior ? [prior] : []).concat(
    droppedRows
      .filter((r) => r.content)
      .map((r) => {
        const first = String(r.content).split("\n")[0].slice(0, 200);
        return `- [${r.role}] ${first}`;
      })
  );
  return lines.join("\n").slice(0, 8000);
}

/** Context stats for the inspector UI. */
export function contextStats({ threadId, runId, depth }) {
  const rows = loadViewMessages({ threadId, runId, depth });
  const tokens = rows.map(messageTokens).reduce((a, b) => a + b, 0);
  const thread = q.get("SELECT summary FROM threads WHERE id = ?", threadId);
  return {
    messageCount: rows.length,
    estimatedTokens: tokens,
    budget: DEFAULT_CONTEXT_BUDGET,
    usageRatio: Math.min(1, tokens / DEFAULT_CONTEXT_BUDGET),
    hasSummary: !!thread?.summary,
    summaryTokens: estimateTokens(thread?.summary),
  };
}
