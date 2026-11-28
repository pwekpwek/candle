import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { InvestigationView } from "@/components/candlefix/investigation";
import { MESSAGES } from "@/lib/messages";
import { clearAll, fakeJpeg, layer, polyfillBrowser, seedBatches, seedInvestigation } from "./investigation-harness";

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

const M = MESSAGES.candleFix;
const P = MESSAGES.candleFixPhotos;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.search = "";
  await clearAll();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function seedFull() {
  const s = await seedBatches();
  const inv = await seedInvestigation(s.original.id, {
    issues: ["frosting", "soot"],
    notes: "Seen after two days.",
    checks: [
      { itemId: "frosting.cure-time", issue: "frosting", label: "Days before the first look", checked: true, note: "Two days" },
      { itemId: "tunneling.wick-size", issue: "tunneling", label: "Wick size then", checked: true },
    ],
    hypotheses: [
      { text: "The container was cold.", status: "testing", notes: "Check the next pour" },
      { text: "Cooled too fast.", status: "setAside" },
    ],
  });
  return { ...s, inv };
}

describe("investigation page", () => {
  it("shows the header, the observed block, things to check and hypotheses in their own blocks", async () => {
    const s = await seedFull();
    render(<InvestigationView investigationId={s.inv.id} />);
    expect(await screen.findByRole("heading", { name: "Rough top", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "FIX-A" })).toHaveAttribute("href", `/batches/${s.original.id}`);
    expect(screen.getByRole("link", { name: M.versionText(1) })).toHaveAttribute(
      "href",
      `/formulas/${s.first.formula.id}/versions/${s.first.version.id}`,
    );
    expect(screen.getByRole("link", { name: M.edit })).toHaveAttribute("href", `/investigations/${s.inv.id}/edit`);

    const observed = screen.getByTestId("observed-block");
    expect(within(observed).getByText(M.issueLabels.frosting)).toBeInTheDocument();
    expect(within(observed).getByText(M.issueLabels.soot)).toBeInTheDocument();
    expect(within(observed).getByText("Seen after two days.")).toBeInTheDocument();
    expect(observed.className).not.toMatch(/dashed/);

    // Photos: the generalised gallery with investigation wording.
    expect(await screen.findByRole("heading", { name: P.heading })).toBeInTheDocument();
    expect(screen.getByText(P.empty)).toBeInTheDocument();

    const checks = screen.getByTestId("checks-section");
    const ticked = within(checks).getByTestId("check-item-frosting.cure-time");
    expect(ticked).toHaveAttribute("data-ticked", "true");
    expect(within(ticked).getByText(/Days before the first look/)).toBeInTheDocument();
    expect(within(ticked).getByText(/Two days/)).toBeInTheDocument();
    // Items never ticked are listed too, marked as not ticked.
    const other = within(checks).getByTestId("check-item-frosting.pour-temperature");
    expect(other).toHaveAttribute("data-ticked", "false");
    // A tick from an issue no longer chosen sits under its own heading.
    const kept = within(checks).getByTestId("no-longer-listed");
    expect(within(kept).getByText(/Wick size then/)).toBeInTheDocument();

    const block = screen.getByTestId("hypotheses-block");
    expect(block.className).toMatch(/border-dashed/);
    expect(within(block).getByRole("heading", { name: M.hypothesesHeading })).toBeInTheDocument();
    const cards = within(block).getAllByTestId("hypothesis-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText(M.hypothesisHeading(1))).toBeInTheDocument();
    expect(within(cards[0]).getByTestId("hypothesis-status")).toHaveTextContent(M.hypothesisStatus.testing);
    expect(within(cards[1]).getByTestId("hypothesis-status")).toHaveTextContent(M.hypothesisStatus.setAside);
    expect(within(cards[0]).getByRole("link", { name: M.hypothesisFollowUpFor(1) })).toHaveAttribute(
      "href",
      `/investigations/${s.inv.id}/experiments/new?hypothesis=${s.inv.hypotheses[0].id}`,
    );
  });

  it("uses the issue labels as the title when there is none", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id, { title: undefined, issues: ["tunneling", "other"], otherIssue: "Pitting" });
    render(<InvestigationView investigationId={inv.id} />);
    expect(await screen.findByRole("heading", { name: "Tunneling, Other: Pitting", level: 1 })).toBeInTheDocument();
  });

  it("shows the saved notice once and removes the parameter", async () => {
    const s = await seedFull();
    nav.search = "saved=1";
    render(<InvestigationView investigationId={s.inv.id} />);
    expect(await screen.findByText(M.savedNotice)).toBeInTheDocument();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/investigations/${s.inv.id}`, { scroll: false }));
  });

  it("archives and unarchives, with a badge", async () => {
    const s = await seedFull();
    render(<InvestigationView investigationId={s.inv.id} />);
    fireEvent.click(await screen.findByRole("button", { name: M.archive }));
    expect(await screen.findByTestId("investigation-archived")).toHaveTextContent(M.archivedBadge);
    expect((await layer().investigations.get(s.inv.id))!.investigation.archivedAt).not.toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: M.unarchive }));
    await waitFor(() => expect(screen.queryByTestId("investigation-archived")).toBeNull());
  });

  it("confirms with the counts, deletes the photos and experiments, and goes back to the batch", async () => {
    const s = await seedFull();
    await layer().investigationPhotos.add({ photoId: crypto.randomUUID(), investigationId: s.inv.id, bytes: fakeJpeg(), width: 10, height: 10 });
    await layer().investigationPhotos.add({ photoId: crypto.randomUUID(), investigationId: s.inv.id, bytes: fakeJpeg(80), width: 10, height: 10 });
    await layer().investigationPhotos.add({ photoId: crypto.randomUUID(), investigationId: s.inv.id, bytes: fakeJpeg(90), width: 10, height: 10 });
    await layer().correctiveExperiments.create({
      experimentId: crypto.randomUUID(),
      investigationId: s.inv.id,
      hypothesisId: s.inv.hypotheses[0].id,
      followUpBatchId: s.followUp.id,
      burnSessionIds: [],
    });
    render(<InvestigationView investigationId={s.inv.id} />);
    fireEvent.click(await screen.findByRole("button", { name: M.delete }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByTestId("delete-impact")).toHaveTextContent(M.deleteImpact(3, 1));
    expect(within(dialog).getByTestId("delete-impact")).toHaveTextContent(
      "This deletes the investigation, its 3 photos and 1 corrective experiment. The batches and burn tests stay.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: M.deleteConfirm }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(`/batches/${s.original.id}`));

    expect(await layer().investigations.get(s.inv.id)).toBeUndefined();
    expect(await layer().investigationPhotos.listByInvestigation(s.inv.id)).toHaveLength(0);
    expect(await layer().correctiveExperiments.listByInvestigation(s.inv.id)).toHaveLength(0);
    // The batches stay.
    expect(await layer().batches.get(s.original.id)).toBeDefined();
    expect(await layer().batches.get(s.followUp.id)).toBeDefined();
  });

  it("keeps the investigation when the delete is declined", async () => {
    const s = await seedFull();
    render(<InvestigationView investigationId={s.inv.id} />);
    fireEvent.click(await screen.findByRole("button", { name: M.delete }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: M.deleteKeep }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await layer().investigations.get(s.inv.id)).toBeDefined();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows a friendly not-found state", async () => {
    await seedBatches();
    render(<InvestigationView investigationId="nope" />);
    expect(await screen.findByRole("heading", { name: M.notFoundTitle })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: M.backToBatches })).toHaveAttribute("href", "/batches");
  });
});
