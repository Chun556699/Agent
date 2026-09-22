import { checkResponse, readSseLines } from "./base.js";

function toApi(messages) {
  const system = [];
  const out = [];
  for (const m of messages) {
    if (m.role === "system") { system.push(m.content); continue; }
    if (m.role === "tool") {
      // consecutive tool results merge into one user message
      const block = {
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      };
      const prev = out[out.length - 1];
      if (prev?.role === "user" && Array.isArray(prev.content) && prev.content[0]?.type === "tool_result") {
        prev.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (m.role === "assistant" && m.tool_calls?.length) {
      const content = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments ?? {} });
      }
      out.push({ role: "assistant", content });
      continue;
    }
    out.push({ role: m.role, content: m.content ?? "" });
  }
  return { system: system.join("\n\n"), messages: out };
}

export async function* streamChat({ apiKey, baseUrl, model, messages, tools, signal }) {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/messages`;
  const { system, messages: apiMessages } = toApi(messages);
  const body = {
    model,
    system: system || undefined,
    messages: apiMessages,
    max_tokens: 8192,
    stream: true,
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters ?? { type: "object", properties: {} },
    }));
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey ?? "",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
    signal,
  });
  await checkResponse(response, "Anthropic");

  const blocks = new Map(); // index -> {kind, id, name, text/jsonText}
  const usage = { inputTokens: 0, outputTokens: 0 };

  for await (const data of readSseLines(response)) {
    let ev;
    try { ev = JSON.parse(data); } catch { continue; }
    switch (ev.type) {
      case "content_block_start": {
        const i = ev.index;
        const b = ev.content_block ?? {};
        blocks.set(i, {
          kind: b.type,
          id: b.id,
          name: b.name,
          buf: "",
        });
        break;
      }
      case "content_block_delta": {
        const acc = blocks.get(ev.index);
        if (!acc) break;
        if (ev.delta?.type === "text_delta" && ev.delta.text) {
          yield { type: "text_delta", delta: ev.delta.text };
        } else if (ev.delta?.type === "input_json_delta") {
          acc.buf += ev.delta.partial_json ?? "";
        }
        break;
      }
      case "message_delta":
        if (ev.usage?.output_tokens != null) usage.outputTokens = ev.usage.output_tokens;
        break;
      case "message_start":
        if (ev.message?.usage?.input_tokens != null) usage.inputTokens = ev.message.usage.input_tokens;
        break;
    }
  }

  const toolCalls = [...blocks.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, b]) => b.kind === "tool_use")
    .map(([, b]) => {
      let parsed = {};
      try { parsed = JSON.parse(b.buf || "{}"); } catch { /* keep */ }
      return { id: b.id, name: b.name, arguments: parsed };
    });
  if (toolCalls.length) yield { type: "tool_calls", toolCalls };
  yield { type: "usage", usage };
  yield { type: "done" };
}
