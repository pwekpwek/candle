import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FormulaDetail } from "@/components/formulas/detail";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { DataLayer } from "@/lib/db";
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
const V01 = "Use numbers only, with a period for decimals (for example 462.5). No commas.";

// Radix menus and popovers expect these browser APIs, which jsdom lacks.
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
  // The component uses the singleton on the default database: start each test empty.
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

type Seeded = {
  lib: Library;
  formulaId: string;
  v1: FormulaVersion;
  wax: string;
  oils: string[];
};

/** WE-5 saved through the real data layer: wax 1000.0 g, oils 40.0, 26.7, 13.3 g. */
async function seedWE5(): Promise<Seeded> {
  const lib = await makeLibrary(layer());
  const saved = await layer().versions.save(newFormulaRequest(we5Input(lib)));
  const v1 = saved.version;
  return {
    lib,
    formulaId: saved.formula.id,
    v1,
    wax: v1.inputs.waxes[0].componentId,
    oils: v1.inputs.oils.map((o) => o.componentId),
  };
}

async function renderDetail(formulaId: string, versionId?: string) {
  render(<FormulaDetail formulaId={formulaId} versionId={versionId} />);
  await screen.findByLabelText(F.measuredFieldLabel("Soy wax"));
}

const field = (name: string) =>
  screen.getByLabelText(F.measuredFieldLabel(name)) as HTMLInputElement;

function enter(name: string, value: string) {
  fireEvent.change(field(name), { target: { value } });
}

function enterAndBlur(name: string, value: string) {
  enter(name, value);
  fireEvent.blur(field(name));
}

const row = (name: string) => {
  const table = screen.getByRole("table");
  const cell = within(table).getByText(name, { selector: "th" });
  return within(cell.closest("tr") as HTMLElement);
};

const summaryRow = (name: string) =>
  within(
    within(screen.getByRole("table"))
      .getByRole("rowheader", { name })
      .closest("tr") as HTMLElement,
  );

async function enterWE8() {
  enter("Soy wax", "1003.2");
  enter("Lavender", "40.4");
  enter("Vanilla", "26.1");
  enterAndBlur("Cedarwood", "13.9");
}

async function openMenuItem(name: string) {
  const trigger = screen.getByRole("button", { name: F.moreActions });
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name }));
}

describe("measured weights: WE-8", () => {
  it("shows every row of the WE-8 table, the actual blend and the oil shares", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    await enterWE8();

    expect(row("Soy wax").getByText("1000.0 g")).toBeInTheDocument();
    expect(row("Soy wax").getByText("+3.2 g +0.32%")).toBeInTheDocument();
    expect(row("Lavender").getByText("40.0 g")).toBeInTheDocument();
    expect(row("Lavender").getByText("+0.4 g +1.00%")).toBeInTheDocument();
    expect(row("Vanilla").getByText("26.7 g")).toBeInTheDocument();
    expect(row("Vanilla").getByText("0.6 g under plan (-2.25%)")).toBeInTheDocument();
    expect(row("Cedarwood").getByText("13.3 g")).toBeInTheDocument();
    expect(row("Cedarwood").getByText("0.6 g over plan (+4.51%)")).toBeInTheDocument();

    const fragrance = summaryRow("Fragrance");
    expect(fragrance.getByText("80.0 g")).toBeInTheDocument();
    expect(fragrance.getByText("80.4 g")).toBeInTheDocument();
    expect(fragrance.getByText("+0.4 g +0.50%")).toBeInTheDocument();
    const total = summaryRow("Total mixture");
    expect(total.getByText("1080.0 g")).toBeInTheDocument();
    expect(total.getByText("1083.6 g")).toBeInTheDocument();
    expect(total.getByText("+3.6 g +0.33%")).toBeInTheDocument();

    const planned = screen.getByRole("region", { name: "Planned blend" });
    expect(within(planned).getByText("8% of wax weight")).toBeInTheDocument();
    expect(within(planned).getByText("= 7.41% of total mixture")).toBeInTheDocument();

    const actual = screen.getByRole("region", { name: "Actual blend" });
    expect(within(actual).getByText("8.01% of wax weight")).toBeInTheDocument();
    expect(within(actual).getByText("= 7.42% of total mixture")).toBeInTheDocument();
    expect(within(actual).getByText("50.25%")).toBeInTheDocument();
    expect(within(actual).getByText("32.46%")).toBeInTheDocument();
    expect(within(actual).getByText("17.29%")).toBeInTheDocument();
  });

  it("never changes the planned figures or the stored version", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    const planned = ["Soy wax", "Lavender", "Vanilla", "Cedarwood"].map(
      (n) => row(n).getAllByRole("cell")[0].textContent,
    );
    expect(planned).toEqual(["1000.0 g", "40.0 g", "26.7 g", "13.3 g"]);
    expect(summaryRow("Fragrance").getByText("80.0 g")).toBeInTheDocument();
    expect(summaryRow("Total mixture").getByText("1080.0 g")).toBeInTheDocument();
    const before = await layer().versions.get(s.v1.id);

    await enterWE8();
    await screen.findByText("Saved");

    const after = ["Soy wax", "Lavender", "Vanilla", "Cedarwood"].map(
      (n) => row(n).getAllByRole("cell")[0].textContent,
    );
    expect(after).toEqual(planned);
    expect(summaryRow("Fragrance").getByText("80.0 g")).toBeInTheDocument();
    expect(summaryRow("Total mixture").getByText("1080.0 g")).toBeInTheDocument();
    expect(await layer().versions.get(s.v1.id)).toEqual(before);
  });

  it("with only wax and oil A entered, shows two differences and asks for the rest", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enter("Soy wax", "1003.2");
    enter("Lavender", "40.4");

    expect(row("Soy wax").getByText("+3.2 g +0.32%")).toBeInTheDocument();
    expect(row("Lavender").getByText("+0.4 g +1.00%")).toBeInTheDocument();
    const actual = screen.getByRole("region", { name: "Actual blend" });
    expect(within(actual).getByText(MESSAGES.results.enterAllMeasured)).toBeInTheDocument();
    expect(within(actual).queryByText("8.01% of wax weight")).not.toBeInTheDocument();
    expect(summaryRow("Total mixture").queryByText("1083.6 g")).not.toBeInTheDocument();
  });
});

