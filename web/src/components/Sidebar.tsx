import { useState } from "react";
import {
  Activity,
  Bot,
  BrainCircuit,
  Ellipsis,
  MessagesSquare,
  Pencil,
  Plug,
  Plus,
  Puzzle,
  Trash2,
} from "lucide-react";
import { Menu, MenuItem, Modal, Tip } from "./ui";
import type { Thread } from "../types";

type Page = "chat" | "agents" | "plugins" | "providers" | "memory" | "activity";

const NAV: { id: Page; label: string; icon: typeof MessagesSquare }[] = [
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "plugins", label: "Plugins", icon: Puzzle },
  { id: "providers", label: "Providers", icon: Plug },
  { id: "memory", label: "Memory", icon: BrainCircuit },
  { id: "activity", label: "Activity", icon: Activity },
];

export function Sidebar({
  page, setPage, threads, current, onSelect, onNew, onRename, onDelete,
}: {
  page: Page;
  setPage: (p: Page) => void;
  threads: Thread[];
  current: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Thread | null>(null);

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
            <n.icon
              size={15}
              strokeWidth={page === n.id ? 2 : 1.75}
              className={page === n.id ? "text-ink" : "text-ink-3"}
            />
            {n.label}
          </button>
        ))}
      </nav>

      <div className="mt-6 px-5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Threads</span>
        <Tip content="New thread (Ctrl+N)" side="right">
          <button
            onClick={onNew}
            className="text-ink-3 hover:text-ink transition-colors -mr-1 p-0.5 rounded"
          >
            <Plus size={15} />
          </button>
        </Tip>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-3 pb-3 space-y-px">
        {threads.map((t) => (
          <div
            key={t.id}
            className={`group flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-[13px] cursor-pointer transition-colors ${
              current === t.id ? "bg-card border border-line shadow-card text-ink" : "text-ink-2 hover:bg-fill hover:text-ink border border-transparent"
            }`}
            onClick={() => onSelect(t.id)}
          >
            {t.activeRuns > 0 && (
              <span className="streaming-dot w-1.5 h-1.5 rounded-full bg-run shrink-0" />
            )}
            <span className="truncate flex-1">{t.title || "New thread"}</span>
            <Menu
              trigger={
                <button
                  className="opacity-0 group-hover:opacity-100 text-ink-3 hover:text-ink transition-opacity p-0.5 rounded data-[state=open]:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Thread options"
                >
                  <Ellipsis size={14} />
                </button>
              }
            >
              <MenuItem onSelect={() => setRenaming({ id: t.id, title: t.title })}>
                <Pencil size={12} /> Rename
              </MenuItem>
              <MenuItem destructive onSelect={() => setConfirmDelete(t)}>
                <Trash2 size={12} /> Delete thread
              </MenuItem>
            </Menu>
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

      <Modal
        open={!!renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Rename thread"
      >
        <input
          autoFocus
          className="input w-full"
          value={renaming?.title ?? ""}
          maxLength={120}
          onChange={(e) => setRenaming((r) => r && { ...r, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && renaming) {
              onRename(renaming.id, renaming.title.trim());
              setRenaming(null);
            }
          }}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-ghost" onClick={() => setRenaming(null)}>Cancel</button>
          <button
            className="btn-ink"
            disabled={!renaming?.title.trim()}
            onClick={() => {
              if (renaming) {
                onRename(renaming.id, renaming.title.trim());
                setRenaming(null);
              }
            }}
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Delete thread?"
        description={confirmDelete ? `"${confirmDelete.title || "New thread"}" and its messages, runs and approvals are permanently removed.` : undefined}
      >
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
          <button
            className="btn-ink !bg-err"
            onClick={() => {
              if (confirmDelete) onDelete(confirmDelete.id);
              setConfirmDelete(null);
            }}
          >
            Delete
          </button>
        </div>
      </Modal>
    </aside>
  );
}
