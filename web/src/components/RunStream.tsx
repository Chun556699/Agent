import { useEffect, useReducer, useRef } from "react";
import { api, streamRun } from "../api";
import type { RunEvent } from "../types";

export type Block =
  | { kind: "text"; key: string; text: string; complete: boolean }
  | { kind: "tool"; key: string; toolCallId: string; name: string; args: unknown; result?: string; ok?: boolean; waitingApproval?: boolean }
  | { kind: "approval"; key: string; approvalId: string; tool: string; args: unknown; danger: string; resolved?: boolean }
  | { kind: "subagent"; key: string; childRunId: string; agentName: string; task: string; status?: string }
  | { kind: "notice"; key: string; text: string };

type State = {
  blocks: Block[];
  status: "connecting" | "running" | "completed" | "failed" | "cancelled" | "done";
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
};

type Action = { type: "event"; ev: RunEvent };

let seq = 0;
const k = () => `b${seq++}`;

function reduce(state: State, action: Action): State {
  const ev = action.ev;
  const blocks = [...state.blocks];
  const lastText = () => {
    const last = blocks[blocks.length - 1];
    if (last?.kind === "text" && !last.complete) return last;
    const b: Block = { kind: "text", key: k(), text: "", complete: false };
    blocks.push(b);
    return b;
  };

  switch (ev.type) {
    case "run_started":
      return state;
    case "message_delta": {
      lastText().text += ev.delta ?? "";
      return { ...state, blocks };
    }
    case "message_complete": {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "text") {
        last.complete = true;
        last.text = ev.content || last.text;
      } else if (ev.content) {
        blocks.push({ kind: "text", key: k(), text: ev.content, complete: true });
      }
      return { ...state, blocks };
    }
    case "tool_call": {
      const tb = blocks.find(
        (b) => b.kind === "tool" && b.toolCallId === ev.toolCallId
      );
      if (!tb) {
        blocks.push({
          kind: "tool", key: k(), toolCallId: String(ev.toolCallId),
          name: String(ev.name), args: ev.args,
        });
      }
      return { ...state, blocks };
    }
    case "tool_result": {
      const tb = blocks.find(
        (b) => b.kind === "tool" && b.toolCallId === ev.toolCallId
      );
      if (tb && tb.kind === "tool") {
        tb.ok = ev.ok as boolean;
        tb.waitingApproval = false;
        tb.result =
          typeof ev.result === "string"
            ? ev.result
            : ev.result != null
              ? JSON.stringify(ev.result, null, 2)
              : ev.error;
        if (!ev.ok && ev.error) tb.result = `Error: ${ev.error}`;
      }
      return { ...state, blocks };
    }
    case "approval_request": {
      const tb = blocks.find(
        (b) => b.kind === "tool" && b.toolCallId === ev.toolCallId
      );
      if (tb && tb.kind === "tool") tb.waitingApproval = true;
      blocks.push({
        kind: "approval", key: k(), approvalId: String(ev.approvalId),
        tool: String(ev.tool), args: ev.args, danger: String(ev.danger ?? "confirm"),
      });
      return { ...state, blocks };
    }
    case "approval_resolved": {
      for (const b of blocks) {
        if (b.kind === "approval" && b.resolved == null && b.tool === ev.tool) b.resolved = true;
        if (b.kind === "tool" && b.toolCallId === ev.toolCallId) b.waitingApproval = false;
      }
      return { ...state, blocks };
    }
    case "subagent_started": {
      blocks.push({
        kind: "subagent", key: k(), childRunId: String(ev.childRunId),
        agentName: String(ev.agentName ?? ev.agentId), task: String(ev.task ?? ""),
        status: "running",
      });
      return { ...state, blocks };
    }
    case "subagent_finished": {
      const sb = blocks.find((b) => b.kind === "subagent" && b.childRunId === ev.childRunId);
      if (sb && sb.kind === "subagent") sb.status = String(ev.status);
      return { ...state, blocks };
    }
    case "context_compacted": {
      blocks.push({ kind: "notice", key: k(), text: `Context compacted (${ev.droppedCount} older messages summarized)` });
      return { ...state, blocks };
    }
    case "run_completed": {
      return {
        ...state,
        status: (ev.status as State["status"]) ?? "completed",
        usage: ev.usage as State["usage"],
        error: ev.error as string | undefined,
      };
    }
    default:
      return state;
  }
}

export function useRunEvents(runId: string | null) {
  const [state, dispatch] = useReducer(reduce, { blocks: [], status: "connecting" });
  useEffect(() => {
    if (!runId) return;
    const close = streamRun(runId, (ev) => dispatch({ type: "event", ev }));
    return close;
  }, [runId]);
  return state;
}

