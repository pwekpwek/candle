import { MESSAGES } from "@/lib/messages";
import type { BatchLot, MaterialLot, Supplier } from "@/lib/types";
import { formatProducedOn } from "./text";

const B = MESSAGES.batches;

export type LotOption = { value: string; text: string };

/** "LOT-1 · Example Wax Co · received Nov 1, 2026": code, then supplier, then received date when known. */
export function lotOptionText(lot: MaterialLot, supplierName: string | null): string {
  const parts = [lot.code];
  if (supplierName) parts.push(supplierName);
  if (lot.receivedOn) parts.push(B.lotReceivedOn(formatProducedOn(lot.receivedOn)));
  return parts.join(B.separator);
}

/**
 * The choices for one component: the material's lots that are not archived, plus
 * the lot chosen now and the lot stored on the batch even when archived. A
 * stored link whose lot is gone is listed from its recorded code.
 */
export function buildLotOptions(
  lots: readonly MaterialLot[],
  materialId: string,
  selectedLotId: string,
  linked: BatchLot | undefined,
  supplierNames: ReadonlyMap<string, string>,
): LotOption[] {
  const options: LotOption[] = [];
  for (const lot of lots) {
    if (lot.materialId !== materialId) continue;
    const keep = lot.archivedAt === null || lot.id === selectedLotId || lot.id === linked?.lotId;
    if (!keep) continue;
    const text = lotOptionText(lot, lot.supplierId ? (supplierNames.get(lot.supplierId) ?? null) : null);
    options.push({ value: lot.id, text: lot.archivedAt !== null ? B.lotArchivedOption(text) : text });
  }
  if (linked && !lots.some((lot) => lot.id === linked.lotId)) {
    options.push({ value: linked.lotId, text: B.lotMissingOption(linked.lotCode) });
  }
  return options;
}

export function supplierNameMap(suppliers: readonly Supplier[]): Map<string, string> {
  return new Map(suppliers.map((s) => [s.id, s.name]));
}
