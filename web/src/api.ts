import type { RunEvent } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    req<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
};

/** Subscribe to a run's SSE stream (with replay). Returns a closer. */
export function streamRun(
  runId: string,
  onEvent: (ev: RunEvent) => void,
  onError?: (e: Event) => void
): () => void {
  const es = new EventSource(`/api/runs/${runId}/events`);
  const handler = (e: MessageEvent) => {
    try {
      onEvent({ type: e.type, ...JSON.parse(e.data) });
    } catch { /* ignore malformed */ }
  };
  const EVENTS = [
    "run_started", "message_delta", "message_complete", "tool_call", "tool_result",
    "approval_request", "approval_resolved", "subagent_started", "subagent_finished",
    "context", "context_compacted", "usage", "run_completed", "ping",
  ];
  for (const t of EVENTS) es.addEventListener(t, handler);
  es.onerror = (e) => onError?.(e);
  return () => es.close();
}
