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
  it("accepts the contract's forms", () => {
    expect(parseFixed("462", 3)).toEqual({ ok: true, value: 462000, decimals: 0 });
    expect(parseFixed("462.5", 3)).toEqual({ ok: true, value: 462500, decimals: 1 });
    expect(parseFixed(".5", 3)).toEqual({ ok: true, value: 500, decimals: 1 });
    expect(parseFixed("5.", 3)).toEqual({ ok: true, value: 5000, decimals: 0 });
    expect(parseFixed("  462.5  ", 3)).toEqual({ ok: true, value: 462500, decimals: 1 });
    expect(parseFixed("\t12\n", 3)).toEqual({ ok: true, value: 12000, decimals: 0 });
  });

  it("drops trailing zeros when counting decimals", () => {
    expect(parseFixed("5.50", 3)).toEqual({ ok: true, value: 5500, decimals: 1 });
    expect(parseFixed("5.000", 3)).toEqual({ ok: true, value: 5000, decimals: 0 });
    expect(parseFixed("0.0", 3)).toEqual({ ok: true, value: 0, decimals: 0 });
    expect(parseFixed("007", 3)).toEqual({ ok: true, value: 7000, decimals: 0 });
  });

  it("scales for percentages, parts and whole numbers", () => {
    expect(parseFixed("8.25", 2)).toEqual({ ok: true, value: 825, decimals: 2 });
    expect(parseFixed("8", 2)).toEqual({ ok: true, value: 800, decimals: 0 });
    expect(parseFixed("9999.99", 2)).toEqual({ ok: true, value: 999999, decimals: 2 });
    expect(parseFixed("5", 0)).toEqual({ ok: true, value: 5, decimals: 0 });
    expect(parseFixed("5.0", 0)).toEqual({ ok: true, value: 5, decimals: 0 });
  });

  it("reports empty for blank text", () => {
    expect(parseFixed("", 3)).toEqual({ ok: false, reason: "empty" });
    expect(parseFixed("   ", 3)).toEqual({ ok: false, reason: "empty" });
  });

  it("reports format for anything that breaks V-01", () => {
    for (const bad of [
      ".",
      " . ",
      "1,000",
      "1,5",
      "-2",
      "+2",
      "1 000",
      "abc",
      "12a",
      "1e3",
      "1E3",
      "1.2.3",
      "..5",
      "0x10",
      "٣",
    ]) {
      expect(parseFixed(bad, 3), bad).toEqual({ ok: false, reason: "format" });
    }
  });

  it("reports tooManyDecimals when significant decimals exceed the scale", () => {
    expect(parseFixed("1.2345", 3)).toEqual({ ok: false, reason: "tooManyDecimals" });
    expect(parseFixed("0.0005", 3)).toEqual({ ok: false, reason: "tooManyDecimals" });
    expect(parseFixed("500.55", 2)).toEqual({ ok: true, value: 50055, decimals: 2 });
    expect(parseFixed("8.255", 2)).toEqual({ ok: false, reason: "tooManyDecimals" });
    expect(parseFixed("5.5", 0)).toEqual({ ok: false, reason: "tooManyDecimals" });
  });

  it("reports tooLarge above Number.MAX_SAFE_INTEGER after scaling", () => {
    // MAX_SAFE_INTEGER is 9007199254740991.
    expect(parseFixed("9007199254740.991", 3)).toEqual({
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
      decimals: 3,
    });
    expect(parseFixed("9007199254740.992", 3)).toEqual({ ok: false, reason: "tooLarge" });
    expect(parseFixed("99999999999999999999", 0)).toEqual({ ok: false, reason: "tooLarge" });
  });
});

describe("precision helpers", () => {
  it("gives decimals and labels", () => {
    expect(precisionDecimals(1000)).toBe(0);
    expect(precisionDecimals(100)).toBe(1);
    expect(precisionDecimals(10)).toBe(2);
    expect(precisionLabel(1000)).toBe("1 g");
    expect(precisionLabel(100)).toBe("0.1 g");
    expect(precisionLabel(10)).toBe("0.01 g");
  });
});

