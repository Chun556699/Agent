import { useEffect, useState } from "react";
import { api } from "../api";
import type { ToolSpec } from "../types";

type ContextStats = {
  messageCount: number;
  estimatedTokens: number;
  budget: number;
  usageRatio: number;
  hasSummary: boolean;
  summaryTokens: number;
};

type RunNode = {
  run: { id: string; agent_id: string; status: string; parent_run_id: string | null; depth: number; model: string | null };
  children: { id: string; agent_id: string; status: string }[];
};

export function Inspector({ runId }: { runId: string }) {
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [tree, setTree] = useState<RunNode | null>(null);
  const [tools, setTools] = useState<ToolSpec[]>([]);
  const [auto, setAuto] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const [ctx, run] = await Promise.all([
          api.get<ContextStats>(`/api/runs/${runId}/context`),
          api.get<RunNode>(`/api/runs/${runId}`),
        ]);
        if (live) { setStats(ctx); setTree(run); }
      } catch { /* run may have ended */ }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { live = false; clearInterval(t); };
  }, [runId]);

  useEffect(() => {
    api.get<{ tools: ToolSpec[]; autoApprove: Record<string, boolean> }>("/api/tools").then((d) => {
      setTools(d.tools);
      setAuto(d.autoApprove ?? {});
    }).catch(() => {});
  }, []);

  const toggleAuto = async (name: string, on: boolean) => {
    setAuto((a) => ({ ...a, [name]: on }));
    await api.put("/api/settings/auto-approve", { tool: name, enabled: on });
  };

  const ratio = stats?.usageRatio ?? 0;
  const barColor = ratio > 0.8 ? "var(--color-err)" : ratio > 0.5 ? "var(--color-warn)" : "var(--color-ok)";

  return (
    <aside className="w-72 shrink-0 border-l border-line bg-paper overflow-y-auto">
      <div className="p-4 space-y-5">
        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-ink-3 mb-2">Context</h3>
          {stats && (
            <div className="card p-3 space-y-2">
              <div className="flex justify-between text-[12px]">
                <span className="text-ink-2">~{stats.estimatedTokens.toLocaleString()} tokens</span>
                <span className="text-ink-3">/ {stats.budget.toLocaleString()}</span>
              </div>
              <div className="h-1.5 rounded-full bg-fill overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ratio * 100)}%`, background: barColor }} />
              </div>
              <div className="text-[11px] text-ink-3">
                {stats.messageCount} messages{stats.hasSummary ? ` · summary ~${stats.summaryTokens} tok` : ""}
              </div>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-ink-3 mb-2">Run tree</h3>
          {tree && (
            <div className="card p-3 space-y-1.5 text-[12px]">
              <RunRow id={tree.run.id} label={`${tree.run.agent_id}${tree.run.model ? ` · ${tree.run.model}` : ""}`} status={tree.run.status} depth={0} />
              {tree.children.map((c) => (
                <RunRow key={c.id} id={c.id} label={c.agent_id} status={c.status} depth={1} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-ink-3 mb-2">Tools</h3>
          <div className="card divide-y divide-line text-[12px]">
            {tools.map((t) => (
              <div key={t.name} className="px-3 py-2 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.danger === "safe" ? "bg-ok" : t.danger === "confirm" ? "bg-warn" : "bg-err"}`} />
                <code className="font-mono text-[11px] flex-1 truncate">{t.name}</code>
                {t.danger !== "safe" && (
                  <label className="flex items-center gap-1 text-[10px] text-ink-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[#1c1a16]"
                      checked={!!auto[t.name]}
                      onChange={(e) => toggleAuto(t.name, e.target.checked)}
                    />
                    auto
                  </label>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function RunRow({ id, label, status, depth }: { id: string; label: string; status: string; depth: number }) {
  const color =
    status === "running" ? "bg-run streaming-dot" :
    status === "completed" ? "bg-ok" :
    status === "awaiting_approval" ? "bg-warn" : "bg-err";
  return (
    <div className="flex items-center gap-2" style={{ paddingLeft: depth * 14 }}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
      <span className="truncate text-ink-2">{label}</span>
      <span className="ml-auto text-[10px] text-ink-3">{status}</span>
    </div>
  );
}
