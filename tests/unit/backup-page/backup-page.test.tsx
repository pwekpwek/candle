import "fake-indexeddb/auto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BackupView, formatExportedAt } from "@/components/backup";
import { formatFileSize } from "@/components/backup/format";
import { MAX_BACKUP_BYTES, checkBackupText, exportBackup, deviceIdsOf, readDeviceData } from "@/lib/backup";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { DataLayer } from "@/lib/db";
import { MESSAGES, messageForCheckFailure, restoreSummary } from "@/lib/messages";
import { baseFields } from "../gramguard/helpers";
import { makeLibrary, newFormulaRequest, we5Input } from "../db/harness";

const calls = vi.hoisted(() => ({
  order: [] as string[],
  download: vi.fn<(fileName: string, text: string) => void>(),
  gate: null as null | Promise<void>,
  applyCount: 0,
  sizeOverride: null as null | number,
}));

vi.mock("@/components/backup/download", () => ({
  downloadText: (fileName: string, text: string) => {
    calls.order.push(`download:${fileName}`);
    calls.download(fileName, text);
  },
}));

vi.mock("@/lib/backup", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/backup")>();
  return {
    ...real,
    exportBackup: async (...args: Parameters<typeof real.exportBackup>) => {
      const out = await real.exportBackup(...args);
      return calls.sizeOverride === null ? out : { ...out, sizeBytes: calls.sizeOverride };
    },
    applyRestore: async (...args: Parameters<typeof real.applyRestore>) => {
      calls.order.push("apply");
      calls.applyCount += 1;
      if (calls.gate) await calls.gate;
      return real.applyRestore(...args);
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    bfcacheId: "test",
  }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/backup",
}));

const B = MESSAGES.backup;
const FIXTURES = join(process.cwd(), "tests", "fixtures", "backups");
const goodText = readFileSync(join(FIXTURES, "good.json"), "utf8");
const good = JSON.parse(goodText) as {
  exportedAt: string;
  counts: { formulas: number; formulaVersions: number; materials: number; measurements: number };
  data: unknown;
};
const GOOD_NAME = "candlelab-backup-20261114-060512.json";
const FILE_NAME = /^candlelab-backup-\d{8}-\d{6}\.json$/;

