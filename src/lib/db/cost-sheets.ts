import { CostSheetSchema, batchLotSlot } from "@/lib/schemas";
import type {
  Batch,
  CostItemLine,
  CostMaterialLine,
  CostPrice,
  CostSheet,
  Formula,
  FormulaVersion,
  MaterialType,
} from "@/lib/types";
import type {
  CandleDatabase,
  CostItemLineInput,
  CostSheetInput,
  CostSheetListItem,
  CostSheetsRepo,
} from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";
import { cleanOptional } from "./suppliers";

/**
 * Cost sheets (v0.3 TrueCandle Cost). Design: docs/v0.3-cost.md, "Building a
 * sheet (snapshot rules)" and "Archive and delete rules".
 */

/** Newest created first, then id. */
function sheetOrder(a: CostSheet, b: CostSheet): number {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

type Slot = { key: string; materialId: string; materialType: MaterialType; name: string; componentId?: string };

/** The version's components in its order: wax rows, oil rows, the wick, the vessel. */
function slotsOf(version: FormulaVersion): Slot[] {
  const { waxes, oils, wick, vessel } = version.inputs;
  const slots: Slot[] = [...waxes, ...oils].map((row) => ({
    key: batchLotSlot({ part: "row", componentId: row.componentId }),
    materialId: row.materialId,
    materialType: row.snapshot.type,
    name: row.snapshot.name,
    componentId: row.componentId,
  }));
  if (wick) slots.push({ key: "wick", materialId: wick.materialId, materialType: "wick", name: wick.snapshot.name });
  if (vessel) {
    slots.push({ key: "vessel", materialId: vessel.materialId, materialType: "vessel", name: vessel.snapshot.name });
  }
  return slots;
}

function samePrice(a: CostPrice, b: CostPrice): boolean {
  if (a.source !== b.source) return false;
  switch (a.source) {
    case "lot": {
      const other = b as Extract<CostPrice, { source: "lot" }>;
      return (
        a.lotId === other.lotId &&
        a.lotCode === other.lotCode &&
        a.paidCentavos === other.paidCentavos &&
        a.quantity === other.quantity
      );
    }
    case "material":
    case "sheet":
      return a.unitCentavos === (b as { unitCentavos: number }).unitCentavos;
    case "none":
      return true;
  }
}

/**
 * The material lines of a sheet built from current data, in the version's
 * order. `previous` is the sheet being copied: its pieces per candle and its
 * typed prices are kept. Only Dexie operations are awaited.
 */
async function buildLines(
  db: CandleDatabase,
  version: FormulaVersion,
  batch: Batch | null,
  previous: CostSheet | null,
): Promise<CostMaterialLine[]> {
  const previousByKey = new Map((previous?.materials ?? []).map((line) => [line.key, line]));
  const lotByKey = new Map((batch?.lots ?? []).map((link) => [batchLotSlot(link), link]));
  const measured = new Map((batch?.entries ?? []).map((entry) => [entry.componentId, entry.actualMg]));
  const planned = new Map(version.targets.components.map((target) => [target.componentId, target.targetMg]));
  const lines: CostMaterialLine[] = [];
  for (const slot of slotsOf(version)) {
    const before = previousByKey.get(slot.key);
    let quantity: CostMaterialLine["quantity"];
    if (slot.componentId !== undefined) {
      const actual = measured.get(slot.componentId);
      quantity =
        actual !== undefined
          ? { unit: "mg", mg: actual, from: "measured" }
          : { unit: "mg", mg: planned.get(slot.componentId) ?? 0, from: "planned" };
    } else {
      quantity = { unit: "piece", perCandle: before?.quantity.unit === "piece" ? before.quantity.perCandle : 1 };
    }

    let price: CostPrice = { source: "none" };
    if (before?.price.source === "sheet") {
      price = before.price;
    } else {
      const link = lotByKey.get(slot.key);
      const lot = link ? await db.materialLots.get(link.lotId) : undefined;
      if (lot?.purchase) {
        price = {
          source: "lot",
          lotId: lot.id,
          lotCode: lot.code,
          paidCentavos: lot.purchase.paidCentavos,
          quantity: lot.purchase.quantity,
        };
      } else {
        const material = await db.materials.get(slot.materialId);
        if (material?.defaultPriceCentavos !== undefined) {
          price = { source: "material", unitCentavos: material.defaultPriceCentavos };
        }
      }
    }
    lines.push({
      key: slot.key,
      materialId: slot.materialId,
      materialType: slot.materialType,
      name: slot.name,
      quantity,
      price,
    });
  }
  return lines;
}

/** Trimmed item line fields as the schema checks them. */
function itemLine(id: string, itemId: string | null, input: CostItemLineInput): CostItemLine {
  return {
    id,
    itemId,
    name: typeof input.name === "string" ? input.name.trim() : input.name,
    unitCentavos: input.unitCentavos,
    per: input.per,
    quantity: input.quantity,
  };
}

function optionalFields(title: string | undefined, notes: string | undefined) {
  const t = cleanOptional(title);
  const n = cleanOptional(notes);
  return { ...(t !== undefined ? { title: t } : {}), ...(n !== undefined ? { notes: n } : {}) };
}

export function createCostSheetsRepo(db: CandleDatabase, now: () => string, newId: () => string): CostSheetsRepo {
  const readStores = () => [db.costSheets, db.formulas, db.formulaVersions, db.batches];

  /** Joins sheets with their formula, version and batch. A sheet whose links are broken is left out (damaged data). */
  async function withLinks(sheets: CostSheet[]): Promise<CostSheetListItem[]> {
    const [formulas, versions, batches] = await Promise.all([
      db.formulas.bulkGet([...new Set(sheets.map((sheet) => sheet.formulaId))]),
      db.formulaVersions.bulkGet([...new Set(sheets.map((sheet) => sheet.versionId))]),
      db.batches.bulkGet([...new Set(sheets.flatMap((sheet) => (sheet.batchId === null ? [] : [sheet.batchId])))]),
    ]);
    const formulaById = new Map(formulas.filter((f): f is Formula => f !== undefined).map((f) => [f.id, f]));
    const versionById = new Map(versions.filter((v): v is FormulaVersion => v !== undefined).map((v) => [v.id, v]));
    const batchById = new Map(batches.filter((b): b is Batch => b !== undefined).map((b) => [b.id, b]));
    const items: CostSheetListItem[] = [];
    for (const sheet of sheets) {
      const formula = formulaById.get(sheet.formulaId);
      const version = versionById.get(sheet.versionId);
      const batch = sheet.batchId === null ? null : (batchById.get(sheet.batchId) ?? undefined);
      if (formula && version && batch !== undefined) items.push({ sheet, formula, version, batch });
    }
    return items;
  }

  return {
    list: (filter) =>
      guard(() =>
        db.transaction("r", readStores(), async () => {
          let sheets: CostSheet[];
          if (filter?.batchId !== undefined) sheets = await db.costSheets.where("batchId").equals(filter.batchId).toArray();
          else if (filter?.formulaId !== undefined) {
            sheets = await db.costSheets.where("formulaId").equals(filter.formulaId).toArray();
          } else sheets = await db.costSheets.toArray();
          if (filter?.formulaId !== undefined) sheets = sheets.filter((sheet) => sheet.formulaId === filter.formulaId);
          return withLinks(sheets.sort(sheetOrder));
        }),
      ),

    get: (id) =>
      guard(() =>
        db.transaction("r", readStores(), async () => {
          const sheet = await db.costSheets.get(id);
          if (!sheet) return undefined;
          const [item] = await withLinks([sheet]);
          if (!item) return undefined;
          const copiedFrom = sheet.copiedFromId === null ? null : ((await db.costSheets.get(sheet.copiedFromId)) ?? null);
          return { ...item, copiedFrom };
        }),
      ),

    create: (request) =>
      guard(() =>
        db.transaction(
          "rw",
          [db.costSheets, db.formulas, db.formulaVersions, db.batches, db.materials, db.materialLots, db.meta],
          async () => {
            const already = await db.costSheets.get(request.sheetId);
            if (already) return { sheet: already, created: false };

            let batch: Batch | null = null;
            let versionId: string;
            if (request.basis.kind === "batch") {
              batch = (await db.batches.get(request.basis.batchId)) ?? null;
              if (!batch) throw notFound("Batch", request.basis.batchId);
              versionId = batch.versionId;
            } else {
              versionId = request.basis.versionId;
            }
            const version = await db.formulaVersions.get(versionId);
            if (!version) throw notFound("Version", versionId);
            if (!(await db.formulas.get(version.formulaId))) throw notFound("Formula", version.formulaId);

            const candlesMade = request.candlesMade ?? batch?.candlesMade;
            if (candlesMade === undefined) {
              throw new DataError("invalid", "A cost sheet needs the number of candles made.");
            }
            const sellable =
              request.sellable ?? (request.candlesMade === undefined ? batch?.sellable : undefined) ?? candlesMade;

            const timestamp = now();
            const sheet = parseRecord(
              CostSheetSchema,
              {
                id: request.sheetId,
                ...optionalFields(request.title, undefined),
                basis: request.basis.kind,
                formulaId: version.formulaId,
                versionId: version.id,
                batchId: batch?.id ?? null,
                candlesMade,
                sellable,
                materials: await buildLines(db, version, batch, null),
                items: [],
                labourHoursX100: 0,
                labourRateCentavos: 0,
                overhead: { mode: "fixed", centavos: 0 },
                testingCentavos: 0,
                pricesIncludeVat: false,
                wholesale: null,
                retail: null,
                copiedFromId: null,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
              "cost sheet",
            );
            await db.costSheets.add(sheet);
            await bumpChangeCounter(db);
            return { sheet, created: true };
          },
        ),
      ),

    update: (id, input: CostSheetInput) =>
      guard(() =>
        db.transaction("rw", [db.costSheets, db.costItems, db.meta], async () => {
          const existing = await db.costSheets.get(id);
          if (!existing) throw notFound("Cost sheet", id);

          // Material lines: exactly the stored keys; only pieces and price may change.
          const inputByKey = new Map<string, (typeof input.materials)[number]>();
          for (const line of input.materials) {
            if (inputByKey.has(line.key)) throw new DataError("invalid", `Line ${line.key} is sent twice.`);
            inputByKey.set(line.key, line);
          }
          if (inputByKey.size !== existing.materials.length) {
            throw new DataError("invalid", "A cost sheet's material lines cannot be added or removed.");
          }
          const materials = existing.materials.map((stored): CostMaterialLine => {
            const sent = inputByKey.get(stored.key);
            if (!sent) throw new DataError("invalid", `Line ${stored.key} is missing.`);
            let quantity = stored.quantity;
            if (sent.perCandle !== undefined) {
              if (stored.quantity.unit !== "piece") {
                throw new DataError("invalid", `Line ${stored.key} is weighed; its weight cannot change.`);
              }
              quantity = { unit: "piece", perCandle: sent.perCandle };
            }
            let price = stored.price;
            if (!samePrice(sent.price, stored.price)) {
              if (sent.price.source !== "sheet" && sent.price.source !== "none") {
                throw new DataError("invalid", `Line ${stored.key} can only take a typed price or no price.`);
              }
              price = sent.price.source === "sheet" ? { source: "sheet", unitCentavos: sent.price.unitCentavos } : { source: "none" };
            }
            return { ...stored, quantity, price };
          });

          // Item lines: stored lines keep their id and item link; new ones get a fresh id.
          const storedItems = new Map(existing.items.map((line) => [line.id, line]));
          const seen = new Set<string>();
          const items: CostItemLine[] = [];
          for (const sent of input.items) {
            if (sent.id !== undefined) {
              const stored = storedItems.get(sent.id);
              if (!stored) throw notFound("Item line", sent.id);
              if (seen.has(sent.id)) throw new DataError("invalid", `Item line ${sent.id} is sent twice.`);
              seen.add(sent.id);
              items.push(itemLine(stored.id, stored.itemId, sent));
            } else {
              if (sent.itemId !== null && !(await db.costItems.get(sent.itemId))) throw notFound("Item", sent.itemId);
              items.push(itemLine(newId(), sent.itemId, sent));
            }
          }

          const sheet = parseRecord(
            CostSheetSchema,
            {
              id: existing.id,
              ...optionalFields(input.title, input.notes),
              basis: existing.basis,
              formulaId: existing.formulaId,
              versionId: existing.versionId,
              batchId: existing.batchId,
              candlesMade: input.candlesMade,
              sellable: input.sellable,
              materials,
              items,
              labourHoursX100: input.labourHoursX100,
              labourRateCentavos: input.labourRateCentavos,
              overhead: input.overhead,
              testingCentavos: input.testingCentavos,
              pricesIncludeVat: input.pricesIncludeVat,
              wholesale: input.wholesale,
              retail: input.retail,
              copiedFromId: existing.copiedFromId,
              createdAt: existing.createdAt,
              updatedAt: now(),
            },
            "cost sheet",
          );
          await db.costSheets.put(sheet);
          await bumpChangeCounter(db);
          return sheet;
        }),
      ),

    copy: (request) =>
      guard(() =>
        db.transaction(
          "rw",
          [db.costSheets, db.costItems, db.formulas, db.formulaVersions, db.batches, db.materials, db.materialLots, db.meta],
          async () => {
            const already = await db.costSheets.get(request.sheetId);
            if (already) return { sheet: already, created: false };
            const from = await db.costSheets.get(request.fromId);
            if (!from) throw notFound("Cost sheet", request.fromId);
            const version = await db.formulaVersions.get(from.versionId);
            if (!version) throw notFound("Version", from.versionId);
            let batch: Batch | null = null;
            if (from.batchId !== null) {
              batch = (await db.batches.get(from.batchId)) ?? null;
              if (!batch) throw notFound("Batch", from.batchId);
            }
            // Counts: the batch's when it records them, otherwise the old sheet's.
            const fromBatch = batch?.candlesMade !== undefined;
            const candlesMade = fromBatch ? batch!.candlesMade! : from.candlesMade;
            const sellable = fromBatch ? (batch!.sellable ?? batch!.candlesMade!) : from.sellable;
            // Items picked from the list take the item's current price when it still exists.
            const items: CostItemLine[] = [];
            for (const line of from.items) {
              const item = line.itemId === null ? undefined : await db.costItems.get(line.itemId);
              items.push(item ? { ...line, unitCentavos: item.unitCentavos } : { ...line });
            }
            const timestamp = now();
            const sheet = parseRecord(
              CostSheetSchema,
              {
                ...from,
                id: request.sheetId,
                candlesMade,
                sellable,
                materials: await buildLines(db, version, batch, from),
                items,
                copiedFromId: from.id,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
              "cost sheet",
            );
            await db.costSheets.add(sheet);
            await bumpChangeCounter(db);
            return { sheet, created: true };
          },
        ),
      ),

    delete: (id) =>
      guard(() =>
        db.transaction("rw", db.costSheets, db.meta, async () => {
          if (!(await db.costSheets.get(id))) throw notFound("Cost sheet", id);
          await db.costSheets.delete(id);
          await bumpChangeCounter(db);
        }),
      ),
  };
}
