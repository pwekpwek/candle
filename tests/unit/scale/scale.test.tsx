import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FormulaDetail } from "@/components/formulas/detail";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { DataLayer } from "@/lib/db";
import type { ValidatedFormulaInput } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import type { FormulaVersion } from "@/lib/types";
import {
  makeLibrary,
  newFormulaRequest,
  revisionRequest,
  we5Input,
  type Library,
} from "../db/harness";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/",
}));

const F = MESSAGES.formula;
const S = MESSAGES.scale;

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(async () => {
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "";
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const layer = (): DataLayer => getDataLayer();

type Seeded = { lib: Library; formulaId: string; v1: FormulaVersion };

/** Saves a formula through the real data layer. WE-5 unless `overrides` say otherwise. */
async function seed(overrides: Partial<ValidatedFormulaInput> = {}): Promise<Seeded> {
  const lib = await makeLibrary(layer());
  const saved = await layer().versions.save(newFormulaRequest(we5Input(lib, overrides)));
  return { lib, formulaId: saved.formula.id, v1: saved.version };
}

/** WE-1 style: one wax, one oil, total mode, 8% of wax. */
const oneOil = (lib: Library): Partial<ValidatedFormulaInput> => ({
  oils: [{ rowId: "o1", materialId: lib.oilIds[0], partsX100: 100 }],
});

async function renderDetail(formulaId: string, versionId?: string) {
  render(<FormulaDetail formulaId={formulaId} versionId={versionId} />);
  await screen.findByLabelText(F.measuredFieldLabel("Soy wax"));
}

async function openDialog(title: string) {
  fireEvent.click(screen.getByRole("button", { name: F.scale }));
  const dialog = await screen.findByRole("dialog");
  within(dialog).getByRole("heading", { name: title });
  return dialog;
}

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

/** The text of one row of the preview table, e.g. "1000.0 g → to 1666.7 g". */
const previewRow = (dialog: HTMLElement, name: string): string => {
  const header = within(dialog).getByRole("rowheader", { name });
  return (header.closest("tr") as HTMLElement).textContent ?? "";
};

const saveButton = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: S.save });

const versionsOf = async (formulaId: string) => layer().versions.listByFormula(formulaId);

describe("scale dialog: vessels mode (WE-9a, WE-9b)", () => {
  it("WE-9a: 10 vessels previews 1800.0 g and saves version 2 without touching version 1", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");

    expect(within(dialog).getByLabelText("Vessels")).toHaveValue("6");
    expect(within(dialog).getByLabelText("Fill (g)")).toHaveValue("180");
    expect(within(dialog).getByLabelText("Vessels")).toHaveAttribute("inputmode", "numeric");
    expect(within(dialog).getByLabelText("Fill (g)")).toHaveAttribute("inputmode", "decimal");

    type(within(dialog).getByLabelText("Vessels"), "10");

    expect(within(dialog).getByText("New total mixture: 1800.0 g")).toBeInTheDocument();
    expect(previewRow(dialog, "Soy wax")).toMatch(/1000\.0 g.*1666\.7 g/);
    expect(previewRow(dialog, "Lavender")).toMatch(/40\.0 g.*66\.7 g/);
    expect(previewRow(dialog, "Vanilla")).toMatch(/26\.7 g.*44\.4 g/);
    expect(previewRow(dialog, "Cedarwood")).toMatch(/13\.3 g.*22\.2 g/);
    expect(previewRow(dialog, "Total mixture")).toMatch(/1080\.0 g.*1800\.0 g/);
    expect(within(dialog).getByText(/This saves as version 2\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/Percentage, basis and ratios stay the same\./)).toBeInTheDocument();

    const v1Before = await layer().versions.get(s.v1.id);
    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const all = await versionsOf(s.formulaId);
    expect(all.map((v) => v.number)).toEqual([2, 1]);
    const v2 = all[0];
    expect(v2.origin).toBe("scaled");
    expect(v2.parentVersionId).toBe(s.v1.id);
    expect(v2.scale).toEqual({ method: "vesselCount", factorX10000: 16667 });
    expect(v2.inputs.sizing).toEqual({ mode: "vessels", count: 10, fillMg: 180000 });
    expect(v2.inputs.fragranceBp).toBe(800);
    expect(v2.inputs.basis).toBe("wax");
    const targetOf = (id: string) => v2.targets.components.find((c) => c.componentId === id)?.targetMg;
    expect(targetOf(v2.inputs.waxes[0].componentId)).toBe(1666700);
    expect(v2.inputs.oils.map((o) => targetOf(o.componentId))).toEqual([66700, 44400, 22200]);
    expect(v2.targets.totalMg).toBe(1800000);

    expect(await layer().versions.get(s.v1.id)).toEqual(v1Before);
  });

  it("WE-9b: 6 to 3 vessels gives 500.0 g wax and oils 20.0, 13.3 and 6.7 g", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Vessels"), "3");

    expect(within(dialog).getByText("New total mixture: 540.0 g")).toBeInTheDocument();
    expect(previewRow(dialog, "Soy wax")).toMatch(/1000\.0 g.*500\.0 g/);
    expect(previewRow(dialog, "Lavender")).toMatch(/40\.0 g.*20\.0 g/);
    expect(previewRow(dialog, "Vanilla")).toMatch(/26\.7 g.*13\.3 g/);
    expect(previewRow(dialog, "Cedarwood")).toMatch(/13\.3 g.*6\.7 g/);
  });

  it("a changed fill is used; an unchanged fill keeps the current one", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Fill (g)"), "90");
    expect(within(dialog).getByText("New total mixture: 540.0 g")).toBeInTheDocument();
  });
});