beforeEach(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  calls.order.length = 0;
  calls.download.mockReset();
  calls.gate = null;
  calls.applyCount = 0;
  calls.sizeOverride = null;
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.batches.clear(),
    db.curePlans.clear(),
    db.productionPlans.clear(),
    db.burnSessions.clear(),
    db.burnPhotos.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const layer = (): DataLayer => getDataLayer();

async function deviceData() {
  const db = openDatabase();
  try {
    return await readDeviceData(db);
  } finally {
    db.close();
  }
}

async function metaRow() {
  const db = openDatabase();
  try {
    return await db.meta.toArray();
  } finally {
    db.close();
  }
}

function renderPage() {
  return render(<BackupView />);
}

function choose(container: HTMLElement, text: string, name = "backup.json") {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([text], name, { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
}

const restoreButton = () => screen.getByRole("button", { name: B.restore });

describe("export (PRD-24, PRD-27)", () => {
  it("says there is no backup yet, then exports once and updates the line", async () => {
    renderPage();
    expect(await screen.findByText(B.neverBackedUp.title)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: B.exportBackup }));
    await screen.findByText(/^Exported /);
    expect(calls.download).toHaveBeenCalledTimes(1);
    const [fileName, json] = calls.download.mock.calls[0];
    expect(fileName).toMatch(FILE_NAME);
    const parsed = JSON.parse(json) as { format: string; counts: { formulas: number } };
    expect(parsed.format).toBe("candlelab-backup");
    expect(parsed.counts.formulas).toBe(0);
    expect(await screen.findByText(/^Last backup: just now · 0 changes since$/)).toBeTruthy();
    expect(screen.queryByText(B.neverBackedUp.title)).toBeNull();
    expect(screen.getByText(/^Exported .+ · 0 formulas · 0 versions$/)).toBeTruthy();
  });

  it("counts the formulas and versions in the exported line", async () => {
    const lib = await makeLibrary(layer());
    await layer().versions.save(newFormulaRequest(we5Input(lib)));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: B.exportBackup }));
    const [, json] = await waitFor(() => {
      expect(calls.download).toHaveBeenCalled();
      return calls.download.mock.calls[0];
    });
    const parsed = JSON.parse(json) as { exportedAt: string };
    expect(
      await screen.findByText(B.exportedLine(formatExportedAt(parsed.exportedAt), 1, 1)),
    ).toBeTruthy();
    expect(await screen.findByText(/^Last backup: just now · 0 changes since$/)).toBeTruthy();
  });

  it("shows the file size and the photos on this device after an export", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: B.exportBackup }));
    await screen.findByText(/^Exported /);
    const [, json] = calls.download.mock.calls[0];
    const bytes = new TextEncoder().encode(json).length;
    expect(await screen.findByText(MESSAGES.burnCompare.backupFileSize(formatFileSize(bytes)))).toBeTruthy();
    expect(screen.getByText(MESSAGES.burnCompare.backupDevicePhotos(0, "0 B"))).toBeTruthy();
    expect(screen.queryByText(/cannot restore a file that large/)).toBeNull();
  });

  it("counts the photos on this device", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(newFormulaRequest(we5Input(lib)));
    const { batch } = await layer().batches.create({
      batchId: crypto.randomUUID(),
      versionId: saved.version.id,
      producedOn: "2026-11-10",
      entries: [],
    });
    const { session } = await layer().burnSessions.create({
      sessionId: crypto.randomUUID(),
      batchId: batch.id,
      testedOn: "2026-11-18",
      milestoneId: null,
      candles: [{ label: "A", wick: { text: "CD-10" }, burns: [] }],
    });
    const bytes = new Uint8Array(2048).fill(7);
    bytes.set([0xff, 0xd8, 0xff, 0xe0]);
    await layer().burnPhotos.add({ photoId: crypto.randomUUID(), sessionId: session.id, bytes, width: 10, height: 10 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: B.exportBackup }));
    expect(await screen.findByText(MESSAGES.burnCompare.backupDevicePhotos(1, "2 KB"))).toBeTruthy();
  });

  it("warns when the file is larger than this app can restore, and still downloads it", async () => {
    calls.sizeOverride = MAX_BACKUP_BYTES + 1;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: B.exportBackup }));
    expect(
      await screen.findByText(MESSAGES.burnCompare.backupTooLarge(formatFileSize(MAX_BACKUP_BYTES + 1), "256 MB")),
    ).toBeTruthy();
    expect(calls.download).toHaveBeenCalledTimes(1);
  });

  it("exports once on a double click", async () => {
    renderPage();
    const button = await screen.findByRole("button", { name: B.exportBackup });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText(/^Exported /);
    expect(calls.download).toHaveBeenCalledTimes(1);
  });

  it("shows an error notice when the download fails", async () => {
    calls.download.mockImplementation(() => {
      throw new Error("no download");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: B.exportBackup }));
    const notice = await screen.findByText(B.exportFailed);
    expect(notice.closest('[role="alert"]')).toBeTruthy();
    expect(screen.queryByText(/^Exported /)).toBeNull();
  });
});

describe("draft note (F6)", () => {
  it("is not shown without a draft", async () => {
    const lib = await makeLibrary(layer());
    await layer().versions.save(newFormulaRequest(we5Input(lib)));
    renderPage();
    await screen.findByText(/^Last backup|No backup yet/);
    await waitFor(() => expect(screen.queryByText(B.loadingStatus)).toBeNull());
    expect(screen.queryByText(B.draftNotIncluded)).toBeNull();
  });

  it("is shown for a new-formula draft", async () => {
    await layer().drafts.put("new", null, baseFields());
    renderPage();
    expect(await screen.findByText(B.draftNotIncluded)).toBeTruthy();
  });

  it("is shown for a draft of a revision", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(newFormulaRequest(we5Input(lib)));
    await layer().drafts.put(saved.formula.id, saved.version.id, baseFields());
    renderPage();
    expect(await screen.findByText(B.draftNotIncluded)).toBeTruthy();
  });
});

