import { describe, expect, it } from "vitest";
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/time";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const UTC = { timeZone: "UTC" };
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => NOW - ms;

describe("formatRelativeTime", () => {
  it("says just now under a minute", () => {
    expect(formatRelativeTime(ago(0), NOW, UTC)).toBe("just now");
    expect(formatRelativeTime(ago(59_999), NOW, UTC)).toBe("just now");
  });

  it("shows minutes, rounded down", () => {
    expect(formatRelativeTime(ago(MIN), NOW, UTC)).toBe("1m ago");
    expect(formatRelativeTime(ago(5 * MIN + 30_000), NOW, UTC)).toBe("5m ago");
    expect(formatRelativeTime(ago(59 * MIN + 59_000), NOW, UTC)).toBe("59m ago");
  });

  it("shows hours, rounded down", () => {
    expect(formatRelativeTime(ago(HOUR), NOW, UTC)).toBe("1h ago");
    expect(formatRelativeTime(ago(2 * HOUR + 10 * MIN), NOW, UTC)).toBe("2h ago");
    expect(formatRelativeTime(ago(23 * HOUR + 59 * MIN), NOW, UTC)).toBe("23h ago");
  });

  it("shows days up to six days", () => {
    expect(formatRelativeTime(ago(DAY), NOW, UTC)).toBe("1d ago");
    expect(formatRelativeTime(ago(3 * DAY + HOUR), NOW, UTC)).toBe("3d ago");
    expect(formatRelativeTime(ago(6 * DAY + 23 * HOUR), NOW, UTC)).toBe("6d ago");
  });

  it("falls back to a calendar date from seven days", () => {
    expect(formatRelativeTime("2026-11-08T12:00:00Z", NOW, UTC)).toBe("Nov 8");
    expect(formatRelativeTime("2026-03-02T09:00:00Z", NOW, UTC)).toBe("Mar 2");
  });

  it("includes the year for an earlier year", () => {
    expect(formatRelativeTime("2025-11-12T09:00:00Z", NOW, UTC)).toBe(
      "Nov 12, 2025",
    );
  });

  it("treats a time in the future as just now", () => {
    expect(formatRelativeTime(NOW + 5 * MIN, NOW, UTC)).toBe("just now");
  });

  it("accepts ISO strings, Dates and epoch milliseconds", () => {
    const iso = "2026-11-15T10:00:00Z";
    expect(formatRelativeTime(iso, NOW, UTC)).toBe("2h ago");
    expect(formatRelativeTime(new Date(iso), NOW, UTC)).toBe("2h ago");
    expect(formatRelativeTime(Date.parse(iso), new Date(NOW), UTC)).toBe(
      "2h ago",
    );
  });

  it("returns an empty string for an unreadable timestamp", () => {
    expect(formatRelativeTime("not a date", NOW, UTC)).toBe("");
    expect(formatRelativeTime(NOW, "nope", UTC)).toBe("");
  });
});

describe("formatAbsoluteDate", () => {
  it("omits the year in the current year", () => {
    expect(formatAbsoluteDate("2026-11-12T09:00:00Z", NOW, UTC)).toBe("Nov 12");
    expect(formatAbsoluteDate("2026-01-01T00:00:00Z", NOW, UTC)).toBe("Jan 1");
  });

  it("includes the year when it is not the current year", () => {
    expect(formatAbsoluteDate("2025-12-31T23:00:00Z", NOW, UTC)).toBe(
      "Dec 31, 2025",
    );
    expect(formatAbsoluteDate("2027-02-03T00:00:00Z", NOW, UTC)).toBe(
      "Feb 3, 2027",
    );
  });

  it("uses the requested time zone for the calendar day", () => {
    const t = "2026-11-12T23:30:00Z";
    expect(formatAbsoluteDate(t, NOW, { timeZone: "UTC" })).toBe("Nov 12");
    expect(formatAbsoluteDate(t, NOW, { timeZone: "Asia/Tokyo" })).toBe(
      "Nov 13",
    );
  });

  it("returns an empty string for an unreadable timestamp", () => {
    expect(formatAbsoluteDate("", NOW, UTC)).toBe("");
  });
});
