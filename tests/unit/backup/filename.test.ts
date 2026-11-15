import { describe, expect, it } from "vitest";
import { backupFileName } from "@/lib/backup";

describe("backupFileName", () => {
  it("formats the UTC parts", () => {
    expect(backupFileName("2026-11-14T06:05:12.000Z")).toBe("candlelab-backup-20261114-060512.json");
  });

  it("uses UTC even when the local date differs", () => {
    expect(backupFileName("2026-11-14T23:30:00.000Z")).toBe("candlelab-backup-20261114-233000.json");
    expect(backupFileName("2026-12-31T23:59:59Z")).toBe("candlelab-backup-20261231-235959.json");
    // An offset input is converted to UTC.
    expect(backupFileName("2026-11-15T01:00:00+08:00")).toBe("candlelab-backup-20261114-170000.json");
  });

  it("throws RangeError on bad input", () => {
    for (const bad of ["", "not a date", "2026-13-45T00:00:00.000Z"]) {
      expect(() => backupFileName(bad)).toThrow(RangeError);
    }
  });
});
