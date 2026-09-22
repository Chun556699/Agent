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
          <h1 className="text-lg font-semibold">Plugin marketplace</h1>
          <p className="text-sm text-neutral-500">
            Install tools and MCP servers. Installed plugins load at boot; MCP tools appear as <code>plugin:tool</code>.
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
            <h2 className="text-sm font-medium mb-2">Local modules</h2>
            <p className="text-xs text-neutral-500 mb-2">
              .mjs files dropped in <code>~/.agentdesk/plugins</code>. Trust them like code — they run in-process.
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
    <div className="rounded-lg border border-line bg-surface-1 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="font-medium text-sm flex-1">{e.name}</div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-neutral-400 font-mono">{e.kind}</span>
        <span className="text-[10px] text-neutral-600">v{e.version}</span>
      </div>
      <p className="text-xs text-neutral-400">{e.description}</p>
      {e.tools && (
        <div className="flex flex-wrap gap-1">
          {e.tools.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-neutral-400 font-mono">{t}</span>
          ))}
        </div>
      )}
      {e.kind === "mcp" && e.spec && (
        <pre className="text-[10px] text-neutral-500 font-mono truncate">{e.spec.command} {e.spec.args.join(" ")}</pre>
      )}
      <div className="flex items-center gap-2 pt-1">
        {!inst ? (
          <button disabled={busy} onClick={() => act(() => api.post(`/api/plugins/${e.id}/install`))}
            className="px-2.5 py-1 rounded bg-accent/20 text-accent-soft text-xs hover:bg-accent/30 disabled:opacity-40">
            Install
          </button>
        ) : (
          <>
            <button disabled={busy} onClick={() => act(() => api.post(`/api/plugins/${e.id}/toggle`, { enabled: !inst.enabled }))}
              className={`px-2.5 py-1 rounded text-xs disabled:opacity-40 ${inst.enabled ? "bg-emerald-600/20 text-emerald-400" : "bg-surface-3 text-neutral-400"}`}>
              {inst.enabled ? "Enabled" : "Disabled"}
            </button>
            <button disabled={busy} onClick={() => act(() => api.del(`/api/plugins/${e.id}`))}
              className="px-2.5 py-1 rounded bg-surface-3 text-xs text-neutral-400 hover:text-red-400 disabled:opacity-40">
              Uninstall
            </button>
          </>
        )}
        <span className="text-[10px] text-neutral-600 ml-auto">{e.author}</span>
      </div>
      {err && <div className="text-[11px] text-red-400">{err}</div>}
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
    <section className="rounded-lg border border-line bg-surface-1 p-4 space-y-3">
      <h2 className="text-sm font-medium">Connect an MCP server</h2>
      <p className="text-xs text-neutral-500">Any stdio MCP server — command runs locally, tools are registered under its id.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className="bg-surface-2 border border-line rounded px-2.5 py-1.5 text-xs" placeholder="id (e.g. my-server)" value={id} onChange={(e) => setId(e.target.value)} />
        <input className="bg-surface-2 border border-line rounded px-2.5 py-1.5 text-xs" placeholder="command (e.g. npx)" value={command} onChange={(e) => setCommand(e.target.value)} />
        <input className="bg-surface-2 border border-line rounded px-2.5 py-1.5 text-xs" placeholder="args (space separated)" value={args} onChange={(e) => setArgs(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <button disabled={busy || !id || !command} onClick={submit}
          className="px-2.5 py-1 rounded bg-accent/20 text-accent-soft text-xs hover:bg-accent/30 disabled:opacity-40">
          {busy ? "Connecting…" : "Connect"}
        </button>
        {err && <span className="text-[11px] text-red-400">{err}</span>}
      </div>
    </section>
  );
}
