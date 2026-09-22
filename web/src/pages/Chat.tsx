import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Inspector } from "../components/Inspector";
import { RunStream } from "../components/RunStream";
import { useFetch } from "../lib/hooks";
import type { Agent, Message, Provider, Run, Thread } from "../types";

type ThreadData = { thread: Thread; messages: Message[]; runs: Run[] };

export function ChatPage({ threadId, onThreadChanged }: { threadId: string | null; onThreadChanged: () => void }) {
  const { data, reload } = useFetch<ThreadData>(threadId ? `/api/threads/${threadId}` : null, [threadId]);
  const { data: providersData } = useFetch<{ providers: Provider[] }>("/api/providers");
  const { data: agentsData } = useFetch<{ agents: Agent[] }>("/api/agents");

  const [input, setInput] = useState("");
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("orchestrator");
  const [providerId, setProviderId] = useState("mock");
  const [model, setModel] = useState<string>("");
  const [showInspector, setShowInspector] = useState(true);
  const [sending, setSending] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [contextKey, setContextKey] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const provider = providersData?.providers.find((p) => p.id === providerId);
  const models = provider?.models ?? [];

  useEffect(() => {
    setLiveRunId(null);
    setLiveStatus(null);
    settled.current = false;
    setContextKey((c) => c + 1);
  }, [threadId]);

  const send = async () => {
    if (!threadId || !input.trim() || sending) return;
    setSending(true);
    const message = input;
    setInput("");
    try {
      const { runId } = await api.post<{ runId: string }>(`/api/threads/${threadId}/runs`, {
        message,
        agentId,
        providerId,
        model: model || undefined,
      });
      settled.current = false;
      setLiveRunId(runId);
      setLiveStatus("running");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const cancel = async () => {
    if (liveRunId) await api.post(`/api/runs/${liveRunId}/cancel`);
  };

  // Track live status; refresh history once when the run settles.
  const settled = useRef(false);
  const onStatusChange = useCallback((status: string) => {
    setLiveStatus(status);
    if (!settled.current && ["completed", "failed", "cancelled"].includes(status)) {
      settled.current = true;
      setTimeout(() => {
        reload();
        onThreadChanged();
        setContextKey((c) => c + 1);
      }, 400);
    }
  }, [reload, onThreadChanged]);

  const messages = data?.messages ?? [];
  const runs = data?.runs ?? [];

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 border-b border-line flex items-center px-4 gap-3">
          <div className="font-medium text-sm truncate flex-1">
            {data?.thread?.title ?? "New thread"}
          </div>
          <select
            className="bg-surface-2 border border-line rounded text-xs px-2 py-1"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            title="Agent"
          >
            {(agentsData?.agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select
            className="bg-surface-2 border border-line rounded text-xs px-2 py-1"
            value={providerId}
            onChange={(e) => { setProviderId(e.target.value); setModel(""); }}
            title="Provider"
          >
            {(providersData?.providers ?? []).filter((p) => p.configured).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          <select
            className="bg-surface-2 border border-line rounded text-xs px-2 py-1 max-w-40"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            title="Model"
          >
            <option value="">default model</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button
            onClick={() => setShowInspector((s) => !s)}
            className={`text-xs px-2 py-1 rounded border ${showInspector ? "border-accent/50 text-accent-soft" : "border-line text-neutral-400"}`}
          >
            Inspector
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!threadId && (
            <EmptyState onSend={(m) => {
              // create thread then send is handled by parent flow — just prompt to create
              setInput(m);
            }} />
          )}
          {threadId && messages.length === 0 && !liveRunId && (
            <div className="text-neutral-500 text-sm py-10 text-center">
              Send a message to start. Try <code className="text-neutral-300">help</code> with the mock model —
              no API key needed.
            </div>
          )}

          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((m) => <HistoricMessage key={m.id} m={m} />)}
            {liveRunId && (
              <LiveRun
                key={liveRunId}
                runId={liveRunId}
                onStatusChange={onStatusChange}
              />
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {threadId && (
          <div className="shrink-0 border-t border-line p-4">
            <div className="max-w-3xl mx-auto flex gap-2">
              <textarea
                className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent/60"
                rows={input.split("\n").length > 3 ? 4 : 2}
                placeholder="Message the agent… (Enter to send, Shift+Enter for newline)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {liveStatus === "running" || liveStatus === "awaiting_approval" ? (
                <button onClick={cancel} className="px-4 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm self-end">
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={sending || !input.trim()}
                  className="px-4 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm self-end"
                >
                  Send
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showInspector && threadId && (
        <Inspector runId={liveRunId ?? runs[runs.length - 1]?.id ?? null} runs={runs} contextKey={contextKey} />
      )}
    </div>
  );
}

/** Live run wrapper: reports every status change to the parent. */
function LiveRun({ runId, onStatusChange }: { runId: string; onStatusChange: (status: string) => void }) {
  return (
    <div className="space-y-4">
      <RunStream runId={runId} onStatusChange={onStatusChange} />
    </div>
  );
}

function HistoricMessage({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/20 border border-accent/30 px-4 py-2 text-sm whitespace-pre-wrap">
          {m.content}
        </div>
      </div>
    );
  }
  if (m.role === "tool") return null; // results live inside their call cards via run view

  const calls = m.toolCalls ?? [];
  return (
    <div className="space-y-1.5">
      {m.content && (
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-neutral-200">{m.content}</div>
      )}
      {calls.length > 0 && (
        <div>
          <button onClick={() => setOpen((o) => !o)} className="text-[11px] text-neutral-500 hover:text-neutral-300">
            {open ? "▾" : "▸"} {calls.length} tool call{calls.length > 1 ? "s" : ""}
          </button>
          {open && (
            <div className="mt-1 space-y-1">
              {calls.map((tc) => (
                <div key={tc.id} className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-xs">
                  <span className="font-mono text-neutral-300">{tc.name}</span>
                  <pre className="text-neutral-500">{JSON.stringify(tc.arguments, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onSend }: { onSend: (m: string) => void }) {
  const suggestions = [
    "help",
    "calc 21 * 2",
    "remember my favorite editor is vim",
    "spawn a subagent team to research agent desktops",
  ];
  return (
    <div className="max-w-xl mx-auto pt-16 text-center space-y-6">
      <div>
        <div className="text-2xl font-semibold tracking-tight">AgentDesk</div>
        <p className="text-neutral-500 text-sm mt-2">
          A local agent work platform — durable threads, multi-provider models,
          tool calls with approvals, plugin marketplace, and specialist sub-agents.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-left">
        {suggestions.map((s) => (
          <div key={s} className="rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-xs text-neutral-400">
            {s}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-neutral-600">
        Create a thread from the sidebar to begin. The offline mock model needs no API key.
      </p>
    </div>
  );
}
