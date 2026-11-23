/**
 * Batch search, filters and URL state (v0.3). Pure; see ./contract.ts.
 */
import { MESSAGES } from "@/lib/messages";
import { isLocalDate } from "@/lib/schedule";
import {
  EMPTY_BATCH_QUERY,
  MAX_QUERY_LENGTH,
  QUERY_PARAMS,
  type BatchQuery,
  type FilterBatches,
  type IsEmptyBatchQuery,
  type NormalizeSearchText,
  type ParamSource,
  type ParseBatchQuery,
  type SerializeBatchQuery,
  type YesNo,
} from "./contract";

const ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

function idParam(value: string | null): string | null {
  return value !== null && ID_PATTERN.test(value) ? value : null;
}

function dateParam(value: string | null): string | null {
  return value !== null && isLocalDate(value) ? value : null;
}

function yesNoParam(value: string | null): YesNo | null {
  return value === "yes" || value === "no" ? value : null;
}

export const parseBatchQuery: ParseBatchQuery = (params: ParamSource): BatchQuery => ({
  q: (params.get(QUERY_PARAMS.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH).trim(),
  formulaId: idParam(params.get(QUERY_PARAMS.formulaId)),
  from: dateParam(params.get(QUERY_PARAMS.from)),
  to: dateParam(params.get(QUERY_PARAMS.to)),
  lotId: idParam(params.get(QUERY_PARAMS.lotId)),
  supplierId: idParam(params.get(QUERY_PARAMS.supplierId)),
  curePlan: yesNoParam(params.get(QUERY_PARAMS.curePlan)),
  burnTests: yesNoParam(params.get(QUERY_PARAMS.burnTests)),
});

export const serializeBatchQuery: SerializeBatchQuery = (query) => {
  const out = new URLSearchParams();
  const keys = Object.keys(QUERY_PARAMS) as (keyof BatchQuery)[];
  for (const key of keys) {
    const value = query[key];
    if (value !== null && value !== "") out.set(QUERY_PARAMS[key], value);
  }
  return out.toString();
};

export const isEmptyBatchQuery: IsEmptyBatchQuery = (query) =>
  (Object.keys(EMPTY_BATCH_QUERY) as (keyof BatchQuery)[]).every(
    (key) => query[key] === EMPTY_BATCH_QUERY[key],
  );

export const normalizeSearchText: NormalizeSearchText = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const filterBatches: FilterBatches = (items, query) => {
  const terms = normalizeSearchText(query.q)
    .split(" ")
    .filter((t) => t !== "");

  return items.filter((item) => {
    const { batch, formula, lots } = item;

    if (query.formulaId !== null && batch.formulaId !== query.formulaId) return false;
    if (query.from !== null && batch.producedOn < query.from) return false;
    if (query.to !== null && batch.producedOn > query.to) return false;
    if (query.lotId !== null && !lots.some((l) => l.link.lotId === query.lotId)) return false;
    if (
      query.supplierId !== null &&
      !lots.some(
        (l) => l.link.supplierId === query.supplierId || l.lot?.supplierId === query.supplierId,
      )
    ) {
      return false;
    }
    if (query.curePlan !== null && item.hasCurePlan !== (query.curePlan === "yes")) return false;
    if (query.burnTests !== null && item.burnTestCount > 0 !== (query.burnTests === "yes")) {
      return false;
    }

    if (terms.length > 0) {
      const title = batch.label?.trim()
        ? batch.label
        : MESSAGES.batches.defaultTitle(batch.id.slice(0, 8).toUpperCase());
      const fields = [title, formula.name];
      for (const l of lots) {
        fields.push(l.link.lotCode);
        if (l.lot) fields.push(l.lot.code);
        if (l.link.supplierName) fields.push(l.link.supplierName);
        if (l.supplier) fields.push(l.supplier.name);
      }
      const haystack = fields.map(normalizeSearchText);
      if (!terms.every((t) => haystack.some((f) => f.includes(t)))) return false;
    }
    return true;
  });
};
