import { useEffect, useState } from "react";
import { api } from "../api";
import { useFetch } from "../lib/hooks";
import type { Run, ToolSpec } from "../types";

type ContextStats = {
  messageCount: number;
  estimatedTokens: number;
  budget: number;
  usageRatio: number;
  hasSummary: boolean;
  summaryTokens: number;
};

export function Inspector({
  runId, runs, contextKey,
}: {
  runId: string | null;
  runs: Run[];
  contextKey: number;
}) {
  const [ctx, setCtx] = useState<ContextStats | null>(null);
  const { data: toolsData, reload: reloadTools } = useFetch<{ tools: ToolSpec[]; autoApprove: Record<string, boolean> }>("/api/tools");

  useEffect(() => {
    if (!runId) { setCtx(null); return; }
    api.get<ContextStats>(`/api/runs/${runId}/context`).then(setCtx).catch(() => setCtx(null));
    const t = setInterval(() => {
      api.get<ContextStats>(`/api/runs/${runId}/context`).then(setCtx).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [runId, contextKey]);

  const tree = buildTree(runs);

  return (
    <div className="w-72 shrink-0 border-l border-line bg-surface-1 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-line">
        <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Inspector</div>
      </div>

      <section className="px-4 py-3 border-b border-line space-y-2">
        <div className="text-xs font-medium text-neutral-300">Context</div>
        {ctx ? (
          <>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${ctx.usageRatio > 0.8 ? "bg-red-500" : ctx.usageRatio > 0.5 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.round(ctx.usageRatio * 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-neutral-500 space-y-0.5">
              <div>{ctx.estimatedTokens.toLocaleString()} / {ctx.budget.toLocaleString()} tokens (est)</div>
              <div>{ctx.messageCount} messages in view</div>
              {ctx.hasSummary && <div className="text-indigo-400">+ compacted summary ({ctx.summaryTokens} tok)</div>}
            </div>
          </>
        ) : (
          <div className="text-[11px] text-neutral-600">Run a message to see context usage.</div>
        )}
      </section>

      <section className="px-4 py-3 border-b border-line space-y-1.5">
        <div className="text-xs font-medium text-neutral-300">Run tree</div>
        {tree.length === 0 && <div className="text-[11px] text-neutral-600">No runs yet.</div>}
        {tree.map((n) => (
          <RunNode key={n.run.id} node={n} active={runId} depth={0} />
        ))}
      </section>

      <section className="px-4 py-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-neutral-300">Tools</div>
        </div>
        <div className="text-[10px] text-neutral-600">Auto-approve skips the permission prompt.</div>
        {(toolsData?.tools ?? []).map((t) => (
          <div key={t.name} className="flex items-center gap-2 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              t.danger === "safe" ? "bg-emerald-500" : t.danger === "dangerous" ? "bg-red-500" : "bg-amber-500"
            }`} />
            <span className="font-mono text-neutral-400 flex-1 truncate" title={t.description}>{t.name}</span>
            {t.danger !== "safe" && (
              <input
                type="checkbox"
                className="accent-indigo-500"
                checked={!!toolsData?.autoApprove?.[t.name]}
                onChange={async (e) => {
                  await api.put("/api/settings/auto-approve", { tool: t.name, enabled: e.target.checked });
                  reloadTools();
                }}
              />
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

type Node = { run: Run; children: Node[] };

function buildTree(runs: Run[]): Node[] {
  const map = new Map<string, Node>();
  const roots: Node[] = [];
  for (const r of runs) map.set(r.id, { run: r, children: [] });
  for (const r of runs) {
    const n = map.get(r.id)!;
    if (r.parent_run_id && map.has(r.parent_run_id)) map.get(r.parent_run_id)!.children.push(n);
    else roots.push(n);
  }
  return roots;
}

function RunNode({ node, active, depth }: { node: Node; active: string | null; depth: number }) {
  const r = node.run;
  const statusColor =
    r.status === "completed" ? "text-emerald-400"
    : r.status === "failed" ? "text-red-400"
    : r.status === "cancelled" ? "text-neutral-500"
    : "text-sky-400";
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-[11px] py-0.5 ${active === r.id ? "text-white" : "text-neutral-400"}`} style={{ paddingLeft: depth * 12 }}>
        <span className={statusColor}>{r.status === "running" || r.status === "awaiting_approval" ? "●" : "○"}</span>
        <span className="truncate">{r.agent_id}</span>
        <span className="text-neutral-600 font-mono">{r.model}</span>
      </div>
      {node.children.map((c) => (
        <RunNode key={c.run.id} node={c} active={active} depth={depth + 1} />
      ))}
    </div>
  );
}
