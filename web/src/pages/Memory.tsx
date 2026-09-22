import { api } from "../api";
import { useFetch } from "../lib/hooks";
import type { MemoryItem } from "../types";

export function MemoryPage() {
  const { data, reload } = useFetch<{ memories: MemoryItem[] }>("/api/memory");

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <header>
          <h1 className="font-display text-2xl tracking-tight">Memory</h1>
          <p className="text-sm text-ink-2 mt-1">
            Persistent facts agents save via <code className="font-mono">memory_save</code>. Shared across threads and sub-agents.
          </p>
        </header>
        {(data?.memories ?? []).length === 0 && (
          <div className="text-sm text-ink-3 py-10 text-center">
            Nothing remembered yet. Ask the agent to remember something.
          </div>
        )}
        <div className="space-y-2">
          {(data?.memories ?? []).map((m) => (
            <div key={m.id} className="card px-4 py-3 flex gap-3">
              <div className="flex-1">
                <div className="text-[14px]">{m.content}</div>
                <div className="text-[11px] text-ink-3 mt-1">
                  {m.tags && <span className="text-ink-2 mr-2">#{m.tags}</span>}
                  {m.created_at}
                </div>
              </div>
              <button
                className="text-ink-3 hover:text-err self-start transition-colors"
                onClick={async () => { await api.del(`/api/memory/${m.id}`); reload(); }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
