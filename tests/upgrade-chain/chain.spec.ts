/**
 * v0.2 integration QA: real browser-profile upgrade chain.
 *
 * `run-chain.sh` serves four production builds in turn on port 3000 and runs
 * one phase of this file against each, in ONE persistent Chromium profile:
 *
 *   v01 (8b0c32c, schema 1) -> bt (d6a0268, schema 2) -> cp (8551473, schema 3)
 *   -> bm (359fa76 or later, schema 4)
 *
 * Every phase dumps all IndexedDB stores when it opens (after the new build
 * upgraded the database) and checks that every record the previous phase left
 * is unchanged, then adds data with the screens. Two more phases restore the
 * v0.1 and CurePilot backups made on the way into fresh profiles on the final
 * build. Photos are generated in the page; nothing real is used.
 *
 * Env: PHASE, CHAIN_PROFILE (persistent profile dir), CHAIN_OUT (dumps and
 * backups). Not part of `npm run test:e2e`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { WE5, enterWE8, expectWE8Figures, measuredInput, scaleToTen } from "../e2e/helpers-flow";
import {
  SLOW,
  addCurePlan,
  batchLabel,
  buildWE5,
  milestoneRow,
  openSchedule,
  planProduction,
  productionDate,
  restoreFile,
  submitCreate,
  visible,
  waitForHeading,
} from "../e2e/helpers-schedule";
import { addPhotos, createSession } from "../e2e/helpers-burn";

const PHASE = process.env.PHASE ?? "";
const PROFILE = process.env.CHAIN_PROFILE ?? "";
const OUT = process.env.CHAIN_OUT ?? "";

const DATA_STORES = [
  "materials",
  "formulas",
  "formulaVersions",
  "measurements",
  "batches",
  "curePlans",
  "productionPlans",
  "burnSessions",
  "burnPhotos",
] as const;

type Dump = { version: number; stores: Record<string, unknown[]> };

/** Every store of the `candlelab` database, photo bytes replaced by their length and SHA-256. */
async function dump(page: Page): Promise<Dump> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("candlelab");
      req.onupgradeneeded = () => {
        req.transaction?.abort();
        reject(new Error("candlelab does not exist yet"));
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const names = Array.from(db.objectStoreNames);
    const stores: Record<string, unknown[]> = {};
    const tx = db.transaction(names, "readonly");
    await Promise.all(
      names.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const r = tx.objectStore(name).getAll();
            r.onsuccess = () => {
              stores[name] = r.result;
              resolve();
            };
            r.onerror = () => reject(r.error);
          }),
      ),
    );
    const version = db.version;
    db.close();
    const hex = (buf: ArrayBuffer) =>
      Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
    for (const photo of (stores.burnPhotos ?? []) as Record<string, unknown>[]) {
      const bytes = photo.bytes as Uint8Array;
      photo.bytes = {
        length: bytes.length,
        sha256: hex(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)),
      };
    }
    return { version, stores };
  });
}

function save(name: string, value: unknown) {
  writeFileSync(join(OUT, name), JSON.stringify(value, null, 2));
}

function load(name: string): Dump {
  return JSON.parse(readFileSync(join(OUT, name), "utf8")) as Dump;
}

const counts = (d: Dump) =>
  Object.fromEntries(Object.entries(d.stores).map(([k, v]) => [k, v.length]));

/**
 * The previous phase's records are all still there, unchanged, and every
 * store the new schema added is empty. `meta` and `drafts` are reported, not
 * compared: the app may write them when it opens.
 */
