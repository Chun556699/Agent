import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../lib/hooks";
import type { Provider } from "../types";

export function ProvidersPage() {
  const { data, reload } = useFetch<{ providers: Provider[] }>("/api/providers");

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <header>
          <h1 className="text-lg font-semibold">Model providers</h1>
          <p className="text-sm text-neutral-500">
            API keys are encrypted at rest (AES-256-GCM) and never leave this machine except to the provider.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.providers ?? []).map((p) => (
            <ProviderCard key={p.id} p={p} onChanged={reload} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ p, onChanged }: { p: Provider; onChanged: () => void }) {
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(p.baseUrl ?? "");
  const [testing, setTesting] = useState<null | "pending" | "ok" | "fail">(null);
  const [testMsg, setTestMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/providers/${p.id}`, {
        apiKey: key || undefined,
        baseUrl: baseUrl || undefined,
      });
      setKey("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting("pending");
    try {
      const r = await api.post<{ reply: string }>(`/api/providers/${p.id}/test`, { model: p.models[0] });
      setTesting("ok");
      setTestMsg(r.reply || "ok");
    } catch (e) {
      setTesting("fail");
      setTestMsg((e as Error).message);
    }
  };

  const toggle = async (enabled: boolean) => {
    await api.put(`/api/providers/${p.id}`, { enabled });
    onChanged();
  };

  const fmtBadge = { openai: "OpenAI-API", anthropic: "Anthropic", gemini: "Gemini", mock: "offline" }[p.format] ?? p.format;

  return (
    <div className={`rounded-lg border bg-surface-1 p-4 space-y-3 ${p.enabled ? "border-line" : "border-line/50 opacity-60"}`}>
      <div className="flex items-center gap-2">
        <div className="font-medium text-sm flex-1">{p.label}</div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-neutral-400 font-mono">{fmtBadge}</span>
        {p.configured && <span className="w-2 h-2 rounded-full bg-emerald-500" title="Configured" />}
        <button
          onClick={() => toggle(!p.enabled)}
          className={`text-[11px] px-2 py-0.5 rounded ${p.enabled ? "text-emerald-400" : "text-neutral-500"}`}
        >
          {p.enabled ? "enabled" : "disabled"}
        </button>
      </div>
      {p.blurb && <div className="text-[11px] text-neutral-500">{p.blurb}</div>}

      {p.keyRequired && (
        <input
          type="password"
          className="w-full bg-surface-2 border border-line rounded px-2.5 py-1.5 text-xs"
          placeholder={p.hasKey ? "API key saved (enter to replace)" : "API key"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      )}
      {p.id === "custom" && (
        <input
          className="w-full bg-surface-2 border border-line rounded px-2.5 py-1.5 text-xs"
          placeholder="Base URL, e.g. https://my-llm.example.com/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      )}
      {p.id !== "mock" && p.id !== "custom" && (
        <input
          className="w-full bg-surface-2 border border-line rounded px-2.5 py-1.5 text-xs font-mono"
          placeholder="Base URL override (optional)"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      )}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || (!key && !baseUrl)}
          className="px-2.5 py-1 rounded bg-accent/20 text-accent-soft text-xs hover:bg-accent/30 disabled:opacity-40">
          Save
        </button>
        {p.configured && (
          <button onClick={test} disabled={testing === "pending"}
            className="px-2.5 py-1 rounded bg-surface-3 text-xs hover:bg-surface-3/70 disabled:opacity-40">
            {testing === "pending" ? "Testing…" : "Test connection"}
          </button>
        )}
        {testing === "ok" && <span className="text-[11px] text-emerald-400">✓ {testMsg}</span>}
        {testing === "fail" && <span className="text-[11px] text-red-400" title={testMsg}>✗ {testMsg.slice(0, 80)}</span>}
      </div>

      <div className="flex flex-wrap gap-1">
        {p.models.map((m) => (
          <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-neutral-400 font-mono">{m}</span>
        ))}
      </div>
    </div>
  );
}
