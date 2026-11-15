import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";

describe("@/lib/db entry point", () => {
  it("opens nothing at import time", async () => {
    const open = vi.spyOn(indexedDB, "open");
    vi.resetModules();
    await import("@/lib/db");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("getDataLayer returns the same object twice and opens nothing until used", async () => {
    vi.resetModules();
    const open = vi.spyOn(indexedDB, "open");
    const { getDataLayer } = await import("@/lib/db");
    const a = getDataLayer();
    const b = getDataLayer();
    expect(a).toBe(b);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
    (await import("@/lib/db")).getDataLayer();
  });

  it("exports the documented names", async () => {
    const mod = await import("@/lib/db");
    expect(typeof mod.openDatabase).toBe("function");
    expect(typeof mod.createDataLayer).toBe("function");
    expect(typeof mod.probeStorage).toBe("function");
    const error = new mod.DataError("storage", "x");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("storage");
  });

  it("exposes working versions and measurements", async () => {
    const { createDataLayer, openDatabase } = await import("@/lib/db");
    const db = openDatabase(`candlelab-test-stub-${crypto.randomUUID()}`);
    const layer = createDataLayer(db);
    await expect(layer.versions.get("x")).resolves.toBeUndefined();
    await expect(layer.measurements.getForVersion("x")).resolves.toBeUndefined();
    db.close();
    await db.delete();
  });

  it("reports an unavailable IndexedDB as a storage error", async () => {
    const { createDataLayer, openDatabase } = await import("@/lib/db");
    const db = openDatabase(`candlelab-test-broken-${crypto.randomUUID()}`);
    const layer = createDataLayer(db);
    vi.spyOn(db.materials, "toArray").mockRejectedValue(new Error("QuotaExceeded"));
    await expect(layer.materials.list()).rejects.toMatchObject({ code: "storage" });
    vi.restoreAllMocks();
    db.close();
    await db.delete();
  });
});
