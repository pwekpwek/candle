import { describe, expect, it } from "vitest";
import {
  attentionCount,
  buildSchedule,
  cureEndOf,
  groupSchedule,
  milestoneDueOn,
  stateFor,
  viewMilestones,
} from "@/lib/schedule";
import type { CureScheduleItem, ProductionPlanListItem } from "@/lib/db/contract";
import type { Batch, CureMilestone, CurePlan, Formula, FormulaVersion, ProductionPlan } from "@/lib/types";

const T = "2026-11-01T00:00:00.000Z";
const TODAY = "2026-11-19";
const formula = { id: crypto.randomUUID() } as unknown as Formula;
const version = { id: crypto.randomUUID() } as unknown as FormulaVersion;

function ms(
  kind: CureMilestone["kind"],
  offsetDays: number,
  doneOn: string | null = null,
  id: string = crypto.randomUUID(),
): CureMilestone {
  return { id, kind, offsetDays, doneOn };
}

function batch(producedOn: string): Batch {
  return {
    id: crypto.randomUUID(),
    formulaId: formula.id,
    versionId: version.id,
    producedOn,
    entries: [],
    createdAt: T,
    updatedAt: T,
  };
}

function plan(b: Batch, milestones: CureMilestone[]): CurePlan {
  return { id: b.id, milestones, createdAt: T, updatedAt: T };
}

function cure(b: Batch, p: CurePlan): CureScheduleItem {
  return { plan: p, batch: b, formula, version };
}

function entry(plannedOn: string, linked: Batch | null): ProductionPlanListItem {
  const p: ProductionPlan = {
    id: crypto.randomUUID(),
    formulaId: formula.id,
    versionId: version.id,
    plannedOn,
    batchId: linked ? linked.id : null,
    createdAt: T,
    updatedAt: T,
  };
  return { plan: p, formula, version, batch: linked };
}

