import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FormulaEditor } from "@/components/editor";
import { getDataLayer } from "@/lib/db";
import { MESSAGES, messageForIssue } from "@/lib/messages";
import { makeLibrary, newFormulaRequest, we5Input, type Library } from "../db/harness";
import {
  AMOUNT,
  COUNT,
  FILL,
  NAME,
  PCT,
  choose,
  resetDb,
  resultsPanel,
  saveButton,
  sleep,
  textbox,
  typeInto,
  waitForDraft,
  waitForEditor,
} from "./helpers";

const nav = vi.hoisted(() => ({
  router: {
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => new URLSearchParams(),
}));

const E = MESSAGES.editor;
const R = MESSAGES.results;
let lib: Library;

beforeEach(async () => {
  await resetDb();
  nav.router.replace.mockClear();
  lib = await makeLibrary(getDataLayer());
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  // Let an unmount flush finish before the next test empties the database.
  await sleep(40);
});

async function openNew() {
  render(<FormulaEditor mode="new" />);
  await waitForEditor();
}

/** WE-5 through the interface: 6 vessels x 180 g, 8% of wax weight, 0.1 g, one wax, oils 3:2:1. */
async function typeWE5() {
  typeInto(NAME, "Lavender Vanilla Cedar");
  fireEvent.click(screen.getByRole("radio", { name: E.modeVessels }));
  typeInto(COUNT, "6");
  typeInto(FILL, "180");
  typeInto(PCT, "8");
  await choose("Wax", "Soy wax");
  fireEvent.click(screen.getByRole("button", { name: E.addOil }));
  fireEvent.click(screen.getByRole("button", { name: E.addOil }));
  await choose("Oil 1", "Lavender");
  await choose("Oil 2", "Vanilla");
  await choose("Oil 3", "Cedarwood");
  typeInto("Parts (Oil 1)", "3");
  typeInto("Parts (Oil 2)", "2");
  typeInto("Parts (Oil 3)", "1");
}

/** A valid total-mixture formula: 1000 g, 8%, one wax, one oil. */
async function typeBase() {
  typeInto(NAME, "Base");
  typeInto(AMOUNT, "1000");
  typeInto(PCT, "8");
  await choose("Wax", "Soy wax");
  await choose("Oil 1", "Lavender");
}

const expectIncomplete = () => {
  const panel = resultsPanel();
  expect(within(panel).getByText(R.incomplete)).toBeInTheDocument();
  expect(within(panel).queryByRole("table")).not.toBeInTheDocument();
};

describe("live results (WE-5)", () => {
  it("shows the plan, the derived total and the basis sentence as WE-5 is typed", async () => {
    await openNew();
    expectIncomplete();
    await typeWE5();

    const panel = within(resultsPanel());
    for (const g of ["1000.0 g", "80.0 g", "40.0 g", "26.7 g", "13.3 g", "1080.0 g"]) {
      expect(panel.getByText(g)).toBeInTheDocument();
    }
    expect(screen.getByText(`= 1080.0 g ${E.derivedTotalSuffix}`)).toBeInTheDocument();
    expect(screen.getByTestId("basis-explanation")).toHaveTextContent(
      "8% of wax weight: 8 g of fragrance for every 100 g of wax. That is 7.41% of the total mixture.",
    );
  });

  it("switches the basis sentence with the basis control", async () => {
    await openNew();
    typeInto(PCT, "8");
    fireEvent.click(screen.getByRole("radio", { name: "of total mixture" }));
    expect(screen.getByTestId("basis-explanation")).toHaveTextContent("8.70%");
  });
});

describe("validation behaviour", () => {
  const cases: {
    label: string;
    field: string;
    apply: () => void;
    expected?: string;
  }[] = [
    {
      label: "empty amount",
      field: AMOUNT,
      apply: () => typeInto(AMOUNT, ""),
      expected: messageForIssue({ rule: "V-03", field: "amount", severity: "error" }),
    },
    {
      label: "a comma",
      field: AMOUNT,
      apply: () => typeInto(AMOUNT, "1,000"),
      expected: messageForIssue({ rule: "V-01", field: "amount", severity: "error" }),
    },
    { label: "too many decimals for 0.1 g", field: AMOUNT, apply: () => typeInto(AMOUNT, "500.55") },
    {
      label: "fragrance 80",
      field: PCT,
      apply: () => typeInto(PCT, "80"),
      expected: messageForIssue({ rule: "V-07", field: "fragrancePct", severity: "error" }),
    },
  ];

  for (const c of cases) {
    it(`keeps results empty for ${c.label} and shows the message after blur`, async () => {
      await openNew();
      await typeBase();
      expect(within(resultsPanel()).getByRole("table")).toBeInTheDocument();

      c.apply();
      expectIncomplete();
      const input = textbox(c.field);
      expect(input).not.toHaveAttribute("aria-invalid");

      fireEvent.blur(input);
      expect(input).toHaveAttribute("aria-invalid", "true");
      const message = document.getElementById(input.getAttribute("aria-describedby") ?? "");
      expect(message?.textContent?.trim()).toBeTruthy();
      if (c.expected) expect(message).toHaveTextContent(c.expected);
    });
  }

  it("clears a message as soon as the value becomes valid", async () => {
    await openNew();
    await typeBase();
    typeInto(AMOUNT, "");
    fireEvent.blur(textbox(AMOUNT));
    expect(textbox(AMOUNT)).toHaveAttribute("aria-invalid", "true");
    typeInto(AMOUNT, "1");
    expect(textbox(AMOUNT)).not.toHaveAttribute("aria-invalid");
  });

  it("keeps results empty when the last oil is removed at 8%, and says why", async () => {
    await openNew();
    await typeBase();
    fireEvent.click(screen.getByRole("button", { name: `${E.remove} Oil 1` }));
    expectIncomplete();
    expect(
      screen.getByText(messageForIssue({ rule: "V-11", field: "oils", severity: "error" })),
    ).toBeInTheDocument();
  });

  it("keeps results empty for a second oil with empty parts and tags the parts field", async () => {
    await openNew();
    await typeBase();
    fireEvent.click(screen.getByRole("button", { name: E.addOil }));
    await choose("Oil 2", "Vanilla");
    typeInto("Parts (Oil 1)", "1");
    expectIncomplete();
    const parts = textbox("Parts (Oil 2)");
    expect(parts).not.toHaveAttribute("aria-invalid");
    fireEvent.blur(parts);
    expect(parts).toHaveAttribute("aria-invalid", "true");
    expect(textbox("Parts (Oil 1)")).not.toHaveAttribute("aria-invalid");
  });

  it("shows the V-08 warning at 13% of wax weight and still saves", async () => {
    await openNew();
    await typeBase();
    typeInto(PCT, "13");
    expect(
      screen.getByText(messageForIssue({ rule: "V-08", field: "fragrancePct", severity: "warning" })),
    ).toBeInTheDocument();
    expect(textbox(PCT)).not.toHaveAttribute("aria-invalid");
    fireEvent.click(saveButton());
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled());
    const formulas = await getDataLayer().formulas.list();
    expect(formulas).toHaveLength(1);
    expect(formulas[0].latestVersion.inputs.fragranceBp).toBe(1300);
  });

  it("reveals parts for both oils with a second oil and hides them when back to one", async () => {
    await openNew();
    expect(screen.queryByRole("textbox", { name: /^Parts/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: E.addOil }));
    expect(textbox("Parts (Oil 1)")).toBeInTheDocument();
    expect(textbox("Parts (Oil 2)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `${E.remove} Oil 2` }));
    expect(screen.queryByRole("textbox", { name: /^Parts/ })).not.toBeInTheDocument();
  });

  it("shows parts for waxes only from the second wax, and caps the rows", async () => {
    await openNew();
    expect(screen.queryByRole("button", { name: `${E.remove} Wax` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: E.addAnotherWax }));
    expect(textbox("Parts (Wax 1)")).toBeInTheDocument();
    expect(textbox("Parts (Wax 2)")).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: E.addAnotherWax }));
    }
    expect(screen.queryByRole("button", { name: E.addAnotherWax })).not.toBeInTheDocument();
  });

  it("does not offer a material already chosen in another row of the same blend", async () => {
    await openNew();
    fireEvent.click(screen.getByRole("button", { name: E.addOil }));
    await choose("Oil 1", "Lavender");
    const second = (await screen.findByRole("combobox", { name: "Oil 2" })) as HTMLSelectElement;
    await waitFor(() => expect(within(second).getAllByRole("option").length).toBeGreaterThan(1));
    const names = within(second)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).not.toContain("Lavender");
    expect(names).toContain("Vanilla");
  });

  it("with problems, Save writes nothing, shows every message and focuses the first problem", async () => {
    await openNew();
    fireEvent.click(saveButton());
    await sleep(20);
    expect(await getDataLayer().formulas.list()).toHaveLength(0);
    expect(textbox(NAME)).toHaveFocus();
    expect(textbox(NAME)).toHaveAttribute("aria-invalid", "true");
    expect(textbox(AMOUNT)).toHaveAttribute("aria-invalid", "true");
    expect(textbox(PCT)).toHaveAttribute("aria-invalid", "true");
    expect(nav.router.replace).not.toHaveBeenCalled();

    typeInto(NAME, "Named");
    fireEvent.click(saveButton());
    expect(textbox(AMOUNT)).toHaveFocus();
  });

  it("focuses the first problem in screen order when the wax is missing", async () => {
    await openNew();
    typeInto(NAME, "Named");
    typeInto(AMOUNT, "1000");
    typeInto(PCT, "8");
    // Focus cannot land on a picker that is still loading its list.
    const wax = await screen.findByRole("combobox", { name: "Wax" });
    await waitFor(() => expect(wax).toBeEnabled());
    fireEvent.click(saveButton());
    expect(wax).toHaveFocus();
  });

  it("keeps the Save mousedown from blurring the focused field", async () => {
    await openNew();
    const name = textbox(NAME);
    name.focus();
    const proceeded = fireEvent.mouseDown(saveButton());
    expect(proceeded).toBe(false);
    expect(name).toHaveFocus();
  });
});

