import { useFetch } from "../lib/hooks";

type ActivityEvent = {
  seq: number;
  runId: string;
  type: string;
  [k: string]: unknown;
};

export function ActivityPage() {
  const { data, reload } = useFetch<{ events: ActivityEvent[] }>("/api/activity?limit=200");

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold">Activity</h1>
            <p className="text-sm text-neutral-500">Raw event log — every run is a durable, replayable event stream.</p>
          </div>
          <button onClick={reload} className="ml-auto px-3 py-1.5 rounded bg-surface-2 text-sm hover:bg-surface-3">
            Refresh
          </button>
        </header>
        <div className="rounded-lg border border-line bg-surface-1 divide-y divide-line/50 font-mono text-[11px]">
          {(data?.events ?? []).map((e) => (
            <div key={e.seq} className="px-3 py-1.5 flex gap-3">
              <span className="text-neutral-600 w-12 shrink-0">#{e.seq}</span>
              <span className={`w-36 shrink-0 ${eventColor(e.type)}`}>{e.type}</span>
              <span className="text-neutral-500 truncate">{e.runId}</span>
              <span className="text-neutral-600 truncate flex-1">{summarize(e)}</span>
            </div>
          ))}
          {(data?.events ?? []).length === 0 && (
            <div className="px-3 py-6 text-neutral-500 text-center">No events yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function eventColor(t: string) {
  if (t === "run_completed") return "text-emerald-400";
  if (t === "approval_request") return "text-amber-400";
  if (t === "tool_call" || t === "tool_result") return "text-sky-400";
  if (t.startsWith("subagent")) return "text-indigo-400";
  return "text-neutral-400";
}

function summarize(e: ActivityEvent): string {
  switch (e.type) {
    case "tool_call": return `${e.name} ${JSON.stringify(e.args)?.slice(0, 80)}`;
    case "tool_result": return `${e.name} → ${e.ok ? "ok" : e.error}`;
    case "approval_request": return `${e.tool} (${e.danger})`;
    case "subagent_started": return `${e.agentName}: ${String(e.task ?? "").slice(0, 60)}`;
    case "run_started": return `${e.agentId} on ${e.providerId}/${e.model}`;
    case "run_completed": return `${e.status}${e.error ? ` — ${e.error}` : ""}`;
    default: return JSON.stringify(e).slice(0, 100);
  }
}
