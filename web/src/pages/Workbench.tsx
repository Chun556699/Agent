import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Circle, Loader2, Plus, Zap } from "lucide-react";
import { api } from "../api";
import { cx } from "../components/ui";
import type { Agent, Thread, ThreadStatus } from "../types";

const COLUMNS: { id: ThreadStatus; label: string; dot: string }[] = [
  { id: "inbox", label: "待处理", dot: "bg-ink-3" },
  { id: "in_progress", label: "进行中", dot: "bg-run" },
  { id: "review", label: "评审中", dot: "bg-warn" },
  { id: "done", label: "已完成", dot: "bg-ok" },
];

const NEXT: Partial<Record<ThreadStatus, ThreadStatus>> = {
  inbox: "in_progress",
  in_progress: "review",
  review: "done",
};

export function WorkbenchPage({
  threads, onOpen, onNew, onChanged,
}: {
  threads: Thread[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onChanged: () => void;
}) {
  const { data: agentsData } = useAgents();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ThreadStatus | null>(null);

  const move = async (id: string, status: ThreadStatus) => {
    await api.patch(`/api/threads/${id}`, { status });
    onChanged();
  };

  const agentName = (id: string) =>
    agentsData?.agents.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="h-13 px-5 flex items-center gap-3 border-b border-line shrink-0">
        <span className="text-[15px] font-semibold tracking-tight">工作台</span>
        <span className="text-[11px] text-ink-3">任务从发起到交付，一张板看全</span>
        <button onClick={onNew} className="btn-ink ml-auto !text-[12px] !py-1.5">
          <Plus size={13} /> 新建任务
        </button>
      </header>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 h-full px-5 py-4 min-w-max">
          {COLUMNS.map((col) => {
            const cards = threads.filter((t) => (t.status ?? "inbox") === col.id);
            return (
              <section
                key={col.id}
                onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
                onDragLeave={() => setDragOver((c) => (c === col.id ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && dragging !== col.id) move(dragging, col.id);
                  setDragging(null);
                  setDragOver(null);
                }}
                className={cx(
                  "w-72 shrink-0 flex flex-col rounded-2xl bg-fill/60 border transition-colors",
                  dragOver === col.id ? "border-ink-3 bg-fill" : "border-transparent",
                )}
              >
                <div className="px-3.5 pt-3 pb-2 flex items-center gap-2">
                  <span className={cx("w-2 h-2 rounded-full", col.dot)} />
                  <span className="text-[12.5px] font-medium">{col.label}</span>
                  <span className="ml-auto text-[10.5px] font-mono text-ink-3">{cards.length}</span>
                  {col.id === "inbox" && (
                    <button onClick={onNew} className="text-ink-3 hover:text-ink" aria-label="新建任务">
                      <Plus size={13} />
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-2">
                  {cards.map((t) => (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={() => setDragging(t.id)}
                      onDragEnd={() => { setDragging(null); setDragOver(null); }}
                      onClick={() => onOpen(t.id)}
                      className={cx(
                        "card px-3 py-2.5 cursor-pointer hover:shadow-pop transition-shadow group",
                        dragging === t.id && "opacity-40",
                      )}
                    >
                      <div className="text-[13px] font-medium leading-snug line-clamp-2">
                        {t.title || "新任务"}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-ink-3">
                        <span className="inline-flex items-center gap-1">
                          <Zap size={10} /> {agentName(t.agentId)}
                        </span>
                        {t.runCount > 0 && <span>· {t.runCount} 次运行</span>}
                        <span className="ml-auto">{shortTime(t.updatedAt)}</span>
                      </div>
                      {NEXT[t.status ?? "inbox"] && (
                        <div className="mt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              move(t.id, NEXT[t.status ?? "inbox"]!);
                            }}
                            className="btn-mini !text-[10px] !py-0.5"
                          >
                            {NEXT_LABEL[t.status ?? "inbox"]}
                            <ArrowRight size={10} />
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {cards.length === 0 && (
                    <div className="px-3 py-6 text-center text-[11px] text-ink-3">
                      {col.id === "inbox" ? "拖任务到这里，或点击 + 新建" : "暂无任务"}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const NEXT_LABEL: Record<ThreadStatus, string> = {
  inbox: "开始处理",
  in_progress: "提交评审",
  review: "标记完成",
  done: "完成",
};

export function StatusIcon({ status, className }: { status: ThreadStatus; className?: string }) {
  if (status === "done") return <CheckCircle2 size={12} className={cx("text-ok", className)} />;
  if (status === "in_progress") return <Loader2 size={12} className={cx("text-run animate-spin", className)} />;
  if (status === "review") return <Circle size={12} className={cx("text-warn", className)} />;
  return <Circle size={12} className={cx("text-ink-3", className)} />;
}

function shortTime(iso: string) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  const now = Date.now();
  const mins = Math.round((now - d.getTime()) / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return `${Math.round(hrs / 24)}天前`;
}

function useAgents() {
  const [data, setData] = useState<{ agents: Agent[] } | null>(null);
  useEffect(() => {
    api.get<{ agents: Agent[] }>("/api/agents").then(setData).catch(() => {});
  }, []);
  return { data };
}
