import { checkResponse, readSseLines } from "./base.js";

function toApi(messages) {
  let systemInstruction;
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemInstruction = { parts: [{ text: m.content }] };
      continue;
    }
    if (m.role === "tool") {
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: m.name,
            response: { result: typeof m.content === "string" ? m.content : m.content },
          },
        }],
      });
      continue;
    }
    if (m.role === "assistant") {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls ?? []) {
        parts.push({ functionCall: { name: tc.name, args: tc.arguments ?? {} } });
      }
      contents.push({ role: "model", parts });
      continue;
    }
    contents.push({ role: "user", parts: [{ text: m.content ?? "" }] });
  }
  return { systemInstruction, contents };
}

export async function* streamChat({ apiKey, baseUrl, model, messages, tools, signal }) {
  const base = (baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const { systemInstruction, contents } = toApi(messages);
  const body = { systemInstruction, contents };
  if (tools?.length) {
    body.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters ?? { type: "object", properties: {} },
      })),
    }];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey ?? "",
    },
    body: JSON.stringify(body),
    signal,
  });
  await checkResponse(response, "Gemini");

  const toolCalls = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let callN = 0;

  for await (const data of readSseLines(response)) {
    let chunk;
    try { chunk = JSON.parse(data); } catch { continue; }
    if (chunk.usageMetadata) {
      usage.inputTokens = chunk.usageMetadata.promptTokenCount ?? usage.inputTokens;
      usage.outputTokens = chunk.usageMetadata.candidatesTokenCount ?? usage.outputTokens;
    }
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.text) yield { type: "text_delta", delta: part.text };
      if (part.functionCall) {
        toolCalls.push({
          id: `gemini_call_${callN++}_${Date.now()}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }
  }

  if (toolCalls.length) yield { type: "tool_calls", toolCalls };
  yield { type: "usage", usage };
  yield { type: "done" };
}
