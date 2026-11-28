import { describe, expect, it } from "vitest";
import {
  centavosToInput,
  formatBp,
  formatCentavos,
  formatHours,
  formatMargin,
  formatPeso,
  formatUnitPrice,
  fraction,
  parseHours,
  parseMoney,
  parsePercent,
  parseWholeNumber,
} from "@/lib/cost";
import { MAX_LABOUR_HOURS_X100, MAX_MONEY_CENTAVOS } from "@/lib/types";

const P = "₱";

describe("formatting", () => {
  it("formats pesos with commas and two decimals", () => {
    expect(formatPeso(fraction(0))).toBe(`${P}0.00`);
    expect(formatPeso(fraction(5))).toBe(`${P}0.05`);
    expect(formatPeso(fraction(185_000))).toBe(`${P}1,850.00`);
    expect(formatPeso(fraction(123_456_789_012))).toBe(`${P}1,234,567,890.12`);
    expect(formatCentavos(185_000)).toBe(`${P}1,850.00`);
    expect(formatCentavos(0)).toBe(`${P}0.00`);
  });

  it("shows negatives with an ASCII hyphen-minus", () => {
    expect(formatPeso(fraction(-1230))).toBe(`-${P}12.30`);
    expect(formatCentavos(-1230)).toBe(`-${P}12.30`);
    expect(formatPeso(fraction(-1230)).charCodeAt(0)).toBe(45);
  });

  it("rounds half away from zero to the centavo", () => {
    expect(formatPeso(fraction(831555, 100))).toBe(`${P}83.16`);
    expect(formatPeso(fraction(1, 2))).toBe(`${P}0.01`);
    expect(formatPeso(fraction(499, 1000))).toBe(`${P}0.00`);
    expect(formatPeso(fraction(-1, 2))).toBe(`-${P}0.01`);
    expect(formatPeso(fraction(-499, 1000))).toBe(`${P}0.00`);
    expect(formatPeso(fraction(-501, 1000))).toBe(`-${P}0.01`);
  });

  it("formats margins to two decimals", () => {
    expect(formatMargin(fraction(2, 5))).toBe("40.00%");
    expect(formatMargin(fraction(0))).toBe("0.00%");
    expect(formatMargin(fraction(-51, 1000))).toBe("-5.10%");
    expect(formatMargin(fraction(1, 3))).toBe("33.33%");
    expect(formatMargin(fraction(1, 20000))).toBe("0.01%");
    expect(formatMargin(fraction(1, 40000))).toBe("0.00%");
    expect(formatMargin(fraction(-1, 40000))).toBe("0.00%");
    expect(formatMargin(fraction(9999, 10000))).toBe("99.99%");
  });

  it("formats basis points and hours as typed", () => {
    expect(formatBp(1250)).toBe("12.5%");
    expect(formatBp(4000)).toBe("40%");
    expect(formatBp(1234)).toBe("12.34%");
    expect(formatBp(5)).toBe("0.05%");
    expect(formatBp(0)).toBe("0%");
    expect(formatHours(350)).toBe("3.5");
    expect(formatHours(25)).toBe("0.25");
    expect(formatHours(400)).toBe("4");
    expect(formatHours(0)).toBe("0");
  });

  it("formats unit prices and input text", () => {
    expect(formatUnitPrice(fraction(185_000), "kg")).toBe(`${P}1,850.00 per kg`);
    expect(formatUnitPrice(fraction(3850), "piece")).toBe(`${P}38.50 each`);
    expect(centavosToInput(185_000)).toBe("1850.00");
    expect(centavosToInput(0)).toBe("0.00");
    expect(centavosToInput(5)).toBe("0.05");
    expect(parseMoney(centavosToInput(123_456))).toEqual({ ok: true, value: 123_456 });
  });
});

