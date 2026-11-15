import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "@/lib/backup";

describe("canonicalJson", () => {
  it("sorts keys at every depth with no whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[{"y":2,"z":1}]},"b":1}',
    );
  });

  it("keeps array order, including nested arrays", () => {
    expect(canonicalJson([3, [2, 1], ["b", "a"]])).toBe('[3,[2,1],["b","a"]]');
  });

  it("omits undefined properties and turns undefined elements into null", () => {
    expect(canonicalJson({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(canonicalJson([1, undefined, 3])).toBe("[1,null,3]");
  });

  it("gives identical text for the same content in a different key order", () => {
    const a = { x: 1, y: { p: 1, q: 2 }, z: [1] };
    const b = { z: [1], y: { q: 2, p: 1 }, x: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("matches JSON.stringify for strings and numbers", () => {
    const values = [
      "",
      "plain",
      'quo"te\\ \n\t\u0001',
      "ünï ☃ 😀  ",
      -0,
      0,
      7,
      -12,
      0.1,
      1.5e-7,
      1e21,
      123456789.125,
    ];
    for (const v of values) expect(canonicalJson(v)).toBe(JSON.stringify(v));
    expect(canonicalJson({ 'k"ey\n': "ä" })).toBe(JSON.stringify({ 'k"ey\n': "ä" }));
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(null)).toBe("null");
  });

  it("orders keys by code unit", () => {
    expect(canonicalJson({ a: 1, Z: 2, ä: 3 })).toBe('{"Z":2,"a":1,"ä":3}');
    // U+1F600 is the surrogate pair D83D DE00, which sorts before U+FFFF.
    expect(canonicalJson({ "￿": 2, "😀": 1 })).toBe('{"😀":1,"￿":2}');
  });

  it("throws TypeError on values JSON cannot represent faithfully", () => {
    const bad: unknown[] = [
      NaN,
      Infinity,
      -Infinity,
      BigInt(1),
      () => 1,
      Symbol("s"),
      new Date(),
      new Map(),
      { a: { b: NaN } },
      [1, () => 2],
      { f() {} },
      undefined,
    ];
    for (const v of bad) expect(() => canonicalJson(v)).toThrow(TypeError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(TypeError);
  });

  it("does not mutate its input", () => {
    const input = { b: [{ y: 1, x: 2 }], a: undefined, c: { z: 1, a: 2 } };
    canonicalJson(input);
    expect(Object.keys(input)).toEqual(["b", "a", "c"]);
    expect(Object.keys(input.c)).toEqual(["z", "a"]);
    expect(Object.keys(input.b[0])).toEqual(["y", "x"]);
  });
});

describe("sha256Hex", () => {
  it("matches the published vectors", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes the UTF-8 bytes of non-ASCII text", async () => {
    const text = "Kerzenlicht ä ö ü ß, 蝋燭, 😀";
    expect(await sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });
});