/** Plain UTC arithmetic, independent of the module under test. */
function shift(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

describe("stateFor", () => {
  it("done beats everything", () => {
    expect(stateFor("2026-01-01", true, TODAY)).toBe("done");
    expect(stateFor("2027-01-01", true, TODAY)).toBe("done");
  });

  it("splits at today-1, today, today+1", () => {
    expect(stateFor("2026-11-18", false, TODAY)).toBe("overdue");
    expect(stateFor("2026-11-19", false, TODAY)).toBe("due");
    expect(stateFor("2026-11-20", false, TODAY)).toBe("upcoming");
  });
});

describe("milestoneDueOn", () => {
  it("adds the offset to the production date", () => {
    expect(milestoneDueOn("2026-03-01", 14)).toBe("2026-03-15");
    expect(milestoneDueOn("2026-10-20", 14)).toBe("2026-11-03");
    expect(milestoneDueOn("2026-11-19", 0)).toBe("2026-11-19");
  });
});

describe("viewMilestones", () => {
  it("orders by offset, then kind, then id", () => {
    const check = ms("check", 14, null, "00000000-0000-4000-8000-000000000001");
    const burn = ms("burnTest", 14, null, "00000000-0000-4000-8000-000000000002");
    const end = ms("cureEnd", 14, null, "00000000-0000-4000-8000-000000000003");
    const early = ms("check", 3, null, "00000000-0000-4000-8000-000000000009");
    const burnLow = ms("burnTest", 14, null, "00000000-0000-4000-8000-000000000000");
    const b = batch("2026-11-01");
    const views = viewMilestones(plan(b, [check, burn, end, early, burnLow]), b.producedOn, TODAY);
    expect(views.map((v) => v.milestone.id)).toEqual([early.id, end.id, burnLow.id, burn.id, check.id]);
  });

  it("computes due date, state and daysFromToday", () => {
    const b = batch("2026-11-05");
    const views = viewMilestones(
      plan(b, [ms("check", 0), ms("check", 14), ms("cureEnd", 20), ms("burnTest", 30, "2026-11-10")]),
      b.producedOn,
      TODAY,
    );
    expect(views.map((v) => [v.dueOn, v.state, v.daysFromToday])).toEqual([
      ["2026-11-05", "overdue", -14],
      ["2026-11-19", "due", 0],
      ["2026-11-25", "upcoming", 6],
      ["2026-12-05", "done", 16],
    ]);
  });

  it("does not mutate the plan", () => {
    const b = batch("2026-11-01");
    const p = plan(b, [ms("check", 9), ms("check", 1)]);
    const before = p.milestones.map((m) => m.id);
    viewMilestones(p, b.producedOn, TODAY);
    expect(p.milestones.map((m) => m.id)).toEqual(before);
  });
});

describe("recalculation", () => {
  const b = batch("2026-11-01");
  const done = ms("check", 5, "2026-11-06");
  const p = plan(b, [ms("cureEnd", 14), ms("burnTest", 21), ms("check", 30), done]);

  it("moving producedOn moves every open milestone by the same delta; done keeps doneOn", () => {
    const base = viewMilestones(p, "2026-11-01", TODAY);
    for (const delta of [-5, 3]) {
      const moved = viewMilestones(p, shift("2026-11-01", delta), TODAY);
      expect(moved.map((v) => v.milestone.id)).toEqual(base.map((v) => v.milestone.id));
      base.forEach((v, i) => {
        const w = moved[i];
        expect(w.dueOn).toBe(shift(v.dueOn, delta));
        if (v.milestone.doneOn) {
          expect(w.state).toBe("done");
          expect(w.milestone.doneOn).toBe("2026-11-06");
        } else {
          expect(w.daysFromToday - v.daysFromToday).toBe(delta);
        }
      });
    }
  });

  it("states update when the date moves", () => {
    const endState = (producedOn: string) =>
      viewMilestones(p, producedOn, TODAY).find((v) => v.milestone.kind === "cureEnd")?.state;
    expect(endState("2026-11-10")).toBe("upcoming");
    expect(endState("2026-11-01")).toBe("overdue");
    expect(endState("2026-10-01")).toBe("overdue");
    expect(endState("2026-11-05")).toBe("due");
  });

  it("changing one offset moves only that milestone", () => {
    const target = p.milestones[1];
    const changed: CurePlan = {
      ...p,
      milestones: p.milestones.map((m) => (m.id === target.id ? { ...m, offsetDays: 40 } : m)),
    };
    const before = viewMilestones(p, b.producedOn, TODAY);
    const after = viewMilestones(changed, b.producedOn, TODAY);
    const byId = (views: typeof before, id: string) => views.find((v) => v.milestone.id === id)!;
    for (const m of p.milestones) {
      if (m.id === target.id) expect(byId(after, m.id).dueOn).toBe("2026-12-11");
      else expect(byId(after, m.id).dueOn).toBe(byId(before, m.id).dueOn);
    }
  });

  it("an offset change keeps a done milestone done", () => {
    const changed: CurePlan = { ...p, milestones: [{ ...done, offsetDays: 90 }] };
    const v = viewMilestones(changed, b.producedOn, TODAY)[0];
    expect(v.state).toBe("done");
    expect(v.milestone.doneOn).toBe("2026-11-06");
  });
});

describe("cureEndOf", () => {
  it("returns the cureEnd milestone or undefined", () => {
    const b = batch("2026-11-01");
    const end = ms("cureEnd", 14);
    expect(cureEndOf(plan(b, [ms("check", 1), end]))).toBe(end);
    expect(cureEndOf(plan(b, [ms("burnTest", 7)]))).toBeUndefined();
  });
});

describe("buildSchedule, groupSchedule, attentionCount", () => {
  const b1 = batch("2026-11-01");
  const b2 = batch("2026-10-01");
  const b3 = batch("2026-11-10");
  const b1End = ms("cureEnd", 14); // 11-15 overdue
  const b1Burn = ms("burnTest", 18); // 11-19 due
  const b1Check = ms("check", 30); // 12-01 upcoming
  const b2End = ms("cureEnd", 14, "2026-10-20"); // due 10-15, done 10-20
  const b2Burn = ms("burnTest", 49); // 11-19 due
  const b3Check = ms("check", 9); // 11-19 due
  const b3End = ms("cureEnd", 20); // 11-30 upcoming

  const producedBatch = batch("2026-11-17");
  const overdueEntry = entry("2026-11-10", null);
  const dueEntry = entry("2026-11-19", null);
  const upcomingEntry = entry("2026-12-02", null);
  const doneWithBatch = entry("2026-11-05", producedBatch); // doneOn 11-17
  const doneNoBatch = entry("2026-11-08", null);
  doneNoBatch.plan.batchId = crypto.randomUUID(); // linked, batch row missing

  const data = {
    cure: [
      cure(b1, plan(b1, [b1End, b1Burn, b1Check])),
      cure(b2, plan(b2, [b2End, b2Burn])),
      cure(b3, plan(b3, [b3Check, b3End])),
    ],
    production: [upcomingEntry, doneWithBatch, dueEntry, overdueEntry, doneNoBatch],
  };

  const items = buildSchedule(data, TODAY);
  const mkey = (b: Batch, m: CureMilestone) => `m:${b.id}:${m.id}`;
  const pkey = (e: ProductionPlanListItem) => `p:${e.plan.id}`;

  it("builds one item per milestone and entry with stable keys", () => {
    expect(items).toHaveLength(12);
    expect(new Set(items.map((i) => i.key)).size).toBe(12);
    expect(items.some((i) => i.key === mkey(b1, b1End))).toBe(true);
    expect(items.some((i) => i.key === pkey(dueEntry))).toBe(true);
  });

  it("orders by dueOn, milestones before production entries, then key", () => {
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1];
      const b = items[i];
      expect(a.dueOn <= b.dueOn).toBe(true);
      if (a.dueOn === b.dueOn) {
        if (a.kind === b.kind) expect(a.key < b.key).toBe(true);
        else expect(a.kind).toBe("milestone");
      }
    }
    const today = items.filter((i) => i.dueOn === TODAY);
    expect(today.map((i) => i.kind)).toEqual(["milestone", "milestone", "milestone", "production"]);
  });

  it("sets states, daysFromToday and doneOn", () => {
    const find = (k: string) => items.find((i) => i.key === k)!;
    const end1 = find(mkey(b1, b1End));
    expect([end1.state, end1.dueOn, end1.daysFromToday, end1.doneOn]).toEqual([
      "overdue",
      "2026-11-15",
      -4,
      null,
    ]);
    const end2 = find(mkey(b2, b2End));
    expect([end2.state, end2.dueOn, end2.doneOn]).toEqual(["done", "2026-10-15", "2026-10-20"]);
    expect(find(pkey(doneWithBatch)).doneOn).toBe("2026-11-17");
    expect(find(pkey(doneNoBatch)).doneOn).toBe("2026-11-08");
    expect(find(pkey(doneNoBatch)).state).toBe("done");
    expect(find(pkey(upcomingEntry)).doneOn).toBeNull();
    expect(find(pkey(overdueEntry)).state).toBe("overdue");
    expect(find(pkey(dueEntry)).state).toBe("due");
    expect(find(pkey(upcomingEntry)).state).toBe("upcoming");
  });

  it("groups in the documented order", () => {
    const g = groupSchedule(items);
    expect(g.overdue.map((i) => i.key)).toEqual([pkey(overdueEntry), mkey(b1, b1End)]);
    expect(g.due).toHaveLength(4);
    expect(g.due.slice(0, 3).map((i) => i.key)).toEqual(
      [mkey(b1, b1Burn), mkey(b2, b2Burn), mkey(b3, b3Check)].sort(),
    );
    expect(g.due[3].key).toBe(pkey(dueEntry));
    expect(g.upcoming.map((i) => i.dueOn)).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(g.done.map((i) => i.doneOn)).toEqual(["2026-11-17", "2026-11-08", "2026-10-20"]);
    expect(g.overdue.length + g.due.length + g.upcoming.length + g.done.length).toBe(items.length);
  });

  it("groups do not depend on input order", () => {
    const a = groupSchedule(items);
    const b = groupSchedule([...items].reverse());
    for (const k of ["overdue", "due", "upcoming", "done"] as const) {
      expect(b[k].map((i) => i.key)).toEqual(a[k].map((i) => i.key));
    }
  });

  it("counts overdue plus due only", () => {
    expect(attentionCount(items)).toBe(6);
    expect(attentionCount([])).toBe(0);
    expect(attentionCount(groupSchedule(items).done)).toBe(0);
  });

  it("handles empty data", () => {
    expect(buildSchedule({ cure: [], production: [] }, TODAY)).toEqual([]);
  });
});
