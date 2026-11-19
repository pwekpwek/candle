"use client";

import { useEffect, useState } from "react";
import { getDataLayer } from "@/lib/db";
import type { BurnSessionDetail } from "@/lib/db";
import type { BurnPhoto } from "@/lib/types";

export type LoadedSessions =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      /** Found sessions, in the order of the ids. */
      sessions: BurnSessionDetail[];
      /** Photos by session id (only when asked for). */
      photos: Record<string, BurnPhoto[]>;
      /** Ids that matched no session. */
      missing: string[];
    };

/**
 * Loads the given sessions (and, for a report, their photos) once, and again
 * when `reload()` is called. Client-only: reads through the data layer.
 */
export function useBurnSessions(
  ids: readonly string[],
  withPhotos: boolean,
): { state: LoadedSessions; reload: () => void } {
  const key = `${withPhotos ? "p" : "n"}:${ids.join(",")}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; value: LoadedSessions } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const layer = getDataLayer();
        const found = await Promise.all(ids.map((id) => layer.burnSessions.get(id)));
        const sessions: BurnSessionDetail[] = [];
        const missing: string[] = [];
        found.forEach((item, i) => {
          if (item) sessions.push(item);
          else missing.push(ids[i]);
        });
        const photos: Record<string, BurnPhoto[]> = {};
        if (withPhotos) {
          const lists = await Promise.all(sessions.map((s) => layer.burnPhotos.listBySession(s.session.id)));
          sessions.forEach((s, i) => {
            photos[s.session.id] = lists[i];
          });
        }
        if (!cancelled) setResult({ key, attempt, value: { status: "ready", sessions, photos, missing } });
      } catch (error) {
        console.error(error);
        if (!cancelled) setResult({ key, attempt, value: { status: "error" } });
      }
    })();
    return () => {
      cancelled = true;
    };
    // `ids` is represented by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, withPhotos]);

  const state: LoadedSessions =
    result && result.key === key && result.attempt === attempt ? result.value : { status: "loading" };
  return { state, reload: () => setAttempt((n) => n + 1) };
}
