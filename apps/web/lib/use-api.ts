"use client";
import { useCallback, useEffect, useReducer } from "react";

/*
 * Minimal request cache: one entry per key, shared by every component that
 * asks for it, refreshed on window focus. Deliberately no background polling,
 * so the Friday rush does not multiply load. Booking decisions never trust
 * this cache; the server re-checks every rule.
 */

interface Entry<T = unknown> {
  data?: T;
  error?: unknown;
  loading: boolean;
  fetcher: () => Promise<T>;
  inflight?: Promise<void>;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function load(key: string): Promise<void> {
  const entry = entries.get(key);
  if (!entry) return Promise.resolve();
  if (entry.inflight) return entry.inflight;
  entries.set(key, { ...entry, loading: true });
  notify();
  const inflight = entry
    .fetcher()
    .then(
      (data) => entries.set(key, { ...entries.get(key)!, data, error: undefined, loading: false, inflight: undefined }),
      (error) => entries.set(key, { ...entries.get(key)!, error, loading: false, inflight: undefined }),
    )
    .then(notify);
  entries.set(key, { ...entries.get(key)!, inflight });
  return inflight;
}

/** Re-fetch every cached entry whose key starts with the prefix. */
export function revalidate(prefix: string): Promise<void> {
  return Promise.all([...entries.keys()].filter((k) => k.startsWith(prefix)).map(load)).then(() => undefined);
}

const IDLE: Entry = { loading: false, fetcher: async () => undefined };

export function useApi<T>(key: string | null, fetcher: () => Promise<T>) {
  // Read the cache during render and re-render on every cache change. The
  // subscription is registered before the loading effect below runs, so no
  // update can be missed. Server and first client render both see IDLE.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  const entry = (key ? entries.get(key) ?? IDLE : IDLE) as Entry<T>;

  useEffect(() => {
    if (!key) return;
    const existing = entries.get(key);
    entries.set(key, { ...(existing ?? { loading: false }), fetcher } as Entry);
    if (!existing || (existing.data === undefined && !existing.inflight)) void load(key);
  }, [key, fetcher]);

  useEffect(() => {
    if (!key) return;
    const onFocus = () => void load(key);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [key]);

  const refresh = useCallback(() => (key ? load(key) : Promise.resolve()), [key]);

  return {
    data: entry.data,
    error: entry.error,
    /** True until the first response (or error) arrives. */
    loading: key !== null && entry.data === undefined && entry.error === undefined,
    refreshing: entry.loading,
    refresh,
  };
}
