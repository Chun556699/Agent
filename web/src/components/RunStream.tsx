import { useEffect, useReducer, useRef } from "react";
import { api, streamRun } from "../api";
import type { RunEvent } from "../types";

type Block =
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; name: string; args: unknown; ok?: boolean; result?: string; error?: string; denied?: boolean }
  | { kind: "approval"; approvalId: string; tool: string; args: unknown; danger: string; resolved?: boolean }
  | { kind: "subagent"; childRunId: string; agentName: string; task: string; status?: string }
  | { kind: "notice"; text: string };

type State = {
  blocks: Block[];
  status: string;
  usage: { inputTokens: number; outputTokens: number };
};

function reducer(state: State, ev: RunEvent): State {
  const blocks = [...state.blocks];
  const last = blocks[blocks.length - 1];

  switch (ev.type) {
    case "message_delta":
      if (last?.kind === "text") blocks[blocks.length - 1] = { ...last, text: last.text + (ev.delta ?? "") };
      else blocks.push({ kind: "text", text: ev.delta ?? "" });
      return { ...state, blocks };
    case "tool_call":
      blocks.push({ kind: "tool", id: ev.toolCallId ?? "", name: ev.name ?? "", args: ev.args });
      return { ...state, blocks };
    case "tool_result": {
      const i = blocks.findIndex((b) => b.kind === "tool" && b.id === ev.toolCallId);
      if (i >= 0) {
        const t = blocks[i] as Extract<Block, { kind: "tool" }>;
        blocks[i] = { ...t, ok: ev.ok, result: typeof ev.result === "string" ? ev.result : JSON.stringify(ev.result), error: ev.error, denied: !!ev.denied };
      }
      return { ...state, blocks };
    }
    case "approval_request":
      blocks.push({ kind: "approval", approvalId: ev.approvalId ?? "", tool: ev.tool ?? "", args: ev.args, danger: ev.danger ?? "" });
      return { ...state, status: "awaiting_approval", blocks };
    case "approval_resolved": {
      const i = blocks.findIndex((b) => b.kind === "approval" && b.approvalId === ev.approvalId);
      if (i >= 0) blocks[i] = { ...(blocks[i] as Extract<Block, { kind: "approval" }>), resolved: true };
      return { ...state, status: "running", blocks };
    }
    case "subagent_started":
      blocks.push({ kind: "subagent", childRunId: ev.childRunId ?? "", agentName: ev.agentName ?? "", task: ev.task ?? "" });
      return { ...state, blocks };
    case "subagent_finished": {
      const i = blocks.findIndex((b) => b.kind === "subagent" && b.childRunId === ev.childRunId);
      if (i >= 0) blocks[i] = { ...(blocks[i] as Extract<Block, { kind: "subagent" }>), status: ev.status };
      return { ...state, blocks };
    }
    case "context_compacted":
      blocks.push({ kind: "notice", text: `Context compacted — ${ev.droppedCount} older messages folded into the thread summary` });
      return { ...state, blocks };
    case "run_completed":
      return {
        ...state,
        status: ev.status ?? state.status,
        usage: ev.usage ?? state.usage,
      };
    case "usage":
      if (!ev.usage) return state;
      return { ...state, usage: { inputTokens: state.usage.inputTokens + ev.usage.inputTokens, outputTokens: state.usage.outputTokens + ev.usage.outputTokens } };
    default:
      return state;
  }
}

