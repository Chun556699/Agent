import type { Thread } from "../types";

type Page = "chat" | "agents" | "plugins" | "providers" | "memory" | "activity";

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "chat", label: "Chat", icon: "◈" },
  { id: "agents", label: "Agents", icon: "⬡" },
  { id: "plugins", label: "Plugins", icon: "▦" },
  { id: "providers", label: "Providers", icon: "⌁" },
  { id: "memory", label: "Memory", icon: "◔" },
  { id: "activity", label: "Activity", icon: "≣" },
];

export function Sidebar({
  page, setPage, threads, current, onSelect, onNew, onDelete,
}: {
  page: Page;
  setPage: (p: Page) => void;
  threads: Thread[];
  current: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="w-64 shrink-0 flex flex-col border-r border-line bg-paper">
      <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
        <span className="bolt text-[17px] text-ink" />
        <span className="font-semibold tracking-tight text-[15px]">AgentDesk</span>
        <span className="ml-auto text-[10px] text-ink-3 font-mono">v0.1</span>
      </div>

      <nav className="px-3 space-y-0.5">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setPage(n.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-colors ${
              page === n.id
                ? "bg-card border border-line shadow-card font-medium text-ink"
                : "text-ink-2 hover:bg-fill hover:text-ink border border-transparent"
            }`}
          >
            <span className={`w-4 text-center ${page === n.id ? "text-ink" : "text-ink-3"}`}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      <div className="mt-6 px-5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Threads</span>
        <button
          onClick={onNew}
          className="text-ink-3 hover:text-ink text-sm leading-none transition-colors"
          title="New thread (Ctrl+N)"
        >
          +
        </button>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-3 pb-3 space-y-px">
        {threads.map((t) => (
          <div
            key={t.id}
            className={`group flex items-center gap-2 px-3 py-[7px] rounded-lg text-[13px] cursor-pointer transition-colors ${
              current === t.id ? "bg-card border border-line shadow-card text-ink" : "text-ink-2 hover:bg-fill hover:text-ink border border-transparent"
            }`}
            onClick={() => onSelect(t.id)}
          >
            <span className="truncate flex-1">{t.title || "New thread"}</span>
            <button
              className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-err transition-opacity text-sm leading-none"
              onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
              title="Delete thread"
            >
              ×
            </button>
          </div>
        ))}
        {threads.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-ink-3">No threads yet.</div>
        )}
      </div>

      {/* Ctrl+N only fires inside the Electron shell — browsers hijack it. */}
      {window.agentdeskDesktop && (
        <div className="px-5 py-3 border-t border-line flex items-center gap-2 text-[11px] text-ink-3">
          <span className="kbd">Ctrl N</span> new thread
        </div>
      )}
    </aside>
  );
}
