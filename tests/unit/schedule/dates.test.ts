import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isLocalDate, todayLocal } from "@/lib/schedule";

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles Feb 29 in leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("handles zero, negative and 365 days", () => {
    expect(addDays("2026-11-19", 0)).toBe("2026-11-19");
    expect(addDays("2026-11-19", -19)).toBe("2026-10-31");
    expect(addDays("2026-11-19", 365)).toBe("2027-11-19");
    expect(addDays("2027-03-01", 365)).toBe("2028-02-29");
  });

  it("throws RangeError for input that is not a real date", () => {
    const bad = ["2026-02-30", "2026-13-01", "26-01-01", "2026-1-1", "", "2026-01-01T00:00", "abc"];
    for (const value of bad) {
      expect(() => addDays(value, 1)).toThrow(RangeError);
    }
  });
});

describe("DST boundaries", () => {
  it("gives exact calendar dates across spring and autumn changes", () => {
    expect(addDays("2026-03-01", 14)).toBe("2026-03-15");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-10-20", 14)).toBe("2026-11-03");
    expect(addDays("2026-10-30", 2)).toBe("2026-11-01");
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14);
    expect(daysBetween("2026-10-20", "2026-11-03")).toBe(14);
  });
});

describe("daysBetween", () => {
  it("is signed in both directions", () => {
    expect(daysBetween("2026-11-19", "2026-11-19")).toBe(0);
    expect(daysBetween("2026-11-19", "2026-11-22")).toBe(3);
    expect(daysBetween("2026-11-22", "2026-11-19")).toBe(-3);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });

  it("throws for invalid input", () => {
    expect(() => daysBetween("2026-02-30", "2026-03-01")).toThrow(RangeError);
    expect(() => daysBetween("2026-03-01", "nope")).toThrow(RangeError);
  });
});

describe("isLocalDate", () => {
  it("accepts real dates only", () => {
    expect(isLocalDate("2026-11-19")).toBe(true);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2027-02-29")).toBe(false);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("2026-00-10")).toBe(false);
    expect(isLocalDate("2026-11-1")).toBe(false);
    expect(isLocalDate(" 2026-11-10")).toBe(false);
  });
});

describe("todayLocal", () => {
  it("uses local date parts", () => {
    expect(todayLocal(new Date(2026, 10, 19, 23, 30))).toBe("2026-11-19");
    expect(todayLocal(new Date(2026, 10, 19, 0, 5))).toBe("2026-11-19");
  });

  it("is not converted to UTC", () => {
    const late = new Date(2026, 10, 19, 23, 30);
    const utcDate = late.toISOString().slice(0, 10);
    expect(todayLocal(late)).toBe("2026-11-19");
    // In any zone where UTC differs from local at this moment, the result still follows local.
    if (utcDate !== "2026-11-19") expect(todayLocal(late)).not.toBe(utcDate);
  });

  it("pads month and day", () => {
    expect(todayLocal(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  it("defaults to the current clock", () => {
    expect(isLocalDate(todayLocal())).toBe(true);
  });
});
