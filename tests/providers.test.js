import { test } from "node:test";
import assert from "node:assert/strict";
import { streamChat as openaiChat } from "../server/agentdesk/providers/openai.js";
import { streamChat as anthropicChat } from "../server/agentdesk/providers/anthropic.js";
import { streamChat as geminiChat } from "../server/agentdesk/providers/gemini.js";

const realFetch = globalThis.fetch;

function mockSse(body) {
  globalThis.fetch = async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

async function collect(gen) {
  const out = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

test("openai driver parses text, tool calls and usage", async () => {
  mockSse([
    `data: {"choices":[{"delta":{"content":"Hello"}}]}`,
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"calculator","arguments":"{\\"ex"}}]}}]}`,
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"pression\\":\\"1+1\\"}"}}]}}]}`,
    `data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":10,"completion_tokens":5}}`,
    `data: [DONE]`,
    "",
  ].join("\n\n"));
  try {
    const evs = await collect(
      openaiChat({ apiKey: "k", baseUrl: "https://api.example.com", model: "m", messages: [], tools: [] })
    );
    const text = evs.filter((e) => e.type === "text_delta").map((e) => e.delta).join("");
    assert.equal(text, "Hello");
    const tc = evs.find((e) => e.type === "tool_calls");
    assert.deepEqual(tc.toolCalls, [{ id: "call_1", name: "calculator", arguments: { expression: "1+1" } }]);
    const usage = evs.find((e) => e.type === "usage");
    assert.deepEqual(usage.usage, { inputTokens: 10, outputTokens: 5 });
    assert.equal(evs.at(-1).type, "done");
  } finally {
    restoreFetch();
  }
});

test("anthropic driver parses tool_use blocks and usage", async () => {
  mockSse([
    `data: {"type":"message_start","message":{"usage":{"input_tokens":42}}}`,
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi "}}`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"there"}}`,
    `data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_1","name":"calculator"}}`,
    `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"expression\\": \\"2*3\\"}"}}`,
    `data: {"type":"message_delta","usage":{"output_tokens":7}}`,
    "",
  ].join("\n\n"));
  try {
    const evs = await collect(
      anthropicChat({ apiKey: "k", baseUrl: "https://api.anthropic.com", model: "claude-x", messages: [], tools: [] })
    );
    assert.equal(evs.filter((e) => e.type === "text_delta").map((e) => e.delta).join(""), "Hi there");
    const tc = evs.find((e) => e.type === "tool_calls");
    assert.deepEqual(tc.toolCalls, [{ id: "tu_1", name: "calculator", arguments: { expression: "2*3" } }]);
    assert.deepEqual(evs.find((e) => e.type === "usage").usage, { inputTokens: 42, outputTokens: 7 });
  } finally {
    restoreFetch();
  }
});

test("gemini driver parses parts, functionCall and usageMetadata", async () => {
  mockSse([
    `data: {"candidates":[{"content":{"parts":[{"text":"Answer: "}]}}]}`,
    `data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_current_datetime","args":{}}}]}}],"usageMetadata":{"promptTokenCount":20,"candidatesTokenCount":3}}`,
    "",
  ].join("\n\n"));
  try {
    const evs = await collect(
      geminiChat({ apiKey: "k", model: "gemini-x", messages: [], tools: [] })
    );
    assert.equal(evs.filter((e) => e.type === "text_delta").map((e) => e.delta).join(""), "Answer: ");
    const tc = evs.find((e) => e.type === "tool_calls");
    assert.equal(tc.toolCalls[0].name, "get_current_datetime");
    assert.deepEqual(evs.find((e) => e.type === "usage").usage, { inputTokens: 20, outputTokens: 3 });
  } finally {
    restoreFetch();
  }
});

test("openai driver raises ProviderError on http error", async () => {
  globalThis.fetch = async () => new Response("nope", { status: 401 });
  try {
    await assert.rejects(
      () =>
        collect(
          openaiChat({ apiKey: "k", baseUrl: "https://api.example.com", model: "m", messages: [], tools: [] })
        ),
      /401|OpenAI-compatible/
    );
  } finally {
    restoreFetch();
  }
});
