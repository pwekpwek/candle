import { describe, expect, it } from "vitest";
import { batchCsvFileName, buildBatchCsv } from "@/lib/batchtrace";
import { comp, makeItem, makeLot } from "./fixtures";

const BOM = "﻿";
const HEADER =
  "Batch,Batch ID,Production date,Formula,Version,Component,Material,Planned (g),Measured (g),Lot code,Supplier,Lot received,Cure plan,Burn tests";

const rows = (csv: string) => csv.slice(BOM.length).split("\r\n").slice(0, -1);

describe("buildBatchCsv", () => {
  it("is the BOM and the header row for no items", () => {
    expect(buildBatchCsv([])).toBe(BOM + HEADER + "\r\n");
  });

  it("writes one row per component, with CRLF line ends", () => {
    const item = makeItem({
      id: "abcdef12-0000",
      label: "Autumn A",
      producedOn: "2026-03-10",
      formulaName: "Cedar Blend",
      versionNumber: 3,
      hasCurePlan: true,
      burnTestCount: 2,
      waxes: [comp("w1", "Example Soy Wax"), comp("w2", "Example Coco Wax")],
      oils: [comp("o1", "Example Cedar Oil")],
      wick: "Example Wick 4",
      vessel: "Example Jar",
      targets: [
        { componentId: "w1", targetMg: 100000 },
        { componentId: "w2", targetMg: 50040 },
        { componentId: "o1", targetMg: 16000 },
      ],
      entries: [
        { componentId: "w1", actualMg: 100234 },
        { componentId: "o1", actualMg: 16005 },
      ],
      precisionMg: 100,
      lots: [
        makeLot({
          lotId: "l1",
          componentId: "w1",
          recordedCode: "LOT-TEST-001",
          recordedSupplierId: "s1",
          recordedSupplierName: "Example Wax Co",
          currentSupplierId: "s1",
          receivedOn: "2026-02-01",
        }),
        makeLot({ lotId: "l2", part: "wick", recordedCode: "WICK-LOT-9" }),
      ],
    });
    const csv = buildBatchCsv([item]);
    expect(csv.startsWith(BOM + HEADER + "\r\n")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).not.toMatch(/[^\r]\n/);
    const r = rows(csv);
    expect(r).toHaveLength(1 + 5);
    const pre = "Autumn A,abcdef12-0000,2026-03-10,Cedar Blend,3";
    expect(r[1]).toBe(
      `${pre},Wax,Example Soy Wax,100.0,100.23,LOT-TEST-001,Example Wax Co,2026-02-01,Yes,2`,
    );
    expect(r[2]).toBe(`${pre},Wax,Example Coco Wax,50.0,,,,,Yes,2`);
    expect(r[3]).toBe(`${pre},Fragrance oil,Example Cedar Oil,16.0,16.01,,,,Yes,2`);
    expect(r[4]).toBe(`${pre},Wick,Example Wick 4,,,WICK-LOT-9,,,Yes,2`);
    expect(r[5]).toBe(`${pre},Vessel,Example Jar,,,,,,Yes,2`);
  });

  it("writes no row for a missing wick or vessel, and No for no cure plan", () => {
    const item = makeItem({ id: "abcdef12-0000", label: "L", wick: null, vessel: null });
    const r = rows(buildBatchCsv([item]));
    expect(r).toHaveLength(2);
    expect(r[1].endsWith(",No,0")).toBe(true);
  });

  it("uses the default title when the label is blank", () => {
    const r = rows(buildBatchCsv([makeItem({ id: "3f2a9c10-2222", label: "  " })]));
    expect(r[1].startsWith("Batch 3F2A9C10,3f2a9c10-2222,")).toBe(true);
  });

  it("takes the recorded snapshot for code and supplier, the current lot for received", () => {
    const item = makeItem({
      id: "abcdef12-0000",
      label: "L",
      lots: [
        makeLot({
          lotId: "l1",
          componentId: "w1",
          recordedCode: "OLD-CODE",
          currentCode: "NEW-CODE",
          recordedSupplierId: "s1",
          recordedSupplierName: "Recorded Co",
          currentSupplierId: "s2",
          currentSupplierName: "Current Co",
          receivedOn: "2026-01-15",
        }),
      ],
    });
    const r = rows(buildBatchCsv([item]));
    expect(r[1]).toContain(",OLD-CODE,Recorded Co,2026-01-15,");
    expect(r[1]).not.toContain("NEW-CODE");
    expect(r[1]).not.toContain("Current Co");
  });

  it("quotes commas, quotes and newlines (RFC 4180)", () => {
    const item = makeItem({ id: "abcdef12-0000", label: 'Say "hi", ok\nnext', formulaName: "A,B" });
    const csv = buildBatchCsv([item]);
    expect(csv).toContain('"Say ""hi"", ok\nnext"');
    expect(csv).toContain(',"A,B",');
  });

  it("guards against formula injection", () => {
    const eq = buildBatchCsv([makeItem({ id: "abcdef12-0000", label: "=SUM(A1)" })]);
    expect(eq).toContain("'=SUM(A1),abcdef12-0000");
    const minus = buildBatchCsv([makeItem({ id: "abcdef12-0000", label: "-5" })]);
    expect(minus).toContain("'-5,abcdef12-0000");
    const plus = buildBatchCsv([makeItem({ id: "abcdef12-0000", label: "+1", formulaName: "@x" })]);
    expect(plus).toContain("'+1,");
    expect(plus).toContain(",'@x,");
  });

  it("keeps the given order of items", () => {
    const r = rows(
      buildBatchCsv([
        makeItem({ id: "bbbbbbbb-0000", label: "B" }),
        makeItem({ id: "aaaaaaaa-0000", label: "A" }),
      ]),
    );
    expect(r[1].startsWith("B,")).toBe(true);
    expect(r[2].startsWith("A,")).toBe(true);
  });
});

describe("batchCsvFileName", () => {
  it("builds the file name from a local date", () => {
    expect(batchCsvFileName("2026-11-21")).toBe("candlelab-batches-20261121.csv");
  });
});
