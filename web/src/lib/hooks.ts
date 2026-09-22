import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

export function useFetch<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true);
    api
      .get<T>(path)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  useEffect(reload, [path, ...deps]);
  return { data, error, loading, reload };
}

export function useDebounced<T>(fn: () => void, ms: number) {
  const t = useRef<number | undefined>(undefined);
  return useCallback(() => {
    window.clearTimeout(t.current);
    t.current = window.setTimeout(fn, ms);
  }, [fn, ms]);
}