describe("autosave", () => {
  it("goes Saving then Saved and the record holds the entries", async () => {
    const s = await seedWE5();
    const original = layer().measurements.saveEntries.bind(layer().measurements);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(layer().measurements, "saveEntries").mockImplementationOnce(async (...args) => {
      await gate;
      return original(...args);
    });
    await renderDetail(s.formulaId);

    enterAndBlur("Soy wax", "1003.2");
    expect(await screen.findByText("Saving…")).toBeInTheDocument();
    release();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    const record = await layer().measurements.getForVersion(s.v1.id);
    expect(record?.entries).toEqual([{ componentId: s.wax, actualMg: 1003200 }]);
  });

  it("shows Saving while a typed value waits for its pause, never Saved early (PRD-20)", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enterAndBlur("Soy wax", "1003.2");
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    // A second value typed without a blur: its save is still waiting.
    enter("Lavender", "40.4");
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    await waitFor(async () => {
      const record = await layer().measurements.getForVersion(s.v1.id);
      expect(record?.entries).toHaveLength(2);
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("saves a value still waiting for its pause when the page is closed", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enter("Soy wax", "1003.2");
    window.dispatchEvent(new Event("pagehide"));
    await waitFor(async () => {
      const record = await layer().measurements.getForVersion(s.v1.id);
      expect(record?.entries).toEqual([{ componentId: s.wax, actualMg: 1003200 }]);
    });
  });

  it("saves after a pause in typing, without a blur", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enter("Soy wax", "1003.2");
    expect(await layer().measurements.getForVersion(s.v1.id)).toBeUndefined();
    await waitFor(
      async () => {
        const record = await layer().measurements.getForVersion(s.v1.id);
        expect(record?.entries).toEqual([{ componentId: s.wax, actualMg: 1003200 }]);
      },
      { timeout: 3000 },
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("shows the saved values again when the page is reopened", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enter("Soy wax", "1003.2");
    enterAndBlur("Vanilla", "26.1");
    await screen.findByText("Saved");
    cleanup();

    await renderDetail(s.formulaId);
    expect(field("Soy wax").value).toBe("1003.2");
    expect(field("Vanilla").value).toBe("26.1");
    expect(field("Lavender").value).toBe("");
    expect(row("Vanilla").getByText("0.6 g under plan (-2.25%)")).toBeInTheDocument();
  });

  it("accepts a second decimal at 0.1 g and shows it as typed", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enterAndBlur("Vanilla", "26.15");
    await screen.findByText("Saved");
    expect(field("Vanilla").value).toBe("26.15");
    expect(screen.queryByText(V01)).not.toBeInTheDocument();
    const record = await layer().measurements.getForVersion(s.v1.id);
    expect(record?.entries).toEqual([{ componentId: s.oils[1], actualMg: 26150 }]);
    cleanup();
    await renderDetail(s.formulaId);
    expect(field("Vanilla").value).toBe("26.15");
  });

  it("removes an entry when its field is cleared, and saves [] when all are", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enter("Soy wax", "1003.2");
    enterAndBlur("Vanilla", "26.1");
    await waitFor(async () => {
      const record = await layer().measurements.getForVersion(s.v1.id);
      expect(record?.entries).toHaveLength(2);
    });
    enterAndBlur("Soy wax", "");
    await waitFor(async () => {
      const record = await layer().measurements.getForVersion(s.v1.id);
      expect(record?.entries).toEqual([{ componentId: s.oils[1], actualMg: 26100 }]);
    });
    enterAndBlur("Vanilla", "");
    await waitFor(async () => {
      const record = await layer().measurements.getForVersion(s.v1.id);
      expect(record?.entries).toEqual([]);
    });
  });

  it.each(["-2", "1,5"])("refuses %s with the V-01 message and saves nothing", async (bad) => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enterAndBlur("Soy wax", bad);
    expect(await screen.findByText(V01)).toBeInTheDocument();
    expect(field("Soy wax")).toHaveAttribute("aria-invalid", "true");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await layer().measurements.getForVersion(s.v1.id)).toBeUndefined();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();

    // A valid keystroke clears the message.
    enter("Soy wax", "1003");
    await waitFor(() => expect(screen.queryByText(V01)).not.toBeInTheDocument());
  });

  it("does not save a valid field while another one is invalid", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    enter("Soy wax", "abc");
    enterAndBlur("Vanilla", "26.1");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await layer().measurements.getForVersion(s.v1.id)).toBeUndefined();
  });

  it("shows Error with Retry for a rejected save, keeps the text, and Retry saves", async () => {
    const s = await seedWE5();
    vi.spyOn(layer().measurements, "saveEntries").mockRejectedValueOnce(new Error("boom"));
    await renderDetail(s.formulaId);

    enterAndBlur("Soy wax", "1003.2");
    expect(await screen.findByText("Error")).toBeInTheDocument();
    expect(field("Soy wax").value).toBe("1003.2");
    expect(row("Soy wax").getByText("+3.2 g +0.32%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    const record = await layer().measurements.getForVersion(s.v1.id);
    expect(record?.entries).toEqual([{ componentId: s.wax, actualMg: 1003200 }]);
  });

  it("does not overlap saves: a change during a save is saved afterwards", async () => {
    const s = await seedWE5();
    const original = layer().measurements.saveEntries.bind(layer().measurements);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi
      .spyOn(layer().measurements, "saveEntries")
      .mockImplementationOnce(async (...args) => {
        await gate;
        return original(...args);
      });
    await renderDetail(s.formulaId);

    enterAndBlur("Soy wax", "1003.2");
    await screen.findByText("Saving…");
    enterAndBlur("Vanilla", "26.1");
    expect(spy).toHaveBeenCalledTimes(1);
    release();
    await waitFor(async () => {
      const record = await layer().measurements.getForVersion(s.v1.id);
      expect(record?.entries).toHaveLength(2);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("snapshots and history", () => {
  it("keeps the snapshot name and adds a 'now called' hint after a library rename", async () => {
    const s = await seedWE5();
    await layer().materials.update(s.lib.oilIds[0], { type: "fragranceOil", name: "Lavender Fine" });
    await renderDetail(s.formulaId);

    const lavender = row("Lavender");
    expect(lavender.getByText(F.nowCalled("Lavender Fine"))).toBeInTheDocument();
    expect(lavender.getByText("40.0 g")).toBeInTheDocument();
    expect(row("Soy wax").queryByText(/now called/)).not.toBeInTheDocument();
    expect(row("Vanilla").getByText("26.7 g")).toBeInTheDocument();
    expect(screen.queryByText("Lavender Fine", { selector: "th" })).not.toBeInTheDocument();
  });

  async function seedThreeVersions() {
    const s = await seedWE5();
    const v2 = (
      await layer().versions.save(
        revisionRequest(s.formulaId, s.v1.id, we5Input(s.lib, { changeNote: "cedar added" })),
      )
    ).version;
    const v3 = (
      await layer().versions.save({
        versionId: crypto.randomUUID(),
        target: { kind: "existing", formulaId: s.formulaId },
        origin: "scaled",
        parentVersionId: v2.id,
        scale: { method: "vesselCount", factorX10000: 16667 },
        input: we5Input(s.lib, { sizing: { mode: "vessels", count: 10, fillMg: 180000 } }),
        draftKey: null,
      })
    ).version;
    return { ...s, v2, v3 };
  }

  it("lists every version, highest first, with origin, date, total, link and current mark", async () => {
    const s = await seedThreeVersions();
    await renderDetail(s.formulaId);

    const items = within(screen.getByRole("heading", { name: "Versions" }).closest("section")!)
      .getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const [i3, i2, i1] = items.map((li) => within(li));
    expect(i3.getByText("v3")).toBeInTheDocument();
    expect(i3.getByText(/Scaled x1\.67 from v2/)).toBeInTheDocument();
    expect(i3.getByText("1800.0 g")).toBeInTheDocument();
    expect(i3.getByText("8% of wax weight")).toBeInTheDocument();
    expect(i2.getByText("v2")).toBeInTheDocument();
    expect(i2.getByText(/Revision: cedar added/)).toBeInTheDocument();
    expect(i2.getByText("1080.0 g")).toBeInTheDocument();
    expect(i1.getByText("v1")).toBeInTheDocument();
    expect(i1.getByText(/First version/)).toBeInTheDocument();

    const links = items.map((li) => within(li).getByRole("link"));
    expect(links[0]).toHaveAttribute("href", `/formulas/${s.formulaId}`);
    expect(links[1]).toHaveAttribute("href", `/formulas/${s.formulaId}/versions/${s.v2.id}`);
    expect(links[2]).toHaveAttribute("href", `/formulas/${s.formulaId}/versions/${s.v1.id}`);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");

    // The header describes the latest version.
    expect(
      screen.getByText(/Version 3 · scaled x1\.67 from v2 · .* · 10 vessels × 180\.0 g/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: F.revise })).toHaveAttribute(
      "href",
      `/formulas/${s.formulaId}/revise?from=${s.v3.id}`,
    );
    // T21: Scale is a button that opens the scale dialog, not a link.
    expect(screen.getByRole("button", { name: F.scale })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: F.scale })).not.toBeInTheDocument();
  });

  it("the version view of v1 shows v1's own figures and says it is not the latest", async () => {
    const s = await seedThreeVersions();
    await renderDetail(s.formulaId, s.v1.id);

    expect(screen.getByText(/Version 1 · first version · .* · 6 vessels × 180\.0 g/)).toBeInTheDocument();
    expect(summaryRow("Total mixture").getByText("1080.0 g")).toBeInTheDocument();
    expect(screen.queryByText("1800.0 g", { selector: "td span" })).not.toBeInTheDocument();
    expect(screen.getByText(F.notLatestNotice(1, 3))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: F.openLatest })).toHaveAttribute(
      "href",
      `/formulas/${s.formulaId}`,
    );
    const current = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveAttribute("href", `/formulas/${s.formulaId}/versions/${s.v1.id}`);
    expect(screen.getByRole("link", { name: F.revise })).toHaveAttribute(
      "href",
      `/formulas/${s.formulaId}/revise?from=${s.v1.id}`,
    );
  });

  it("shows a version's wick, vessel and notes", async () => {
    const lib = await makeLibrary(layer());
    const saved = await layer().versions.save(
      newFormulaRequest(we5Input(lib, { notes: "Pour at 55 C" })),
    );
    await layer().formulas.updateDetails(saved.formula.id, {
      name: "Lavender Vanilla Cedar",
      notes: "Gift batch",
    });
    await renderDetail(saved.formula.id);
    expect(screen.getByText("Wick A")).toBeInTheDocument();
    expect(screen.getByText("Tin 180")).toBeInTheDocument();
    expect(screen.getByText("Pour at 55 C")).toBeInTheDocument();
    expect(screen.getByText("Gift batch")).toBeInTheDocument();
  });
});

describe("saved confirmation", () => {
  it("shows 'Saved as version N' with both actions and removes the parameter", async () => {
    const s = await seedWE5();
    nav.search = "saved=1";
    await renderDetail(s.formulaId);

    expect(screen.getByText("Saved as version 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: MESSAGES.editor.backToSaved })).toHaveAttribute(
      "href",
      "/",
    );
    fireEvent.click(screen.getByRole("button", { name: MESSAGES.editor.enterMeasured }));
    expect(field("Soy wax")).toHaveFocus();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/formulas/${s.formulaId}`));
  });

  it("shows nothing without the parameter", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    expect(screen.queryByText(/Saved as version/)).not.toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("formula actions", () => {
  it("renames and edits notes without creating a version", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    await openMenuItem(F.editDetails);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(F.nameLabel), { target: { value: "  Lavender Dream  " } });
    fireEvent.change(within(dialog).getByLabelText(F.notesLabel), { target: { value: "Gift batch" } });
    fireEvent.click(within(dialog).getByRole("button", { name: F.saveDetails }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { level: 1, name: "Lavender Dream" })).toBeInTheDocument();
    expect(screen.getByText("Gift batch")).toBeInTheDocument();
    const formula = await layer().formulas.get(s.formulaId);
    expect(formula?.name).toBe("Lavender Dream");
    expect(formula?.notes).toBe("Gift batch");
    expect(formula?.latestVersionNumber).toBe(1);
    expect(await layer().versions.listByFormula(s.formulaId)).toHaveLength(1);
  });

  it("keeps the dialog open and explains an empty name", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    await openMenuItem(F.editDetails);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(F.nameLabel), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: F.saveDetails }));
    expect(await within(dialog).findByText("Give this formula a name.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect((await layer().formulas.get(s.formulaId))?.name).toBe("Lavender Vanilla Cedar");
  });

  it("keeps the dialog open when the save fails", async () => {
    const s = await seedWE5();
    vi.spyOn(layer().formulas, "updateDetails").mockRejectedValueOnce(new Error("boom"));
    await renderDetail(s.formulaId);
    await openMenuItem(F.editDetails);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(F.nameLabel), { target: { value: "New name" } });
    fireEvent.click(within(dialog).getByRole("button", { name: F.saveDetails }));
    expect(await within(dialog).findByText(F.detailsSaveFailed)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(F.nameLabel)).toHaveValue("New name");
  });

  it("archives and unarchives", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    expect(screen.queryByText(F.archivedBadge, { exact: true })).not.toBeInTheDocument();

    await openMenuItem(F.archive);
    expect(await screen.findByText(F.archivedBadge, { exact: true })).toBeInTheDocument();
    expect(screen.getByText(F.archivedDone)).toBeInTheDocument();
    expect((await layer().formulas.get(s.formulaId))?.archivedAt).not.toBeNull();

    await openMenuItem(F.unarchive);
    await waitFor(() =>
      expect(screen.queryByText(F.archivedBadge, { exact: true })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(F.unarchivedDone)).toBeInTheDocument();
    expect((await layer().formulas.get(s.formulaId))?.archivedAt).toBeNull();
  });

  it("deletes permanently after a confirmation that names the formula and the counts", async () => {
    const s = await seedWE5();
    await layer().measurements.saveEntries(s.v1.id, [{ componentId: s.wax, actualMg: 1003200 }]);
    await renderDetail(s.formulaId);
    await openMenuItem(F.deletePermanently);

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(
        "This removes Lavender Vanilla Cedar, its 1 version and 1 measured-weights record. This cannot be undone.",
      ),
    ).toBeInTheDocument();
    const destructive = within(dialog).getByRole("button", { name: F.deleteConfirm });
    expect(destructive).not.toHaveFocus();
    expect(nav.replace).not.toHaveBeenCalled();

    fireEvent.click(destructive);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
    expect(await layer().formulas.get(s.formulaId)).toBeUndefined();
    expect(await layer().versions.listByFormula(s.formulaId)).toEqual([]);
    expect(await layer().measurements.listByFormula(s.formulaId)).toEqual([]);
  });

  it("keeping the formula closes the confirmation and deletes nothing", async () => {
    const s = await seedWE5();
    await renderDetail(s.formulaId);
    await openMenuItem(F.deletePermanently);
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/This removes/);
    fireEvent.click(within(dialog).getByRole("button", { name: F.deleteKeep }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await layer().formulas.get(s.formulaId)).toBeDefined();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("not found and failure", () => {
  it("shows a calm not-found state for a missing formula", async () => {
    render(<FormulaDetail formulaId="abc" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: F.notFoundTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: MESSAGES.editor.backToSaved })).toHaveAttribute("href", "/");
  });

  it("shows a not-found state for a missing version, with a link to the formula", async () => {
    const s = await seedWE5();
    render(<FormulaDetail formulaId={s.formulaId} versionId="v1" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: F.notFoundVersionTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: F.openLatest })).toHaveAttribute(
      "href",
      `/formulas/${s.formulaId}`,
    );
    expect(screen.getByRole("link", { name: MESSAGES.editor.backToSaved })).toBeInTheDocument();
  });

  it("shows a notice with Try again when loading fails", async () => {
    const s = await seedWE5();
    vi.spyOn(layer().formulas, "get").mockRejectedValueOnce(new Error("boom"));
    render(<FormulaDetail formulaId={s.formulaId} />);
    expect(await screen.findByText(F.loadFailedTitle)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: F.tryAgain }));
    expect(await screen.findByLabelText(F.measuredFieldLabel("Soy wax"))).toBeInTheDocument();
  });
});
