import type { Thread } from "../types";

export type NavKey = "chat" | "agents" | "plugins" | "providers" | "memory" | "activity";

const NAV: { key: NavKey; label: string; icon: string }[] = [
  { key: "chat", label: "Threads", icon: "◈" },
  { key: "agents", label: "Agents", icon: "⬡" },
  { key: "plugins", label: "Plugins", icon: "▦" },
  { key: "providers", label: "Providers", icon: "⌁" },
  { key: "memory", label: "Memory", icon: "◔" },
  { key: "activity", label: "Activity", icon: "≣" },
];

export function Sidebar({
  page, onNavigate, threads, activeThread, onSelectThread, onNewThread, onDeleteThread,
}: {
  page: NavKey;
  onNavigate: (k: NavKey) => void;
  threads: Thread[];
  activeThread: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
}) {
  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-line bg-surface-1">
      <div className="px-4 py-4 border-b border-line flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
          A
        </div>
        <div>
          <div className="font-semibold text-sm tracking-tight">AgentDesk</div>
          <div className="text-[11px] text-neutral-500">local agent workspace</div>
        </div>
      </div>

      <nav className="p-2 space-y-0.5">
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => onNavigate(n.key)}
            className={`w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center gap-2.5 transition-colors ${
              page === n.key
                ? "bg-surface-3 text-white"
                : "text-neutral-400 hover:bg-surface-2 hover:text-neutral-200"
            }`}
          >
            <span className="text-neutral-500 w-4 text-center">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      {page === "chat" && (
        <div className="flex-1 min-h-0 flex flex-col border-t border-line">
          <div className="p-2">
            <button
              onClick={onNewThread}
              className="w-full px-3 py-1.5 rounded-md text-sm bg-accent/15 text-accent-soft hover:bg-accent/25 transition-colors"
            >
              + New thread
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {threads.map((t) => (
              <div
                key={t.id}
                className={`group flex items-center rounded-md text-sm cursor-pointer ${
                  activeThread === t.id
                    ? "bg-surface-3 text-white"
                    : "text-neutral-400 hover:bg-surface-2 hover:text-neutral-200"
                }`}
                onClick={() => onSelectThread(t.id)}
              >
                <span className="flex-1 truncate px-3 py-1.5">{t.title}</span>
                <button
                  title="Delete thread"
                  className="opacity-0 group-hover:opacity-100 px-2 text-neutral-500 hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(t.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {threads.length === 0 && (
              <div className="px-3 py-4 text-xs text-neutral-500">
                No threads yet. Start one — the built-in offline model works without an API key.
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
