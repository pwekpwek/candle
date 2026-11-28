import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BatchDetail } from "@/components/batches";
import { InvestigationsSection } from "@/components/candlefix";
import { DeleteSessionDialog } from "@/components/burn/session";
import { MESSAGES } from "@/lib/messages";
import { clearAll, fakeJpeg, layer, polyfillBrowser, seedBatches, seedInvestigation, seedSession } from "./investigation-harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/",
}));

const M = MESSAGES.candleFix;
const B = MESSAGES.batches;
const BT = MESSAGES.burn;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  await clearAll();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Investigations section on the batch page", () => {
  it("shows an empty state with the Record an issue action", async () => {
    const s = await seedBatches();
    render(<InvestigationsSection batchId={s.original.id} />);
    const section = await screen.findByTestId("investigations-section");
    expect(within(section).getByRole("heading", { name: M.sectionHeading })).toBeInTheDocument();
    expect(await within(section).findByText(M.sectionEmpty)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: M.recordButton })).toHaveAttribute(
      "href",
      `/investigations/new?batch=${s.original.id}`,
    );
    expect(within(section).queryByTestId("follow-up-links")).toBeNull();
  });

  it("lists investigations with date, archived badge, photo and experiment counts", async () => {
    const s = await seedBatches();
    const a = await seedInvestigation(s.original.id, { title: "Rough top", observedOn: "2026-11-14" });
    const b = await seedInvestigation(s.original.id, { title: undefined, issues: ["soot"], observedOn: "2026-11-15" });
    await layer().investigations.setArchived(b.id, true);
    await layer().investigationPhotos.add({ photoId: crypto.randomUUID(), investigationId: a.id, bytes: fakeJpeg(), width: 10, height: 10 });
    render(<InvestigationsSection batchId={s.original.id} />);
    const rows = await screen.findAllByTestId("investigation-row");
    expect(rows).toHaveLength(2);
    // Latest observation first; no title shows the issue labels; archived ones are listed with a badge.
    expect(rows[0]).toHaveTextContent("Soot");
    expect(rows[0]).toHaveAttribute("href", `/investigations/${b.id}`);
    expect(within(rows[0]).getByTestId("investigation-archived")).toHaveTextContent(M.archivedBadge);
    expect(rows[1]).toHaveTextContent("Rough top");
    expect(rows[1]).toHaveTextContent(M.rowObserved("Nov 14, 2026"));
    expect(rows[1]).toHaveTextContent(M.rowPhotos(1));
    expect(rows[1]).toHaveTextContent(M.rowExperiments(0));
    expect(within(rows[1]).queryByTestId("investigation-archived")).toBeNull();
  });

  it("lists the investigations this batch is a follow-up for", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id, {
      hypotheses: [{ text: "Cold container", status: "open" }],
    });
    await layer().correctiveExperiments.create({
      experimentId: crypto.randomUUID(),
      investigationId: inv.id,
      hypothesisId: inv.hypotheses[0].id,
      followUpBatchId: s.followUp.id,
      burnSessionIds: [],
    });
    render(<InvestigationsSection batchId={s.followUp.id} />);
    const links = await screen.findByTestId("follow-up-links");
    expect(within(links).getByRole("heading", { name: M.followUpHeading })).toBeInTheDocument();
    const link = within(links).getByRole("link", { name: M.followUpLink("Rough top", "FIX-A") });
    expect(link).toHaveAttribute("href", `/investigations/${inv.id}`);
  });
});

describe("batch delete explains investigations and follow-up experiments", () => {
  async function openDelete(batchId: string) {
    render(<BatchDetail batchId={batchId} />);
    fireEvent.click(await screen.findByRole("button", { name: B.deleteBatch }));
    return screen.findByRole("dialog");
  }

  it("refuses and says why when the batch has an investigation", async () => {
    const s = await seedBatches();
    await seedInvestigation(s.original.id);
    const dialog = await openDelete(s.original.id);
    expect(await within(dialog).findByText(B.investigationsDeleteBlocked(1))).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: B.deleteConfirm })).toBeNull();
    expect(within(dialog).getByRole("button", { name: B.deleteKeep })).toBeInTheDocument();
    // The section is on the page too.
    expect(await screen.findByTestId("investigations-section")).toBeInTheDocument();
  });

  it("refuses and says why when the batch is a follow-up batch", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id, { hypotheses: [{ text: "Cold container", status: "open" }] });
    await layer().correctiveExperiments.create({
      experimentId: crypto.randomUUID(),
      investigationId: inv.id,
      hypothesisId: inv.hypotheses[0].id,
      followUpBatchId: s.followUp.id,
      burnSessionIds: [],
    });
    const dialog = await openDelete(s.followUp.id);
    expect(await within(dialog).findByText(B.followUpDeleteBlocked(1))).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: B.deleteConfirm })).toBeNull();
  });
});

describe("burn test delete refused while an experiment lists it", () => {
  it("says so and offers no delete", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id, { hypotheses: [{ text: "Cold container", status: "open" }] });
    const session = await seedSession(s.followUp.id, "2026-11-22");
    await layer().correctiveExperiments.create({
      experimentId: crypto.randomUUID(),
      investigationId: inv.id,
      hypothesisId: inv.hypotheses[0].id,
      followUpBatchId: s.followUp.id,
      burnSessionIds: [session.id],
    });
    render(<DeleteSessionDialog sessionId={session.id} title="Round 1" open onOpenChange={() => {}} onDeleted={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(BT.deleteBlockedByExperiments(1))).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: BT.deleteConfirm })).toBeNull();
    await waitFor(() => expect(within(dialog).queryByRole("status")).toBeNull());
    expect(await layer().burnSessions.get(session.id)).toBeDefined();
  });

  it("still deletes a burn test no experiment lists", async () => {
    const s = await seedBatches();
    const session = await seedSession(s.original.id, "2026-11-22");
    const onDeleted = vi.fn();
    render(<DeleteSessionDialog sessionId={session.id} title="Round 1" open onOpenChange={() => {}} onDeleted={onDeleted} />);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: BT.deleteConfirm })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: BT.deleteConfirm }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(await layer().burnSessions.get(session.id)).toBeUndefined();
  });
});
