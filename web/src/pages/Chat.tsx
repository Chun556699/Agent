import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { api } from "../api";
import { useFetch } from "../lib/hooks";
import { RunStream, ApprovalCard } from "../components/RunStream";
import { Inspector } from "../components/Inspector";
import { Markdown } from "../components/Markdown";
import { PillSelect, Tip, cx } from "../components/ui";
import { Orb } from "../components/fx";
import type { Agent, Message, Provider } from "../types";

type ThreadDetail = {
  thread: { id: string; title: string; agent_id: string };
  messages: Message[];
  runs: { id: string; agent_id: string; status: string }[];
  pendingApprovals: { approvalId: string; tool: string; args: unknown; danger: string; runId: string }[];
};

const SUGGESTIONS = [
  "calc 21*2",
  "fetch example.com",
  "spawn a subagent team",
  "run a shell command",
];

export function ChatPage({ threadId, onThreadChanged }: { threadId: string; onThreadChanged: () => void }) {
  const { data, reload } = useFetch<ThreadDetail>(`/api/threads/${threadId}`);
  const { data: agentsData } = useFetch<{ agents: Agent[] }>("/api/agents");
  const { data: providersData } = useFetch<{ providers: Provider[] }>("/api/providers");

  const [agentId, setAgentId] = useState("orchestrator");
  const [providerId, setProviderId] = useState("mock");
  const [model, setModel] = useState("mock");
  const [input, setInput] = useState("");
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("running");
  const [inspector, setInspector] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const settled = useRef(true);

  const providers = providersData?.providers ?? [];
  const activeProvider = providers.find((p) => p.id === providerId);
  const models = activeProvider?.models ?? [];
  const lastRunId = data?.runs[data.runs.length - 1]?.id;
  const inspectRunId = liveRunId ?? lastRunId ?? null;
  const running = liveRunId && !["completed", "failed", "cancelled"].includes(liveStatus);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length, liveRunId]);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || !settled.current) return;
    setInput("");
    settled.current = false;
    const { runId } = await api.post<{ runId: string }>(`/api/threads/${threadId}/runs`, {
      message, agentId, providerId, model,
    });
    setLiveStatus("running");
    setLiveRunId(runId);
    reload();
  };

  const stop = () => { if (liveRunId) api.post(`/api/runs/${liveRunId}/cancel`); };

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-13 px-5 flex items-center gap-2.5 border-b border-line shrink-0">
          <PillSelect
            className="w-40"
            value={agentId}
            onValue={setAgentId}
            options={(agentsData?.agents ?? []).map((a) => ({ value: a.id, label: a.name }))}
            placeholder="Agent"
          />
          <PillSelect
            className="w-36"
            value={providerId}
            onValue={(v) => { setProviderId(v); setModel(""); }}
            options={providers.filter((p) => p.configured).map((p) => ({ value: p.id, label: p.label }))}
            placeholder="Provider"
          />
          <PillSelect
            className="w-44"
            value={model}
            onValue={setModel}
            options={[{ value: "", label: "default model" }, ...models.map((m) => ({ value: m, label: m }))]}
            placeholder="Model"
          />
          <div className="ml-auto flex items-center gap-2">
            {inspectRunId && (
              <button onClick={() => setInspector((v) => !v)} className={`btn-mini ${inspector ? "!bg-ink !text-paper !border-ink" : ""}`}>
                Inspector
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
            {(data?.messages ?? []).length === 0 && !liveRunId && (
              <EmptyState onSuggest={(s) => send(s)} />
            )}
            {(data?.messages ?? []).map((m) => <HistoricMessage key={m.id} m={m} />)}
            {(data?.pendingApprovals ?? []).map((a) => (
              <ApprovalCard key={a.approvalId} b={a} onDecided={() => {
                // The server-side run resumes — follow its live stream again.
                setLiveRunId(a.runId);
                setLiveStatus("running");
                settled.current = false;
                reload();
              }} />
            ))}
            {liveRunId && (
              <div className="rise">
                <RunStream runId={liveRunId} onStatusChange={(s) => {
                  setLiveStatus(s);
                  if (["completed", "failed", "cancelled"].includes(s) && !settled.current) {
                    settled.current = true;
                    setLiveRunId(null);
                    reload();
                    onThreadChanged();
                  }
                }} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="shrink-0 px-6 pb-5 pt-2">
          <div className="max-w-2xl mx-auto">
            <div
              className={cx(
                "card px-4 py-3 transition-shadow focus-within:border-ink-3",
                running && "card-live",
              )}
              style={{ boxShadow: "var(--shadow-pop)" }}
            >
              <textarea
                className="w-full bg-transparent resize-none text-[14px] leading-relaxed outline-none placeholder:text-ink-3"
                rows={Math.min(6, Math.max(1, input.split("\n").length))}
                placeholder={`Message ${agentsData?.agents.find((a) => a.id === agentId)?.name ?? "agent"}…`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
              />
              <div className="flex items-center mt-1">
                <span className="text-[11px] text-ink-3 flex items-center gap-2">
                  {running ? (
                    <>
                      <Orb small />
                      <span className="shimmer-text">agent working</span>
                    </>
                  ) : (
                    "Enter to send · Shift+Enter newline"
                  )}
                </span>
                <div className="ml-auto">
                  {running ? (
                    <Tip content="Stop this run" side="left">
                      <button
                        onClick={stop}
                        className="w-8 h-8 rounded-full bg-card border border-line flex items-center justify-center text-ink-2 hover:text-ink hover:bg-fill transition-colors"
                      >
                        <Square size={11} fill="currentColor" />
                      </button>
                    </Tip>
                  ) : (
                    <button
                      onClick={() => send()}
                      disabled={!input.trim()}
                      className="w-8 h-8 rounded-full bg-ink text-paper flex items-center justify-center transition-all hover:opacity-80 active:scale-95 disabled:opacity-25"
                    >
                      <ArrowUp size={14} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {inspector && inspectRunId && <Inspector runId={inspectRunId} />}
    </div>
  );
}

function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="py-16 text-center">
      <span className="bolt float-y text-3xl text-ink inline-block mb-5" />
      <h1 className="font-display text-[34px] leading-tight tracking-tight">Welcome to AgentDesk</h1>
      <p className="text-ink-2 mt-3 text-[14px]">Deploy agents to plan, fetch, code and build — everything stays on your machine.</p>
      <div className="flex flex-wrap justify-center gap-2 mt-7">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            className="btn-ghost !text-[12px] !py-1.5 rise"
            style={{ animationDelay: `${0.35 + i * 0.07}s` }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoricMessage({ m }: { m: Message }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end rise">
        <div className="bg-ink text-paper rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] max-w-[80%] whitespace-pre-wrap leading-relaxed">
          {m.content}
        </div>
      </div>
    );
  }
  if (m.role === "tool") {
    return (
      <div className="card px-3.5 py-2.5 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-ink-3 shrink-0" />
          <code className="font-mono text-[12px] font-medium">{m.name}</code>
        </div>
        {m.content && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-ink-3 hover:text-ink text-[11px]">result</summary>
            <pre className="mt-1 text-[11px] text-ink-2 max-h-48 overflow-y-auto">{m.content.slice(0, 4000)}</pre>
          </details>
        )}
      </div>
    );
  }
  const toolCalls = m.toolCalls ?? [];
  return (
    <div className="rise">
      {m.content && <Markdown text={m.content} />}
      {toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {toolCalls.map((tc: { id: string; name: string }) => (
            <span key={tc.id} className="text-[11px] px-2 py-0.5 rounded-full bg-fill text-ink-2 font-mono">{tc.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}