describe("files that cannot be restored (PRD-25, DATA-19)", () => {
  const EXPECTED: Record<string, string> = {
    "bad-01-not-json.json": "not-backup",
    "bad-02-wrong-format.json": "not-backup",
    "bad-03-newer-version.json": "newer",
    "bad-04-missing-field.json": "invalid",
    "bad-05-wrong-type.json": "invalid",
    "bad-06-negative-weight.json": "invalid",
    "bad-07-count-mismatch.json": "incomplete",
    "bad-08-checksum-mismatch.json": "checksum",
    "bad-09-truncated.json": "not-backup",
    "bad-10-duplicate-ids.json": "duplicates",
    "bad-11-orphaned-version.json": "orphans",
  };
  const files = readdirSync(FIXTURES).filter((f) => f.startsWith("bad-") && f.endsWith(".json"));

  it("covers all eleven fixtures", () => {
    expect(files.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const name of Object.keys(EXPECTED)) {
    it(`${name} shows its reason and changes nothing`, async () => {
      const lib = await makeLibrary(layer());
      await layer().versions.save(newFormulaRequest(we5Input(lib)));
      const before = await deviceData();
      const metaBefore = await metaRow();

      const text = readFileSync(join(FIXTURES, name), "utf8");
      const direct = await checkBackupText(text, text.length, deviceIdsOf(before));
      expect(direct.ok).toBe(false);
      if (direct.ok) return;
      expect(direct.failure.code).toBe(EXPECTED[name]);

      const { container } = renderPage();
      await screen.findByText(/^Last backup|No backup yet/);
      choose(container, text, name);
      expect(await screen.findByText(B.cantRestoreTitle)).toBeTruthy();
      expect(screen.getByText(messageForCheckFailure(direct.failure))).toBeTruthy();
      expect(screen.getByText(B.nothingChanged)).toBeTruthy();
      expect(screen.getByRole("button", { name: B.chooseAnother })).toBeTruthy();
      expect(screen.queryByRole("button", { name: B.restore })).toBeNull();

      expect(await deviceData()).toEqual(before);
      expect(await metaRow()).toEqual(metaBefore);
    });
  }

  it("refuses a file over the size limit as not a backup, without reading it", async () => {
    const { container } = renderPage();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["{}"], "huge.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: MAX_BACKUP_BYTES + 1 });
    const text = vi.spyOn(file, "text");
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(B.cantRestoreTitle)).toBeTruthy();
    expect(screen.getByText(messageForCheckFailure({ code: "not-backup" }))).toBeTruthy();
    expect(text).not.toHaveBeenCalled();
  });

  it("refuses a file that cannot be read", async () => {
    const { container } = renderPage();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["{}"], "broken.json", { type: "application/json" });
    vi.spyOn(file, "text").mockRejectedValue(new Error("unreadable"));
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(B.cantRestoreTitle)).toBeTruthy();
    expect(screen.getByText(messageForCheckFailure({ code: "not-backup" }))).toBeTruthy();
  });
});

