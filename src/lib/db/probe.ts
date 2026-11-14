/**
 * Storage probe (T03). Answers one question for the shell: can this browser
 * open an IndexedDB database right now? It opens and deletes a throwaway
 * database with a unique name and never touches the app database. It lives in
 * `@/lib/db` because only that folder may touch IndexedDB (TRD-04).
 */

/** Give up after this long so a hung or blocked open cannot freeze the shell. */
const PROBE_TIMEOUT_MS = 3000;

export async function probeStorage(): Promise<boolean> {
  if (typeof indexedDB === "undefined" || indexedDB === null) return false;

  const name = `candlelab-probe-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(ok);
    };

    try {
      timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
      const request = indexedDB.open(name, 1);

      request.onerror = () => finish(false);
      request.onblocked = () => finish(false);
      request.onsuccess = () => {
        request.result.close();
        try {
          const cleanup = indexedDB.deleteDatabase(name);
          cleanup.onsuccess = () => finish(true);
          // The database opened, so storage works. A failed cleanup only
          // leaves an empty throwaway database behind.
          cleanup.onerror = () => finish(true);
          cleanup.onblocked = () => finish(true);
        } catch {
          finish(true);
        }
      };
    } catch {
      finish(false);
    }
  });
}
