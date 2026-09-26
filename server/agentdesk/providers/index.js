import { decryptSecret, encryptSecret } from "../crypto.js";
import { q } from "../db.js";
import { HttpError } from "../http.js";
import * as anthropic from "./anthropic.js";
import * as gemini from "./gemini.js";
import * as mock from "./mock.js";
import * as openai from "./openai.js";

/**
 * Vendor catalog. `format` selects the wire driver; most vendors expose an
 * OpenAI-compatible API so one driver covers them all (like LiteLLM, minus
 * the dependency).
 */
export const VENDORS = [
  { id: "mock", label: "Mock (offline demo)", format: "mock", baseUrl: null, keyRequired: false,
    models: ["mock-1"], blurb: "Built-in offline model for demos and tests." },
  { id: "openai", label: "OpenAI", format: "openai", baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3", "o4-mini"] },
  { id: "anthropic", label: "Anthropic", format: "anthropic", baseUrl: "https://api.anthropic.com",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"] },
  { id: "google", label: "Google Gemini", format: "gemini", baseUrl: "https://generativelanguage.googleapis.com",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"] },
  { id: "deepseek", label: "DeepSeek", format: "openai", baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "moonshot", label: "Moonshot Kimi", format: "openai", baseUrl: "https://api.moonshot.ai/v1",
    models: ["kimi-k2-0905-preview", "moonshot-v1-128k"] },
  { id: "qwen", label: "Alibaba Qwen", format: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen3-max", "qwen-plus", "qwen-flash"] },
  { id: "zhipu", label: "Zhipu GLM", format: "openai", baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4.6", "glm-4.5-air"] },
  { id: "minimax", label: "MiniMax", format: "openai", baseUrl: "https://api.minimax.io/v1",
    models: ["MiniMax-M2", "abab6.5s-chat"] },
  { id: "doubao", label: "ByteDance Doubao", format: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["doubao-seed-1-6", "doubao-1-5-pro-256k"] },
  { id: "mistral", label: "Mistral", format: "openai", baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"] },
  { id: "groq", label: "Groq", format: "openai", baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"] },
  { id: "xai", label: "xAI Grok", format: "openai", baseUrl: "https://api.x.ai/v1",
    models: ["grok-4", "grok-3-mini"] },
  { id: "openrouter", label: "OpenRouter", format: "openai", baseUrl: "https://openrouter.ai/api/v1",
    models: ["auto"], blurb: "Gateway to hundreds of models." },
  { id: "ollama", label: "Ollama (local)", format: "openai", baseUrl: "http://localhost:11434/v1",
    keyRequired: false, models: ["llama3.3", "qwen3", "deepseek-r1"] },
  { id: "lmstudio", label: "LM Studio (local)", format: "openai", baseUrl: "http://localhost:1234/v1",
    keyRequired: false, models: ["local-model"] },
  { id: "custom", label: "Custom (OpenAI-compatible)", format: "openai", baseUrl: "",
    keyRequired: false, models: [],
    blurb: "Any endpoint speaking the OpenAI chat-completions protocol." },
];

const DRIVERS = { openai, anthropic, gemini, mock };

export function listProviders() {
  return VENDORS.map((v) => {
    const row = q.get("SELECT * FROM providers WHERE id = ?", v.id);
    return {
      ...v,
      baseUrl: row?.base_url ?? v.baseUrl,
      enabled: row ? !!row.enabled : true,
      hasKey: !!row?.api_key_enc,
      keyRequired: v.keyRequired !== false,
      configured: !!row?.api_key_enc || v.keyRequired === false,
    };
  });
}

export function getProviderState(id) {
  const vendor = VENDORS.find((v) => v.id === id);
  if (!vendor) throw new HttpError(404, `Unknown provider '${id}'`);
  const row = q.get("SELECT * FROM providers WHERE id = ?", id);
  return { vendor, row };
}

export function configureProvider(id, { apiKey, baseUrl, enabled }) {
  const { vendor } = getProviderState(id);
  const existing = q.get("SELECT * FROM providers WHERE id = ?", id);
  const enc =
    apiKey != null ? (apiKey === "" ? null : encryptSecret(apiKey)) : existing?.api_key_enc ?? null;
  // Fields not present in this request keep their stored values — e.g.
  // toggling `enabled` must not reset a custom baseUrl back to the default.
  const nextBase = baseUrl != null ? baseUrl : (existing?.base_url ?? vendor.baseUrl ?? "");
  const nextEnabled = enabled == null ? (existing?.enabled ?? 1) : enabled ? 1 : 0;
  q.run(
    `INSERT INTO providers (id, base_url, enabled, api_key_enc, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       base_url = excluded.base_url,
       enabled = excluded.enabled,
       api_key_enc = excluded.api_key_enc,
       updated_at = excluded.updated_at`,
    id,
    nextBase,
    nextEnabled,
    enc
  );
}

/** Resolve a provider+model into a working streamChat call. */
export function resolveModel({ providerId, model }) {
  const { vendor, row } = getProviderState(providerId);
  if (row && !row.enabled) throw new HttpError(400, `Provider '${providerId}' is disabled`);
  const apiKey = row?.api_key_enc ? decryptSecret(row.api_key_enc) : null;
  if (vendor.keyRequired !== false && !apiKey) {
    throw new HttpError(400, `Provider '${providerId}' has no API key configured`);
  }
  const driver = DRIVERS[vendor.format];
  const chosen = model || vendor.models[0];
  return {
    providerId,
    model: chosen,
    vendor,
    run: ({ messages, tools, signal, meta }) =>
      driver.streamChat({
        apiKey,
        baseUrl: row?.base_url || vendor.baseUrl,
        model: chosen,
        messages,
        tools,
        signal,
        meta,
      }),
  };
}