export function RunStream({ runId, compact, onStatusChange }: { runId: string; compact?: boolean; onStatusChange?: (status: string) => void }) {
  const [state, dispatch] = useReducer(reducer, { blocks: [], status: "running", usage: { inputTokens: 0, outputTokens: 0 } });
  const boxRef = useRef<HTMLDivElement>(null);
  const lastStatus = useRef("");

  useEffect(() => {
    return streamRun(runId, (ev) => dispatch(ev as RunEvent));
  }, [runId]);

  useEffect(() => {
    if (state.status !== lastStatus.current) {
      lastStatus.current = state.status;
      onStatusChange?.(state.status);
    }
  }, [state.status, onStatusChange]);

  // scrollIntoView reaches the enclosing chat scroller (this box rarely
  // overflows itself) so new blocks — e.g. an approval card — stay visible.
  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [state.blocks.length]);

  return (
    <div ref={boxRef} className={compact ? "space-y-2" : "space-y-3"}>
      {state.blocks.map((b, i) => <BlockView key={i} b={b} compact={compact} />)}
      {state.status === "running" && (
        <div className="flex items-center gap-2 text-[12px] text-ink-3">
          <span className="streaming-dot w-1.5 h-1.5 rounded-full bg-run" />
          working…
        </div>
      )}
      {state.status === "awaiting_approval" && (
        <div className="flex items-center gap-2 text-[12px] text-warn">
          <span className="streaming-dot w-1.5 h-1.5 rounded-full bg-warn" />
          waiting for approval
        </div>
      )}
      {state.status !== "running" && state.status !== "awaiting_approval" && !compact && (
        <div className="text-[11px] text-ink-3 pt-1">
          {state.status}{state.usage.inputTokens ? ` · ${state.usage.inputTokens + state.usage.outputTokens} tokens` : ""}
        </div>
      )}
    </div>
  );
}

function BlockView({ b, compact }: { b: Block; compact?: boolean }) {
  switch (b.kind) {
    case "text":
      return <p className={`whitespace-pre-wrap leading-relaxed ${compact ? "text-[13px]" : "text-[14px]"}`}>{b.text}</p>;
    case "tool":
      return <ToolCard b={b} />;
    case "approval":
      return b.resolved ? null : <ApprovalCard b={b} />;
    case "subagent":
      return <SubagentCard b={b} />;
    case "notice":
      return <div className="text-[11px] text-ink-3 italic">{b.text}</div>;
  }
}

function ToolCard({ b }: { b: Extract<Block, { kind: "tool" }> }) {
  const dot = b.ok === undefined ? "bg-run streaming-dot" : b.ok ? "bg-ok" : b.denied ? "bg-warn" : "bg-err";
  return (
    <div className="card px-3.5 py-2.5 text-[12px] rise">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <code className="font-mono text-[12px] font-medium">{b.name}</code>
        <span className="text-ink-3 truncate font-mono text-[11px]">{JSON.stringify(b.args)?.slice(0, 90)}</span>
      </div>
      {(b.result || b.error) && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-ink-3 hover:text-ink text-[11px]">
            {b.ok ? "result" : b.denied ? "denied" : "error"}
          </summary>
          <pre className="mt-1 text-[11px] text-ink-2 max-h-48 overflow-y-auto">{(b.result || b.error)?.slice(0, 4000)}</pre>
        </details>
      )}
    </div>
  );
}

export function ApprovalCard({ b, onDecided }: { b: { approvalId: string; tool: string; args: unknown; danger: string }; onDecided?: () => void }) {
  const decide = async (approved: boolean, alwaysAllow = false) => {
    await api.post(`/api/approvals/${b.approvalId}`, { approved, alwaysAllow });
    onDecided?.();
  };
  return (
    <div className="card px-4 py-3 rise border-l-2" style={{ borderLeftColor: "var(--color-warn)" }}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-warn streaming-dot" />
        <span className="text-[13px] font-medium">Approve <code className="font-mono">{b.tool}</code>?</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fill text-ink-2">{b.danger}</span>
      </div>
      <pre className="mt-1.5 text-[11px] text-ink-2 max-h-32 overflow-y-auto">{JSON.stringify(b.args, null, 2)?.slice(0, 1200)}</pre>
      <div className="flex gap-2 mt-2.5">
        <button onClick={() => decide(true)} className="btn-mini !bg-ink !text-paper !border-ink">Approve</button>
        <button onClick={() => decide(true, true)} className="btn-mini">Always allow {b.tool}</button>
        <button onClick={() => decide(false)} className="btn-mini !text-err !border-err/30">Deny</button>
      </div>
    </div>
  );
}

function SubagentCard({ b }: { b: Extract<Block, { kind: "subagent" }> }) {
  return (
    <div className="card px-4 py-3 rise">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-run">⬡</span>
        <span className="font-medium">Sub-agent · {b.agentName}</span>
        {b.status && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fill text-ink-2">{b.status}</span>}
      </div>
      <div className="text-[12px] text-ink-2 mt-0.5 line-clamp-2">{b.task}</div>
      <div className="mt-2 pl-3 border-l-2 border-line">
        <RunStream runId={b.childRunId} compact />
      </div>
    </div>
  );
}
