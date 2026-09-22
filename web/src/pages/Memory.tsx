import { api } from "../api";
import { useFetch } from "../lib/hooks";
import type { MemoryItem } from "../types";

export function MemoryPage() {
  const { data, reload } = useFetch<{ memories: MemoryItem[] }>("/api/memory");

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header>
          <h1 className="text-lg font-semibold">Memory</h1>
          <p className="text-sm text-neutral-500">
            Persistent facts agents save via <code>memory_save</code>. Shared across threads and sub-agents.
          </p>
        </header>
        {(data?.memories ?? []).length === 0 && (
          <div className="text-sm text-neutral-500 py-8 text-center">
            Nothing remembered yet. Ask the agent to remember something.
          </div>
        )}
        <div className="space-y-2">
          {(data?.memories ?? []).map((m) => (
            <div key={m.id} className="rounded-lg border border-line bg-surface-1 px-4 py-3 flex gap-3">
              <div className="flex-1">
                <div className="text-sm">{m.content}</div>
                <div className="text-[11px] text-neutral-500 mt-1">
                  {m.tags && <span className="text-neutral-400 mr-2">#{m.tags}</span>}
                  {m.created_at}
                </div>
              </div>
              <button
                className="text-neutral-500 hover:text-red-400 self-start"
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
