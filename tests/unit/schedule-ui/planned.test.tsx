import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CreateBatch, formatProducedOn } from "@/components/batches";
import { FormulaDetail } from "@/components/formulas/detail";
import { CreatePlan, PlanView } from "@/components/schedule";
import { MESSAGES } from "@/lib/messages";
import {
  clearDatabase,
  daysFromToday,
  layer,
  makeBatch,
  polyfillBrowser,
  seedFormula,
  seedRevision,
} from "./harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), search: "" }));

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

const S = MESSAGES.schedule;
const B = MESSAGES.batches;
const F = MESSAGES.formula;
const fmt = formatProducedOn;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.search = "";
  await clearDatabase();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const plannedOn = () => screen.getByLabelText(S.plannedOnLabel) as HTMLInputElement;
const planLabel = () => screen.getByLabelText(S.planLabelLabel) as HTMLInputElement;

async function seedPlan(plannedDate = daysFromToday(5), label?: string) {
  const s = await seedFormula();
  const { plan } = await layer().productionPlans.create({
    planId: crypto.randomUUID(),
    versionId: s.version.id,
    plannedOn: plannedDate,
    ...(label ? { label } : {}),
  });
  return { ...s, plan };
}

describe("planned production: create", () => {
  it("shows the source and saves an entry, then opens it", async () => {
    const s = await seedFormula();
    render(<CreatePlan versionId={s.version.id} />);
    await screen.findByLabelText(S.plannedOnLabel);
    expect(screen.getByRole("link", { name: "Lavender Vanilla Cedar" })).toBeInTheDocument();

    type(plannedOn(), daysFromToday(9));
    type(planLabel(), " Autumn run ");
    fireEvent.click(screen.getByRole("button", { name: S.planSave }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const entries = await layer().productionPlans.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].plan).toMatchObject({
      versionId: s.version.id,
      formulaId: s.formulaId,
      plannedOn: daysFromToday(9),
      label: "Autumn run",
      batchId: null,
    });
    expect(nav.replace).toHaveBeenCalledWith(`/schedule/plan/${entries[0].plan.id}?created=1`);
  });

  it("allows a past date", async () => {
    const s = await seedFormula();
    render(<CreatePlan versionId={s.version.id} />);
    await screen.findByLabelText(S.plannedOnLabel);
    type(plannedOn(), "2020-01-15");
    fireEvent.click(screen.getByRole("button", { name: S.planSave }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect((await layer().productionPlans.list())[0].plan.plannedOn).toBe("2020-01-15");
  });

  it("needs a date and a label of at most 40 characters", async () => {
    const s = await seedFormula();
    render(<CreatePlan versionId={s.version.id} />);
    await screen.findByLabelText(S.plannedOnLabel);
    type(planLabel(), "z".repeat(41));
    fireEvent.click(screen.getByRole("button", { name: S.planSave }));
    expect(await screen.findByText(S.plannedOnRequired)).toBeInTheDocument();
    expect(screen.getByText(S.planLabelTooLong)).toBeInTheDocument();
    await waitFor(() => expect(plannedOn()).toHaveFocus());
    expect(await layer().productionPlans.list()).toEqual([]);
  });

  it("reuses one plan id across retries, so a retry never makes a second entry", async () => {
    const s = await seedFormula();
    render(<CreatePlan versionId={s.version.id} />);
    await screen.findByLabelText(S.plannedOnLabel);
    type(plannedOn(), daysFromToday(2));
    const create = vi
      .spyOn(layer().productionPlans, "create")
      .mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: S.planSave }));
    expect(await screen.findByText(S.planCreateFailed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: S.planSave }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0].planId).toBe(create.mock.calls[1][0].planId);
    expect(await layer().productionPlans.list()).toHaveLength(1);
  });

  it("explains when the version does not exist", async () => {
    render(<CreatePlan versionId="missing" />);
    expect(await screen.findByText(B.sourceNotFoundTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText(S.plannedOnLabel)).not.toBeInTheDocument();
  });
});

