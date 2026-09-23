import { useCallback, useEffect, useState } from "react";
import { Tooltip as RTooltip } from "radix-ui";
import { api } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Titlebar } from "./components/Titlebar";
import { ChatPage } from "./pages/Chat";
import { AgentsPage } from "./pages/Agents";
import { PluginsPage } from "./pages/Plugins";
import { ProvidersPage } from "./pages/Providers";
import { MemoryPage } from "./pages/Memory";
import { ActivityPage } from "./pages/Activity";
import type { Thread } from "./types";

type Page = "chat" | "agents" | "plugins" | "providers" | "memory" | "activity";

export default function App() {
  const [page, setPage] = useState<Page>("chat");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await api.get<{ threads: Thread[] }>("/api/threads");
      setThreads(d.threads);
      setCurrent((c) => (c && d.threads.some((t) => t.id === c) ? c : d.threads[0]?.id ?? null));
    } catch {
      /* server down — keep UI alive */
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createThread = useCallback(async () => {
    const { thread } = await api.post<{ thread: Thread }>("/api/threads");
    await reload();
    setCurrent(thread.id);
    setPage("chat");
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        createThread();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createThread]);

  const deleteThread = async (id: string) => {
    await api.del(`/api/threads/${id}`);
    if (current === id) setCurrent(null);
    reload();
  };

  return (
    <RTooltip.Provider>
    <div className="h-full flex flex-col bg-paper text-ink">
      <Titlebar />
      <div className="flex-1 flex min-h-0">
      <Sidebar
        page={page}
        setPage={setPage}
        threads={threads}
        current={current}
        onSelect={(id) => { setCurrent(id); setPage("chat"); }}
        onNew={createThread}
        onDelete={deleteThread}
      />
      <main className="flex-1 flex min-w-0">
        {page === "chat" && (
          current
            ? <ChatPage key={current} threadId={current} onThreadChanged={reload} />
            : <NoThread onNew={createThread} />
        )}
        {page === "agents" && <AgentsPage />}
        {page === "plugins" && <PluginsPage />}
        {page === "providers" && <ProvidersPage />}
        {page === "memory" && <MemoryPage />}
        {page === "activity" && <ActivityPage />}
      </main>
      </div>
    </div>
    </RTooltip.Provider>
  );
}

function NoThread({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <span className="bolt text-4xl text-ink mb-6" />
      <h1 className="font-display text-4xl tracking-tight">Your workspace, agents and humans together.</h1>
      <p className="text-ink-2 mt-3 max-w-md text-sm">
        Start a thread and deploy agents to plan, code, fetch and build — everything stays on your machine.
      </p>
      <button onClick={onNew} className="btn-ink mt-6">New thread</button>
    </div>
  );
}
