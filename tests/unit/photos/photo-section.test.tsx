import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DataError } from "@/lib/db/errors";
import { MESSAGES } from "@/lib/messages";
import type { BurnPhoto } from "@/lib/types";
import { PhotoGrid } from "@/components/burn/photos";
import { PhotoSection } from "@/components/burn/photos";

const M = MESSAGES.burnPhotos;

const repo = {
  listBySession: vi.fn(),
  add: vi.fn(),
  delete: vi.fn(),
  usage: vi.fn(),
};
vi.mock("@/lib/db", () => ({ getDataLayer: () => ({ burnPhotos: repo }) }));

const prepare = vi.fn();
vi.mock("@/lib/photos", () => ({ preparePhoto: (f: Blob) => prepare(f) }));

function photo(n: number, caption?: string): BurnPhoto {
  return {
    id: `p${n}`,
    sessionId: "s1",
    mimeType: "image/jpeg",
    width: 800,
    height: 600,
    byteLength: 3,
    sha256: "0".repeat(64),
    caption,
    createdAt: "2026-01-01T00:00:00.000Z",
    bytes: new Uint8Array([0xff, 0xd8, 0xff]),
  };
}
const many = (n: number) => Array.from({ length: n }, (_, i) => photo(i + 1));

const revoke = vi.fn();
let counter = 0;

