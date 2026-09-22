import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../lib/hooks";
import type { InstalledPlugin, PluginEntry } from "../types";

type MarketData = {
  marketplace: PluginEntry[];
  installed: InstalledPlugin[];
  localModules: string[];
};

export function PluginsPage() {
  const { data, reload } = useFetch<MarketData>("/api/plugins/marketplace");
  const installed = new Map((data?.installed ?? []).map((p) => [p.id, p]));

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="font-display text-2xl tracking-tight">Plugin marketplace</h1>
          <p className="text-sm text-ink-2 mt-1">
            Install tools and MCP servers. Installed plugins load at boot; MCP tools appear as <code className="font-mono">plugin:tool</code>.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.marketplace ?? []).map((e) => (
            <MarketCard key={e.id} e={e} inst={installed.get(e.id)} onChanged={reload} />
          ))}
        </div>

        <CustomMcpForm onAdded={reload} />

        {(data?.localModules?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-[13px] font-medium mb-2">Local modules</h2>
            <p className="text-[12px] text-ink-2 mb-3">
              .mjs files dropped in <code className="font-mono">~/.agentdesk/plugins</code>. Trust them like code — they run in-process.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data!.localModules.map((id) => (
                <MarketCard
                  key={id}
                  e={{ id, kind: "module", name: id, version: "local", description: "Local plugin module", author: "you", tags: ["local"] }}
                  inst={installed.get(id)}
                  onChanged={reload}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MarketCard({ e, inst, onChanged }: { e: PluginEntry; inst?: InstalledPlugin; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onChanged();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="font-medium text-[14px] flex-1">{e.name}</div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-fill text-ink-2 font-mono">{e.kind}</span>
        <span className="text-[10px] text-ink-3 font-mono">v{e.version}</span>
      </div>
      <p className="text-[12px] text-ink-2">{e.description}</p>
      {e.tools && (
        <div className="flex flex-wrap gap-1">
          {e.tools.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-fill text-ink-2 font-mono">{t}</span>
          ))}
        </div>
      )}
      {e.kind === "mcp" && e.spec && (
        <pre className="text-[10px] text-ink-3 font-mono truncate">{e.spec.command} {e.spec.args.join(" ")}</pre>
      )}
      <div className="flex items-center gap-2 pt-1">
        {!inst ? (
          <button disabled={busy} onClick={() => act(() => api.post(`/api/plugins/${e.id}/install`))} className="btn-ink !text-[12px] !py-1">
            Install
          </button>
        ) : (
          <>
            <button disabled={busy} onClick={() => act(() => api.post(`/api/plugins/${e.id}/toggle`, { enabled: !inst.enabled }))}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 ${inst.enabled ? "border-ink text-ink" : "border-line text-ink-3"}`}>
              {inst.enabled ? "Enabled" : "Disabled"}
            </button>
            <button disabled={busy} onClick={() => act(() => api.del(`/api/plugins/${e.id}`))}
              className="btn-mini !text-err">
              Uninstall
            </button>
          </>
        )}
        <span className="text-[10px] text-ink-3 ml-auto">{e.author}</span>
      </div>
      {err && <div className="text-[11px] text-err">{err}</div>}
    </div>
  );
}

function CustomMcpForm({ onAdded }: { onAdded: () => void }) {
  const [id, setId] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.post("/api/plugins/mcp", {
        id,
        command,
        args: args.split(" ").filter(Boolean),
      });
      setId(""); setCommand(""); setArgs("");
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-4 space-y-3">
      <h2 className="text-[14px] font-medium">Connect an MCP server</h2>
      <p className="text-[12px] text-ink-2">Any stdio MCP server — the command runs locally and its tools register under its id.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className="input !text-[12px]" placeholder="id (e.g. my-server)" value={id} onChange={(e) => setId(e.target.value)} />
        <input className="input !text-[12px]" placeholder="command (e.g. npx)" value={command} onChange={(e) => setCommand(e.target.value)} />
        <input className="input !text-[12px]" placeholder="args (space separated)" value={args} onChange={(e) => setArgs(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <button disabled={busy || !id || !command} onClick={submit} className="btn-ink !text-[12px] !py-1.5">
          {busy ? "Connecting…" : "Connect"}
        </button>
        {err && <span className="text-[11px] text-err">{err}</span>}
      </div>
    </section>
  );
}
