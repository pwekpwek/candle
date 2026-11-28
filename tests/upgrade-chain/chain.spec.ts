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
  openBatch,
  openSchedule,
  planProduction,
  productionDate,
  restoreFile,
  submitCreate,
  visible,
  waitForHeading,
} from "../e2e/helpers-schedule";
import { addPhotos, createSession } from "../e2e/helpers-burn";
import { addInvestigationPhotos, createExperiment, recordInvestigation, reviseAndMakeBatch } from "../e2e/helpers-candlefix";
import {
  batchRows,
  createLot,
  createSupplier,
  lotDetailRow,
  openBatches,
  saveBatchChanges,
  setBatchLot,
} from "../e2e/helpers-lots";
import { recordCostThroughScreens } from "../e2e/helpers-cost";

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
  "suppliers",
  "materialLots",
  "investigations",
  "investigationPhotos",
  "correctiveExperiments",
  "costItems",
  "costSheets",
] as const;

/** IndexedDB version of the final build the restore phases run on (v0.3 TrueCandle Cost: schema 7). */
const FINAL_IDB_VERSION = 70;

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
    for (const photo of [...(stores.burnPhotos ?? []), ...(stores.investigationPhotos ?? [])] as Record<string, unknown>[]) {
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

/**
 * v0.3 schema 4 -> 5 check, in its own fresh profile (`run-v03.sh`): the v0.2
 * integration build (c922234, schema 4) makes WE-5, a batch with a cure plan,
 * and a linked burn test with a photo, then exports format 4.
 */
test("v02: v0.2 integration build makes a batch with a cure plan and a burn test with a photo", async () => {
  test.skip(PHASE !== "v02");
  await withProfile(PROFILE, async (page) => {
    await buildWE5(page);
    const start = await dump(page);
    const v1 = idOf<{ id: string; number: number }>(start.stores.formulaVersions, (v) => v.number === 1);
    await page.goto(`/batches/new?version=${v1}`);
    await waitForHeading(page, "Create batch");
    await productionDate(page).fill(isoOffset(-10));
    await batchLabel(page).fill("V02-01");
    await submitCreate(page);
    await waitForHeading(page, "V02-01");
    const batchId = idOf<{ id: string; label?: string }>((await dump(page)).stores.batches, (b) => b.label === "V02-01");
    await addCurePlan(page, batchId, { cure: "14", rows: [{ kind: "burnTest", label: "First burn", offset: "3" }] });
    await createSession(page, batchId, {
      date: isoOffset(0),
      label: "V02 burn",
      planned: "First burn",
      candles: [
        { label: "A", wickText: "Generated wick 1", burns: [{ minutes: "240", before: "250.00", after: "238.50", soot: "None seen" }] },
      ],
      conclusion: "Maker's own words.",
    });
    await addPhotos(page, 1);
    const end = await dump(page);
    expect(end.version).toBe(40);
    expect(end.stores.batches).toHaveLength(1);
    expect(end.stores.curePlans).toHaveLength(1);
    expect(end.stores.burnSessions).toHaveLength(1);
    expect(end.stores.burnPhotos).toHaveLength(1);
    save("dump-v02-end.json", end);
    const { backup } = await exportTo(page, "v02-backup.json");
    expect(backup.formatVersion).toBe(4);
    console.log("v02 end", JSON.stringify(counts(end)));
  });
});

/**
 * v0.3 final build (`run-v03.sh`), same profile as the `v02` phase: the schema 5
 * upgrade keeps every v0.2 record, then suppliers, lots and a lot link are
 * added with the screens, and a format 5 backup is exported for `restore05`.
 */
test("lots: v0.3 build keeps the v0.2 profile and records suppliers, lots and lot links", async () => {
  test.skip(PHASE !== "lots");
  await withProfile(PROFILE, async (page) => {
    await openApp(page);
    const open = await dump(page);
    save("dump-lots-open.json", open);
    const log: string[] = [];
    expectPreserved(load("dump-v02-end.json"), open, 50, log);
    console.log("lots upgrade:\n  " + log.join("\n  "));

    const before = open.stores.batches as { id: string; label?: string; versionId: string }[];
    const v02 = before.find((b) => b.label === "V02-01");
    expect(v02, "the V02-01 batch").toBeDefined();
    const batchId = v02!.id;
    const versionId = v02!.versionId;

    await createSupplier(page, "Example Wax Co");
    await createLot(page, { material: WE5.wax, supplier: "Example Wax Co", code: "LOT-TEST-001" });

    // Link it from the batch's edit form and save.
    await openBatch(page, batchId, "V02-01");
    await setBatchLot(page, WE5.wax, "LOT-TEST-001");
    await saveBatchChanges(page);
    await openBatch(page, batchId, "V02-01");
    const waxRow = lotDetailRow(page, WE5.wax);
    await expect(waxRow).toContainText("LOT-TEST-001", { timeout: SLOW });
    await expect(waxRow).toContainText("Example Wax Co");

    // Search finds the batch by the lot code.
    await openBatches(page, "?q=LOT-TEST-001");
    await expect(batchRows(page)).toHaveCount(1, { timeout: SLOW });
    await expect(batchRows(page).first()).toContainText("V02-01");

    const end = await dump(page);
    expect(end.stores.suppliers).toHaveLength(1);
    expect(end.stores.materialLots).toHaveLength(1);
    const batch = (end.stores.batches as { id: string; lots?: unknown[] }[]).find((b) => b.id === batchId);
    expect(batch?.lots).toHaveLength(1);
    // The cure plan and the burn test the v0.2 build made are untouched.
    expect(end.stores.curePlans).toEqual(open.stores.curePlans);
    expect(end.stores.burnSessions).toEqual(open.stores.burnSessions);
    expect(end.stores.burnPhotos).toEqual(open.stores.burnPhotos);
    save("dump-lots-end.json", end);

    // A second batch without lots, so the restore phase has two batches.
    await page.goto(`/batches/new?version=${versionId}`);
    await waitForHeading(page, "Create batch");
    await productionDate(page).fill(isoOffset(-1));
    await batchLabel(page).fill("V03-02");
    await submitCreate(page);
    await waitForHeading(page, "V03-02");

    const { backup } = await exportTo(page, "lots-backup.json");
    expect(backup.formatVersion).toBe(5);
    expect(backup.counts).toMatchObject({ batches: 2, suppliers: 1, materialLots: 1 });
    console.log("lots end", JSON.stringify(counts(end)));
  });
});

/**
 * v0.3 CandleFix (`run-candlefix.sh`), phase 1 on the restore-fix build
 * (db1730d, schema 5) in a fresh profile: a batch with a lot, a cure plan and
 * a burn test with a photo, made with the screens; a format 5 backup.
 */
test("v03fix: restore-fix build makes a batch with a lot, a cure plan and a burn test with a photo", async () => {
  test.skip(PHASE !== "v03fix");
  await withProfile(PROFILE, async (page) => {
    await buildWE5(page);
    const start = await dump(page);
    const v1 = idOf<{ id: string; number: number }>(start.stores.formulaVersions, (v) => v.number === 1);
    await createSupplier(page, "Example Wax Co");
    await createLot(page, { material: WE5.wax, supplier: "Example Wax Co", code: "LOT-FIX-001" });
    await page.goto(`/batches/new?version=${v1}`);
    await waitForHeading(page, "Create batch");
    await productionDate(page).fill(isoOffset(-10));
    await batchLabel(page).fill("FIX-01");
    await submitCreate(page);
    await waitForHeading(page, "FIX-01");
    const batchId = idOf<{ id: string; label?: string }>((await dump(page)).stores.batches, (b) => b.label === "FIX-01");
    await openBatch(page, batchId, "FIX-01");
    await setBatchLot(page, WE5.wax, "LOT-FIX-001");
    await saveBatchChanges(page);
    await addCurePlan(page, batchId, { cure: "14", rows: [{ kind: "burnTest", label: "First burn", offset: "3" }] });
    await createSession(page, batchId, {
      date: isoOffset(-2),
      label: "Fix burn",
      planned: "First burn",
      candles: [
        { label: "A", wickText: "Generated wick 1", burns: [{ minutes: "240", before: "250.00", after: "238.50", soot: "None seen" }] },
      ],
      conclusion: "Maker's own words.",
    });
    await addPhotos(page, 1);
    const end = await dump(page);
    expect(end.version).toBe(50);
    expect(end.stores.batches).toHaveLength(1);
    expect((end.stores.batches[0] as { lots?: unknown[] }).lots).toHaveLength(1);
    expect(end.stores.curePlans).toHaveLength(1);
    expect(end.stores.burnSessions).toHaveLength(1);
    expect(end.stores.burnPhotos).toHaveLength(1);
    expect(end.stores.investigations, "schema 5 has no CandleFix stores").toBeUndefined();
    save("dump-v03fix-end.json", end);
    const { backup } = await exportTo(page, "v03fix-backup.json");
    expect(backup.formatVersion).toBe(5);
    console.log("v03fix end", JSON.stringify(counts(end)));
  });
});

/**
 * v0.3 CandleFix (`run-candlefix.sh`), phase 2 on this build, same profile as
 * `v03fix`: the schema 6 upgrade keeps every schema 5 record (photo bytes by
 * SHA-256), then an investigation with two generated photos and a corrective
 * experiment on a follow-up batch are recorded with the screens, and a format 6
 * backup is exported for `restore06`.
 */
test("candlefix: CandleFix build keeps the schema 5 profile and records an investigation, photos and an experiment", async () => {
  test.skip(PHASE !== "candlefix");
  await withProfile(PROFILE, async (page) => {
    await openApp(page);
    const open = await dump(page);
    save("dump-candlefix-open.json", open);
    const log: string[] = [];
    expectPreserved(load("dump-v03fix-end.json"), open, 60, log);
    console.log("candlefix upgrade:\n  " + log.join("\n  "));

    const batch = (open.stores.batches as { id: string; label?: string; formulaId: string }[]).find((b) => b.label === "FIX-01");
    expect(batch, "the FIX-01 batch").toBeDefined();
    const investigationId = await recordInvestigation(page, batch!.id, {
      date: isoOffset(-1),
      title: "Upgrade check",
      issues: ["tunneling", "other"],
      other: "Generated test issue",
      notes: "Made-up observation for the upgrade check.",
      checks: [{ itemId: "tunneling.first-burn-length", note: "Generated note" }],
      hypotheses: [{ text: "Generated hypothesis one" }, { text: "Generated hypothesis two", status: "Being tested" }],
    });
    await addInvestigationPhotos(page, 2);
    const followId = await reviseAndMakeBatch(page, `/formulas/${batch!.formulaId}`, 2, { label: "FIX-02", daysAgo: 1 });
    await createSession(page, followId, {
      date: isoOffset(0),
      label: "Follow-up burn",
      candles: [{ label: "B", wickText: "Generated wick 2", burns: [{ minutes: "180", before: "250.00", after: "240.00" }] }],
    });
    await createExperiment(page, investigationId, { hypothesis: 1, batchTitle: "FIX-02", burnTests: ["Follow-up burn"], change: "Generated change" });
    await page.goto(`/investigations/${investigationId}/compare`);
    await waitForHeading(page, "Before and after");

    const end = await dump(page);
    expect(end.stores.investigations).toHaveLength(1);
    expect(end.stores.investigationPhotos).toHaveLength(2);
    expect(end.stores.correctiveExperiments).toHaveLength(1);
    // Everything the schema 5 build made is untouched by the CandleFix work.
    for (const store of ["curePlans", "burnPhotos", "suppliers", "materialLots"]) {
      expect(end.stores[store], store).toEqual(open.stores[store]);
    }
    expect(end.stores.batches.find((b) => (b as { id: string }).id === batch!.id)).toEqual(
      open.stores.batches.find((b) => (b as { id: string }).id === batch!.id),
    );
    save("dump-candlefix-end.json", end);
    const { backup } = await exportTo(page, "candlefix-backup.json");
    expect(backup.formatVersion).toBe(6);
    expect(backup.schemaVersion).toBe(6);
    expect(backup.counts).toMatchObject({ investigations: 1, investigationPhotos: 2, correctiveExperiments: 1, batches: 2 });
    console.log("candlefix end", JSON.stringify(counts(end)));
  });
});

/**
 * v0.3 TrueCandle Cost (`run-cost.sh`), phase 1 on the CandleFix build
 * (ac75476, schema 6): WE-5, a supplier and lot, batch "C6-01" with the wax lot,
 * a burn test with a generated photo, and an investigation with a generated
 * photo, all with the screens; a format 6 backup for `restore06c`.
 */
test("fix6: CandleFix build makes a batch with a lot, a burn test with a photo and an investigation", async () => {
  test.skip(PHASE !== "fix6");
  await withProfile(PROFILE, async (page) => {
    await buildWE5(page);
    const start = await dump(page);
    const v1 = idOf<{ id: string; number: number }>(start.stores.formulaVersions, (v) => v.number === 1);
    await createSupplier(page, "Example Wax Co");
    await createLot(page, { material: WE5.wax, supplier: "Example Wax Co", code: "LOT-C6-001" });
    await page.goto(`/batches/new?version=${v1}`);
    await waitForHeading(page, "Create batch");
    await productionDate(page).fill(isoOffset(-10));
    await batchLabel(page).fill("C6-01");
    await submitCreate(page);
    await waitForHeading(page, "C6-01");
    const batchId = idOf<{ id: string; label?: string }>((await dump(page)).stores.batches, (b) => b.label === "C6-01");
    await openBatch(page, batchId, "C6-01");
    await setBatchLot(page, WE5.wax, "LOT-C6-001");
    await saveBatchChanges(page);
    await createSession(page, batchId, {
      date: isoOffset(-3),
      label: "C6 burn",
      candles: [{ label: "A", wickText: "Generated wick 1", burns: [{ minutes: "240", before: "250.00", after: "238.50", soot: "None seen" }] }],
    });
    await addPhotos(page, 1);
    await recordInvestigation(page, batchId, {
      date: isoOffset(-1),
      title: "Schema 6 issue",
      issues: ["tunneling"],
      notes: "Made-up observation for the upgrade check.",
      checks: [{ itemId: "tunneling.first-burn-length", note: "Generated note" }],
      hypotheses: [{ text: "Generated hypothesis" }],
    });
    await addInvestigationPhotos(page, 1);
    const end = await dump(page);
    expect(end.version).toBe(60);
    expect((end.stores.batches[0] as { lots?: unknown[] }).lots).toHaveLength(1);
    expect(end.stores.burnPhotos).toHaveLength(1);
    expect(end.stores.investigations).toHaveLength(1);
    expect(end.stores.investigationPhotos).toHaveLength(1);
    expect(end.stores.costSheets, "schema 6 has no cost stores").toBeUndefined();
    save("dump-fix6-end.json", end);
    const { backup } = await exportTo(page, "fix6-backup.json");
    expect(backup.formatVersion).toBe(6);
    console.log("fix6 end", JSON.stringify(counts(end)));
  });
});

/**
 * v0.3 TrueCandle Cost, phase 2 on this build, same profile as `fix6`: the
 * schema 7 upgrade keeps every schema 6 record (photo bytes by SHA-256); then
 * a material price, a lot purchase, candle counts on C6-01 and a batch cost
 * sheet are recorded with the screens, and a format 7 backup is exported for
 * `restore07`.
 */
test("cost7: TrueCandle Cost build keeps the schema 6 profile and records prices, counts and a cost sheet", async () => {
  test.skip(PHASE !== "cost7");
  await withProfile(PROFILE, async (page) => {
    await openApp(page);
    const open = await dump(page);
    save("dump-cost7-open.json", open);
    const log: string[] = [];
    expectPreserved(load("dump-fix6-end.json"), open, 70, log);
    console.log("cost7 upgrade:\n  " + log.join("\n  "));
    const batch = (open.stores.batches as { id: string; label?: string }[]).find((b) => b.label === "C6-01");
    expect(batch, "the C6-01 batch").toBeDefined();

    await recordCostThroughScreens(page, batch!.id);

    const end = await dump(page);
    expect(end.stores.costSheets).toHaveLength(1);
    const sheet = end.stores.costSheets[0] as { batchId: string; candlesMade: number; sellable: number; materials: { price: { source: string } }[] };
    expect(sheet).toMatchObject({ batchId: batch!.id, candlesMade: 6, sellable: 5 });
    expect(sheet.materials[0]!.price.source).toBe("lot");
    // The schema 6 records other than C6-01 (counts added), its lot (purchase added) and the wax (price added) are untouched.
    for (const store of ["burnSessions", "burnPhotos", "suppliers", "investigations", "investigationPhotos", "formulaVersions"]) {
      expect(end.stores[store], store).toEqual(open.stores[store]);
    }
    save("dump-cost7-end.json", end);
    const { backup } = await exportTo(page, "cost7-backup.json");
    expect(backup.formatVersion).toBe(7);
    expect(backup.schemaVersion).toBe(7);
    expect(backup.counts).toMatchObject({ costSheets: 1, investigations: 1, investigationPhotos: 1, burnPhotos: 1 });
    console.log("cost7 end", JSON.stringify(counts(end)));
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
  // v0.3: the format 4 file the v0.2 integration build made in the `v02` phase,
  // and the format 5 file this build made in the `lots` phase.
  [
    "restore04v02",
    "v02-backup.json",
    { batches: 1, curePlans: 1, burnSessions: 1, burnPhotos: 1, suppliers: 0, materialLots: 0 },
  ],
  [
    "restore05",
    "lots-backup.json",
    { batches: 2, curePlans: 1, burnSessions: 1, burnPhotos: 1, suppliers: 1, materialLots: 1 },
  ],
  // v0.3 CandleFix: the format 5 file the restore-fix build made in `v03fix`.
  [
    "restore05fix",
    "v03fix-backup.json",
    { batches: 1, curePlans: 1, burnSessions: 1, burnPhotos: 1, suppliers: 1, materialLots: 1, investigations: 0 },
  ],
  // v0.3 CandleFix: the format 6 file this build made in `candlefix`, with investigation photos.
  [
    "restore06",
    "candlefix-backup.json",
    { batches: 2, burnSessions: 2, burnPhotos: 1, investigations: 1, investigationPhotos: 2, correctiveExperiments: 1 },
  ],
  // v0.3 TrueCandle Cost: the format 6 file the CandleFix build made in `fix6`,
  // and the format 7 file this build made in `cost7`, with a cost sheet.
  [
    "restore06c",
    "fix6-backup.json",
    { batches: 1, burnSessions: 1, burnPhotos: 1, investigations: 1, investigationPhotos: 1, costItems: 0, costSheets: 0 },
  ],
  [
    "restore07",
    "cost7-backup.json",
    { batches: 1, burnSessions: 1, burnPhotos: 1, investigations: 1, investigationPhotos: 1, costSheets: 1 },
  ],
] as const) {
  test(`${phase}: the final build restores ${file} into a fresh profile`, async () => {
    test.skip(PHASE !== phase);
    await withProfile(PROFILE, async (page) => {
      await restoreFile(page, join(OUT, file), false);
      await openApp(page);
      const after = await dump(page);
      expect(after.version).toBe(FINAL_IDB_VERSION);
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
      if ((source.data.investigationPhotos ?? []).length > 0) {
        const fileShas = (source.data.investigationPhotos as unknown as { sha256: string }[]).map((p) => p.sha256).sort();
        const deviceShas = (after.stores.investigationPhotos as { bytes: { sha256: string } }[])
          .map((p) => p.bytes.sha256)
          .sort();
        expect(deviceShas, "investigation photo bytes match their SHA-256").toEqual(fileShas);
        // Every CandleFix record is on the device exactly as written.
        for (const store of ["investigations", "correctiveExperiments"]) {
          expect(after.stores[store], store).toEqual(source.data[store]);
        }
        const investigation = after.stores.investigations[0] as { id: string; title?: string };
        const experiments = (source.data.correctiveExperiments ?? []).length;
        if (experiments > 0) {
          await page.goto(`/investigations/${investigation.id}/compare`);
          await waitForHeading(page, "Before and after");
          // The original batch plus one column per corrective experiment in the file.
          await expect(page.getByTestId("before-after-column")).toHaveCount(1 + experiments, { timeout: SLOW });
        } else {
          // No experiment to compare: the investigation page opens with its observations.
          await page.goto(`/investigations/${investigation.id}`);
          await expect(page.getByText(investigation.title ?? "").first()).toBeVisible({ timeout: SLOW });
        }
      }
      if ((source.data.burnPhotos ?? []).length > 0) {
        const fileShas = (source.data.burnPhotos as unknown as { sha256: string }[]).map((p) => p.sha256).sort();
        const deviceShas = (after.stores.burnPhotos as { bytes: { sha256: string } }[])
          .map((p) => p.bytes.sha256)
          .sort();
        expect(deviceShas, "photo bytes match their SHA-256").toEqual(fileShas);
      }
      if (phase === "restore07" || phase === "restore06c") {
        // Every record in the file is on the device exactly as written, prices, counts and sheets included.
        for (const store of ["materials", "materialLots", "batches", "investigations", "costItems", "costSheets"]) {
          expect(after.stores[store], store).toEqual(source.data[store] ?? []);
        }
      }
      if (phase === "restore07") {
        const sheet = after.stores.costSheets[0] as { id: string };
        await page.goto(`/costs/${sheet.id}`);
        await expect(page.getByTestId("cost-per-sellable")).toBeVisible({ timeout: SLOW });
      }
      if (phase === "restore05" || phase === "restore05fix") {
        // Every lot link in the file is on the device as written.
        const fileBatches = source.data.batches as unknown as { id: string; lots?: unknown[] }[];
        const deviceBatches = after.stores.batches as { id: string; lots?: unknown[] }[];
        for (const batch of fileBatches) {
          expect(deviceBatches.find((b) => b.id === batch.id)?.lots, `lots of ${batch.id}`).toEqual(batch.lots);
        }
      }
      if (phase === "restore04") {
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