function expectPreserved(before: Dump, after: Dump, expectedVersion: number, log: string[]) {
  expect(after.version, "IndexedDB version after upgrade").toBe(expectedVersion);
  log.push(`IndexedDB version ${before.version} -> ${after.version}`);
  for (const [store, rows] of Object.entries(before.stores)) {
    if (store === "meta" || store === "drafts") continue;
    expect(after.stores[store], `store ${store} after upgrade`).toEqual(rows);
    log.push(`${store}: ${rows.length} record(s) identical`);
  }
  for (const store of Object.keys(after.stores)) {
    if (!(store in before.stores)) {
      expect(after.stores[store], `new store ${store}`).toEqual([]);
      log.push(`${store}: added, empty`);
    }
  }
  const metaKeys = (d: Dump) =>
    (d.stores.meta ?? []).map((m) => (m as { key: string }).key).sort();
  for (const key of metaKeys(before)) {
    expect(metaKeys(after), "meta keys kept").toContain(key);
  }
  log.push(`meta keys kept: ${metaKeys(before).join(", ")}`);
}

function isoOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function exportTo(page: Page, name: string) {
  await page.goto("/backup");
  await waitForHeading(page, "Backup and restore");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  const file = join(OUT, name);
  await download.saveAs(file);
  return { file, backup: JSON.parse(readFileSync(file, "utf8")) };
}

/** Opens the home page and waits until the saved formula is listed (the app has opened the database). */
async function openApp(page: Page) {
  await page.goto("/");
  await waitForHeading(page, "Saved formulas");
  await expect(page.getByText(WE5.name).first()).toBeVisible({ timeout: SLOW });
}

