// Loads data from the server for a screen. `key` names what is being loaded (change it to load something else; null means "do not load yet"). While a new request runs, the previous data stays available so lists do not flash empty. `reload()` fetches again after a change.
import { useEffect, useEffectEvent, useState } from "react";

export type Resource<T> = {
  // The latest data received, possibly for the previous key while `loading` is true.
  data: T | undefined;
  // The error of the current request, if it failed.
  error: Error | null;
  loading: boolean;
  reload: () => void;
};

type Settled<T> = { token: string; data?: T; error?: Error };

export function useResource<T>(key: string | null, load: () => Promise<T>): Resource<T> {
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const token = key === null ? null : `${key}#${version}`;
  // Always calls the newest `load` without making the effect depend on it.
  const run = useEffectEvent(load);

  useEffect(() => {
    if (token === null) return undefined;
    let cancelled = false;
    run().then(
      (data) => {
        if (!cancelled) setSettled({ token, data });
      },
      (error: unknown) => {
        if (!cancelled) {
          setSettled((previous) => {
            const failure = error instanceof Error ? error : new Error(String(error));
            return previous?.data === undefined ? { token, error: failure } : { token, data: previous.data, error: failure };
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  return {
    data: settled?.data,
    error: settled !== null && settled.token === token ? (settled.error ?? null) : null,
    loading: token !== null && settled?.token !== token,
    reload: () => setVersion((value) => value + 1),
  };
}
