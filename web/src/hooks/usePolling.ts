import { useCallback, useEffect, useRef, useState } from "react";

interface PollingState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/** Polls `fetcher` immediately and every `intervalMs`, exposing the latest
 * result plus a manual `refresh`. Stale responses from an overlapping
 * request are dropped via a request-id guard.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = []): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const run = useCallback(() => {
    const id = ++requestId.current;
    fetcher()
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: Error) => {
        if (id !== requestId.current) return;
        setError(err.message);
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
    const timer = setInterval(run, intervalMs);
    return () => clearInterval(timer);
  }, [run, intervalMs]);

  return { data, error, loading, refresh: run };
}
