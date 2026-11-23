import { describe, expect, it } from "vitest";
import type { BatchTraceItem } from "@/lib/db/contract";
import {
  EMPTY_BATCH_QUERY,
  MAX_QUERY_LENGTH,
  filterBatches,
  isEmptyBatchQuery,
  normalizeSearchText,
  parseBatchQuery,
  serializeBatchQuery,
  type BatchQuery,
} from "@/lib/batchtrace";
import { makeItem, makeLot } from "./fixtures";

const parse = (s: string) => parseBatchQuery(new URLSearchParams(s));
const q = (over: Partial<BatchQuery>): BatchQuery => ({ ...EMPTY_BATCH_QUERY, ...over });

describe("parseBatchQuery", () => {
  it("returns the empty query for no params", () => {
    expect(parse("")).toEqual(EMPTY_BATCH_QUERY);
  });

  it("reads every param", () => {
    expect(
      parse("q=rose&formula=f-1&from=2026-01-01&to=2026-12-31&lot=l-1&supplier=s-1&cure=yes&burn=no"),
    ).toEqual({
      q: "rose",
      formulaId: "f-1",
      from: "2026-01-01",
      to: "2026-12-31",
      lotId: "l-1",
      supplierId: "s-1",
      curePlan: "yes",
      burnTests: "no",
    });
  });

  it("drops bad values", () => {
    expect(
      parse("from=2026-02-30&to=nope&cure=maybe&burn=1&formula=a%20b&lot=&supplier=" + "x".repeat(65)),
    ).toEqual(EMPTY_BATCH_QUERY);
  });

  it("trims q and cuts it to the maximum length", () => {
    expect(parse("q=%20%20hello%20%20").q).toBe("hello");
    expect(parse("q=" + "a".repeat(500)).q).toHaveLength(MAX_QUERY_LENGTH);
  });

  it("uses the first value of a repeated param", () => {
    expect(parse("q=one&q=two&cure=no&cure=yes")).toEqual(q({ q: "one", curePlan: "no" }));
  });
});

describe("serializeBatchQuery", () => {
  it("gives an empty string for the empty query", () => {
    expect(serializeBatchQuery(EMPTY_BATCH_QUERY)).toBe("");
  });

  it("writes keys in a fixed order and leaves empties out", () => {
    const s = serializeBatchQuery(
      q({ burnTests: "yes", q: "x", supplierId: "s1", from: "2026-01-02", formulaId: "f1" }),
    );
    expect(s).toBe("q=x&formula=f1&from=2026-01-02&supplier=s1&burn=yes");
  });

  it("encodes spaces, ampersands and unicode", () => {
    const s = serializeBatchQuery(q({ q: "a b&c é" }));
    expect(s).not.toContain(" ");
    expect(s).not.toContain("&c");
    expect(new URLSearchParams(s).get("q")).toBe("a b&c é");
  });

  it("round-trips", () => {
    const queries = [
      EMPTY_BATCH_QUERY,
      q({ q: "rose & vanilla" }),
      q({ q: "Crème brûlée", formulaId: "abc-123" }),
      q({ from: "2026-02-28", to: "2026-03-01", curePlan: "no" }),
      q({
        q: "x",
        formulaId: "f",
        from: "2026-01-01",
        to: "2026-01-01",
        lotId: "l",
        supplierId: "s",
        curePlan: "yes",
        burnTests: "no",
      }),
    ];
    for (const x of queries) expect(parse(serializeBatchQuery(x))).toEqual(x);
  });
});

describe("isEmptyBatchQuery", () => {
  it("is true only when nothing is set", () => {
    expect(isEmptyBatchQuery(EMPTY_BATCH_QUERY)).toBe(true);
    expect(isEmptyBatchQuery(q({ q: "a" }))).toBe(false);
    expect(isEmptyBatchQuery(q({ burnTests: "no" }))).toBe(false);
  });
});

describe("normalizeSearchText", () => {
  it("lowercases, strips accents and collapses whitespace", () => {
    expect(normalizeSearchText("  Crème\t BRÛLÉE \n x ")).toBe("creme brulee x");
    expect(normalizeSearchText("Crème")).toContain("creme");
  });
});

