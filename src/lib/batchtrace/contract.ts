/**
 * Batch search, filters, URL state and CSV export (v0.3) — contract.
 *
 * Pure logic over `BatchTraceItem`s read by `getDataLayer().batchTrace.read()`.
 * Design: docs/v0.3-lots.md, "Search, filters and URL state" and "CSV export".
 * Only the lead edits this file. `./index.ts` must export every function below.
 */
import type { BatchTraceItem } from "@/lib/db/contract";

export type YesNo = "yes" | "no";

/** The search and filters of the Batches list. Every field empty means "show all". */
export type BatchQuery = {
  /** Search text, trimmed, at most MAX_QUERY_LENGTH characters. "" for none. */
  q: string;
  formulaId: string | null;
  /** Production date from (inclusive), YYYY-MM-DD. */
  from: string | null;
  /** Production date to (inclusive), YYYY-MM-DD. */
  to: string | null;
  /** A lot linked on any component. */
  lotId: string | null;
  /** A supplier, as recorded on the batch's lots or as the lot's supplier now. */
  supplierId: string | null;
  /** "yes": has a cure plan; "no": has none. */
  curePlan: YesNo | null;
  /** "yes": has at least one burn test; "no": has none. */
  burnTests: YesNo | null;
};

/** Longest search text kept from the URL or the box. */
export const MAX_QUERY_LENGTH = 200;

/**
 * URL parameter names, in the order `serializeBatchQuery` writes them:
 * q, formula, from, to, lot, supplier, cure, burn.
 */
export const QUERY_PARAMS = {
  q: "q",
  formulaId: "formula",
  from: "from",
  to: "to",
  lotId: "lot",
  supplierId: "supplier",
  curePlan: "cure",
  burnTests: "burn",
} as const satisfies Record<keyof BatchQuery, string>;

export const EMPTY_BATCH_QUERY: BatchQuery = {
  q: "",
  formulaId: null,
  from: null,
  to: null,
  lotId: null,
  supplierId: null,
  curePlan: null,
  burnTests: null,
};

/** Anything with `get(name)`: URLSearchParams and Next's ReadonlyURLSearchParams both fit. */
export type ParamSource = { get(name: string): string | null };

/**
 * Reads the query from URL parameters. Tolerant: a value it does not
 * understand is dropped (treated as absent), never thrown:
 *   - q: trimmed, cut to MAX_QUERY_LENGTH characters.
 *   - formula, lot, supplier: kept when 1–64 characters of [A-Za-z0-9-].
 *   - from, to: kept when a real calendar date YYYY-MM-DD.
 *   - cure, burn: "yes" or "no".
 * A repeated parameter uses its first value (`get`).
 */
export type ParseBatchQuery = (params: ParamSource) => BatchQuery;

/**
 * Writes the query as a search string without the leading "?", keys in
 * QUERY_PARAMS order, empty fields left out, values URL-encoded
 * (URLSearchParams rules). The empty query gives "". Round trip:
 * parseBatchQuery(new URLSearchParams(serializeBatchQuery(x))) equals x for
 * every x that parseBatchQuery can return.
 */
export type SerializeBatchQuery = (query: BatchQuery) => string;

/** True when no search text and no filter is set. */
export type IsEmptyBatchQuery = (query: BatchQuery) => boolean;

/**
 * Lowercase, accents removed (NFKD, combining marks dropped), whitespace runs
 * collapsed to one space, trimmed. Used for both the search text and the
 * fields it is matched against.
 */
export type NormalizeSearchText = (text: string) => string;

/**
 * Keeps the items that match every part of the query, in their given order.
 * Search: the normalised `q` is split on spaces; every term must be contained
 * in at least one of: the batch title (label, or "Batch " + first 8 id
 * characters in capitals, as `MESSAGES.batches.defaultTitle`), the formula
 * name, each lot code recorded on the batch, each lot's current code, each
 * supplier name recorded on the batch, each lot's current supplier name.
 * Filters (all combined with AND):
 *   formulaId   batch.formulaId equals it
 *   from / to   from <= producedOn <= to (string compare); from > to matches nothing
 *   lotId       any lot link has this lotId
 *   supplierId  any lot link has this recorded supplierId, or its lot's current supplierId
 *   curePlan    hasCurePlan is true ("yes") or false ("no")
 *   burnTests   burnTestCount > 0 ("yes") or === 0 ("no")
 */
export type FilterBatches = (
  items: readonly BatchTraceItem[],
  query: BatchQuery,
) => BatchTraceItem[];

/**
 * The CSV of the given items (already filtered), in their order. RFC 4180,
 * CRLF line ends, a UTF-8 BOM first, headers from MESSAGES.batchCsv. Cells
 * starting with =, +, -, @, tab or CR get a leading apostrophe (formula
 * injection), then RFC 4180 quoting. One row per component of each batch's
 * version: wax rows, oil rows, then the wick and the vessel when the version
 * has them. Columns, in order (docs/v0.3-lots.md, "CSV export"):
 *   Batch, Batch ID, Production date, Formula, Version, Component, Material,
 *   Planned (g), Measured (g), Lot code, Supplier, Lot received, Cure plan,
 *   Burn tests.
 * Planned is the version's stored target at the version's precision
 * (formatWeight from @/lib/gramguard); Measured is the batch entry at 0.01 g;
 * both blank for the wick and vessel and when not entered. Lot code and
 * Supplier are the batch's recorded snapshot. Lot received is the lot's
 * current receivedOn. Cure plan is "Yes"/"No" from MESSAGES.batchCsv; Burn
 * tests is the count. With no items, the file is the BOM and the header row.
 */
export type BuildBatchCsv = (items: readonly BatchTraceItem[]) => string;

/** `candlelab-batches-YYYYMMDD.csv` from a local date YYYY-MM-DD. */
export type BatchCsvFileName = (localDate: string) => string;
