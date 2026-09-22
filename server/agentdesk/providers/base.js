/**
 * Provider contract. A driver is a module exporting:
 *
 *   async function* streamChat({ apiKey, baseUrl, model, messages, tools, signal })
 *
 * `messages` is a normalized list:
 *   { role: "system" | "user" | "assistant" | "tool",
 *     content: string,
 *     tool_calls?: [{ id, name, arguments /* object *\/ }],
 *     tool_call_id?: string, name?: string }
 *
 * `tools` is a normalized list:
 *   { name, description, parameters /* JSON Schema *\/ }
 *
 * It yields normalized stream events:
 *   { type: "text_delta", delta: string }
 *   { type: "tool_calls", toolCalls: [{ id, name, arguments /* object *\/ }] }
 *   { type: "usage", usage: { inputTokens, outputTokens } }
 *   { type: "done" }
 */
export class ProviderError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function* readSseLines(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      if (line === "") {
        if (dataLines.length) {
          yield dataLines.join("\n");
          dataLines = [];
        }
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }
  if (dataLines.length) yield dataLines.join("\n");
}

export async function checkResponse(response, providerLabel) {
  if (response.ok) return;
  let body = "";
  try { body = await response.text(); } catch { /* ignore */ }
  throw new ProviderError(
    `${providerLabel} request failed (HTTP ${response.status})`,
    { status: response.status, body: body.slice(0, 2000) }
  );
}