describe("restore, add to what is here (PRD-26)", () => {
  async function restoreGood(container: HTMLElement) {
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    fireEvent.click(restoreButton());
  }

  it("previews good.json, restores it into an empty device and summarises", async () => {
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    choose(container, goodText, GOOD_NAME);
    expect(await screen.findByText(GOOD_NAME)).toBeTruthy();
    expect(
      screen.getByText(B.exportedLine(formatExportedAt(good.exportedAt), 2, 3)),
    ).toBeTruthy();
    expect(
      screen.getByText("Will add 2 formulas, 3 versions, 7 materials, 1 measurement"),
    ).toBeTruthy();
    expect(screen.queryByText(/^Already here/)).toBeNull();
    expect(screen.queryByText(B.keepDeviceCopy)).toBeNull();
    expect(
      (screen.getByLabelText(B.addToWhatsHere) as HTMLInputElement).checked,
    ).toBe(true);

    fireEvent.click(restoreButton());
    const summary = restoreSummary({
      fileName: GOOD_NAME,
      added: { formulas: 2, formulaVersions: 3, materials: 7, measurements: 1, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0 },
      skippedIdentical: 0,
      kept: { formulas: 0, formulaVersions: 0, materials: 0, measurements: 0, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0 },
    });
    expect(await screen.findByText(summary)).toBeTruthy();
    const link = screen.getByRole("link", { name: B.openSaved });
    expect(link.getAttribute("href")).toBe("/");
    expect(await deviceData()).toEqual({ ...(good.data as object), batches: [], curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [] });
    // The chosen file and the preview are gone.
    expect(screen.queryByText(B.addToWhatsHere)).toBeNull();
    expect(calls.download).not.toHaveBeenCalled();
  });

  it("restoring the same file again adds nothing", async () => {
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    await restoreGood(container);
    await screen.findByText(B.resultTitle);

    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    expect(screen.getByText("Nothing new to add.")).toBeTruthy();
    expect(
      screen.getByText("Already here: 2 formulas, 3 versions, 7 materials, 1 measurement"),
    ).toBeTruthy();
    const before = await deviceData();
    fireEvent.click(restoreButton());
    expect(
      await screen.findByText(
        `Restored from ${GOOD_NAME}: nothing new was added. Skipped 13 identical items.`,
      ),
    ).toBeTruthy();
    expect(await deviceData()).toEqual(before);
  });

  it("offers the conflict choice: keep this device's copy, or use the backup's", async () => {
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    await restoreGood(container);
    await screen.findByText(B.resultTitle);

    const cedar = (await layer().materials.list()).find((m) => m.name === "Cedarwood")!;
    await layer().materials.update(cedar.id, { type: "fragranceOil", name: "Cedarwood EDITED" });

    // Keep this device's copy (the default).
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    expect(screen.getByText("Conflicts: 1 material")).toBeTruthy();
    expect((screen.getByLabelText(B.keepDeviceCopy) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(restoreButton());
    const kept = await screen.findByText(
      `Restored from ${GOOD_NAME}: nothing new was added. Skipped 12 identical items. Kept this device's copy of 1 material.`,
    );
    expect(kept).toBeTruthy();
    expect((await layer().materials.get(cedar.id))?.name).toBe("Cedarwood EDITED");

    // Use the backup's copy.
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    fireEvent.click(screen.getByLabelText(B.useBackupCopy));
    await waitFor(() =>
      expect((screen.getByLabelText(B.useBackupCopy) as HTMLInputElement).checked).toBe(true),
    );
    await waitFor(() => expect(restoreButton().hasAttribute("disabled")).toBe(false));
    fireEvent.click(restoreButton());
    expect(
      await screen.findByText(B.replacedSentence({ formulas: 0, formulaVersions: 0, materials: 1, measurements: 0, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0 })),
    ).toBeTruthy();
    expect((await layer().materials.get(cedar.id))?.name).toBe("Cedarwood");
    expect(await deviceData()).toEqual({ ...(good.data as object), batches: [], curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [] });
  });

  it("lists burn tests dated before their batch and shared planned burn tests, and still restores", async () => {
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    const lib = await makeLibrary(layer());
    const { version } = await layer().versions.save(newFormulaRequest(we5Input(lib)));
    const { batch } = await layer().batches.create({
      batchId: crypto.randomUUID(),
      versionId: version.id,
      producedOn: "2026-11-10",
      entries: [],
    });
    const cure = await layer().curePlans.save(batch.id, [{ kind: "burnTest", offsetDays: 2 }]);
    const milestoneId = cure.milestones[0]!.id;
    const candles = [{ label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 60 }] }];
    const first = crypto.randomUUID();
    await layer().burnSessions.create({ sessionId: first, batchId: batch.id, testedOn: "2026-11-12", milestoneId, candles });
    const db = openDatabase();
    let text: string;
    try {
      const stored = (await db.burnSessions.get(first))!;
      await db.burnSessions.put({
        ...stored,
        id: crypto.randomUUID(),
        testedOn: "2026-11-01",
        candles: stored.candles.map((c) => ({ ...c, id: crypto.randomUUID(), burns: c.burns.map((b) => ({ ...b, id: crypto.randomUUID() })) })),
      });
      text = (await exportBackup(db, { now: () => "2026-11-16T09:00:00.000Z" })).json;
      await Promise.all(db.tables.map((t) => t.clear()));
    } finally {
      db.close();
    }
    choose(container, text, GOOD_NAME);
    expect(await screen.findByText(GOOD_NAME)).toBeTruthy();
    expect(screen.getByText(B.previewBurnDatesBeforeBatch(1))).toBeTruthy();
    expect(screen.getByText(B.previewSharedPlannedTests(1))).toBeTruthy();
    expect(B.previewBurnDatesBeforeBatch(2)).toBe(
      "2 burn tests will be dated before their batches' production date. Check those dates after restoring.",
    );
    fireEvent.click(restoreButton());
    expect(await screen.findByText(B.resultTitle)).toBeTruthy();
    expect(await layer().burnSessions.get(first)).toBeTruthy();
  });

  it("shows no burn lines for an ordinary file", async () => {
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    expect(screen.queryByText(/dated before/)).toBeNull();
    expect(screen.queryByText(/more than one burn test/)).toBeNull();
  });

  it("Cancel clears the chosen file and the preview", async () => {
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    fireEvent.click(screen.getByRole("button", { name: B.cancel }));
    expect(screen.queryByText(GOOD_NAME)).toBeNull();
    expect(screen.queryByRole("button", { name: B.restore })).toBeNull();
    expect((await deviceData()).formulas).toHaveLength(0);
  });

  it("says the data changed when the device changes after the preview, and checks again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    const before = await deviceData();

    await layer().materials.create({ type: "wax", name: "Added after the preview" });
    const changed = await deviceData();
    expect(changed.materials).toHaveLength(before.materials.length + 1);

    fireEvent.click(restoreButton());
    expect(await screen.findByText(B.failStale)).toBeTruthy();
    expect(await deviceData()).toEqual(changed); // nothing written
    expect(screen.queryByText(B.resultTitle)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: B.recheck }));
    await waitFor(() => expect(screen.queryByText(B.failStale)).toBeNull());
    await waitFor(() => expect(restoreButton().hasAttribute("disabled")).toBe(false));
    fireEvent.click(restoreButton());
    expect(await screen.findByText(B.resultTitle)).toBeTruthy();
    const after = await deviceData();
    expect(after.formulas).toHaveLength(2);
    expect(after.materials).toHaveLength(8);
  });

  it("shows Don't close this tab while applying and ignores a second Restore", async () => {
    let release: () => void = () => {};
    calls.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    fireEvent.click(restoreButton());
    expect(await screen.findByText(B.dontCloseTab)).toBeTruthy();
    expect(restoreButton().getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: B.chooseFile }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: B.exportBackup }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(restoreButton());
    fireEvent.click(restoreButton());
    release();
    await screen.findByText(B.resultTitle);
    expect(calls.applyCount).toBe(1);
    expect(screen.queryByText(B.dontCloseTab)).toBeNull();
  });
});