describe("save", () => {
  it("saves WE-5 as formula + version 1, removes the draft and goes to the formula page", async () => {
    await openNew();
    await typeWE5();
    await waitForDraft("new");
    fireEvent.click(saveButton());
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledTimes(1));

    const formulas = await getDataLayer().formulas.list();
    expect(formulas).toHaveLength(1);
    const { formula, latestVersion } = formulas[0];
    expect(formula.name).toBe("Lavender Vanilla Cedar");
    expect(latestVersion.number).toBe(1);
    expect(latestVersion.origin).toBe("initial");
    expect(latestVersion.parentVersionId).toBeNull();
    expect(latestVersion.inputs.sizing).toEqual({ mode: "vessels", count: 6, fillMg: 180000 });
    expect(latestVersion.inputs.fragranceBp).toBe(800);
    expect(latestVersion.targets.totalMg).toBe(1080000);
    expect(latestVersion.targets.components.map((c) => c.targetMg)).toEqual([
      1000000, 40000, 26700, 13300,
    ]);
    expect(latestVersion.targets.waxTotalMg).toBe(1000000);
    expect(latestVersion.targets.fragranceTotalMg).toBe(80000);
    expect(await getDataLayer().drafts.get("new")).toBeUndefined();
    expect(nav.router.replace).toHaveBeenCalledWith(`/formulas/${formula.id}?saved=1`);
  });

  it("creates exactly one version for two Save clicks in the same tick", async () => {
    await openNew();
    await typeBase();
    const button = saveButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled());
    await sleep(50);
    const formulas = await getDataLayer().formulas.list();
    expect(formulas).toHaveLength(1);
    expect(await getDataLayer().versions.listByFormula(formulas[0].formula.id)).toHaveLength(1);
  });

  it("creates exactly one version for Enter plus a click", async () => {
    await openNew();
    await typeBase();
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    fireEvent.click(saveButton());
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalled());
    await sleep(50);
    const formulas = await getDataLayer().formulas.list();
    expect(formulas).toHaveLength(1);
    expect(await getDataLayer().versions.listByFormula(formulas[0].formula.id)).toHaveLength(1);
  });

  it("shows the failure with Retry, keeps the draft, and Retry succeeds", async () => {
    await openNew();
    await typeBase();
    const spy = vi
      .spyOn(getDataLayer().versions, "save")
      .mockRejectedValueOnce(new Error("disk full"));
    fireEvent.click(saveButton());
    expect(await screen.findByText(E.saveFailed)).toBeInTheDocument();
    expect(nav.router.replace).not.toHaveBeenCalled();
    await waitForDraft("new");
    // Typing still works.
    typeInto(NAME, "Base 2");
    expect(textbox(NAME)).toHaveValue("Base 2");

    fireEvent.click(screen.getByRole("button", { name: E.retry }));
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledTimes(1));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0].versionId).toBe(spy.mock.calls[1][0].versionId);
    const formulas = await getDataLayer().formulas.list();
    expect(formulas).toHaveLength(1);
    expect(await getDataLayer().drafts.get("new")).toBeUndefined();
  });
});

