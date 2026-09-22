import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Sidebar, type NavKey } from "./components/Sidebar";
import { ActivityPage } from "./pages/Activity";
import { AgentsPage } from "./pages/Agents";
import { ChatPage } from "./pages/Chat";
import { MemoryPage } from "./pages/Memory";
import { PluginsPage } from "./pages/Plugins";
import { ProvidersPage } from "./pages/Providers";
import type { Thread } from "./types";

export default function App() {
  const [page, setPage] = useState<NavKey>("chat");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);

  const loadThreads = useCallback(() => {
    api
      .get<{ threads: Thread[] }>("/api/threads")
      .then((d) => {
        setThreads(d.threads);
        setActiveThread((cur) => cur ?? d.threads[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(loadThreads, [loadThreads]);

  const createThread = useCallback(async () => {
    const { thread } = await api.post<{ thread: { id: string } }>("/api/threads", {});
    await loadThreads();
    setActiveThread(thread.id);
    setPage("chat");
  }, [loadThreads]);

  const deleteThread = useCallback(
    async (id: string) => {
      await api.del(`/api/threads/${id}`);
      setActiveThread((cur) => (cur === id ? null : cur));
      await loadThreads();
    },
    [loadThreads]
  );

  return (
    <div className="flex h-full bg-surface-0 text-neutral-200">
      <Sidebar
        page={page}
        onNavigate={setPage}
        threads={threads}
        activeThread={activeThread}
        onSelectThread={(id) => {
          setActiveThread(id);
          setPage("chat");
        }}
        onNewThread={createThread}
        onDeleteThread={deleteThread}
      />
      <main className="flex-1 min-w-0 flex">
        {page === "chat" && (
          <ChatPage threadId={activeThread} onThreadChanged={loadThreads} />
        )}
        {page === "agents" && <AgentsPage />}
        {page === "plugins" && <PluginsPage />}
        {page === "providers" && <ProvidersPage />}
        {page === "memory" && <MemoryPage />}
        {page === "activity" && <ActivityPage />}
      </main>
    </div>
  );
}
