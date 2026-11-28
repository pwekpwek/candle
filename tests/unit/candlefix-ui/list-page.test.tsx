import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { InvestigationList } from "@/components/candlefix/list";
import { MESSAGES } from "@/lib/messages";
import { clearDatabase, layer, makeExperiment, polyfillBrowser, seedWorld } from "./harness";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: nav.replace,
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    bfcacheId: "t",
  }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/investigations",
}));

const M = MESSAGES.candleFixCompare;

beforeEach(async () => {
  polyfillBrowser();
  nav.replace.mockClear();
  nav.search = "";
  await clearDatabase();
});
afterEach(cleanup);

describe("investigations list", () => {
  it("shows an empty state that points to the batches", async () => {
    render(<InvestigationList />);
    expect(await screen.findByText(M.listEmptyTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: M.listEmptyAction }).getAttribute("href")).toBe("/batches");
    expect(screen.getByRole("checkbox", { name: M.showArchived })).toBeTruthy();
  });

  it("lists a row with the title, batch, formula, version, observed date and counts", async () => {
    const w = await seedWorld();
    await makeExperiment(w);
    render(<InvestigationList />);
    const row = await screen.findByTestId("investigation-list-row");
    const link = within(row).getByRole("link", { name: "Rough top" });
    expect(link.getAttribute("href")).toBe(`/investigations/${w.investigation.id}`);
    expect(row.textContent).toContain("FIX-A");
    expect(row.textContent).toContain(w.first.formula.name);
    expect(row.textContent).toContain(M.versionText(1));
    expect(row.textContent).toContain(M.observedOn("Nov 14, 2026"));
    expect(row.textContent).toContain(M.photoCount(0));
    expect(row.textContent).toContain(M.experimentCount(1));
    expect(within(row).queryByText(M.archivedBadge)).toBeNull();
  });

  it("names an untitled investigation by its issues", async () => {
    const w = await seedWorld({ investigation: { title: undefined, issues: ["soot", "other"], otherIssue: "Crooked wick" } });
    void w;
    render(<InvestigationList />);
    const row = await screen.findByTestId("investigation-list-row");
    expect(within(row).getByRole("link", { name: "Soot, Crooked wick" })).toBeTruthy();
  });

  it("hides archived investigations until Show archived is turned on, which writes the URL", async () => {
    const w = await seedWorld();
    await layer().investigations.setArchived(w.investigation.id, true);
    const view = render(<InvestigationList />);
    expect(await screen.findByText(M.listEmptyTitle)).toBeTruthy();
    expect(screen.queryAllByTestId("investigation-list-row")).toHaveLength(0);
    fireEvent.click(screen.getByRole("checkbox", { name: M.showArchived }));
    expect(nav.replace).toHaveBeenCalledWith("/investigations?archived=1", { scroll: false });

    nav.search = "archived=1";
    view.unmount();
    render(<InvestigationList />);
    const row = await screen.findByTestId("investigation-list-row");
    expect(within(row).getByText(M.archivedBadge)).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByRole("checkbox", { name: M.showArchived }) as HTMLInputElement).checked).toBe(true),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: M.showArchived }));
    expect(nav.replace).toHaveBeenLastCalledWith("/investigations", { scroll: false });
  });
});