describe("filterBatches", () => {
  const a = makeItem({ id: "aaaaaaaa-1111", label: "Autumn A", producedOn: "2026-03-10", formulaId: "f1", formulaName: "Cedar Blend", hasCurePlan: true, burnTestCount: 2 });
  const b = makeItem({ id: "3f2a9c10-2222", label: "", producedOn: "2026-04-01", formulaId: "f2", formulaName: "Crème Rose", hasCurePlan: false, burnTestCount: 0 });
  const c = makeItem({ id: "cccccccc-3333", label: "Winter C", producedOn: "2026-05-05", formulaId: "f1", formulaName: "Cedar Blend", hasCurePlan: true, burnTestCount: 0 });
  const items: BatchTraceItem[] = [a, b, c];
  const ids = (r: BatchTraceItem[]) => r.map((i) => i.batch.id);

  it("returns everything, in order, for the empty query", () => {
    expect(ids(filterBatches(items, EMPTY_BATCH_QUERY))).toEqual(ids(items));
  });

  it("filters by formula", () => {
    expect(ids(filterBatches(items, q({ formulaId: "f1" })))).toEqual([a.batch.id, c.batch.id]);
  });

  it("filters by inclusive date bounds", () => {
    expect(ids(filterBatches(items, q({ from: "2026-04-01" })))).toEqual([b.batch.id, c.batch.id]);
    expect(ids(filterBatches(items, q({ to: "2026-04-01" })))).toEqual([a.batch.id, b.batch.id]);
    expect(ids(filterBatches(items, q({ from: "2026-04-01", to: "2026-04-01" })))).toEqual([b.batch.id]);
  });

  it("matches nothing when from is after to", () => {
    expect(filterBatches(items, q({ from: "2026-06-01", to: "2026-01-01" }))).toEqual([]);
  });

  it("filters by cure plan and burn tests", () => {
    expect(ids(filterBatches(items, q({ curePlan: "yes" })))).toEqual([a.batch.id, c.batch.id]);
    expect(ids(filterBatches(items, q({ curePlan: "no" })))).toEqual([b.batch.id]);
    expect(ids(filterBatches(items, q({ burnTests: "yes" })))).toEqual([a.batch.id]);
    expect(ids(filterBatches(items, q({ burnTests: "no" })))).toEqual([b.batch.id, c.batch.id]);
  });

  it("combines filters with AND", () => {
    expect(ids(filterBatches(items, q({ formulaId: "f1", burnTests: "no" })))).toEqual([c.batch.id]);
    expect(ids(filterBatches(items, q({ formulaId: "f2", curePlan: "yes" })))).toEqual([]);
  });

  it("searches the title, the default title and the formula name", () => {
    expect(ids(filterBatches(items, q({ q: "autumn" })))).toEqual([a.batch.id]);
    expect(ids(filterBatches(items, q({ q: "batch 3f2a" })))).toEqual([b.batch.id]);
    expect(ids(filterBatches(items, q({ q: "creme" })))).toEqual([b.batch.id]);
  });

  it("requires every search term, across fields", () => {
    expect(ids(filterBatches(items, q({ q: "cedar winter" })))).toEqual([c.batch.id]);
    expect(ids(filterBatches(items, q({ q: "cedar rose" })))).toEqual([]);
  });

  it("searches recorded and current lot codes and supplier names", () => {
    const d = makeItem({
      id: "dddddddd-4444",
      label: "D",
      lots: [
        makeLot({
          lotId: "l1",
          recordedCode: "OLD-CODE-1",
          currentCode: "NEW-CODE-1",
          recordedSupplierId: "s1",
          recordedSupplierName: "Example Wax Co",
          currentSupplierId: "s2",
          currentSupplierName: "Sample Oils Ltd",
        }),
      ],
    });
    const all = [a, d];
    for (const term of ["old-code", "new-code", "example wax", "sample oils"]) {
      expect(ids(filterBatches(all, q({ q: term })))).toEqual([d.batch.id]);
    }
    expect(filterBatches(all, q({ q: "unknown-code" }))).toEqual([]);
  });

  it("filters by supplier recorded or current", () => {
    const d = makeItem({
      id: "dddddddd-4444",
      lots: [makeLot({ lotId: "l1", recordedSupplierId: "s1", currentSupplierId: "s2" })],
    });
    const e = makeItem({
      id: "eeeeeeee-5555",
      lots: [makeLot({ lotId: "l2", recordedSupplierId: null, currentSupplierId: null })],
    });
    expect(ids(filterBatches([a, d, e], q({ supplierId: "s1" })))).toEqual([d.batch.id]);
    expect(ids(filterBatches([a, d, e], q({ supplierId: "s2" })))).toEqual([d.batch.id]);
    expect(filterBatches([a, d, e], q({ supplierId: "s3" }))).toEqual([]);
  });

  it("tells apart two batches from the same formula by lot, supplier and search", () => {
    const x = makeItem({
      id: "11111111-aaaa",
      label: "Batch X",
      formulaId: "f1",
      lots: [
        makeLot({
          lotId: "lot-x",
          recordedCode: "LOT-TEST-001",
          recordedSupplierId: "sup-x",
          recordedSupplierName: "Example Wax Co",
        }),
      ],
    });
    const y = makeItem({
      id: "22222222-bbbb",
      label: "Batch Y",
      formulaId: "f1",
      lots: [
        makeLot({
          lotId: "lot-y",
          recordedCode: "LOT-TEST-002",
          recordedSupplierId: "sup-y",
          recordedSupplierName: "Sample Oils Ltd",
        }),
      ],
    });
    const both = [x, y];
    expect(ids(filterBatches(both, q({ formulaId: "f1" })))).toEqual([x.batch.id, y.batch.id]);
    expect(ids(filterBatches(both, q({ lotId: "lot-x" })))).toEqual([x.batch.id]);
    expect(ids(filterBatches(both, q({ lotId: "lot-y" })))).toEqual([y.batch.id]);
    expect(ids(filterBatches(both, q({ supplierId: "sup-x" })))).toEqual([x.batch.id]);
    expect(ids(filterBatches(both, q({ supplierId: "sup-y" })))).toEqual([y.batch.id]);
    expect(ids(filterBatches(both, q({ q: "lot-test-002" })))).toEqual([y.batch.id]);
    expect(ids(filterBatches(both, q({ q: "example wax" })))).toEqual([x.batch.id]);
  });
});
