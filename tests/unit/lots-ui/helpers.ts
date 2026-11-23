import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { getDataLayer, openDatabase } from "@/lib/db";
import { id, makeLibrary, newFormulaRequest, we5Input } from "../db/harness";

type Library = Awaited<ReturnType<typeof makeLibrary>>;

/** The components use the singleton on the default database: start each test empty. */
export async function clearDatabase() {
  const db = openDatabase();
  await Promise.all(db.tables.map((table) => table.clear()));
  db.close();
}

export async function waitLoaded(loading: string) {
  await waitFor(() => expect(screen.queryByText(loading)).not.toBeInTheDocument());
}

/**
 * A library, a saved formula version and a batch that links the lot returned by
 * `makeLot` on the version's first wax row.
 */
export async function batchUsingLot(makeLot: (lib: Library) => Promise<string>) {
  const layer = getDataLayer();
  const lib = await makeLibrary(layer);
  const { version } = await layer.versions.save(newFormulaRequest(we5Input(lib)));
  const lotId = await makeLot(lib);
  await layer.batches.create({
    batchId: id(),
    versionId: version.id,
    producedOn: "2026-11-16",
    entries: [],
    lots: [{ part: "row", componentId: version.inputs.waxes[0].componentId, lotId }],
  });
  return { lib, lotId };
}
