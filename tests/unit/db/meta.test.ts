import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setup } from "./harness";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("meta", () => {
  it("returns defaults when no rows exist", async () => {
    const { layer } = setup();
    expect(await layer.meta.get()).toEqual({
      schemaVersion: 4,
      lastBackupAt: null,
      lastBackupCounts: null,
      changesSinceBackup: 0,
      lastRestoreAt: null,
      exampleOffered: false,
      persistence: null,
    });
  });

  it("reads stored backup rows", async () => {
    const { layer, db } = setup();
    await db.meta.bulkPut([
      { key: "lastBackupAt", value: "2026-11-14T00:00:00.000Z" },
      { key: "lastBackupCounts", value: { formulas: 12, formulaVersions: 31 } },
      { key: "lastRestoreAt", value: "2026-11-15T00:00:00.000Z" },
      { key: "changesSinceBackup", value: 4 },
    ]);
    expect(await layer.meta.get()).toMatchObject({
      lastBackupAt: "2026-11-14T00:00:00.000Z",
      lastBackupCounts: { formulas: 12, formulaVersions: 31 },
      lastRestoreAt: "2026-11-15T00:00:00.000Z",
      changesSinceBackup: 4,
    });
  });

  it("records that the example was offered", async () => {
    const { layer } = setup();
    await layer.meta.setExampleOffered();
    expect((await layer.meta.get()).exampleOffered).toBe(true);
  });

  it("records granted and returns it without asking again", async () => {
    const { layer } = setup();
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist } });
    expect(await layer.meta.requestPersistence()).toBe("granted");
    expect(await layer.meta.requestPersistence()).toBe("granted");
    expect(persist).toHaveBeenCalledTimes(1);
    expect((await layer.meta.get()).persistence).toBe("granted");
  });

  it("records denied", async () => {
    const { layer } = setup();
    const persist = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("navigator", { storage: { persist } });
    expect(await layer.meta.requestPersistence()).toBe("denied");
    expect(await layer.meta.requestPersistence()).toBe("denied");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported when the API is missing", async () => {
    const { layer } = setup();
    vi.stubGlobal("navigator", {});
    expect(await layer.meta.requestPersistence()).toBe("unsupported");
    expect((await layer.meta.get()).persistence).toBe("unsupported");
  });

  it("reports unsupported when persist throws, and does not ask again", async () => {
    const { layer } = setup();
    const persist = vi.fn().mockRejectedValue(new Error("nope"));
    vi.stubGlobal("navigator", { storage: { persist } });
    expect(await layer.meta.requestPersistence()).toBe("unsupported");
    expect(await layer.meta.requestPersistence()).toBe("unsupported");
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
