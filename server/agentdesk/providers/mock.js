/**
 * Offline mock provider. Implements the same streaming contract without any
 * network or API key so the whole agent loop (tools, approvals, sub-agents,
 * context) can be exercised and demoed. Behavior is driven by keywords in the
 * last user message:
 *
 *   "calc"/math        -> calculator tool call
 *   "fetch"/"http"     -> http_fetch (requires approval)
 *   "file"             -> file_write + file_read (approval on write)
 *   "shell"/"command"  -> run_shell_command (dangerous approval)
 *   "remember"/"memory"-> memory_save
 *   "subagent"/"delegate"/"team" -> spawn_agent (x2 if "parallel")
 *   "search"           -> knowledge_search
 * After tool results arrive it answers with a summary; otherwise it echoes.
 */

const WORD_DELAY_MS = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function* streamText(text) {
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    yield { type: "text_delta", delta: (i ? " " : "") + words[i] };
  }
}

export async function* streamChat({ model, messages, meta }) {
  await sleep(30);
  const last = messages[messages.length - 1];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = (lastUser?.content ?? "").toLowerCase();

  // If the last message is a tool result, respond with a summary of it.
  if (last?.role === "tool") {
    const summary = `Tool ${last.name ?? last.tool_call_id ?? ""} returned: ${
      typeof last.content === "string" ? last.content.slice(0, 400) : JSON.stringify(last.content).slice(0, 400)
    }. Anything else?`;
    yield* streamText(summary);
    yield { type: "usage", usage: { inputTokens: 120, outputTokens: 40 } };
    yield { type: "done" };
    return;
  }

  const calls = [];
  const push = (name, args) => calls.push({ id: `mock_${calls.length}_${Date.now()}`, name, arguments: args });

  if ((meta?.depth ?? 0) > 0) {
    // Sub-agents never re-spawn in the mock — keeps demos deterministic.
    yield* streamText(
      `[${model ?? "mock"}] Sub-agent done. Result for "${(lastUser?.content ?? "").slice(0, 120)}": mock findings gathered (3 sources), summarized and returned to the orchestrator.`
    );
    yield { type: "usage", usage: { inputTokens: 90, outputTokens: 45 } };
    yield { type: "done" };
    return;
  }

  if (/\bsub-?agent|delegate|parallel|team\b/.test(text)) {
    push("spawn_agent", { agent: "researcher", task: lastUser?.content ?? "Research this topic" });
    if (/parallel|team/.test(text)) {
      push("spawn_agent", { agent: "writer", task: `Summarize findings for: ${lastUser?.content ?? "topic"}` });
    }
  } else if (/shell|command|terminal/.test(text)) {
    push("run_shell_command", { command: "echo hello from agentdesk" });
  } else if (/fetch|http|url|web/.test(text)) {
    push("http_fetch", { url: "https://example.com", method: "GET" });
  } else if (/file|write/.test(text)) {
    push("write_file", { path: "notes/output.txt", content: "Written by AgentDesk mock run" });
  } else if (/remember|memory/.test(text)) {
    push("memory_save", { content: lastUser?.content ?? "", tags: "mock" });
  } else if (/search|knowledge/.test(text)) {
    push("knowledge_search", { query: lastUser?.content ?? "", limit: 5 });
  } else if (/calc|math|[0-9][+*\-\/][0-9]/.test(text)) {
    // Prefer the real expression in the prompt so 'calc 6*7' computes 42 —
    // fall back to the demo expression when the message has none.
    const expr = (lastUser?.content ?? "").match(/\d[\d\s+\-*/().%]*/)?.[0]?.trim();
    push("calculator", { expression: expr || "21 * 2" });
  } else if (/who are you|help|tools/.test(text)) {
    yield* streamText(
      "I am the AgentDesk mock model (offline). Try: 'calc 21*2', 'fetch example.com', 'remember this', 'spawn a subagent team', 'write file', or 'run a shell command' to exercise tools, approvals and sub-agents without an API key."
    );
    yield { type: "usage", usage: { inputTokens: 80, outputTokens: 60 } };
    yield { type: "done" };
    return;
  }

  if (calls.length) {
    yield* streamText("Let me handle that with the right tools.");
    yield { type: "tool_calls", toolCalls: calls };
  } else {
    yield* streamText(
      `Mock model received: "${lastUser?.content ?? ""}". No tool keyword detected — try 'help' for demo commands.`
    );
  }
  yield { type: "usage", usage: { inputTokens: 100, outputTokens: 50 } };
  yield { type: "done" };
}