async function withProfile(dir: string, run: (page: Page, ctx: BrowserContext) => Promise<void>) {
  const ctx = await chromium.launchPersistentContext(dir, {
    baseURL: "http://localhost:3000",
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await run(page, ctx);
  } finally {
    await ctx.close();
  }
}

function idOf<T extends { id: string }>(rows: unknown[], pick: (row: T) => boolean): string {
  const row = (rows as T[]).find(pick);
  expect(row, "record to find").toBeDefined();
  return row!.id;
}

test.beforeAll(() => {
  expect(PROFILE, "CHAIN_PROFILE").not.toBe("");
  expect(OUT, "CHAIN_OUT").not.toBe("");
  mkdirSync(OUT, { recursive: true });
});

test("v01: v0.1 build makes WE-5, measures it, scales to version 2, exports format 1", async () => {
  test.skip(PHASE !== "v01");
  await withProfile(PROFILE, async (page) => {
    await buildWE5(page);
    await enterWE8(page);
    await expectWE8Figures(page);
    await scaleToTen(page);
    const { backup } = await exportTo(page, "v01-backup.json");
    expect(backup.formatVersion).toBe(1);
    expect(backup.counts).toEqual({ materials: 4, formulas: 1, formulaVersions: 2, measurements: 1 });
    const end = await dump(page);
    expect(end.version).toBe(10);
    save("dump-v01-end.json", end);
    console.log("v01 end", JSON.stringify(counts(end)));
  });
});

test("bt: BatchTrace build keeps v0.1 data and adds batches from versions 1 and 2", async () => {
  test.skip(PHASE !== "bt");
  await withProfile(PROFILE, async (page) => {
    await openApp(page);
    const open = await dump(page);
    save("dump-bt-open.json", open);
    const log: string[] = [];
    expectPreserved(load("dump-v01-end.json"), open, 20, log);
    console.log("bt upgrade:\n  " + log.join("\n  "));

    const v1 = idOf<{ id: string; number: number }>(open.stores.formulaVersions, (v) => v.number === 1);
    const v2 = idOf<{ id: string; number: number }>(open.stores.formulaVersions, (v) => v.number === 2);

    // The upgraded version 1 keeps its measured weight.
    const formulaId = (open.stores.formulas[0] as { id: string }).id;
    await page.goto(`/formulas/${formulaId}/versions/${v1}`);
    await expect(measuredInput(page, "Soy 464")).toHaveValue("1003.2", { timeout: SLOW });

    for (const [version, label, daysAgo] of [
      [v1, "BT-01", 10],
      [v2, "BT-02", 3],
    ] as const) {
      await page.goto(`/batches/new?version=${version}`);
      await waitForHeading(page, "Create batch");
      await productionDate(page).fill(isoOffset(-daysAgo));
      await batchLabel(page).fill(label);
      if (label === "BT-01") await visible(page.getByLabel("Measured weight for Soy 464")).fill("1003.2");
      await submitCreate(page);
      await waitForHeading(page, label);
    }
    const end = await dump(page);
    expect(end.stores.batches).toHaveLength(2);
    save("dump-bt-end.json", end);
    await exportTo(page, "bt-backup.json");
    console.log("bt end", JSON.stringify(counts(end)));
  });
});

test("cp: CurePilot build keeps BatchTrace data and adds a cure plan and planned production", async () => {
  test.skip(PHASE !== "cp");
  await withProfile(PROFILE, async (page) => {
    await openApp(page);
    const open = await dump(page);
    save("dump-cp-open.json", open);
    const log: string[] = [];
    expectPreserved(load("dump-bt-end.json"), open, 30, log);
    console.log("cp upgrade:\n  " + log.join("\n  "));

    const bt01 = idOf<{ id: string; label?: string }>(open.stores.batches, (b) => b.label === "BT-01");
    await addCurePlan(page, bt01, {
      cure: "14",
      rows: [
        { kind: "burnTest", label: "First burn", offset: "3" },
        { kind: "check", label: "Check frosting", offset: "7" },
      ],
    });
    await milestoneRow(page, "Check frosting").getByRole("button", { name: /^Mark done/ }).click();
    await expect(milestoneRow(page, "Check frosting")).toContainText("Done on", { timeout: SLOW });

    // Planned production from the formula page (latest version), then Create batch from it.
    const formulaId = (open.stores.formulas[0] as { id: string }).id;
    await planProduction(page, `/formulas/${formulaId}`, { date: isoOffset(5), label: "CP-plan" });
    await visible(page.getByRole("link", { name: "Create batch" })).click();
    await waitForHeading(page, "Create batch");
    await batchLabel(page).fill("CP-03");
    await submitCreate(page);
    await waitForHeading(page, "CP-03");

    await openSchedule(page);
    const end = await dump(page);
    expect(end.stores.curePlans).toHaveLength(1);
    expect(end.stores.productionPlans).toHaveLength(1);
    expect((end.stores.productionPlans[0] as { batchId: string | null }).batchId).not.toBeNull();
    expect(end.stores.batches).toHaveLength(3);
    save("dump-cp-end.json", end);
    const { backup } = await exportTo(page, "cp-backup.json");
    expect(backup.formatVersion).toBe(3);
    console.log("cp end", JSON.stringify(counts(end)));
  });
});

test("bm: BurnMatrix build keeps CurePilot data and records a linked burn test with photos", async () => {
  test.skip(PHASE !== "bm");
  await withProfile(PROFILE, async (page) => {
    await openApp(page);
    const open = await dump(page);
    save("dump-bm-open.json", open);
    const log: string[] = [];
    expectPreserved(load("dump-cp-end.json"), open, 40, log);
    console.log("bm upgrade:\n  " + log.join("\n  "));

    const bt01 = idOf<{ id: string; label?: string }>(open.stores.batches, (b) => b.label === "BT-01");
    const sessionId = await createSession(page, bt01, {
      date: isoOffset(0),
      label: "Chain burn",
      planned: "First burn",
      candles: [
        {
          label: "A",
          wickText: "Generated wick 1",
          burns: [{ minutes: "240", before: "250.00", after: "238.50", soot: "None seen" }],
        },
      ],
      conclusion: "Maker's own words.",
    });
    await expect(page.getByText("11.50 g").first()).toBeVisible({ timeout: SLOW });
    await expect(page.getByText("2.88 g/h").first()).toBeVisible({ timeout: SLOW });
    await addPhotos(page, 2);

    // The planned burn test is marked done on the test date, and every earlier link still opens.
    const end = await dump(page);
    const plan = end.stores.curePlans[0] as { milestones: { label?: string; doneOn: string | null }[] };
    expect(plan.milestones.find((m) => m.label === "First burn")?.doneOn).toBe(isoOffset(0));
    expect(plan.milestones.find((m) => m.label === "Check frosting")?.doneOn).not.toBeNull();
    const session = end.stores.burnSessions[0] as { id: string; batchId: string; milestoneId: string | null };
    expect(session.id).toBe(sessionId);
    expect(session.batchId).toBe(bt01);
    expect(session.milestoneId).not.toBeNull();
    expect(end.stores.burnPhotos).toHaveLength(2);
    save("dump-bm-end.json", end);

    const batches = end.stores.batches as { id: string; versionId: string; label?: string }[];
    const versions = end.stores.formulaVersions as { id: string; number: number }[];
    const numberOf = (b: { versionId: string }) => versions.find((v) => v.id === b.versionId)?.number;
    expect(Object.fromEntries(batches.map((b) => [b.label, numberOf(b)]))).toEqual({
      "BT-01": 1,
      "BT-02": 2,
      "CP-03": 2,
    });
    await openSchedule(page);
    const { backup } = await exportTo(page, "bm-backup.json");
    expect(backup.formatVersion).toBe(4);
    expect(backup.counts).toMatchObject({ batches: 3, curePlans: 1, productionPlans: 1, burnSessions: 1, burnPhotos: 2 });
    console.log("bm end", JSON.stringify(counts(end)));
  });
});

for (const [phase, file, expected] of [
  ["restore01", "v01-backup.json", { materials: 4, formulas: 1, formulaVersions: 2, measurements: 1 }],
  [
    "restore03",
    "cp-backup.json",
    { materials: 4, formulas: 1, formulaVersions: 2, measurements: 1, batches: 3, curePlans: 1, productionPlans: 1 },
  ],
  [
    "restore04",
    "bm-backup.json",
    { batches: 3, curePlans: 1, productionPlans: 1, burnSessions: 1, burnPhotos: 2 },
  ],
] as const) {
  test(`${phase}: the final build restores ${file} into a fresh profile`, async () => {
    test.skip(PHASE !== phase);
    await withProfile(PROFILE, async (page) => {
      await restoreFile(page, join(OUT, file), false);
      await openApp(page);
      const after = await dump(page);
      expect(after.version).toBe(40);
      expect(counts(after)).toMatchObject(expected);
      // Every record in the file is on the device as written (versions may only
      // differ in their display numbers, which a fresh profile never changes).
      const source = JSON.parse(readFileSync(join(OUT, file), "utf8")) as {
        data: Record<string, { id: string }[]>;
      };
      for (const store of DATA_STORES) {
        const rows = source.data[store];
        if (!rows) continue;
        const ids = (after.stores[store] as { id: string }[]).map((r) => r.id).sort();
        expect(ids, `${store} ids`).toEqual(rows.map((r) => r.id).sort());
      }
      if (phase === "restore04") {
        const fileShas = (source.data.burnPhotos as unknown as { sha256: string }[]).map((p) => p.sha256).sort();
        const deviceShas = (after.stores.burnPhotos as { bytes: { sha256: string } }[])
          .map((p) => p.bytes.sha256)
          .sort();
        expect(deviceShas, "photo bytes match their SHA-256").toEqual(fileShas);
        const session = after.stores.burnSessions[0] as { id: string };
        await page.goto(`/burn-tests/${session.id}`);
        await expect(page.getByText("2 of 12", { exact: true })).toBeVisible({ timeout: SLOW });
        await expect(page.getByText("11.50 g").first()).toBeVisible({ timeout: SLOW });
      } else {
        // A batch can be made from the restored version 1.
        const v1 = idOf<{ id: string; number: number }>(after.stores.formulaVersions, (v) => v.number === 1);
        await page.goto(`/batches/new?version=${v1}`);
        await waitForHeading(page, "Create batch");
        await batchLabel(page).fill(`${phase}-batch`);
        await submitCreate(page);
      }
      save(`dump-${phase}.json`, await dump(page));
      console.log(`${phase}`, JSON.stringify(counts(after)));
    });
  });
}