beforeEach(() => {
  counter = 0;
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:fake-${counter++}`),
    revokeObjectURL: revoke,
  }));
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
  repo.listBySession.mockReset().mockResolvedValue([]);
  repo.add.mockReset().mockResolvedValue({ photo: photo(1), created: true });
  repo.delete.mockReset().mockResolvedValue(undefined);
  prepare.mockReset().mockResolvedValue({
    ok: true,
    photo: { bytes: new Uint8Array([0xff, 0xd8, 0xff]), width: 10, height: 10 },
  });
  revoke.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const choose = (files: File[]) =>
  fireEvent.change(screen.getByTestId("photo-input"), { target: { files } });

describe("PhotoSection", () => {
  it("shows the empty state and the count", async () => {
    render(<PhotoSection sessionId="s1" />);
    expect(await screen.findByText(M.empty)).toBeTruthy();
    expect(screen.getByText("0 of 12")).toBeTruthy();
    expect(screen.getByRole("button", { name: M.addButton })).toBeTruthy();
  });

  it("renders photos with alt text, a count and lazy images", async () => {
    repo.listBySession.mockResolvedValue([photo(1, "Soot at hour 3"), photo(2)]);
    render(<PhotoSection sessionId="s1" />);
    const first = await screen.findByAltText("Soot at hour 3");
    expect(first.getAttribute("loading")).toBe("lazy");
    expect(screen.getByAltText("Photo 2 of 2")).toBeTruthy();
    expect(screen.getByText("2 of 12")).toBeTruthy();
    expect(screen.getByText("Soot at hour 3", { selector: "p" })).toBeTruthy();
  });

  it("hides Add at 12 photos and says why", async () => {
    repo.listBySession.mockResolvedValue(many(12));
    render(<PhotoSection sessionId="s1" />);
    expect(await screen.findByText(M.limitReached(12))).toBeTruthy();
    expect(screen.queryByRole("button", { name: M.addButton })).toBeNull();
    expect(screen.getByText("12 of 12")).toBeTruthy();
  });

  it("adds files one by one with a progress status", async () => {
    render(<PhotoSection sessionId="s1" />);
    await screen.findByText(M.empty);
    choose([file("a.jpg"), file("b.jpg")]);
    await waitFor(() => expect(repo.add).toHaveBeenCalledTimes(2));
    const call = repo.add.mock.calls[0][0];
    expect(call.sessionId).toBe("s1");
    expect(call.caption).toBeUndefined();
    expect(typeof call.photoId).toBe("string");
    expect(await screen.findByText(M.addedSummary(2))).toBeTruthy();
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("shows Adding photo 2 of 3 while working", async () => {
    let release: () => void = () => {};
    repo.add
      .mockResolvedValueOnce({ photo: photo(1), created: true })
      .mockImplementationOnce(
        () => new Promise((r) => (release = () => r({ photo: photo(2), created: true }))),
      )
      .mockResolvedValue({ photo: photo(3), created: true });
    render(<PhotoSection sessionId="s1" />);
    await screen.findByText(M.empty);
    choose([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
    expect(await screen.findByText("Adding photo 2 of 3…")).toBeTruthy();
    release();
    await waitFor(() => expect(repo.add).toHaveBeenCalledTimes(3));
  });

  it("stops at the limit and says the rest were not added", async () => {
    repo.listBySession.mockResolvedValue(many(11));
    render(<PhotoSection sessionId="s1" />);
    await screen.findByText("11 of 12");
    choose([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
    await waitFor(() => expect(repo.add).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(M.limitStopped(1, 12))).toBeTruthy();
  });

  it("shows the storage-full message when add is refused for space", async () => {
    repo.add.mockRejectedValue(new DataError("storage-full", "full"));
    render(<PhotoSection sessionId="s1" />);
    await screen.findByText(M.empty);
    choose([file("a.jpg"), file("b.jpg")]);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("out of space for this site");
    expect(alert.textContent).toContain("Nothing else was lost");
    expect(alert.textContent).toContain("not added");
    expect(repo.add).toHaveBeenCalledTimes(1);
  });

  it("shows the limit message when the limit was raced", async () => {
    repo.add.mockRejectedValue(new DataError("invalid", "12"));
    render(<PhotoSection sessionId="s1" />);
    await screen.findByText(M.empty);
    choose([file("a.jpg")]);
    expect((await screen.findByRole("alert")).textContent).toContain(M.errorLimit(12));
  });

  it("shows a generic message for other storage failures", async () => {
    repo.add.mockRejectedValue(new DataError("storage", "boom"));
    render(<PhotoSection sessionId="s1" />);
    await screen.findByText(M.empty);
    choose([file("a.jpg")]);
    expect((await screen.findByRole("alert")).textContent).toContain(M.errorStorage);
  });

  it.each([
    ["not-image", M.errorNotImage("a.jpg")],
    ["too-large", M.errorTooLarge("a.jpg")],
    ["too-big", M.errorTooBig("a.jpg")],
    ["unsupported", M.errorUnsupported],
  ])("explains a %s refusal and does not write", async (reason, text) => {
    prepare.mockResolvedValue({ ok: false, reason });
    render(<PhotoSection sessionId="s1" />);
    await screen.findByText(M.empty);
    choose([file("a.jpg")]);
    expect((await screen.findByRole("alert")).textContent).toContain(text);
    expect(repo.add).not.toHaveBeenCalled();
  });

  it("opens the larger view and deletes only after confirming", async () => {
    repo.listBySession
      .mockResolvedValueOnce([photo(1), photo(2)])
      .mockResolvedValue([photo(2)]);
    render(<PhotoSection sessionId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: M.openPhoto(1, 2) }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: M.viewTitle(1, 2) })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: M.delete }));
    expect(within(dialog).getByText(M.deleteTitle)).toBeTruthy();
    expect(repo.delete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: M.deleteCancel }));
    expect(repo.delete).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: M.delete }));
    fireEvent.click(within(dialog).getByRole("button", { name: M.deleteConfirm }));
    await waitFor(() => expect(repo.delete).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(screen.getByText("1 of 12")).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("revokes object URLs on unmount", async () => {
    repo.listBySession.mockResolvedValue([photo(1), photo(2)]);
    const { unmount } = render(<PhotoSection sessionId="s1" />);
    await screen.findByAltText("Photo 1 of 2");
    unmount();
    expect(revoke).toHaveBeenCalled();
  });

  it("shows device storage usage when the browser reports it", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      storage: { estimate: async () => ({ usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024 }) },
    });
    render(<PhotoSection sessionId="s1" />);
    expect(await screen.findByText(M.storageUsage("5.0 MB", "100.0 MB"))).toBeTruthy();
  });
});

describe("PhotoGrid", () => {
  it("renders nothing for no photos", () => {
    const { container } = render(<PhotoGrid photos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("print variant uses two columns and avoids page breaks", async () => {
    const { container } = render(<PhotoGrid photos={[photo(1, "Cap"), photo(2)]} variant="print" />);
    await screen.findByAltText("Cap");
    const list = container.querySelector("ul")!;
    expect(list.getAttribute("data-variant")).toBe("print");
    expect(list.className).toContain("grid-cols-2");
    expect(list.className).not.toContain("md:grid-cols-4");
    expect(container.querySelector("li")!.className).toContain("break-inside-avoid");
    expect(screen.getByText("Cap", { selector: "figcaption" })).toBeTruthy();
  });
});