describe("scale dialog: total and wax modes", () => {
  it("WE-1: a multiplier of 1.25 on 500 g gives 625.0 g, fragrance 46.3 g, wax 578.7 g", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(
      newFormulaRequest(we5Input(lib, { ...oneOil(lib), sizing: { mode: "total", amountMg: 500000 } })),
    );
    await renderDetail(saved.formula.id);
    const dialog = await openDialog("Scale version 1");

    expect(within(dialog).getByRole("radio", { name: "New amount" })).toBeChecked();
    expect(within(dialog).getByLabelText("Amount (g)")).toHaveValue("500");

    fireEvent.click(within(dialog).getByRole("radio", { name: "Multiplier" }));
    const multiplier = within(dialog).getByLabelText("Multiplier (×)");
    expect(multiplier).toHaveValue("");
    type(multiplier, "1.25");

    expect(within(dialog).getByText("New total mixture: 625.0 g")).toBeInTheDocument();
    expect(previewRow(dialog, "Soy wax")).toMatch(/463\.0 g.*578\.7 g/);
    expect(previewRow(dialog, "Lavender")).toMatch(/37\.0 g.*46\.3 g/);

    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const v2 = (await versionsOf(saved.formula.id))[0];
    expect(v2.scale).toEqual({ method: "multiplier", factorX10000: 12500 });
    expect(v2.inputs.sizing).toEqual({ mode: "total", amountMg: 625000 });
  });

  it("typing a new amount of 625 gives the same figures", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(
      newFormulaRequest(we5Input(lib, { ...oneOil(lib), sizing: { mode: "total", amountMg: 500000 } })),
    );
    await renderDetail(saved.formula.id);
    const dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Amount (g)"), "625");

    expect(within(dialog).getByText("New total mixture: 625.0 g")).toBeInTheDocument();
    expect(previewRow(dialog, "Soy wax")).toMatch(/463\.0 g.*578\.7 g/);
    expect(previewRow(dialog, "Lavender")).toMatch(/37\.0 g.*46\.3 g/);
    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const v2 = (await versionsOf(saved.formula.id))[0];
    expect(v2.scale).toEqual({ method: "amount", factorX10000: 12500 });
  });

  it("WE-9d: 333.3 g times 1.5 shows a new amount of 500.0 g", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(
      newFormulaRequest(we5Input(lib, { ...oneOil(lib), sizing: { mode: "total", amountMg: 333300 } })),
    );
    await renderDetail(saved.formula.id);
    const dialog = await openDialog("Scale version 1");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Multiplier" }));
    type(within(dialog).getByLabelText("Multiplier (×)"), "1.5");
    expect(within(dialog).getByText("New total mixture: 500.0 g")).toBeInTheDocument();
  });

  it("wax mode shows the new wax weight", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(
      newFormulaRequest(we5Input(lib, { ...oneOil(lib), sizing: { mode: "wax", amountMg: 1000000 } })),
    );
    await renderDetail(saved.formula.id);
    const dialog = await openDialog("Scale version 1");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Multiplier" }));
    type(within(dialog).getByLabelText("Multiplier (×)"), "2");
    expect(within(dialog).getByText("New wax weight: 2000.0 g")).toBeInTheDocument();
    expect(previewRow(dialog, "Soy wax")).toMatch(/1000\.0 g.*2000\.0 g/);
  });
});

