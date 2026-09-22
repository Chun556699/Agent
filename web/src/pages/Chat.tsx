import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useFetch } from "../lib/hooks";
import { RunStream } from "../components/RunStream";
import { Inspector } from "../components/Inspector";
import type { Agent, Message, Provider } from "../types";

type ThreadDetail = {
  thread: { id: string; title: string; agent_id: string };
  messages: Message[];
  runs: { id: string; agent_id: string; status: string }[];
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
          <select className="input !py-1.5 !px-2.5 text-[12px] !rounded-full w-36" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {(agentsData?.agents ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="input !py-1.5 !px-2.5 text-[12px] !rounded-full w-32" value={providerId} onChange={(e) => { setProviderId(e.target.value); setModel(""); }}>
            {providers.filter((p) => p.configured).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select className="input !py-1.5 !px-2.5 text-[12px] !rounded-full w-44" value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">default model</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-2">
            {liveRunId && (
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
            <div className="card px-4 py-3" style={{ boxShadow: "var(--shadow-pop)" }}>
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
                <span className="text-[11px] text-ink-3">Enter to send · Shift+Enter newline</span>
                <div className="ml-auto">
                  {liveRunId && liveStatus === "running" ? (
                    <button onClick={stop} className="btn-ghost !py-1.5 !px-4 !text-[12px]">Stop</button>
                  ) : (
                    <button onClick={() => send()} disabled={!input.trim()} className="btn-ink !py-1.5 !px-4 !text-[12px]">Send ↑</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {inspector && liveRunId && <Inspector runId={liveRunId} />}
    </div>
  );
}

function EmptyState({ onSuggest }: { onSuggest: (s: string) => void }) {
  return (
    <div className="py-16 text-center">
      <span className="bolt text-3xl text-ink inline-block mb-5" />
      <h1 className="font-display text-[34px] leading-tight tracking-tight">Welcome to AgentDesk</h1>
      <p className="text-ink-2 mt-3 text-[14px]">Deploy agents to plan, fetch, code and build — everything stays on your machine.</p>
      <div className="flex flex-wrap justify-center gap-2 mt-7">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onSuggest(s)} className="btn-ghost !text-[12px] !py-1.5">{s}</button>
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
  if (m.role === "tool") return null;
  const toolCalls = m.toolCalls ?? [];
  return (
    <div className="rise">
      {m.content && <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{m.content}</p>}
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
