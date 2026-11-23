import type { BatchTraceItem, BatchTraceLot } from "@/lib/db/contract";
import type { Batch, BatchLot, Component, Formula, FormulaVersion, MaterialSnapshot } from "@/lib/types";

const NOW = "2026-01-01T00:00:00.000Z";

export function makeLot(o: {
  lotId: string;
  part?: BatchLot["part"];
  componentId?: string;
  recordedCode?: string;
  currentCode?: string;
  recordedSupplierId?: string | null;
  recordedSupplierName?: string;
  currentSupplierId?: string | null;
  currentSupplierName?: string;
  receivedOn?: string;
}): BatchTraceLot {
  const recordedSupplierId = o.recordedSupplierId ?? null;
  const currentSupplierId = o.currentSupplierId ?? null;
  return {
    link: {
      part: o.part ?? "row",
      ...(o.componentId ? { componentId: o.componentId } : {}),
      lotId: o.lotId,
      lotCode: o.recordedCode ?? "LOT-TEST-001",
      supplierId: recordedSupplierId,
      ...(o.recordedSupplierName ? { supplierName: o.recordedSupplierName } : {}),
    },
    lot: {
      id: o.lotId,
      materialId: "m1",
      supplierId: currentSupplierId,
      code: o.currentCode ?? o.recordedCode ?? "LOT-TEST-001",
      ...(o.receivedOn ? { receivedOn: o.receivedOn } : {}),
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
    },
    supplier: currentSupplierId
      ? {
          id: currentSupplierId,
          name: o.currentSupplierName ?? "Example Supplier",
          createdAt: NOW,
          updatedAt: NOW,
          archivedAt: null,
        }
      : null,
  };
}

const snap = (name: string): MaterialSnapshot => ({ type: "wax", name });
const comp = (componentId: string, name: string): Component => ({
  componentId,
  materialId: `mat-${componentId}`,
  snapshot: snap(name),
  partsX100: 10000,
});

export function makeItem(o: {
  id: string;
  label?: string;
  producedOn?: string;
  formulaId?: string;
  formulaName?: string;
  versionNumber?: number;
  hasCurePlan?: boolean;
  burnTestCount?: number;
  lots?: BatchTraceLot[];
  waxes?: Component[];
  oils?: Component[];
  wick?: string | null;
  vessel?: string | null;
  entries?: { componentId: string; actualMg: number }[];
  targets?: { componentId: string; targetMg: number }[];
  precisionMg?: 1000 | 100 | 10;
}): BatchTraceItem {
  const formulaId = o.formulaId ?? "f1";
  const formula: Formula = {
    id: formulaId,
    name: o.formulaName ?? "Example Formula",
    latestVersionNumber: 1,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
  };
  const version = {
    id: `v-${o.id}`,
    formulaId,
    number: o.versionNumber ?? 1,
    origin: "initial",
    parentVersionId: null,
    scale: null,
    createdAt: NOW,
    calcVersion: 1,
    inputs: {
      sizing: { mode: "total", amountMg: 200000 },
      fragranceBp: 800,
      basis: "total",
      precisionMg: o.precisionMg ?? 100,
      waxes: o.waxes ?? [comp("w1", "Example Soy Wax")],
      oils: o.oils ?? [],
      wick: o.wick ? { materialId: "mw", snapshot: { type: "wick", name: o.wick } } : null,
      vessel: o.vessel ? { materialId: "mv", snapshot: { type: "vessel", name: o.vessel } } : null,
    },
    targets: {
      totalMg: 200000,
      waxTotalMg: 184000,
      fragranceTotalMg: 16000,
      components: o.targets ?? [{ componentId: "w1", targetMg: 184000 }],
    },
  } as unknown as FormulaVersion;
  const batch: Batch = {
    id: o.id,
    formulaId,
    versionId: version.id,
    ...(o.label !== undefined ? { label: o.label } : {}),
    producedOn: o.producedOn ?? "2026-03-10",
    entries: o.entries ?? [],
    createdAt: NOW,
    updatedAt: NOW,
  };
  return {
    batch,
    formula,
    version,
    hasCurePlan: o.hasCurePlan ?? false,
    burnTestCount: o.burnTestCount ?? 0,
    lots: o.lots ?? [],
  };
}

export { comp };
