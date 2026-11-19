import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PHOTO_INPUT_MAX_BYTES,
  QUALITY_LADDER,
  encodeAttempts,
  fitDimensions,
  isJpeg,
  preparePhoto,
} from "@/lib/photos";
import { MAX_PHOTO_BYTES } from "@/lib/types";

describe("fitDimensions", () => {
  it("shrinks a landscape image to 1600 on the long side", () => {
    expect(fitDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });
  it("shrinks a portrait image to 1600 on the long side", () => {
    expect(fitDimensions(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });
  it("never enlarges a small image", () => {
    expect(fitDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("leaves exactly 1600 alone", () => {
    expect(fitDimensions(1600, 900)).toEqual({ width: 1600, height: 900 });
    expect(fitDimensions(900, 1600)).toEqual({ width: 900, height: 1600 });
  });
  it("one pixel over 1600 is scaled", () => {
    expect(fitDimensions(1601, 1601)).toEqual({ width: 1600, height: 1600 });
  });
  it("uses a custom limit", () => {
    expect(fitDimensions(4000, 2000, 1200)).toEqual({ width: 1200, height: 600 });
  });
  it("keeps at least one pixel on the short side", () => {
    expect(fitDimensions(10000, 2)).toEqual({ width: 1600, height: 1 });
  });
});

describe("quality ladder", () => {
  it("steps 0.85, 0.75, 0.65, 0.55", () => {
    expect([...QUALITY_LADDER]).toEqual([0.85, 0.75, 0.65, 0.55]);
  });
  it("tries the ladder at 1600 px then at 1200 px", () => {
    expect(encodeAttempts()).toEqual([
      { maxSide: 1600, quality: 0.85 },
      { maxSide: 1600, quality: 0.75 },
      { maxSide: 1600, quality: 0.65 },
      { maxSide: 1600, quality: 0.55 },
      { maxSide: 1200, quality: 0.85 },
      { maxSide: 1200, quality: 0.75 },
      { maxSide: 1200, quality: 0.65 },
      { maxSide: 1200, quality: 0.55 },
    ]);
  });
});

describe("isJpeg", () => {
  it("checks FF D8 FF", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e]))).toBe(false);
    expect(isJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
});

// ── preparePhoto with a fake bitmap and canvas ──

type Call = { width: number; height: number; quality: number };
let calls: Call[] = [];
let sizeFor: (call: Call) => number;
let closed = false;
let bitmapSize = { width: 4000, height: 3000 };
let blobType = "image/jpeg";
let bitmapError = false;
let convertError = false;

function fakeBlob(size: number, type: string, bytes?: number[]) {
  const data = new Uint8Array(size);
  data.set(bytes ?? [0xff, 0xd8, 0xff, 0xe0]);
  return { size, type, arrayBuffer: async () => data.buffer } as unknown as Blob;
}

class FakeOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return { drawImage() {} };
  }
  async convertToBlob(opts: { type: string; quality: number }) {
    if (convertError) throw new Error("no encoder");
    const call = { width: this.width, height: this.height, quality: opts.quality };
    calls.push(call);
    return fakeBlob(sizeFor(call), blobType);
  }
}

const imageFile = (size = 1000, type = "image/jpeg") =>
  ({ type, size }) as unknown as Blob;

beforeEach(() => {
  calls = [];
  closed = false;
  bitmapSize = { width: 4000, height: 3000 };
  blobType = "image/jpeg";
  bitmapError = false;
  convertError = false;
  sizeFor = () => 300_000;
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => {
      if (bitmapError) throw new Error("cannot decode");
      return { ...bitmapSize, close: () => (closed = true) };
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("preparePhoto", () => {
  it("succeeds at the first quality and returns JPEG bytes", async () => {
    const result = await preparePhoto(imageFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photo.width).toBe(1600);
    expect(result.photo.height).toBe(1200);
    expect(isJpeg(result.photo.bytes)).toBe(true);
    expect(calls).toEqual([{ width: 1600, height: 1200, quality: 0.85 }]);
    expect(closed).toBe(true);
  });

  it("asks for the camera orientation", async () => {
    await preparePhoto(imageFile());
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), {
      imageOrientation: "from-image",
    });
  });

  it("steps the quality down until it fits", async () => {
    sizeFor = ({ quality }) => (quality > 0.65 ? MAX_PHOTO_BYTES + 1 : MAX_PHOTO_BYTES);
    const result = await preparePhoto(imageFile());
    expect(result.ok).toBe(true);
    expect(calls.map((c) => c.quality)).toEqual([0.85, 0.75, 0.65]);
    expect(calls.every((c) => c.width === 1600)).toBe(true);
  });

  it("falls back to 1200 px when 0.55 at 1600 px is still too big", async () => {
    sizeFor = ({ width }) => (width > 1200 ? MAX_PHOTO_BYTES + 1 : 500_000);
    const result = await preparePhoto(imageFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photo.width).toBe(1200);
    expect(result.photo.height).toBe(900);
    expect(calls).toHaveLength(5);
    expect(calls[4]).toEqual({ width: 1200, height: 900, quality: 0.85 });
  });

  it("refuses as too-big when nothing fits", async () => {
    sizeFor = () => MAX_PHOTO_BYTES + 1;
    expect(await preparePhoto(imageFile())).toEqual({ ok: false, reason: "too-big" });
    expect(calls).toHaveLength(8);
    expect(closed).toBe(true);
  });

  it("never enlarges a small image", async () => {
    bitmapSize = { width: 640, height: 480 };
    const result = await preparePhoto(imageFile());
    expect(result.ok && [result.photo.width, result.photo.height]).toEqual([640, 480]);
  });

  it("refuses a file that is not an image without decoding", async () => {
    expect(await preparePhoto(imageFile(10, "application/pdf"))).toEqual({
      ok: false,
      reason: "not-image",
    });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("refuses an image the browser cannot decode as not-image", async () => {
    bitmapError = true;
    expect(await preparePhoto(imageFile())).toEqual({ ok: false, reason: "not-image" });
  });

  it("refuses an input over 40 MiB without decoding", async () => {
    expect(await preparePhoto(imageFile(PHOTO_INPUT_MAX_BYTES + 1))).toEqual({
      ok: false,
      reason: "too-large",
    });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("accepts exactly 40 MiB", async () => {
    const result = await preparePhoto(imageFile(PHOTO_INPUT_MAX_BYTES));
    expect(result.ok).toBe(true);
  });

  it("reports unsupported when the browser encodes something other than JPEG", async () => {
    blobType = "image/png";
    expect(await preparePhoto(imageFile())).toEqual({ ok: false, reason: "unsupported" });
    expect(closed).toBe(true);
  });

  it("reports unsupported when encoding throws", async () => {
    convertError = true;
    expect(await preparePhoto(imageFile())).toEqual({ ok: false, reason: "unsupported" });
  });

  it("uses a DOM canvas when OffscreenCanvas is missing", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    const toBlob = vi.fn((cb: (b: Blob | null) => void, type: string, q: number) => {
      calls.push({ width: 0, height: 0, quality: q });
      cb(fakeBlob(200_000, type));
    });
    const spy = vi.spyOn(document, "createElement").mockImplementation(
      () =>
        ({
          getContext: () => ({ drawImage() {} }),
          toBlob,
        }) as unknown as HTMLCanvasElement,
    );
    const result = await preparePhoto(imageFile());
    spy.mockRestore();
    expect(result.ok).toBe(true);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.85);
  });
});
