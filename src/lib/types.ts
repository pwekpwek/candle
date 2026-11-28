/**
 * CandleLab Studio — record types (T02 contract; batches added in v0.2).
 *
 * Source of truth: docs/specs/4 Data Model.md. Changing a shape here is a
 * schema change (DATA-29). Only the orchestrator edits this file.
 *
 * Quantities are integers (DATA-05):
 *   - weights            whole milligrams            (`…Mg`)
 *   - percentages        whole hundredths of 1%      (`…Bp`, 8% = 800)
 *   - parts              whole hundredths of a part  (`…X100`, 3 parts = 300)
 * Timestamps are ISO 8601 strings in UTC (DATA-06). IDs are UUIDs made on the
 * device with crypto.randomUUID() (DATA-01).
 */

export type Basis = "wax" | "total";

/** Rounding step: 1 g, 0.1 g or 0.01 g. */
export type PrecisionMg = 1000 | 100 | 10;

export type MaterialType = "wax" | "fragranceOil" | "wick" | "vessel";

export type WaxDetails = { maxFragranceBp?: number; maxFragranceBasis?: Basis };
export type WickDetails = { size?: string };
export type VesselDetails = { capacityMl?: number; defaultFillMg?: number };

/** Store `materials`. Mutable. Archived, never deleted, once a version uses it. */
export type Material = {
  id: string;
  type: MaterialType;
  /** 1–80 characters after trimming. */
  name: string;
  supplier?: string;
  notes?: string;
  wax?: WaxDetails;
  wick?: WickDetails;
  vessel?: VesselDetails;
  /**
   * v0.3 TrueCandle Cost: the maker's usual price, whole centavos. Per kg for
   * wax and fragrance oil, per piece for wicks and vessels (`priceUnitOf`).
   * Absent when not recorded.
   */
  defaultPriceCentavos?: number;
  createdAt: string;
  updatedAt: string;
  /** Archived materials are hidden from pickers. */
  archivedAt: string | null;
};