describe("drafts", () => {
  it("writes nothing for an untouched editor", async () => {
    await openNew();
    await sleep(900);
    expect(await getDataLayer().drafts.get("new")).toBeUndefined();
    cleanup();
    await sleep(60);
    expect(await getDataLayer().drafts.get("new")).toBeUndefined();
  });

  it("saves a draft after the debounce, restores it with the banner and Discard empties it", async () => {
    await openNew();
    typeInto(NAME, "Half done");
    expect(await getDataLayer().drafts.get("new")).toBeUndefined();
    const draft = await waitForDraft("new");
    expect(draft?.fields.name).toBe("Half done");
    expect(draft?.baseVersionId).toBeNull();

    cleanup();
    await openNew();
    expect(textbox(NAME)).toHaveValue("Half done");
    expect(screen.getByText(/^Restored your unsaved draft from .+\.$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: E.discard }));
    await waitFor(async () => expect(await getDataLayer().drafts.get("new")).toBeUndefined());
    expect(textbox(NAME)).toHaveValue("");
    expect(screen.queryByText(/Restored your unsaved draft/)).not.toBeInTheDocument();
    await sleep(700);
    expect(await getDataLayer().drafts.get("new")).toBeUndefined();
  });

  it("flushes a pending draft when the editor unmounts", async () => {
    await openNew();
    typeInto(NAME, "Leaving");
    cleanup();
    await waitForDraft("new", 1000);
  });

  it("keeps typing and live results working when the draft cannot be written", async () => {
    vi.spyOn(getDataLayer().drafts, "put").mockRejectedValue(new Error("quota"));
    await openNew();
    await typeBase();
    await sleep(700);
    expect(within(resultsPanel()).getByRole("table")).toBeInTheDocument();
  });
});

