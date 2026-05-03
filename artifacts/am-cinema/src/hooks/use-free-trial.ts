import { useState, useEffect, useCallback } from "react";

export const FREE_WATCH_LIMIT = 3;
const STORAGE_KEY = "phoenix_trial_v1";
const EVENT = "phoenix:trial-updated";

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useFreeTrial() {
  const [watchedIds, setWatchedIds] = useState<string[]>(readIds);

  // Sync across components in the same tab via custom event
  useEffect(() => {
    const handler = () => setWatchedIds(readIds());
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const recordWatch = useCallback((imdbId: string) => {
    const current = readIds();
    if (current.includes(imdbId)) return;
    const next = [...current, imdbId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
    setWatchedIds(next);
  }, []);

  const used = watchedIds.length;
  const remaining = Math.max(0, FREE_WATCH_LIMIT - used);

  return {
    remaining,
    used,
    limit: FREE_WATCH_LIMIT,
    isTrialActive: remaining > 0,
    hasWatched: (id: string) => watchedIds.includes(id),
    recordWatch,
  };
}