describe("scale dialog: validation", () => {
  it("count 2.5 shows V-05, no figures, and Save writes nothing", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");
    const count = within(dialog).getByLabelText("Vessels");
    type(count, "2.5");
    // Shown after blur, not while typing.
    expect(within(dialog).queryByText("Enter a whole number of vessels.")).toBeNull();
    fireEvent.blur(count);

    const message = within(dialog).getByText("Enter a whole number of vessels.");
    expect(count).toHaveAttribute("aria-invalid", "true");
    expect(count.getAttribute("aria-describedby")).toBe(message.closest("p")?.id);
    expect(within(dialog).getByText(MESSAGES.results.incomplete)).toBeInTheDocument();
    expect(within(dialog).queryByText(/New total mixture/)).toBeNull();
    expect(within(dialog).queryByText(/Soy wax/)).toBeNull();

    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(count).toHaveFocus());
    expect(await versionsOf(s.formulaId)).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("an invalid count shows its message on a Save attempt without any blur", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Vessels"), "");
    fireEvent.click(saveButton(dialog));
    expect(await within(dialog).findByText("Enter a whole number of vessels.")).toBeInTheDocument();
    expect(await versionsOf(s.formulaId)).toHaveLength(1);
  });

  it("multiplier 0 and 1000.01 show V-17", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(
      newFormulaRequest(we5Input(lib, { ...oneOil(lib), sizing: { mode: "total", amountMg: 500000 } })),
    );
    await renderDetail(saved.formula.id);
    const dialog = await openDialog("Scale version 1");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Multiplier" }));
    const multiplier = within(dialog).getByLabelText("Multiplier (×)");
    const v17 = "Enter a multiplier between 0.01 and 1000.";

    type(multiplier, "0");
    fireEvent.blur(multiplier);
    expect(within(dialog).getByText(v17)).toBeInTheDocument();
    expect(within(dialog).getByText(MESSAGES.results.incomplete)).toBeInTheDocument();

    type(multiplier, "1000.01");
    expect(within(dialog).getByText(v17)).toBeInTheDocument();
    fireEvent.click(saveButton(dialog));
    expect(await versionsOf(saved.formula.id)).toHaveLength(1);

    type(multiplier, "1000");
    expect(within(dialog).queryByText(v17)).toBeNull();
  });

  it("amount 500.55 at 0.1 g shows the V-04 wording", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(
      newFormulaRequest(we5Input(lib, { ...oneOil(lib), sizing: { mode: "total", amountMg: 500000 } })),
    );
    await renderDetail(saved.formula.id);
    const dialog = await openDialog("Scale version 1");
    const amount = within(dialog).getByLabelText("Amount (g)");
    type(amount, "500.55");
    fireEvent.blur(amount);
    expect(
      within(dialog).getByText(
        "This formula rounds to 0.1 g. Enter 500.5 or 500.6, or switch precision to 0.01 g.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/New total mixture/)).toBeNull();
    fireEvent.click(saveButton(dialog));
    expect(await versionsOf(saved.formula.id)).toHaveLength(1);
  });

  it("a scale that rounds an oil to 0 g shows V-15 and Save writes nothing", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(
      newFormulaRequest(
        we5Input(lib, {
          ...oneOil(lib),
          sizing: { mode: "total", amountMg: 10000 },
          precisionMg: 1000,
        }),
      ),
    );
    await renderDetail(saved.formula.id);
    const dialog = await openDialog("Scale version 1");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Multiplier" }));
    type(within(dialog).getByLabelText("Multiplier (×)"), "0.5");

    expect(
      within(dialog).getByText(
        "Lavender rounds to 0 g at this precision. Use a finer precision or a larger batch.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/Soy wax/)).toBeNull();
    fireEvent.click(saveButton(dialog));
    expect(await versionsOf(saved.formula.id)).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("scale dialog: saving", () => {
  it("a double submit writes one version", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Vessels"), "10");
    const spy = vi.spyOn(layer().versions, "save");
    const button = saveButton(dialog);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await versionsOf(s.formulaId)).toHaveLength(2);
  });

  it("a rejected save shows an error with Retry, keeps the dialog open, and Retry succeeds with the same id", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Vessels"), "10");
    const spy = vi
      .spyOn(layer().versions, "save")
      .mockRejectedValueOnce(new Error("storage is full"));

    fireEvent.click(saveButton(dialog));
    expect(await within(dialog).findByText(S.saveFailed)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await versionsOf(s.formulaId)).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole("button", { name: S.retry }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0].versionId).toBe(spy.mock.calls[0][0].versionId);
    expect(await versionsOf(s.formulaId)).toHaveLength(2);
  });

  it("reopening after Cancel starts again from the source values", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    let dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Vessels"), "10");
    type(within(dialog).getByLabelText("Fill (g)"), "90");
    fireEvent.click(within(dialog).getByRole("button", { name: S.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await versionsOf(s.formulaId)).toHaveLength(1);

    dialog = await openDialog("Scale version 1");
    expect(within(dialog).getByLabelText("Vessels")).toHaveValue("6");
    expect(within(dialog).getByLabelText("Fill (g)")).toHaveValue("180");
    expect(within(dialog).queryByText(/Soy wax/)).toBeInTheDocument();
    expect(within(dialog).getByText("New total mixture: 1080.0 g")).toBeInTheDocument();
  });
});

describe("scale on the formula page", () => {
  it("saving on the formula page shows 'Saved as version 2' and the new latest version", async () => {
    const s = await seed();
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Vessels"), "10");
    fireEvent.click(saveButton(dialog));

    expect(await screen.findByText(MESSAGES.editor.savedAsVersion(2))).toBeInTheDocument();
    // The same confirmation as a save from the editor, with its next step.
    expect(
      screen.getByRole("button", { name: MESSAGES.editor.enterMeasured }),
    ).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
    expect(await screen.findByText(/Version 2/)).toBeInTheDocument();
  });

  it("on the version view of an older version it navigates with ?saved=", async () => {
    const s = await seed();
    const scaled = await layer().versions.save({
      versionId: crypto.randomUUID(),
      target: { kind: "existing", formulaId: s.formulaId },
      origin: "scaled",
      parentVersionId: s.v1.id,
      scale: { method: "vesselCount", factorX10000: 16667 },
      input: we5Input(s.lib, { sizing: { mode: "vessels", count: 10, fillMg: 180000 } }),
      draftKey: null,
    });
    expect(scaled.version.number).toBe(2);

    await renderDetail(s.formulaId, s.v1.id);
    const dialog = await openDialog("Scale version 1");
    expect(within(dialog).getByText(/This saves as version 3\./)).toBeInTheDocument();
    type(within(dialog).getByLabelText("Vessels"), "12");
    fireEvent.click(saveButton(dialog));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(`/formulas/${s.formulaId}?saved=3`));
    const all = await versionsOf(s.formulaId);
    expect(all.map((v) => v.number)).toEqual([3, 2, 1]);
    expect(all[0].parentVersionId).toBe(s.v1.id);
    expect(all[0].origin).toBe("scaled");
  });

  it("scaling an archived formula is allowed", async () => {
    const s = await seed();
    await layer().formulas.setArchived(s.formulaId, true);
    await renderDetail(s.formulaId);
    const dialog = await openDialog("Scale version 1");
    type(within(dialog).getByLabelText("Vessels"), "10");
    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await versionsOf(s.formulaId)).toHaveLength(2);
  });
});