function ToolCard({ block }: { block: Extract<Block, { kind: "tool" }> }) {
  return (
    <details className="rounded-md border border-line bg-surface-2 text-xs open:bg-surface-2/80">
      <summary className="px-3 py-1.5 cursor-pointer flex items-center gap-2 select-none list-none">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          block.waitingApproval ? "bg-amber-400 streaming-dot"
          : block.ok == null ? "bg-sky-400 streaming-dot"
          : block.ok ? "bg-emerald-400" : "bg-red-400"
        }`} />
        <span className="font-mono text-neutral-300">{block.name}</span>
        <span className="text-neutral-500">
          {block.waitingApproval ? "awaiting approval" : block.ok == null ? "running…" : block.ok ? "done" : "failed"}
        </span>
      </summary>
      <div className="px-3 pb-2 pt-1 space-y-1 border-t border-line/60">
        <pre className="text-neutral-400">args: {JSON.stringify(block.args, null, 2)}</pre>
        {block.result != null && (
          <pre className="text-neutral-300 max-h-64 overflow-y-auto">{block.result}</pre>
        )}
      </div>
    </details>
  );
}

function ApprovalCard({ block }: { block: Extract<Block, { kind: "approval" }> }) {
  const decide = async (approved: boolean, alwaysAllow = false) => {
    await api.post(`/api/approvals/${block.approvalId}`, { approved, alwaysAllow });
  };
  if (block.resolved) {
    return (
      <div className="rounded-md border border-line bg-surface-1 px-3 py-1.5 text-xs text-neutral-500">
        {block.tool} — decided
      </div>
    );
  }
  const dangerous = block.danger === "dangerous";
  return (
    <div className={`rounded-md border px-3 py-2 text-xs space-y-2 ${
      dangerous ? "border-red-500/50 bg-red-500/5" : "border-amber-500/50 bg-amber-500/5"
    }`}>
      <div className="flex items-center gap-2">
        <span className={dangerous ? "text-red-400" : "text-amber-400"}>Approval required</span>
        <span className="font-mono text-neutral-300">{block.tool}</span>
        <span className="text-neutral-500">({block.danger})</span>
      </div>
      <pre className="text-neutral-400 max-h-40 overflow-y-auto">{JSON.stringify(block.args, null, 2)}</pre>
      <div className="flex gap-2">
        <button onClick={() => decide(true)}
          className="px-2.5 py-1 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white">
          Approve
        </button>
        <button onClick={() => decide(true, true)}
          className="px-2.5 py-1 rounded bg-surface-3 hover:bg-surface-3/70 text-neutral-200">
          Always allow
        </button>
        <button onClick={() => decide(false)}
          className="px-2.5 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white">
          Deny
        </button>
      </div>
    </div>
  );
}

function SubagentCard({ block }: { block: Extract<Block, { kind: "subagent" }> }) {
  return (
    <div className="rounded-md border border-indigo-500/30 bg-indigo-500/5">
      <div className="px-3 py-1.5 flex items-center gap-2 text-xs border-b border-indigo-500/20">
        <span className="text-indigo-400">⬡</span>
        <span className="text-indigo-300 font-medium">{block.agentName}</span>
        <span className="text-neutral-500 truncate flex-1">{block.task}</span>
        <span className={`shrink-0 ${block.status === "completed" ? "text-emerald-400" : block.status === "running" ? "text-sky-400 streaming-dot" : "text-neutral-500"}`}>
          {block.status ?? "running"}
        </span>
      </div>
      <div className="px-3 py-2">
        <RunStream runId={block.childRunId} compact />
      </div>
    </div>
  );
}

/** Renders a run's live event stream. Recurses into sub-agent runs. */
export function RunStream({
  runId, compact, onStatusChange,
}: {
  runId: string;
  compact?: boolean;
  onStatusChange?: (status: State["status"]) => void;
}) {
  const state = useRunEvents(runId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onStatusChange?.(state.status);
  }, [state.status, onStatusChange]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.blocks.length, state.status]);

  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      {state.blocks.map((b) => {
        if (b.kind === "text") {
          return (
            <div key={b.key} className={`text-sm leading-relaxed whitespace-pre-wrap ${b.complete ? "" : "after:content-['▍'] after:text-accent-soft after:animate-pulse"}`}>
              {b.text || <span className="text-neutral-500">…</span>}
            </div>
          );
        }
        if (b.kind === "tool") return <ToolCard key={b.key} block={b} />;
        if (b.kind === "approval") return <ApprovalCard key={b.key} block={b} />;
        if (b.kind === "subagent") return <SubagentCard key={b.key} block={b} />;
        return (
          <div key={b.key} className="text-[11px] text-neutral-500 italic">{b.text}</div>
        );
      })}
      {state.status === "connecting" && (
        <div className="text-xs text-neutral-500">Connecting…</div>
      )}
      {(state.status === "failed" || state.status === "cancelled") && (
        <div className="text-xs text-red-400">
          Run {state.status}{state.error ? `: ${state.error}` : ""}
        </div>
      )}
      {state.status === "completed" && state.usage && (
        <div className="text-[11px] text-neutral-600">
          tokens: {state.usage.inputTokens} in / {state.usage.outputTokens} out
        </div>
      )}
      <div ref={scrollRef} />
    </div>
  );
}
