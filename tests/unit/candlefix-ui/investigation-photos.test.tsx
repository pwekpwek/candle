import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GallerySection, investigationPhotoAdapter } from "@/components/burn/photos";
import { MESSAGES } from "@/lib/messages";
import { MAX_INVESTIGATION_PHOTOS } from "@/lib/types";
import { clearAll, fakeJpeg, layer, polyfillBrowser, seedBatches, seedInvestigation } from "./investigation-harness";

const prepare = vi.hoisted(() => vi.fn());
vi.mock("@/lib/photos", () => ({ preparePhoto: (f: Blob) => prepare(f) }));

const P = MESSAGES.candleFixPhotos;

beforeEach(async () => {
  polyfillBrowser();
  prepare.mockReset().mockResolvedValue({ ok: true, photo: { bytes: fakeJpeg(), width: 10, height: 10 } });
  await clearAll();
});

afterEach(() => cleanup());

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("investigation photo gallery (generalised burn gallery)", () => {
  it("adds photos to the investigation and lists them with investigation wording", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id);
    render(<GallerySection ownerId={inv.id} adapter={investigationPhotoAdapter} />);
    expect(await screen.findByText(P.empty)).toBeInTheDocument();
    expect(screen.getByText(P.count(0, MAX_INVESTIGATION_PHOTOS))).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("photo-input"), { target: { files: [file("a.jpg"), file("b.jpg")] } });
    expect(await screen.findByText(P.addedSummary(2))).toBeInTheDocument();
    expect(await layer().investigationPhotos.listByInvestigation(inv.id)).toHaveLength(2);
    expect(screen.getByText(P.count(2, MAX_INVESTIGATION_PHOTOS))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: P.openPhoto(1, 2) })).toBeInTheDocument();
  });

  it("deletes one photo after a confirmation", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id);
    await layer().investigationPhotos.add({ photoId: crypto.randomUUID(), investigationId: inv.id, bytes: fakeJpeg(), width: 10, height: 10 });
    render(<GallerySection ownerId={inv.id} adapter={investigationPhotoAdapter} />);
    fireEvent.click(await screen.findByRole("button", { name: P.openPhoto(1, 1) }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: P.delete }));
    expect(within(dialog).getByText(P.deleteBody)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: P.deleteConfirm }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await layer().investigationPhotos.listByInvestigation(inv.id)).toHaveLength(0);
  });

  it("stops at the limit with the investigation text", async () => {
    const s = await seedBatches();
    const inv = await seedInvestigation(s.original.id);
    for (let i = 0; i < MAX_INVESTIGATION_PHOTOS; i++) {
      await layer().investigationPhotos.add({ photoId: crypto.randomUUID(), investigationId: inv.id, bytes: fakeJpeg(64 + i), width: 10, height: 10 });
    }
    render(<GallerySection ownerId={inv.id} adapter={investigationPhotoAdapter} />);
    expect(await screen.findByText(P.limitReached(MAX_INVESTIGATION_PHOTOS))).toBeInTheDocument();
    expect(screen.queryByTestId("photo-input")).toBeNull();
  });
});