describe("revise next to scale", () => {
  it("revising version 1 of a formula with a scaled version 2 makes version 3 and leaves 1 and 2 alone", async () => {
    const s = await seed();
    const scaled = await layer().versions.save({
      versionId: crypto.randomUUID(),
      target: { kind: "existing", formulaId: s.formulaId },
      origin: "scaled",
      parentVersionId: s.v1.id,
      scale: { method: "vesselCount", factorX10000: 16667 },
      input: we5Input(s.lib, { sizing: { mode: "vessels", count: 10, fillMg: 180000 } }),
      draftKey: null,
    });
    const v1Before = await layer().versions.get(s.v1.id);
    const v2Before = await layer().versions.get(scaled.version.id);

    const revised = await layer().versions.save(
      revisionRequest(s.formulaId, s.v1.id, we5Input(s.lib, { changeNote: "more lavender" })),
    );

    expect(revised.version.number).toBe(3);
    expect(revised.version.origin).toBe("revision");
    expect(revised.version.parentVersionId).toBe(s.v1.id);
    expect(revised.version.scale).toBeNull();
    expect(await layer().versions.get(s.v1.id)).toEqual(v1Before);
    expect(await layer().versions.get(scaled.version.id)).toEqual(v2Before);
    expect((await layer().formulas.get(s.formulaId))?.latestVersionNumber).toBe(3);
  });
});