describe("start from an example", () => {
  it("fills the WE-5 fields, creates the four example materials and cleans the address", async () => {
    render(<FormulaEditor mode="new" example />);
    await waitForEditor();
    await waitFor(() => expect(textbox(NAME)).toHaveValue("Lavender Vanilla Cedar (example)"));
    expect(textbox(COUNT)).toHaveValue("6");
    expect(textbox(FILL)).toHaveValue("180");
    expect(textbox(PCT)).toHaveValue("8");
    expect(nav.router.replace).toHaveBeenCalledWith("/formulas/new");

    const names = (await getDataLayer().materials.list()).map((m) => m.name);
    for (const n of [
      "Soy wax (example)",
      "Lavender (example)",
      "Vanilla (example)",
      "Cedarwood (example)",
    ]) {
      expect(names).toContain(n);
    }
    await waitFor(() => expect(within(resultsPanel()).getByText("1080.0 g")).toBeInTheDocument());
    // Nothing is a formula until Save; the example is held as the unsaved draft.
    expect(await getDataLayer().formulas.list()).toHaveLength(0);
    await waitForDraft("new");
  });
});

describe("revise", () => {
  async function seedV1() {
    return getDataLayer().versions.save(newFormulaRequest(we5Input(lib)));
  }

  it("pre-fills from the version, shows the banner and saves version 2", async () => {
    const { formula, version } = await seedV1();
    const before = JSON.stringify(await getDataLayer().versions.get(version.id));
    render(<FormulaEditor mode="revise" formulaId={formula.id} fromVersionId={version.id} />);
    await waitForEditor();

    expect(
      screen.getByRole("heading", { level: 1, name: "Lavender Vanilla Cedar" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: NAME })).not.toBeInTheDocument();
    expect(screen.getByText(E.revising(1, 2))).toBeInTheDocument();
    expect(textbox(COUNT)).toHaveValue("6");
    expect(textbox(FILL)).toHaveValue("180");
    expect(textbox(PCT)).toHaveValue("8");
    expect(textbox("Parts (Oil 1)")).toHaveValue("3");
    await waitFor(() => expect(within(resultsPanel()).getByText("1080.0 g")).toBeInTheDocument());
    // An untouched revise editor writes no draft.
    await sleep(700);
    expect(await getDataLayer().drafts.get(formula.id)).toBeUndefined();

    typeInto("Parts (Oil 1)", "4");
    typeInto(`${E.whatChanged} (${E.optional})`, "More lavender");
    fireEvent.click(saveButton());
    await waitFor(() => expect(nav.router.replace).toHaveBeenCalledTimes(1));
    expect(nav.router.replace).toHaveBeenCalledWith(`/formulas/${formula.id}?saved=2`);

    const versions = await getDataLayer().versions.listByFormula(formula.id);
    expect(versions.map((v) => v.number)).toEqual([2, 1]);
    expect(versions[0].origin).toBe("revision");
    expect(versions[0].parentVersionId).toBe(version.id);
    expect(versions[0].changeNote).toBe("More lavender");
    expect(JSON.stringify(await getDataLayer().versions.get(version.id))).toBe(before);
    expect((await getDataLayer().formulas.get(formula.id))?.name).toBe("Lavender Vanilla Cedar");
    expect(await getDataLayer().drafts.get(formula.id)).toBeUndefined();
  });

  it("starts from the latest version when no version is named", async () => {
    const { formula } = await seedV1();
    render(<FormulaEditor mode="revise" formulaId={formula.id} fromVersionId={null} />);
    await waitForEditor();
    expect(screen.getByText(E.revising(1, 2))).toBeInTheDocument();
  });

  it("restores a revise draft only for the same base version", async () => {
    const { formula, version } = await seedV1();
    render(<FormulaEditor mode="revise" formulaId={formula.id} fromVersionId={version.id} />);
    await waitForEditor();
    typeInto(PCT, "9");
    const draft = await waitForDraft(formula.id);
    cleanup();

    render(<FormulaEditor mode="revise" formulaId={formula.id} fromVersionId={version.id} />);
    await waitForEditor();
    expect(textbox(PCT)).toHaveValue("9");
    expect(screen.getByText(/Restored your unsaved draft/)).toBeInTheDocument();
    cleanup();

    await getDataLayer().drafts.put(formula.id, "some-other-version", draft!.fields);
    render(<FormulaEditor mode="revise" formulaId={formula.id} fromVersionId={version.id} />);
    await waitForEditor();
    expect(textbox(PCT)).toHaveValue("8");
  });

  it("shows a calm not-found state for a formula that does not exist", async () => {
    render(<FormulaEditor mode="revise" formulaId="abc" fromVersionId={null} />);
    expect(
      await screen.findByRole("heading", { level: 1, name: E.notFoundTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(E.notFoundBody)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: E.backToSaved })).toHaveAttribute("href", "/");
  });

  it("shows not-found for a version that is not this formula's", async () => {
    const { formula } = await seedV1();
    render(<FormulaEditor mode="revise" formulaId={formula.id} fromVersionId="nope" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: E.notFoundTitle }),
    ).toBeInTheDocument();
  });

  it("shows a load failure with Retry", async () => {
    const { formula } = await seedV1();
    const spy = vi.spyOn(getDataLayer().formulas, "get").mockRejectedValueOnce(new Error("boom"));
    render(<FormulaEditor mode="revise" formulaId={formula.id} fromVersionId={null} />);
    fireEvent.click(await screen.findByRole("button", { name: E.retry }));
    await waitForEditor();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
