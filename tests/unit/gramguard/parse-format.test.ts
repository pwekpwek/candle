/**
 * TEST-09 (V-01 part): parseFixed. Also the display formatters of CALC-11 and
 * CALC-18, checked against the figures the contract and spec print.
 */
import { describe, expect, it } from "vitest";
import {
  formatFactor,
  formatGrams,
  formatHundredths,
  formatMeasured,
  formatMinimalGrams,
  formatPercent2,
  formatRequestedPercent,
  formatSignedGrams,
  formatSignedPercent2,
  formatWeight,
  parseFixed,
  precisionDecimals,
  precisionLabel,
} from "@/lib/gramguard";

describe("parseFixed (V-01)", () => {
  it.each([
    ["462", 3, 462_000, 0],
    ["462.5", 3, 462_500, 1],
    [".5", 3, 500, 1],
    ["5.", 3, 5_000, 0],
    ["  12.25  ", 3, 12_250, 2],
    ["\t7\n", 0, 7, 0],
    ["0", 3, 0, 0],
    ["8.25", 2, 825, 2],
    ["12.5", 2, 1_250, 1],
    ["5.50", 3, 5_500, 1],
    ["1.2340", 3, 1_234, 3],
    ["3", 2, 300, 0],
  ])("accepts %j at scale %i", (text, scale, value, decimals) => {
    expect(parseFixed(text, scale)).toEqual({ ok: true, value, decimals });
  });

  it("drops trailing zeros when counting decimals", () => {
    const r = parseFixed("5.50", 3);
    expect(r.ok && r.decimals).toBe(1);
    const r2 = parseFixed("5.000", 3);
    expect(r2).toEqual({ ok: true, value: 5_000, decimals: 0 });
  });

  it.each(["", "   ", "\t"])("reports empty for %j", (text) => {
    expect(parseFixed(text, 3)).toEqual({ ok: false, reason: "empty" });
  });

  it.each([".", "1,000", "+5", "-2", "1 000", "1e3", "1E3", "abc", "1.2.3", "5,5", "0x10", "--1"])(
    "rejects %j as a format error",
    (text) => {
      expect(parseFixed(text, 3)).toEqual({ ok: false, reason: "format" });
    },
  );

  it("reports tooManyDecimals when significant decimals exceed the scale", () => {
    expect(parseFixed("1.2345", 3)).toEqual({ ok: false, reason: "tooManyDecimals" });
    expect(parseFixed("8.255", 2)).toEqual({ ok: false, reason: "tooManyDecimals" });
    expect(parseFixed("0.5", 0)).toEqual({ ok: false, reason: "tooManyDecimals" });
  });

  it("reports tooLarge above Number.MAX_SAFE_INTEGER after scaling", () => {
    expect(parseFixed("9007199254740991", 0)).toEqual({ ok: true, value: 9007199254740991, decimals: 0 });
    expect(parseFixed("9007199254740992", 0)).toEqual({ ok: false, reason: "tooLarge" });
    expect(parseFixed("99999999999999999999", 0)).toEqual({ ok: false, reason: "tooLarge" });
    expect(parseFixed("9007199254741", 3)).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("does not read a comma as a thousands separator (WE-13: not 1 g, not 1000 g)", () => {
    const r = parseFixed("1,000", 3);
    expect(r.ok).toBe(false);
  });
});

describe("precision helpers", () => {
  it("precisionDecimals: 1 g, 0.1 g, 0.01 g", () => {
    expect(precisionDecimals(1000)).toBe(0);
    expect(precisionDecimals(100)).toBe(1);
    expect(precisionDecimals(10)).toBe(2);
  });
  it("precisionLabel", () => {
    expect(precisionLabel(1000)).toBe("1 g");
    expect(precisionLabel(100)).toBe("0.1 g");
    expect(precisionLabel(10)).toBe("0.01 g");
  });
});

describe("weight formatting (CALC-11)", () => {
  it("formatWeight uses fixed decimals for the precision, no unit", () => {
    expect(formatWeight(463_000, 100)).toBe("463.0");
    expect(formatWeight(463_000, 1000)).toBe("463");
    expect(formatWeight(7_620, 10)).toBe("7.62");
    expect(formatWeight(0, 100)).toBe("0.0");
    expect(formatWeight(300_000, 10)).toBe("300.00");
    expect(formatWeight(1_666_700, 100)).toBe("1666.7");
  });
  it("formatWeight has no thousands separator", () => {
    expect(formatWeight(1_100_000, 100)).toBe("1100.0");
    expect(formatWeight(1_000_000_000, 1000)).toBe("1000000");
  });
  it("formatGrams adds the unit", () => {
    expect(formatGrams(463_000, 100)).toBe("463.0 g");
    expect(formatGrams(3_000, 1000)).toBe("3 g");
    expect(formatGrams(2_830, 10)).toBe("2.83 g");
    expect(formatGrams(0, 100)).toBe("0.0 g");
  });
});

describe("measured and signed formatting (CALC-18)", () => {
  it("formatMeasured: at least the precision's decimals, up to 2 when finer was typed", () => {
    expect(formatMeasured(1_003_200, 100)).toBe("1003.2");
    expect(formatMeasured(26_150, 100)).toBe("26.15");
    expect(formatMeasured(40_400, 100)).toBe("40.4");
    expect(formatMeasured(40_000, 100)).toBe("40.0");
    expect(formatMeasured(40_000, 1000)).toBe("40");
    expect(formatMeasured(26_100, 10)).toBe("26.10");
    expect(formatMeasured(26_120, 100)).toBe("26.12");
    expect(formatMeasured(26_500, 1000)).toBe("26.5");
  });
  it("formatSignedGrams on the WE-8 differences", () => {
    expect(formatSignedGrams(3_200, 100)).toBe("+3.2 g");
    expect(formatSignedGrams(400, 100)).toBe("+0.4 g");
    expect(formatSignedGrams(-600, 100)).toBe("-0.6 g");
    expect(formatSignedGrams(600, 100)).toBe("+0.6 g");
    expect(formatSignedGrams(0, 100)).toBe("0.0 g");
    expect(formatSignedGrams(3_600, 100)).toBe("+3.6 g");
  });
  it("formatSignedGrams uses an ASCII hyphen-minus", () => {
    const s = formatSignedGrams(-600, 100);
    expect(s.charCodeAt(0)).toBe(0x2d);
    expect(s).not.toContain("−");
  });
  it("formatSignedGrams follows the same decimals rule as formatMeasured", () => {
    expect(formatSignedGrams(-600, 10)).toBe("-0.60 g");
    expect(formatSignedGrams(150, 100)).toBe("+0.15 g");
    expect(formatSignedGrams(2_000, 1000)).toBe("+2 g");
    expect(formatSignedGrams(0, 1000)).toBe("0 g");
  });
  it("formatMinimalGrams: fewest decimals that show the value exactly", () => {
    expect(formatMinimalGrams(180_000)).toBe("180");
    expect(formatMinimalGrams(462_500)).toBe("462.5");
    expect(formatMinimalGrams(1_250)).toBe("1.25");
    expect(formatMinimalGrams(1_001)).toBe("1.001");
    expect(formatMinimalGrams(1_000)).toBe("1");
  });
});

describe("percentage and factor formatting", () => {
  it("formatPercent2: always 2 decimals, no sign, no percent sign", () => {
    expect(formatPercent2(741)).toBe("7.41");
    expect(formatPercent2(799)).toBe("7.99");
    expect(formatPercent2(1000)).toBe("10.00");
    expect(formatPercent2(0)).toBe("0.00");
    expect(formatPercent2(5)).toBe("0.05");
    expect(formatPercent2(5025)).toBe("50.25");
    expect(formatPercent2(10_000)).toBe("100.00");
  });
  it("formatSignedPercent2 on the WE-8 figures", () => {
    expect(formatSignedPercent2(32)).toBe("+0.32");
    expect(formatSignedPercent2(100)).toBe("+1.00");
    expect(formatSignedPercent2(-225)).toBe("-2.25");
    expect(formatSignedPercent2(451)).toBe("+4.51");
    expect(formatSignedPercent2(50)).toBe("+0.50");
    expect(formatSignedPercent2(33)).toBe("+0.33");
    expect(formatSignedPercent2(0)).toBe("0.00");
    expect(formatSignedPercent2(-5)).toBe("-0.05");
  });
  it("formatSignedPercent2 uses an ASCII hyphen-minus", () => {
    expect(formatSignedPercent2(-225).charCodeAt(0)).toBe(0x2d);
  });
  it("formatRequestedPercent: fewest decimals, as typed", () => {
    expect(formatRequestedPercent(800)).toBe("8");
    expect(formatRequestedPercent(825)).toBe("8.25");
    expect(formatRequestedPercent(850)).toBe("8.5");
    expect(formatRequestedPercent(5)).toBe("0.05");
    expect(formatRequestedPercent(0)).toBe("0");
    expect(formatRequestedPercent(5000)).toBe("50");
  });
  it("formatHundredths: parts or multipliers, fewest decimals", () => {
    expect(formatHundredths(300)).toBe("3");
    expect(formatHundredths(3333)).toBe("33.33");
    expect(formatHundredths(150)).toBe("1.5");
    expect(formatHundredths(1)).toBe("0.01");
    expect(formatHundredths(100_000)).toBe("1000");
  });
  it("formatFactor: 2 decimals, half up", () => {
    expect(formatFactor(16_667)).toBe("1.67");
    expect(formatFactor(5_000)).toBe("0.50");
    expect(formatFactor(12_500)).toBe("1.25");
    expect(formatFactor(15_002)).toBe("1.50");
    expect(formatFactor(15_049)).toBe("1.50");
    expect(formatFactor(15_050)).toBe("1.51");
    expect(formatFactor(10_000)).toBe("1.00");
  });
});