/** Store `formulas`. The stable container. Name and notes are mutable. */
export type Formula = {
  id: string;
  name: string;
  notes?: string;
  /** Highest version number under this formula. Used to allocate the next. */
  latestVersionNumber: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/** Copy of a material's details at the moment a version was saved (DATA-03). */
export type MaterialSnapshot = {
  type: MaterialType;
  name: string;
  supplier?: string;
  wax?: WaxDetails;
  wick?: WickDetails;
  vessel?: VesselDetails;
};

export type Component = {
  /** Stable within its version. Fresh for every saved version (DATA-09). */
  componentId: string;
  materialId: string;
  snapshot: MaterialSnapshot;
  partsX100: number;
};

export type Sizing =
  | { mode: "total"; amountMg: number }
  | { mode: "wax"; amountMg: number }
  | { mode: "vessels"; count: number; fillMg: number };

export type SizingMode = Sizing["mode"];

export type LinkedMaterial = { materialId: string; snapshot: MaterialSnapshot };

export type VersionInputs = {
  sizing: Sizing;
  /** Hundredths of a percent. */
  fragranceBp: number;
  basis: Basis;
  precisionMg: PrecisionMg;
  /** 1–5 */
  waxes: Component[];
  /** 0–10. Empty when the formula is unscented (CALC-17). */
  oils: Component[];
  wick: LinkedMaterial | null;
  vessel: LinkedMaterial | null;
  notes?: string;
};

/** Planned weights exactly as shown when the version was saved. */
export type VersionTargets = {
  totalMg: number;
  waxTotalMg: number;
  fragranceTotalMg: number;
  components: { componentId: string; targetMg: number }[];
};

export type VersionOrigin = "initial" | "revision" | "scaled";
export type ScaleMethod = "vesselCount" | "amount" | "multiplier";

export type VersionScale = {
  method: ScaleMethod;
  /** new amount ÷ old amount × 10000, rounded half up. For display only. */
  factorX10000: number;
};

/** Store `formulaVersions`. Write-once (DATA-02, DATA-08). */
export type FormulaVersion = {
  id: string;
  formulaId: string;
  /** 1, 2, 3… unique within a formula. A display label, not identity. */
  number: number;
  /** Set only when the version was renumbered by a restore (DATA-22). */
  originalNumber?: number;
  origin: VersionOrigin;
  /** The version this one was revised or scaled from. */
  parentVersionId: string | null;
  scale: VersionScale | null;
  changeNote?: string;
  createdAt: string;
  inputs: VersionInputs;
  targets: VersionTargets;
  /** Version of the calculation rules used. 1 in v0.1 (DATA-30). */
  calcVersion: number;
};

export type MeasurementEntry = { componentId: string; actualMg: number };

/** Store `measurements`. Separate from the version it points at (DATA-04). */
export type Measurement = {
  id: string;
  formulaId: string;
  versionId: string;
  /** Date the maker weighed (YYYY-MM-DD), optional. */
  measuredOn?: string;
  /** Only the components that have a measured weight. */
  entries: MeasurementEntry[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Store `batches` (v0.2, BatchTrace). One production run made from one saved
 * formula version. `formulaId` and `versionId` are set when the batch is
 * created and never change, so the batch always refers to the exact version
 * it was made from. Planned weights are read from that version's stored
 * `targets` (versions are write-once). The other fields are editable.
 */
export type Batch = {
  id: string;
  formulaId: string;
  versionId: string;
  /** The maker's own code for the batch, 1–40 characters. Optional. */
  label?: string;
  /** Production date (YYYY-MM-DD), in the maker's local calendar. */
  producedOn: string;
  /** Measured weights for the version's components. Only entered ones. */
  entries: MeasurementEntry[];
  /**
   * v0.3: the material lot used for each component, at most one per component,
   * in the version's order (waxes, oils, wick, vessel). Absent when none is
   * recorded, so every v0.2 batch stays valid. See docs/v0.3-lots.md.
   */
  lots?: BatchLot[];
  /** v0.3 TrueCandle Cost: candles made in the batch, 1–MAX_CANDLES. Optional. */
  candlesMade?: number;
  /** v0.3 TrueCandle Cost: candles fit to sell, 0–candlesMade. Present only with `candlesMade`. */
  sellable?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * v0.3 TrueCandle Cost: a lot's purchase. `quantity` is what was received:
 * milligrams for wax and fragrance oil, whole pieces for wicks and vessels
 * (the lot's material type decides; the data layer checks the range).
 */
export type LotPurchase = {
  /** Whole centavos, 0–MAX_MONEY_CENTAVOS. */
  paidCentavos: number;
  quantity: number;
};

/** Which component of the batch's version a lot is recorded for (v0.3). */
export type BatchLotPart = "row" | "wick" | "vessel";

/**
 * One lot recorded on a batch (v0.3). `lotId` links the lot; the code and the
 * supplier are snapshots taken when the link was made, so the batch keeps what
 * was recorded even after the lot or supplier is edited.
 */
export type BatchLot = {
  part: BatchLotPart;
  /** A wax or oil row of the version. Present exactly when `part` is "row". */
  componentId?: string;
  lotId: string;
  /** The lot's code when it was linked. */
  lotCode: string;
  /** The lot's supplier when it was linked, or null. */
  supplierId: string | null;
  /** That supplier's name when it was linked. Absent without a supplier. */
  supplierName?: string;
};

/**
 * Store `suppliers` (v0.3). The maker's own list of suppliers, kept on the
 * device. Archived suppliers are hidden from pickers for new choices.
 */
export type Supplier = {
  id: string;
  /** 1–MAX_SUPPLIER_NAME_LENGTH characters after trimming; unique, case-insensitive. */
  name: string;
  /** Contact notes, up to MAX_TRACE_NOTES_LENGTH characters. */
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/**
 * Store `materialLots` (v0.3). One lot of one library material, optionally
 * from one supplier. No quantities: lots are for tracing, not stock. Once a
 * batch links it, a lot can only be archived, never deleted.
 */
export type MaterialLot = {
  id: string;
  /** Fixed at creation. */
  materialId: string;
  supplierId: string | null;
  /** The lot code, 1–MAX_LOT_CODE_LENGTH characters after trimming. */
  code: string;
  /** Date received (YYYY-MM-DD), local calendar. Optional. */
  receivedOn?: string;
  /** v0.3 TrueCandle Cost: what was paid for the lot as received. Optional. */
  purchase?: LotPurchase;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type CureMilestoneKind = "cureEnd" | "burnTest" | "check";

/**
 * One scheduled point in a batch's cure plan (v0.2, CurePilot). Its due date
 * is never stored: it is the batch's `producedOn` plus `offsetDays`, so moving
 * the production date moves every open milestone. `doneOn` stays as marked.
 */
export type CureMilestone = {
  /** UUID, stable inside its plan. */
  id: string;
  /** `cureEnd` is the end of the cure time (at most one per plan). */
  kind: CureMilestoneKind;
  /** 1–60 characters after trimming. Optional; the screens require it for `check`. */
  label?: string;
  /** Whole days after the production date, 0–365. */
  offsetDays: number;
  /** Local calendar date (YYYY-MM-DD) the maker marked it done, or null. */
  doneOn: string | null;
};

/**
 * Store `curePlans` (v0.2, CurePilot). A batch's curing schedule. `id` IS the
 * batch's id, so a batch has at most one plan. Scheduling information only.
 */
export type CurePlan = {
  /** The batch this plan belongs to (= Batch.id). */
  id: string;
  /** 1–20 milestones, unique ids, at most one `cureEnd`. */
  milestones: CureMilestone[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Store `productionPlans` (v0.2, CurePilot). A planned production run of one
 * saved version. Not a batch: "Create batch" from it makes the batch and sets
 * `batchId` in the same transaction. `formulaId` and `versionId` never change.
 */
export type ProductionPlan = {
  id: string;
  formulaId: string;
  versionId: string;
  /** Planned date (YYYY-MM-DD), local calendar. Any date. */
  plannedOn: string;
  /** 1–40 characters after trimming. Optional. */
  label?: string;
  notes?: string;
  /** The batch made from this entry, or null while it is open. */
  batchId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SootLevel = "none" | "light" | "moderate" | "heavy";

/**
 * One burn of one candle in a burn session (v0.2, BurnMatrix). Observations
 * only: every field except the duration is optional, and nothing here is a
 * verdict. Burns are numbered by their position in `BurnCandle.burns`.
 */
export type BurnRecord = {
  /** UUID, stable inside its candle. */
  id: string;
  /** Whole minutes, 1–1440. */
  durationMin: number;
  /** Candle weight before this burn, whole milligrams (1 up). */
  weightBeforeMg?: number;
  /** Candle weight after this burn, whole milligrams; not above `weightBeforeMg`. */
  weightAfterMg?: number;
  /** Melt pool diameter at the end of the burn, whole millimetres, 0–500. */
  meltPoolDiameterMm?: number;
  /** Melt pool depth at the end of the burn, whole millimetres, 0–500. */
  meltPoolDepthMm?: number;
  /** Flame height seen during the burn, whole millimetres, 0–500. */
  flameHeightMm?: number;
  /** Soot the maker saw. An observation, not a rating. */
  soot?: SootLevel;
  /** Up to MAX_BURN_TEXT_LENGTH characters after trimming. */
  notes?: string;
};

/**
 * The wick of one candle, as tested. `materialId` names a wick in the material
 * library, or is null for a wick typed as free text. `name` is a snapshot of
 * the material's name when it was chosen (or the typed text), so reports keep
 * the name used at the time even after the material is renamed.
 */
export type BurnWick = {
  materialId: string | null;
  /** 1–80 characters after trimming. */
  name: string;
};

/** One candle burned in a session, side by side with the others. */
export type BurnCandle = {
  /** UUID, stable inside its session. */
  id: string;
  /** "Candle 1", "A", "CD-10"…: 1–40 characters after trimming. */
  label: string;
  wick: BurnWick;
  /** 0–MAX_BURNS_PER_CANDLE burns, in the order they happened. */
  burns: BurnRecord[];
  /** Cold throw notes (unlit), the maker's own words. */
  coldThrow?: string;
  /** Hot throw notes (lit), the maker's own words. */
  hotThrow?: string;
  notes?: string;
};

/**
 * Store `burnSessions` (v0.2, BurnMatrix). One dated burn test on one batch.
 * `batchId` is fixed at creation. `milestoneId` optionally names a `burnTest`
 * milestone in the batch's cure plan; it is a soft link (see
 * docs/v0.2-burnmatrix.md): saving a linked session marks that milestone done
 * on `testedOn`. The app gives no pass or fail; `conclusion` is the maker's own text.
 */
export type BurnSession = {
  id: string;
  batchId: string;
  /** Test date (YYYY-MM-DD), local calendar. */
  testedOn: string;
  /** 1–60 characters after trimming. Optional. */
  label?: string;
  /** A burnTest milestone of the batch's cure plan, or null. */
  milestoneId: string | null;
  /** 1–MAX_BURN_CANDLES candles. */
  candles: BurnCandle[];
  /** The maker's own conclusion. Never written by the app. */
  conclusion?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/** Photo fields shared by the stored record and its backup form. */
type BurnPhotoFields = {
  id: string;
  sessionId: string;
  /** Always JPEG: the app re-encodes every photo when it is added. */
  mimeType: "image/jpeg";
  /** Pixels, 1–MAX_PHOTO_DIMENSION. */
  width: number;
  height: number;
  /** Size of the JPEG bytes, 1–MAX_PHOTO_BYTES. */
  byteLength: number;
  /** SHA-256 of the JPEG bytes, lowercase hex. */
  sha256: string;
  /** 1–80 characters after trimming. Optional. */
  caption?: string;
  createdAt: string;
};

/**
 * Store `burnPhotos` (v0.2, BurnMatrix). One photo of a burn session, kept on
 * the device. Write-once: a photo is added or deleted, never changed.
 */
export type BurnPhoto = BurnPhotoFields & {
  /** The JPEG file. */
  bytes: Uint8Array;
};

/** A photo as a backup file holds it: the bytes as standard base64 (with padding). */
export type BurnPhotoBackup = BurnPhotoFields & {
  dataBase64: string;
};

// ───────────────────────────── v0.3 CandleFix ─────────────────────────────
// Design: docs/v0.3-candlefix.md. Observations, things to check and the
// maker's hypotheses; the app never names a cause, a fix or a verdict.

/** The issues a maker can record, in display and storage order. "other" carries its own text. */
export const FIX_ISSUES = [
  "frosting",
  "tunneling",
  "sinkhole",
  "soot",
  "weakColdThrow",
  "weakHotThrow",
  "wetSpots",
  "cracking",
  "mushrooming",
  "other",
] as const;
export type FixIssue = (typeof FIX_ISSUES)[number];

/**
 * A hypothesis's status, set by the maker. Neutral words only: the app never
 * says a hypothesis is confirmed or proven.
 *   open        not tested yet
 *   testing     a follow-up is under way
 *   fits        the follow-up observations fit it
 *   doesNotFit  the follow-up observations don't fit it
 *   setAside    the maker set it aside
 */
export const HYPOTHESIS_STATUSES = ["open", "testing", "fits", "doesNotFit", "setAside"] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

/**
 * One "thing to check" the maker ticked or noted. `itemId` names a built-in
 * item (`<issue>.<slug>`, see `@/lib/candlefix`); `label` is that item's text
 * when it was first saved, so a later rewording never changes what was ticked.
 */
export type ChecklistTick = {
  itemId: string;
  /** The issue whose list the item came from. */
  issue: FixIssue;
  /** Snapshot of the item's text, 1–MAX_CHECK_LABEL_LENGTH characters. */
  label: string;
  checked: boolean;
  /** Up to MAX_CHECK_NOTE_LENGTH characters after trimming. */
  note?: string;
};

/** A maker-written hypothesis, kept apart from observations. Embedded in its investigation. */
export type Hypothesis = {
  /** UUID, stable inside its investigation; experiments point at it. */
  id: string;
  /** The maker's own words, 1–MAX_HYPOTHESIS_TEXT_LENGTH characters after trimming. */
  text: string;
  status: HypothesisStatus;
  notes?: string;
  createdAt: string;
  /** Moves only when the text, status or notes change. */
  updatedAt: string;
};

/**
 * Store `investigations` (v0.3 CandleFix). A defect the maker observed on one
 * batch. `batchId` is fixed at creation, so the exact formula version is the
 * batch's own immutable version.
 */
export type Investigation = {
  id: string;
  batchId: string;
  /** Date observed (YYYY-MM-DD), local calendar. Never before the batch's production date. */
  observedOn: string;
  /** 1–MAX_INVESTIGATION_TITLE_LENGTH characters. Optional. */
  title?: string;
  /** 1–10 issues, unique, in FIX_ISSUES order. */
  issues: FixIssue[];
  /** The "Other" issue's text: present exactly when `issues` holds "other". */
  otherIssue?: string;
  /** Observation notes. */
  notes?: string;
  /** Up to MAX_CHECKS ticks, unique `itemId`. */
  checks: ChecklistTick[];
  /** Up to MAX_HYPOTHESES, unique ids, in the maker's order. */
  hypotheses: Hypothesis[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Photo fields shared by every stored photo kind and their backup forms, without the owner. */
type PhotoFieldsBase = Omit<BurnPhotoFields, "sessionId">;

/** Store `investigationPhotos` (v0.3 CandleFix). Same rules as burn photos; write-once. */
export type InvestigationPhoto = PhotoFieldsBase & {
  investigationId: string;
  bytes: Uint8Array;
};

/** An investigation photo as a backup file holds it (base64 bytes). */
export type InvestigationPhotoBackup = PhotoFieldsBase & {
  investigationId: string;
  dataBase64: string;
};

/**
 * Store `correctiveExperiments` (v0.3 CandleFix). A hypothesis followed by a
 * follow-up batch and, optionally, that batch's burn tests. The investigation,
 * hypothesis and follow-up batch are fixed at creation.
 */
export type CorrectiveExperiment = {
  id: string;
  investigationId: string;
  /** A hypothesis of that investigation. */
  hypothesisId: string;
  /** Any batch except the investigation's own; usually from a new version. */
  followUpBatchId: string;
  /** 0–MAX_EXPERIMENT_SESSIONS burn tests of the follow-up batch, unique. */
  burnSessionIds: string[];
  /** What the maker changed, in their words. */
  change?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

// ─────────────────────────── v0.3 TrueCandle Cost ───────────────────────────
// Design: docs/v0.3-cost.md. Money is whole centavos (PHP only), rounded half
// up only when shown. Cost sheets are snapshots of quantities and prices.

/** The unit a material's price is for: per kg (wax, fragrance oil) or per piece (wick, vessel). */
export type PriceUnit = "kg" | "piece";

export function priceUnitOf(type: MaterialType): PriceUnit {
  return type === "wax" || type === "fragranceOil" ? "kg" : "piece";
}

/** Store `costItems` (v0.3 TrueCandle Cost). Packaging and other priced items: labels, boxes, lids. */
export type CostItem = {
  id: string;
  /** 1–MAX_COST_ITEM_NAME_LENGTH after trimming; unique, case-insensitive. */
  name: string;
  /** Price of one, whole centavos. */
  unitCentavos: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Archived items are hidden from the sheet's picker. */
  archivedAt: string | null;
};

/** Where a cost line's unit price came from. A snapshot: never changes with the lot or material. */
export type CostPrice =
  /** The batch's lot on that component: paid for the quantity received (mg or pieces). */
  | { source: "lot"; lotId: string; lotCode: string; paidCentavos: number; quantity: number }
  /** The material's default price when the sheet was made, per kg or per piece. */
  | { source: "material"; unitCentavos: number }
  /** Typed by the maker on this sheet, per kg or per piece. */
  | { source: "sheet"; unitCentavos: number }
  /** No price known: counts as zero and marks the sheet incomplete. */
  | { source: "none" };

export type CostPriceSource = CostPrice["source"];

/** A material line's quantity: a weight for wax and oil rows, pieces per candle made for the wick and vessel. */
export type CostQuantity =
  | { unit: "mg"; mg: number; from: "planned" | "measured" }
  | { unit: "piece"; perCandle: number };

/** One component of the sheet's version, with the quantity and price it was costed at. */
export type CostMaterialLine = {
  /** `batchLotSlot` form: "row:<componentId>", "wick" or "vessel". Unique in the sheet. */
  key: string;
  materialId: string;
  materialType: MaterialType;
  /** The material's name in the version's snapshot. */
  name: string;
  quantity: CostQuantity;
  price: CostPrice;
};

/** Packaging or another item on a sheet: each sellable candle, or once for the batch. */
export type CostItemPer = "sellable" | "batch";

export type CostItemLine = {
  /** The line's own id (UUID), unique in the sheet. */
  id: string;
  /** Soft link to the `costItems` entry it was picked from, or null for a one-off. */
  itemId: string | null;
  /** Snapshot, 1–MAX_COST_ITEM_NAME_LENGTH after trimming. */
  name: string;
  unitCentavos: number;
  per: CostItemPer;
  /** 1–MAX_ITEM_QUANTITY. */
  quantity: number;
};

export type CostOverhead =
  /** A fixed amount for the batch. */
  | { mode: "fixed"; centavos: number }
  /** A percentage of materials plus labour, hundredths of 1% (12.5% = 1250). */
  | { mode: "percent"; bp: number };

/** A pricing scenario: set by the price per candle, or by a target gross margin (hundredths of 1%, below 100%). */
export type CostScenario = { mode: "price"; priceCentavos: number } | { mode: "margin"; marginBp: number };

/**
 * Store `costSheets` (v0.3 TrueCandle Cost). The cost of one batch, from a
 * saved version (planned weights) or a recorded batch (measured weights and
 * its lots). Basis, formula, version, batch and the lines' quantities are
 * fixed at creation; prices are snapshots.
 */
export type CostSheet = {
  id: string;
  /** 1–MAX_COST_SHEET_TITLE_LENGTH after trimming. Optional. */
  title?: string;
  basis: "version" | "batch";
  formulaId: string;
  versionId: string;
  /** Set exactly when `basis` is "batch". */
  batchId: string | null;
  /** 1–MAX_CANDLES. */
  candlesMade: number;
  /** 0–candlesMade. */
  sellable: number;
  /** One per component of the version, in the version's order. */
  materials: CostMaterialLine[];
  /** 0–MAX_SHEET_ITEMS. */
  items: CostItemLine[];
  /** Hundredths of an hour, 0–MAX_LABOUR_HOURS_X100. */
  labourHoursX100: number;
  /** Per hour, whole centavos. */
  labourRateCentavos: number;
  overhead: CostOverhead;
  /** Testing allowance for the batch, whole centavos. */
  testingCentavos: number;
  /** "Prices include 12% VAT". Off by default: costs are recorded as paid. */
  pricesIncludeVat: boolean;
  wholesale: CostScenario | null;
  retail: CostScenario | null;
  /** Soft link to the sheet this one was copied from. */
  copiedFromId: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * The exported stores, in dependency order. `batches` was added in v0.2
 * (format 2); `curePlans` and `productionPlans` in v0.2 CurePilot (format 3);
 * `burnSessions` and `burnPhotos` in v0.2 BurnMatrix (format 4); suppliers and
 * lots in v0.3 (format 5); the CandleFix stores in v0.3 CandleFix (format 6).
 */
export const DATA_STORES = [
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
export type DataStoreName = (typeof DATA_STORES)[number];

export type BackupData = {
  materials: Material[];
  formulas: Formula[];
  formulaVersions: FormulaVersion[];
  measurements: Measurement[];
  batches: Batch[];
  curePlans: CurePlan[];
  productionPlans: ProductionPlan[];
  burnSessions: BurnSession[];
  /** Photos in their backup form (base64 bytes); the device stores `BurnPhoto`. */
  burnPhotos: BurnPhotoBackup[];
  /** v0.3 (format 5). */
  suppliers: Supplier[];
  materialLots: MaterialLot[];
  /** v0.3 CandleFix (format 6). */
  investigations: Investigation[];
  /** Photos in their backup form (base64 bytes). */
  investigationPhotos: InvestigationPhotoBackup[];
  correctiveExperiments: CorrectiveExperiment[];
  /** v0.3 TrueCandle Cost (format 7). */
  costItems: CostItem[];
  costSheets: CostSheet[];
};

export type BackupCounts = Record<DataStoreName, number>;

export const BACKUP_FORMAT = "candlelab-backup" as const;
/**
 * 7 since v0.3 TrueCandle Cost (adds `costItems` and `costSheets`; prices on
 * materials and lots, candle counts on batches);
 * 6 since v0.3 CandleFix (adds `investigations`, `investigationPhotos` and
 * `correctiveExperiments`); 5 (v0.3 lots) added `suppliers`, `materialLots`
 * and lot links on batches; 4 (BurnMatrix) added `burnSessions` and
 * `burnPhotos`; 3 added `curePlans` and `productionPlans`; 2 added `batches`.
 * Format 1 to 6 files are migrated on restore.
 */
export const BACKUP_FORMAT_VERSION = 7 as const;
/**
 * IndexedDB schema. 7 since v0.3 TrueCandle Cost (cost items and cost
 * sheets); 6 since v0.3 CandleFix (investigations, their photos and
 * corrective experiments); 5 (v0.3) added suppliers and lots; 4 (BurnMatrix)
 * added burn sessions and photos; 3 (CurePilot) added cure plans and
 * production entries; 2 added the `batches` store.
 */
export const SCHEMA_VERSION = 7 as const;
export const CALC_VERSION = 1 as const;
export const APP_VERSION = "0.3.0" as const;
/** v0.3: longest supplier name after trimming. */
export const MAX_SUPPLIER_NAME_LENGTH = 80 as const;
/** v0.3: longest lot code after trimming. */
export const MAX_LOT_CODE_LENGTH = 60 as const;
/** v0.3: longest supplier or lot notes after trimming. */
export const MAX_TRACE_NOTES_LENGTH = 2000 as const;
/** Longest batch label after trimming. */
export const MAX_BATCH_LABEL_LENGTH = 40 as const;
/** Longest production entry label after trimming (same as a batch label). */
export const MAX_PRODUCTION_LABEL_LENGTH = 40 as const;
/** Longest milestone label after trimming. */
export const MAX_MILESTONE_LABEL_LENGTH = 60 as const;
/** Most milestones in one cure plan. */
export const MAX_MILESTONES = 20 as const;
/** Largest milestone offset, in days after the production date. */
export const MAX_OFFSET_DAYS = 365 as const;
/** BurnMatrix: most candles burned side by side in one session. */
export const MAX_BURN_CANDLES = 8 as const;
/** BurnMatrix: most burns recorded for one candle. */
export const MAX_BURNS_PER_CANDLE = 40 as const;
/** BurnMatrix: longest single burn, in minutes (24 hours). */
export const MAX_BURN_MINUTES = 1440 as const;
/** BurnMatrix: largest melt pool or flame measurement, in millimetres. */
export const MAX_BURN_MM = 500 as const;
/** BurnMatrix: longest session label after trimming. */
export const MAX_SESSION_LABEL_LENGTH = 60 as const;
/** BurnMatrix: longest candle label after trimming. */
export const MAX_CANDLE_LABEL_LENGTH = 40 as const;
/** BurnMatrix: longest wick name after trimming. */
export const MAX_WICK_NAME_LENGTH = 80 as const;
/** BurnMatrix: longest photo caption after trimming. */
export const MAX_PHOTO_CAPTION_LENGTH = 80 as const;
/** BurnMatrix: longest notes, throw notes or conclusion after trimming. */
export const MAX_BURN_TEXT_LENGTH = 2000 as const;
/** BurnMatrix: most photos in one session. */
export const MAX_SESSION_PHOTOS = 12 as const;
/** BurnMatrix: longest side of a stored photo, in pixels. */
export const MAX_PHOTO_DIMENSION = 1600 as const;
/** BurnMatrix: largest stored photo, in bytes (1 MiB). */
export const MAX_PHOTO_BYTES = 1_048_576 as const;
/** CandleFix: longest investigation title after trimming. */
export const MAX_INVESTIGATION_TITLE_LENGTH = 60 as const;
/** CandleFix: longest "Other" issue text after trimming. */
export const MAX_OTHER_ISSUE_LENGTH = 80 as const;
/** CandleFix: longest observation notes, hypothesis notes or experiment notes after trimming. */
export const MAX_FIX_TEXT_LENGTH = 2000 as const;
/** CandleFix: most ticked or noted things to check in one investigation. */
export const MAX_CHECKS = 200 as const;
/** CandleFix: longest check item id. */
export const MAX_CHECK_ID_LENGTH = 80 as const;
/** CandleFix: longest check item text snapshot. */
export const MAX_CHECK_LABEL_LENGTH = 200 as const;
/** CandleFix: longest note on one thing to check. */
export const MAX_CHECK_NOTE_LENGTH = 500 as const;
/** CandleFix: most hypotheses in one investigation. */
export const MAX_HYPOTHESES = 20 as const;
/** CandleFix: longest hypothesis text after trimming. */
export const MAX_HYPOTHESIS_TEXT_LENGTH = 500 as const;
/** CandleFix: longest "what changed" text of an experiment after trimming. */
export const MAX_EXPERIMENT_CHANGE_LENGTH = 500 as const;
/** CandleFix: most burn tests one experiment lists. */
export const MAX_EXPERIMENT_SESSIONS = 8 as const;
/** CandleFix: most photos in one investigation (same as a burn session). */
export const MAX_INVESTIGATION_PHOTOS = 12 as const;
/** TrueCandle Cost: largest amount of money, in centavos (₱10,000,000.00). */
export const MAX_MONEY_CENTAVOS = 1_000_000_000 as const;
/** TrueCandle Cost: most pieces one lot can record as received. */
export const MAX_LOT_PIECES = 1_000_000 as const;
/** TrueCandle Cost: most candles in one batch or sheet. */
export const MAX_CANDLES = 100_000 as const;
/** TrueCandle Cost: most wicks or vessels per candle on a sheet. */
export const MAX_PIECES_PER_CANDLE = 50 as const;
/** TrueCandle Cost: most item lines on one sheet. */
export const MAX_SHEET_ITEMS = 30 as const;
/** TrueCandle Cost: largest quantity on one item line. */
export const MAX_ITEM_QUANTITY = 1000 as const;
/** TrueCandle Cost: most labour, in hundredths of an hour (1,000 hours). */
export const MAX_LABOUR_HOURS_X100 = 100_000 as const;
/** TrueCandle Cost: largest overhead percentage, in hundredths of 1% (1,000%). */
export const MAX_OVERHEAD_BP = 100_000 as const;
/** TrueCandle Cost: largest target margin, in hundredths of 1% (99.99%; 100% cannot be reached). */
export const MAX_MARGIN_BP = 9999 as const;
/** TrueCandle Cost: VAT rate the "Prices include 12% VAT" switch uses, in hundredths of 1%. */
export const VAT_BP = 1200 as const;
/** TrueCandle Cost: longest item name after trimming. */
export const MAX_COST_ITEM_NAME_LENGTH = 60 as const;
/** TrueCandle Cost: longest sheet title after trimming. */
export const MAX_COST_SHEET_TITLE_LENGTH = 60 as const;
/** TrueCandle Cost: longest notes on an item or sheet after trimming. */
export const MAX_COST_NOTES_LENGTH = 2000 as const;
export const DB_NAME = "candlelab" as const;

/** The backup file (docs/specs/4 Data Model.md, "Backup file"). */
export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  counts: BackupCounts;
  /** SHA-256 hex of the `data` section serialised with sorted keys (DATA-16). */
  checksum: { algorithm: "SHA-256"; value: string };
  data: BackupData;
};
