import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { probeStorage } from "@/lib/db/probe";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("probeStorage", () => {
  it("resolves true when IndexedDB works", async () => {
    await expect(probeStorage()).resolves.toBe(true);
  });

  it("leaves no throwaway database behind", async () => {
    await probeStorage();
    const dbs = await indexedDB.databases();
    expect(
      dbs.filter((d) => d.name?.startsWith("candlelab-probe")),
    ).toHaveLength(0);
  });

  it("resolves false when indexedDB is missing", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(probeStorage()).resolves.toBe(false);
  });

  it("resolves false when open throws", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    await expect(probeStorage()).resolves.toBe(false);
  });

  it("resolves false when the open request errors", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request: { onerror?: () => void } = {};
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    });
    await expect(probeStorage()).resolves.toBe(false);
  });

  it("resolves false when the open request is blocked", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request: { onblocked?: () => void } = {};
        queueMicrotask(() => request.onblocked?.());
        return request;
      },
    });
    await expect(probeStorage()).resolves.toBe(false);
  });

  it("resolves false when the open request never answers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", { open: () => ({}) });
    const result = probeStorage();
    await vi.advanceTimersByTimeAsync(3500);
    await expect(result).resolves.toBe(false);
  });
});