describe("parseMoney", () => {
  it.each([
    ["1850", 185_000],
    ["1,850.5", 185_050],
    ["₱1,850.00", 185_000],
    ["  45  ", 4500],
    ["0", 0],
    ["0.05", 5],
    [".5", 50],
    ["1,000,000", 100_000_000],
  ])("accepts %s", (text, value) => {
    expect(parseMoney(text)).toEqual({ ok: true, value });
  });

  it.each(["", "   "])("reports empty for %j", (text) => {
    expect(parseMoney(text)).toEqual({ ok: false, reason: "empty" });
  });

  it.each(["abc", "18,50", "1,85.00", "1850.123", "-5", "+5", "1.2.3", "₱", "12 34", "1,8500", ",100", "1850."])(
    "rejects %j as format",
    (text) => {
      expect(parseMoney(text)).toEqual({ ok: false, reason: "format" });
    },
  );

  it("enforces the range", () => {
    expect(parseMoney("10000000")).toEqual({ ok: true, value: MAX_MONEY_CENTAVOS });
    expect(parseMoney("10,000,000.01")).toEqual({ ok: false, reason: "range" });
    expect(parseMoney("99999999999999999999")).toEqual({ ok: false, reason: "range" });
  });
});

describe("parseHours", () => {
  it("parses hundredths", () => {
    expect(parseHours("3.5")).toEqual({ ok: true, value: 350 });
    expect(parseHours("0.25")).toEqual({ ok: true, value: 25 });
    expect(parseHours("4")).toEqual({ ok: true, value: 400 });
    expect(parseHours("0")).toEqual({ ok: true, value: 0 });
  });
  it("rejects bad input", () => {
    expect(parseHours("")).toEqual({ ok: false, reason: "empty" });
    expect(parseHours("1.234")).toEqual({ ok: false, reason: "format" });
    expect(parseHours("-1")).toEqual({ ok: false, reason: "format" });
    expect(parseHours("1,000")).toEqual({ ok: false, reason: "format" });
    expect(parseHours("x")).toEqual({ ok: false, reason: "format" });
  });
  it("enforces the range", () => {
    expect(parseHours("1000")).toEqual({ ok: true, value: MAX_LABOUR_HOURS_X100 });
    expect(parseHours("1000.01")).toEqual({ ok: false, reason: "range" });
  });
});

describe("parsePercent", () => {
  it("parses with or without a percent sign", () => {
    expect(parsePercent("12.5", 10_000)).toEqual({ ok: true, value: 1250 });
    expect(parsePercent("12.5%", 10_000)).toEqual({ ok: true, value: 1250 });
    expect(parsePercent(" 40 % ", 10_000)).toEqual({ ok: true, value: 4000 });
    expect(parsePercent("99.99", 9999)).toEqual({ ok: true, value: 9999 });
    expect(parsePercent("0", 9999)).toEqual({ ok: true, value: 0 });
  });
  it("rejects bad input", () => {
    expect(parsePercent("", 100)).toEqual({ ok: false, reason: "empty" });
    expect(parsePercent("%", 100)).toEqual({ ok: false, reason: "format" });
    expect(parsePercent("1.234", 10_000)).toEqual({ ok: false, reason: "format" });
    expect(parsePercent("-5", 10_000)).toEqual({ ok: false, reason: "format" });
    expect(parsePercent("abc", 10_000)).toEqual({ ok: false, reason: "format" });
    expect(parsePercent("100", 9999)).toEqual({ ok: false, reason: "range" });
  });
});

describe("parseWholeNumber", () => {
  it("parses within the range", () => {
    expect(parseWholeNumber("12", 1, 100)).toEqual({ ok: true, value: 12 });
    expect(parseWholeNumber(" 1 ", 1, 100)).toEqual({ ok: true, value: 1 });
    expect(parseWholeNumber("100", 1, 100)).toEqual({ ok: true, value: 100 });
  });
  it("rejects bad input", () => {
    expect(parseWholeNumber("", 1, 100)).toEqual({ ok: false, reason: "empty" });
    expect(parseWholeNumber("1.5", 1, 100)).toEqual({ ok: false, reason: "format" });
    expect(parseWholeNumber("-3", 0, 100)).toEqual({ ok: false, reason: "format" });
    expect(parseWholeNumber("abc", 1, 100)).toEqual({ ok: false, reason: "format" });
    expect(parseWholeNumber("0", 1, 100)).toEqual({ ok: false, reason: "range" });
    expect(parseWholeNumber("101", 1, 100)).toEqual({ ok: false, reason: "range" });
  });
});
