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
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-2xl tracking-tight">Activity</h1>
            <p className="text-sm text-ink-2 mt-1">Raw event log — every run is a durable, replayable event stream.</p>
          </div>
          <button onClick={reload} className="btn-ghost ml-auto !text-[12px]">Refresh</button>
        </header>
        <div className="card divide-y divide-line font-mono text-[11px]">
          {(data?.events ?? []).map((e) => (
            <div key={e.seq} className="px-3 py-1.5 flex gap-3">
              <span className="text-ink-3 w-12 shrink-0">#{e.seq}</span>
              <span className={`w-36 shrink-0 ${eventColor(e.type)}`}>{e.type}</span>
              <span className="text-ink-3 truncate w-28">{e.runId}</span>
              <span className="text-ink-2 truncate flex-1">{summarize(e)}</span>
            </div>
          ))}
          {(data?.events ?? []).length === 0 && (
            <div className="px-3 py-6 text-ink-3 text-center">No events yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function eventColor(t: string) {
  if (t === "run_completed") return "text-ok";
  if (t === "approval_request") return "text-warn";
  if (t === "tool_call" || t === "tool_result") return "text-run";
  if (t.startsWith("subagent")) return "text-ink";
  return "text-ink-3";
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
