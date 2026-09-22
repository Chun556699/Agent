import { q } from "./db.js";

const subscribers = new Map(); // runId -> Set<fn(event)>

/** Persist an event and fan it out to SSE subscribers. */
export function emit(runId, type, data = {}) {
  q.run(
    "INSERT INTO events (run_id, type, data_json) VALUES (?, ?, ?)",
    runId, type, JSON.stringify(data)
  );
  const subs = subscribers.get(runId);
  if (subs) for (const fn of subs) {
    try { fn({ type, ...data }); } catch { /* subscriber gone */ }
  }
}

export function subscribe(runId, fn) {
  let subs = subscribers.get(runId);
  if (!subs) subscribers.set(runId, (subs = new Set()));
  subs.add(fn);
  return () => subs.delete(fn);
}

export function replayEvents(runId) {
  return q
    .all("SELECT seq, type, data_json FROM events WHERE run_id = ? ORDER BY seq", runId)
    .map((r) => ({ seq: r.seq, type: r.type, ...JSON.parse(r.data_json) }));
}

/** Recent events across all runs (activity feed / debugging). */
export function recentEvents(limit = 200) {
  return q
    .all("SELECT seq, run_id, type, data_json FROM events ORDER BY seq DESC LIMIT ?", limit)
    .map((r) => ({ seq: r.seq, runId: r.run_id, type: r.type, ...JSON.parse(r.data_json) }));
}
