import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog as RDialog } from "radix-ui";
import {
  Activity,
  Bot,
  BrainCircuit,
  KanbanSquare,
  MessagesSquare,
  Plug,
  Plus,
  Puzzle,
  Search,
} from "lucide-react";
import { cx } from "./ui";
import type { Thread } from "../types";

type Page = "workbench" | "chat" | "agents" | "plugins" | "providers" | "memory" | "activity";

const PAGES: { id: Page; label: string; icon: typeof MessagesSquare }[] = [
  { id: "workbench", label: "工作台", icon: KanbanSquare },
  { id: "chat", label: "对话", icon: MessagesSquare },
  { id: "agents", label: "智能体", icon: Bot },
  { id: "plugins", label: "插件", icon: Puzzle },
  { id: "providers", label: "模型供应商", icon: Plug },
  { id: "memory", label: "记忆", icon: BrainCircuit },
  { id: "activity", label: "活动", icon: Activity },
];

export function SearchPalette({
  open,
  onOpenChange,
  threads,
  onSelectThread,
  onNewThread,
  onGoPage,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  threads: Thread[];
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onGoPage: (p: Page) => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      // Dialog mounts async — focus on next frame.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  type Row = { key: string; icon: typeof Search; label: string; sub?: string; action: () => void };
  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const list: Row[] = [
      {
        key: "new",
        icon: Plus,
        label: "新建任务",
        sub: "Ctrl N",
        action: () => { onNewThread(); onOpenChange(false); },
      },
    ];
    for (const p of PAGES) {
      if (!needle || p.label.toLowerCase().includes(needle)) {
        list.push({
          key: `page-${p.id}`,
          icon: p.icon,
          label: `前往${p.label}`,
          action: () => { onGoPage(p.id); onOpenChange(false); },
        });
      }
    }
    for (const t of threads) {
      const title = t.title || "新任务";
      if (!needle || title.toLowerCase().includes(needle)) {
        list.push({
          key: `t-${t.id}`,
          icon: MessagesSquare,
          label: title,
          sub: "任务",
          action: () => { onSelectThread(t.id); onOpenChange(false); },
        });
      }
    }
    return list.slice(0, 9);
  }, [q, threads, onNewThread, onGoPage, onSelectThread, onOpenChange]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); rows[cursor]?.action(); }
  };

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="anim-fade fixed inset-0 z-50 bg-ink/20" />
        <RDialog.Content
          className="anim-pop fixed left-1/2 top-[18%] z-50 w-[520px] max-w-[92vw] -translate-x-1/2 rounded-2xl border border-line bg-card shadow-pop overflow-hidden"
          aria-describedby={undefined}
        >
          <RDialog.Title className="sr-only">搜索</RDialog.Title>
          <div className="flex items-center gap-2.5 px-4 border-b border-line" onKeyDown={onKey}>
            <Search size={15} className="text-ink-3 shrink-0" />
            <input
              ref={inputRef}
              className="palette-input"
              placeholder="搜索任务、页面、操作…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            />
            <span className="kbd shrink-0">esc</span>
          </div>
          <div className="p-2 max-h-[340px] overflow-y-auto">
            {rows.map((r, i) => (
              <button
                key={r.key}
                className={cx("palette-row", i === cursor && "active")}
                onMouseEnter={() => setCursor(i)}
                onClick={r.action}
              >
                <r.icon size={14} className="text-ink-3 shrink-0" />
                <span className="truncate">{r.label}</span>
                {r.sub && <span className="palette-kbd-hint">{r.sub}</span>}
              </button>
            ))}
            {rows.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-ink-3">没有匹配结果。</div>
            )}
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