describe("planned production: entry page", () => {
  it("shows the source, the date and Create batch for an open entry", async () => {
    const s = await seedPlan(daysFromToday(5), "Autumn run");
    render(<PlanView planId={s.plan.id} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Autumn run" })).toBeInTheDocument();
    expect(screen.getByText(S.productionDate(fmt(daysFromToday(5))))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: F.headerVersion(1) })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: S.planCreateBatch })).toHaveAttribute(
      "href",
      `/batches/new?version=${s.version.id}&plan=${s.plan.id}`,
    );
    expect(screen.getByText(S.planOpenLine)).toBeInTheDocument();
  });

  it("marks an archived formula", async () => {
    const s = await seedPlan();
    await layer().formulas.setArchived(s.formulaId, true);
    render(<PlanView planId={s.plan.id} />);
    expect(await screen.findByText(B.formulaArchivedBadge)).toBeInTheDocument();
  });

  it("edits the date, label and notes and shows feedback", async () => {
    const s = await seedPlan();
    render(<PlanView planId={s.plan.id} />);
    await screen.findByLabelText(S.plannedOnLabel);
    type(plannedOn(), daysFromToday(30));
    type(planLabel(), "Moved");
    type(screen.getByLabelText(S.planNotesLabel), "Buy wax first");
    fireEvent.click(screen.getByRole("button", { name: S.planSaveChanges }));
    expect(await screen.findByText(S.planChangesSaved)).toBeInTheDocument();
    const stored = (await layer().productionPlans.get(s.plan.id))!.plan;
    expect(stored).toMatchObject({
      plannedOn: daysFromToday(30),
      label: "Moved",
      notes: "Buy wax first",
    });
    expect(stored.versionId).toBe(s.version.id);
  });

  it("shows the saved confirmation from ?created=1 once", async () => {
    const s = await seedPlan();
    nav.search = "created=1";
    render(<PlanView planId={s.plan.id} />);
    expect(await screen.findByText(S.planSavedNotice)).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/schedule/plan/${s.plan.id}`));
  });

  it("deletes after a confirmation, and keeping it deletes nothing", async () => {
    const s = await seedPlan();
    render(<PlanView planId={s.plan.id} />);
    fireEvent.click(await screen.findByRole("button", { name: S.planDelete }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(S.planDeleteBody(false))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: S.planDeleteKeep }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await layer().productionPlans.get(s.plan.id)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: S.planDelete }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: S.planDeleteConfirm }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/schedule"));
    expect(await layer().productionPlans.get(s.plan.id)).toBeUndefined();
  });

  it("shows not found for an unknown entry", async () => {
    render(<PlanView planId="missing" />);
    expect(await screen.findByText(S.planNotFoundTitle)).toBeInTheDocument();
  });
});

describe("Create batch from a planned entry", () => {
  it("prefills the label, keeps today's date, links the entry, and the entry then shows its batch", async () => {
    const s = await seedPlan(daysFromToday(3), "Autumn run");
    render(<CreateBatch versionId={s.version.id} planId={s.plan.id} />);
    const label = (await screen.findByLabelText(B.labelFieldLabel)) as HTMLInputElement;
    expect(label.value).toBe("Autumn run");
    expect((screen.getByLabelText(B.producedOnFieldLabel) as HTMLInputElement).value).toBe(
      daysFromToday(0),
    );
    expect(
      screen.getByText(B.planNotice("Autumn run", fmt(daysFromToday(3))), { exact: false }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const url = nav.replace.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/batches\/[0-9a-f-]+\?created=1$/);

    const linked = (await layer().productionPlans.get(s.plan.id))!;
    expect(linked.plan.batchId).not.toBeNull();
    expect(url).toContain(linked.plan.batchId!);
    expect(linked.batch?.producedOn).toBe(daysFromToday(0));

    cleanup();
    render(<PlanView planId={s.plan.id} />);
    expect(await screen.findByText(S.planBatchMade)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Autumn run" })).toHaveAttribute(
      "href",
      `/batches/${linked.plan.batchId}`,
    );
    expect(screen.queryByRole("link", { name: S.planCreateBatch })).not.toBeInTheDocument();
  });

  it("refuses an entry that already has a batch and offers no form", async () => {
    const s = await seedPlan();
    const batch = await makeBatch(s.version.id, daysFromToday(0), "First", s.plan.id);
    render(<CreateBatch versionId={s.version.id} planId={s.plan.id} />);
    expect(await screen.findByText(B.planAlreadyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: B.planOpenBatch })).toHaveAttribute(
      "href",
      `/batches/${batch.id}`,
    );
    expect(screen.queryByLabelText(B.producedOnFieldLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: B.createButton })).not.toBeInTheDocument();
  });

  it("refuses an entry for a different version", async () => {
    const s = await seedPlan();
    const v2 = await seedRevision(s);
    render(<CreateBatch versionId={v2.id} planId={s.plan.id} />);
    expect(await screen.findByText(B.planOtherVersionTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText(B.producedOnFieldLabel)).not.toBeInTheDocument();
  });

  it("explains an entry that no longer exists", async () => {
    const s = await seedFormula();
    render(<CreateBatch versionId={s.version.id} planId="gone" />);
    expect(await screen.findByText(B.planGoneTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText(B.producedOnFieldLabel)).not.toBeInTheDocument();
  });

  it("maps an invalid or not-found refusal from create to a clear message", async () => {
    const s = await seedPlan();
    render(<CreateBatch versionId={s.version.id} planId={s.plan.id} />);
    await screen.findByLabelText(B.labelFieldLabel);
    // Another tab links the entry after this page opened.
    await makeBatch(s.version.id, daysFromToday(0), "Other tab", s.plan.id);
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    expect(await screen.findByText(B.planCreateInvalid)).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();

    await layer().productionPlans.delete(s.plan.id);
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    expect(await screen.findByText(B.planCreateGone)).toBeInTheDocument();
  });

  it("a plain Create batch (no plan) still works as before", async () => {
    const s = await seedFormula();
    render(<CreateBatch versionId={s.version.id} />);
    await screen.findByLabelText(B.producedOnFieldLabel);
    fireEvent.click(screen.getByRole("button", { name: B.createButton }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect(await layer().batches.list()).toHaveLength(1);
  });
});

describe("formula page", () => {
  it("has Plan production next to Create batch, and lists open entries only", async () => {
    const s = await seedPlan(daysFromToday(4), "Autumn run");
    const other = await layer().productionPlans.create({
      planId: crypto.randomUUID(),
      versionId: s.version.id,
      plannedOn: daysFromToday(6),
    });
    await makeBatch(s.version.id, daysFromToday(0), "Done run", other.plan.id);

    render(<FormulaDetail formulaId={s.formulaId} />);
    expect(await screen.findByRole("link", { name: S.planProduction })).toHaveAttribute(
      "href",
      `/schedule/plan/new?version=${s.version.id}`,
    );
    expect(screen.getByRole("link", { name: B.formulaCreateBatch })).toBeInTheDocument();
    const section = (await screen.findByRole("heading", { name: S.formulaPlansHeading })).closest(
      "section",
    )!;
    const links = within(section).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", `/schedule/plan/${s.plan.id}`);
    expect(links[0]).toHaveTextContent("Autumn run");
  });

  it("shows no planned production section when there are no open entries", async () => {
    const s = await seedFormula();
    render(<FormulaDetail formulaId={s.formulaId} />);
    await screen.findByRole("link", { name: S.planProduction });
    expect(screen.queryByRole("heading", { name: S.formulaPlansHeading })).not.toBeInTheDocument();
  });

  it("the version view also offers Plan production for that version", async () => {
    const s = await seedFormula();
    const v2 = await seedRevision(s);
    render(<FormulaDetail formulaId={s.formulaId} versionId={s.version.id} />);
    expect(await screen.findByRole("link", { name: S.planProduction })).toHaveAttribute(
      "href",
      `/schedule/plan/new?version=${s.version.id}`,
    );
    expect(v2.id).not.toBe(s.version.id);
  });

  it("the formula delete confirmation mentions planned production entries", async () => {
    const s = await seedPlan();
    render(<FormulaDetail formulaId={s.formulaId} />);
    const trigger = await screen.findByRole("button", { name: F.moreActions });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: F.deletePermanently }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(B.formulaDeletePlans(1))).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: F.deleteConfirm }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
    expect(await layer().productionPlans.get(s.plan.id)).toBeUndefined();
  });
});
