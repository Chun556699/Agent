import { checkResponse, readSseLines } from "./base.js";

function toApiMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      });
    } else if (m.role === "assistant" && m.tool_calls?.length) {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) },
        })),
      });
    } else {
      out.push({ role: m.role, content: m.content ?? "" });
    }
  }
  return out;
}

export async function* streamChat({ apiKey, baseUrl, model, messages, tools, signal }) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model,
    messages: toApiMessages(messages),
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters ?? { type: "object", properties: {} },
      },
    }));
    body.tool_choice = "auto";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  await checkResponse(response, "OpenAI-compatible");

  // pending tool call accumulators keyed by index
  const pending = new Map();
  const usage = { inputTokens: 0, outputTokens: 0 };

  for await (const data of readSseLines(response)) {
    if (data === "[DONE]") break;
    let chunk;
    try { chunk = JSON.parse(data); } catch { continue; }
    if (chunk.usage) {
      usage.inputTokens = chunk.usage.prompt_tokens ?? usage.inputTokens;
      usage.outputTokens = chunk.usage.completion_tokens ?? usage.outputTokens;
    }
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};
    if (delta.content) yield { type: "text_delta", delta: delta.content };
    for (const tc of delta.tool_calls ?? []) {
      const i = tc.index ?? 0;
      if (!pending.has(i)) pending.set(i, { id: "", name: "", argsText: "" });
      const acc = pending.get(i);
      if (tc.id) acc.id = tc.id;
      if (tc.function?.name) acc.name = tc.function.name;
      if (tc.function?.arguments) acc.argsText += tc.function.arguments;
    }
  }

  if (pending.size) {
    const toolCalls = [...pending.keys()].sort().map((i) => {
      const acc = pending.get(i);
      let parsed = {};
      try { parsed = JSON.parse(acc.argsText || "{}"); } catch { /* keep raw */ }
      return {
        id: acc.id || `call_${i}_${Date.now()}`,
        name: acc.name,
        arguments: parsed,
      };
    });
    yield { type: "tool_calls", toolCalls };
  }
  yield { type: "usage", usage };
  yield { type: "done" };
}
