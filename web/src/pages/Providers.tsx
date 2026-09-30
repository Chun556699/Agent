import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "../api";
import { useFetch } from "../lib/hooks";
import { Switch, Tip } from "../components/ui";
import type { Provider } from "../types";

export function ProvidersPage() {
  const { data, reload } = useFetch<{ providers: Provider[] }>("/api/providers");
  const groups = data?.providers ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="font-display text-2xl tracking-tight">模型供应商</h1>
          <p className="text-sm text-ink-2 mt-1">
            接入模型厂商。密钥本地 AES-256-GCM 加密存储，永不离开这台机器。
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((p) => <ProviderCard key={p.id} p={p} onChanged={reload} />)}
        </div>
      </div>
    </div>
  );
}

function ProviderCard({ p, onChanged }: { p: Provider; onChanged: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(p.baseUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/api/providers/${p.id}`, { apiKey: apiKey || undefined, baseUrl: baseUrl || undefined });
      setApiKey("");
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    await api.put(`/api/providers/${p.id}`, { enabled: !p.enabled });
    onChanged();
  };

  const test = async () => {
    setBusy(true);
    setTestMsg(null);
    try {
      const r = await api.post<{ ok: boolean; error?: string; model?: string }>(`/api/providers/${p.id}/test`);
      setTestMsg({ ok: r.ok, text: r.ok ? `Connected${r.model ? ` · ${r.model}` : ""}` : (r.error ?? "failed") });
    } catch (e) {
      setTestMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-medium text-[14px] flex-1">{p.label}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-fill text-ink-2 font-mono">{p.format}</span>
        <Tip content={p.enabled ? "停用" : "启用"} side="left">
          <span className="inline-flex"><Switch checked={p.enabled} onChecked={() => toggle()} /></span>
        </Tip>
      </div>

      {p.keyRequired && (
        <input
          type="password"
          className="input w-full !text-[12px]"
          placeholder={p.hasKey ? "已保存 key —— 输入则替换" : "API key"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      )}
      <input
        className="input w-full !text-[12px]"
        placeholder={p.baseUrl ?? "https://…"}
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
      />

      <div className="flex flex-wrap gap-1">
        {p.models.slice(0, 4).map((m) => (
          <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-fill text-ink-2 font-mono">{m}</span>
        ))}
        {p.models.length > 4 && <span className="text-[10px] text-ink-3">+{p.models.length - 4}</span>}
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <button onClick={save} disabled={busy} className="btn-ink !text-[12px] !py-1.5">保存</button>
        <button onClick={test} disabled={busy || !p.configured} className="btn-ghost !text-[12px] !py-1.5">测试连接</button>
        {testMsg && (
          <span className={`text-[11px] truncate flex items-center gap-1 ${testMsg.ok ? "text-ok" : "text-err"}`}>
            {testMsg.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {testMsg.text}
          </span>
        )}
      </div>
    </div>
  );
}
