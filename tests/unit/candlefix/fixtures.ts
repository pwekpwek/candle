import type { BurnSessionListItem, ComparisonBatch } from "@/lib/db/contract";
import type {
  Batch,
  BurnCandle,
  BurnRecord,
  BurnSession,
  CorrectiveExperiment,
  Formula,
  FormulaVersion,
  Hypothesis,
  Investigation,
} from "@/lib/types";

export const T = "2026-11-20T08:00:00.000Z";
export const id = () => crypto.randomUUID();

export function burn(over: Partial<BurnRecord> = {}): BurnRecord {
  return { id: id(), durationMin: 60, ...over };
}

export function candle(burns: BurnRecord[] = [], over: Partial<BurnCandle> = {}): BurnCandle {
  return { id: id(), label: "A", wick: { materialId: null, name: "CD-10" }, burns, ...over };
}

export function formula(over: Partial<Formula> = {}): Formula {
  return {
    id: id(),
    name: "Test Formula",
    latestVersionNumber: 1,
    createdAt: T,
    updatedAt: T,
    archivedAt: null,
    ...over,
  };
}

/** Only the fields the pure logic reads are filled in; the rest is cast. */
export function version(formulaId: string, number = 1): FormulaVersion {
  return { id: id(), formulaId, number, origin: "initial", createdAt: T } as unknown as FormulaVersion;
}

export type BatchFixture = { batch: Batch; formula: Formula; version: FormulaVersion };

export function batchFixture(over: Partial<Batch> = {}, versionNumber = 1): BatchFixture {
  const f = formula();
  const v = version(f.id, versionNumber);
  const batch: Batch = {
    id: id(),
    formulaId: f.id,
    versionId: v.id,
    producedOn: "2026-11-01",
    entries: [],
    createdAt: T,
    updatedAt: T,
    ...over,
  };
  return { batch, formula: f, version: v };
}

export function session(batchId: string, candles: BurnCandle[], over: Partial<BurnSession> = {}): BurnSession {
  return {
    id: id(),
    batchId,
    testedOn: "2026-11-10",
    milestoneId: null,
    candles,
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

export function sessionItem(fx: BatchFixture, s: BurnSession): BurnSessionListItem {
  return { session: s, batch: fx.batch, formula: fx.formula, version: fx.version, photoCount: 0 };
}

export function investigation(batchId: string, over: Partial<Investigation> = {}): Investigation {
  return {
    id: id(),
    batchId,
    observedOn: "2026-11-05",
    issues: ["frosting"],
    checks: [],
    hypotheses: [],
    archivedAt: null,
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

export function hypothesis(over: Partial<Hypothesis> = {}): Hypothesis {
  return { id: id(), text: "Wax may have been poured warm", status: "open", createdAt: T, updatedAt: T, ...over };
}

export function experiment(
  investigationId: string,
  hypothesisId: string,
  followUpBatchId: string,
  over: Partial<CorrectiveExperiment> = {},
): CorrectiveExperiment {
  return {
    id: id(),
    investigationId,
    hypothesisId,
    followUpBatchId,
    burnSessionIds: [],
    createdAt: T,
    updatedAt: T,
    ...over,
  };
}

export function comparisonBatch(
  fx: BatchFixture,
  sessions: BurnSession[] = [],
  investigations: Investigation[] = [],
): ComparisonBatch {
  return { item: fx, burnSessions: sessions.map((s) => sessionItem(fx, s)), investigations };
}

/** Deep-freezes a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as object)) deepFreeze(v);
  }
  return value;
}
