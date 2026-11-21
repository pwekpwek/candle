import { describe, expect, it } from "vitest";
import { isPlannedTestTaken } from "@/components/burn/session/session-editor";
import type { BurnTestOption } from "@/lib/db";

const option = (id: string, linkedSessionId: string | null) =>
  ({ milestone: { id }, linkedSessionId }) as unknown as BurnTestOption;

describe("planned burn test taken", () => {
  it("is free when nothing is linked, and when this session is the one linked", () => {
    expect(isPlannedTestTaken(option("m1", null), "s1", null)).toBe(false);
    expect(isPlannedTestTaken(option("m1", "s1"), "s1", "m1")).toBe(false);
  });

  it("is taken when another session is linked and this session is not on it", () => {
    expect(isPlannedTestTaken(option("m1", "s2"), "s1", null)).toBe(true);
    expect(isPlannedTestTaken(option("m1", "s2"), "s1", "m9")).toBe(true);
  });

  it("keeps this session's stored link enabled even when another session shares it", () => {
    expect(isPlannedTestTaken(option("m1", "s2"), "s1", "m1")).toBe(false);
  });
});