describe("restore, replace everything (DATA-23, FLOW-09)", () => {
  it("asks for REPLACE, downloads the earlier backup first, then replaces", async () => {
    const lib = await makeLibrary(layer());
    await layer().versions.save(newFormulaRequest(we5Input(lib)));
    const before = await deviceData();

    const { container } = renderPage();
    await screen.findByText(/^Last backup|No backup yet/);
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    fireEvent.click(screen.getByLabelText(B.replaceEverything));
    expect(
      await screen.findByText(
        "Will replace everything on this device with 2 formulas, 3 versions, 7 materials, 1 measurement",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(B.keepDeviceCopy)).toBeNull();

    fireEvent.click(restoreButton());
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(B.replaceTitle);
    expect(dialog.textContent).toContain(B.replaceWarning);
    expect(dialog.textContent).toContain(
      B.replaceAffects({ materials: 6, formulas: 1, formulaVersions: 1, measurements: 0, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0 }),
    );

    // Pressing confirm without the word explains what is missing and does nothing.
    fireEvent.click(screen.getByRole("button", { name: B.replaceConfirm }));
    expect(await screen.findByText(B.replaceNeedsWord)).toBeTruthy();
    expect(calls.download).not.toHaveBeenCalled();
    expect(calls.order).toEqual([]);

    // A wrong word does not pass either.
    fireEvent.change(screen.getByLabelText(B.typeReplace), { target: { value: "replace" } });
    fireEvent.click(screen.getByRole("button", { name: B.replaceConfirm }));
    expect(await screen.findByText(B.replaceNeedsWord)).toBeTruthy();
    expect(calls.order).toEqual([]);

    fireEvent.change(screen.getByLabelText(B.typeReplace), { target: { value: " REPLACE " } });
    fireEvent.click(screen.getByRole("button", { name: B.replaceConfirm }));

    expect(await screen.findByText(B.resultTitle)).toBeTruthy();
    expect(
      screen.getByText(
        B.replaceSummary(GOOD_NAME, { formulas: 2, formulaVersions: 3, materials: 7, measurements: 1, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0 }),
      ),
    ).toBeTruthy();
    expect(calls.order).toHaveLength(2);
    expect(calls.order[0]).toMatch(/^download:candlelab-backup-/);
    expect(calls.order[1]).toBe("apply");
    expect(calls.download).toHaveBeenCalledTimes(1);
    const [fileName, json] = calls.download.mock.calls[0];
    expect(fileName).toMatch(FILE_NAME);
    const safety = JSON.parse(json) as { data: typeof before };
    expect(safety.data).toEqual(before);

    expect(await deviceData()).toEqual({ ...(good.data as object), batches: [], curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [] });
  });

  it("replaces nothing when the earlier backup cannot be downloaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    calls.download.mockImplementation(() => {
      throw new Error("blocked");
    });
    const lib = await makeLibrary(layer());
    await layer().versions.save(newFormulaRequest(we5Input(lib)));
    const before = await deviceData();

    const { container } = renderPage();
    await screen.findByText(/^Last backup|No backup yet/);
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    fireEvent.click(screen.getByLabelText(B.replaceEverything));
    await screen.findByText(/^Will replace everything/);
    fireEvent.click(restoreButton());
    fireEvent.change(await screen.findByLabelText(B.typeReplace), { target: { value: "REPLACE" } });
    fireEvent.click(screen.getByRole("button", { name: B.replaceConfirm }));
    expect(await screen.findByText(B.safetyExportFailed)).toBeTruthy();
    expect(calls.order).not.toContain("apply");
    expect(await deviceData()).toEqual(before);
  });
});

describe("page state", () => {
  it("never leaves a chosen file behind after a finished restore", async () => {
    const { container } = renderPage();
    await screen.findByText(B.neverBackedUp.title);
    choose(container, goodText, GOOD_NAME);
    await screen.findByText(GOOD_NAME);
    fireEvent.click(restoreButton());
    await screen.findByText(B.resultTitle);
    expect(screen.queryByRole("button", { name: B.restore })).toBeNull();
    expect(screen.queryByText(GOOD_NAME, { selector: "p" })).toBeNull();
  });
});
