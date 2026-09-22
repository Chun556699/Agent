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
            <h1 className="text-lg font-semibold">Agents</h1>
            <p className="text-sm text-neutral-500">
              Specialist sub-agents the orchestrator can delegate to — each with its own prompt, tools and context.
            </p>
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="ml-auto px-3 py-1.5 rounded bg-accent/20 text-accent-soft text-sm hover:bg-accent/30"
          >
            + Custom agent
          </button>
        </header>

        {showForm && (
          <AgentForm
            tools={toolsData?.tools ?? []}
            onCreated={() => { setShowForm(false); reload(); }}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(data?.agents ?? []).map((a) => (
            <div key={a.id} className="rounded-lg border border-line bg-surface-1 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-indigo-400">⬡</span>
                <div className="font-medium text-sm flex-1">{a.name}</div>
                {a.builtin
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-neutral-500">built-in</span>
                  : (
                    <button
                      className="text-[11px] text-neutral-500 hover:text-red-400"
                      onClick={async () => { await api.del(`/api/agents/${a.id}`); reload(); }}
                    >
                      delete
                    </button>
                  )}
              </div>
              <p className="text-xs text-neutral-400">{a.description}</p>
              <details className="text-[11px] text-neutral-500">
                <summary className="cursor-pointer hover:text-neutral-300">system prompt</summary>
                <pre className="mt-1 max-h-32 overflow-y-auto">{a.systemPrompt}</pre>
              </details>
              <div className="flex flex-wrap gap-1">
                {(a.tools ?? ["*"]).map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-neutral-400 font-mono">{t}</span>
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
      await api.post("/api/agents", {
        name, description, systemPrompt,
        tools: [...selected],
      });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="rounded-lg border border-accent/30 bg-surface-1 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input className="bg-surface-2 border border-line rounded px-2.5 py-1.5 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="bg-surface-2 border border-line rounded px-2.5 py-1.5 text-sm" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <textarea
        className="w-full bg-surface-2 border border-line rounded px-2.5 py-1.5 text-sm h-24"
        placeholder="System prompt — what this agent is for and how it should behave"
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
      />
      <div>
        <div className="text-xs text-neutral-400 mb-1.5">Tools (leave none selected = all tools)</div>
        <div className="flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <button
              key={t.name}
              onClick={() => setSelected((s) => {
                const n = new Set(s);
                if (n.has(t.name)) n.delete(t.name); else n.add(t.name);
                return n;
              })}
              className={`text-[11px] px-2 py-0.5 rounded font-mono ${selected.has(t.name) ? "bg-accent/25 text-accent-soft" : "bg-surface-2 text-neutral-500"}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={!name || !systemPrompt}
          className="px-3 py-1.5 rounded bg-accent text-white text-sm disabled:opacity-40">
          Create agent
        </button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>
    </div>
  );
}
