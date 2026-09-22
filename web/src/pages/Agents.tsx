import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../lib/hooks";
import type { Agent, ToolSpec } from "../types";

export function AgentsPage() {
  const { data, reload } = useFetch<{ agents: Agent[] }>("/api/agents");
  const { data: toolsData } = useFetch<{ tools: ToolSpec[] }>("/api/tools");
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-2xl tracking-tight">Agents</h1>
            <p className="text-sm text-ink-2 mt-1">
              Specialist sub-agents the orchestrator can delegate to — each with its own prompt, tools and context.
            </p>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="btn-ink ml-auto !text-[12px]">
            + Custom agent
          </button>
        </header>

        {showForm && (
          <AgentForm tools={toolsData?.tools ?? []} onCreated={() => { setShowForm(false); reload(); }} />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.agents ?? []).map((a) => (
            <div key={a.id} className="card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-run">⬡</span>
                <div className="font-medium text-[14px] flex-1">{a.name}</div>
                {a.builtin
                  ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-fill text-ink-3">built-in</span>
                  : (
                    <button className="btn-mini !text-err" onClick={async () => { await api.del(`/api/agents/${a.id}`); reload(); }}>
                      delete
                    </button>
                  )}
              </div>
              <p className="text-[12px] text-ink-2">{a.description}</p>
              <details className="text-[11px] text-ink-3">
                <summary className="cursor-pointer hover:text-ink">system prompt</summary>
                <pre className="mt-1 max-h-32 overflow-y-auto text-ink-2">{a.systemPrompt}</pre>
              </details>
              <div className="flex flex-wrap gap-1">
                {(a.tools ?? ["*"]).map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-fill text-ink-2 font-mono">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentForm({ tools, onCreated }: { tools: ToolSpec[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["calculator", "read_file", "list_directory"]));
  const [err, setErr] = useState("");

  const submit = async () => {
    try {
      await api.post("/api/agents", { name, description, systemPrompt, tools: [...selected] });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="card p-4 space-y-3" style={{ borderColor: "var(--color-ink-3)" }}>
      <div className="grid grid-cols-2 gap-2">
        <input className="input !text-[13px]" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input !text-[13px]" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <textarea
        className="input w-full !text-[13px] h-24 resize-none"
        placeholder="System prompt — what this agent is for and how it should behave"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
      />
      <div>
        <div className="text-[12px] text-ink-2 mb-1.5">Tools (none selected = all tools)</div>
        <div className="flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <button
              key={t.name}
              onClick={() => setSelected((s) => {
                const n = new Set(s);
                if (n.has(t.name)) n.delete(t.name); else n.add(t.name);
                return n;
              })}
              className={`text-[11px] px-2.5 py-1 rounded-full font-mono border transition-colors ${
                selected.has(t.name) ? "bg-ink text-paper border-ink" : "bg-card text-ink-2 border-line"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={!name || !systemPrompt} className="btn-ink !text-[12px]">
          Create agent
        </button>
        {err && <span className="text-[12px] text-err">{err}</span>}
      </div>
    </div>
  );
}