describe("weight formatting (CALC-11, CALC-18)", () => {
  it("formatWeight uses fixed decimals for the precision", () => {
    expect(formatWeight(463000, 100)).toBe("463.0");
    expect(formatWeight(463000, 1000)).toBe("463");
    expect(formatWeight(463000, 10)).toBe("463.00");
    expect(formatWeight(0, 100)).toBe("0.0");
    expect(formatWeight(0, 10)).toBe("0.00");
    expect(formatWeight(50, 10)).toBe("0.05");
    expect(formatWeight(1_000_000_000, 100)).toBe("1000000.0");
  });

  it("formatWeight rounds half up when given a finer value (CALC-08: 2.25 -> 2.3)", () => {
    expect(formatWeight(2250, 100)).toBe("2.3");
    expect(formatWeight(2249, 100)).toBe("2.2");
    expect(formatWeight(500, 1000)).toBe("1");
  });

  it("formatGrams adds the unit", () => {
    expect(formatGrams(463000, 100)).toBe("463.0 g");
    expect(formatGrams(3000, 1000)).toBe("3 g");
    expect(formatGrams(7620, 10)).toBe("7.62 g");
  });

  it("formatMeasured keeps the formula decimals and shows up to 2 when finer was typed", () => {
    expect(formatMeasured(1003200, 100)).toBe("1003.2");
    expect(formatMeasured(26150, 100)).toBe("26.15");
    expect(formatMeasured(40000, 100)).toBe("40.0");
    expect(formatMeasured(40000, 1000)).toBe("40");
    expect(formatMeasured(26150, 1000)).toBe("26.15");
    expect(formatMeasured(26100, 1000)).toBe("26.1");
    expect(formatMeasured(26100, 10)).toBe("26.10");
    expect(formatMeasured(0, 100)).toBe("0.0");
  });

  it("formatSignedGrams signs with an ASCII hyphen-minus", () => {
    expect(formatSignedGrams(3200, 100)).toBe("+3.2 g");
    expect(formatSignedGrams(-600, 100)).toBe("-0.6 g");
    expect(formatSignedGrams(0, 100)).toBe("0.0 g");
    expect(formatSignedGrams(0, 1000)).toBe("0 g");
    expect(formatSignedGrams(0, 10)).toBe("0.00 g");
    expect(formatSignedGrams(-26150, 100)).toBe("-26.15 g");
    expect(formatSignedGrams(400, 100)).toBe("+0.4 g");
    expect(formatSignedGrams(-600, 100)).not.toContain("−");
  });

  it("formatMinimalGrams shows the fewest decimals that are exact", () => {
    expect(formatMinimalGrams(180000)).toBe("180");
    expect(formatMinimalGrams(462500)).toBe("462.5");
    expect(formatMinimalGrams(0)).toBe("0");
    expect(formatMinimalGrams(1500)).toBe("1.5");
    expect(formatMinimalGrams(1)).toBe("0.001");
    expect(formatMinimalGrams(333300)).toBe("333.3");
  });
});

describe("percentage and factor formatting", () => {
  it("formatPercent2 always shows 2 decimals", () => {
    expect(formatPercent2(741)).toBe("7.41");
    expect(formatPercent2(800)).toBe("8.00");
    expect(formatPercent2(5)).toBe("0.05");
    expect(formatPercent2(0)).toBe("0.00");
    expect(formatPercent2(10000)).toBe("100.00");
    expect(formatPercent2(-225)).toBe("-2.25");
  });

  it("formatSignedPercent2 signs the value", () => {
    expect(formatSignedPercent2(32)).toBe("+0.32");
    expect(formatSignedPercent2(-225)).toBe("-2.25");
    expect(formatSignedPercent2(0)).toBe("0.00");
    expect(formatSignedPercent2(451)).toBe("+4.51");
  });

  it("formatRequestedPercent shows the fewest decimals", () => {
    expect(formatRequestedPercent(800)).toBe("8");
    expect(formatRequestedPercent(825)).toBe("8.25");
    expect(formatRequestedPercent(850)).toBe("8.5");
    expect(formatRequestedPercent(0)).toBe("0");
    expect(formatRequestedPercent(5)).toBe("0.05");
    expect(formatRequestedPercent(5000)).toBe("50");
  });

  it("formatHundredths shows parts and multipliers with the fewest decimals", () => {
    expect(formatHundredths(300)).toBe("3");
    expect(formatHundredths(3333)).toBe("33.33");
    expect(formatHundredths(100)).toBe("1");
    expect(formatHundredths(150)).toBe("1.5");
    expect(formatHundredths(1)).toBe("0.01");
    expect(formatHundredths(999_999)).toBe("9999.99");
    expect(formatHundredths(100_000)).toBe("1000");
  });

  it("formatFactor shows 2 decimals, half up", () => {
    expect(formatFactor(16667)).toBe("1.67");
    expect(formatFactor(10000)).toBe("1.00");
    expect(formatFactor(5000)).toBe("0.50");
    expect(formatFactor(12500)).toBe("1.25");
    expect(formatFactor(16650)).toBe("1.67");
    expect(formatFactor(16649)).toBe("1.66");
    expect(formatFactor(5)).toBe("0.00");
    expect(formatFactor(100000)).toBe("10.00");
  });
});
