import { describe, expect, it } from "vitest";
import { checklistFor, checklistItemById, checklistView } from "@/lib/candlefix";
import { MESSAGES } from "@/lib/messages";
import { FIX_ISSUES } from "@/lib/types";
import type { ChecklistTick, FixIssue } from "@/lib/types";

const ID_PATTERN = /^[a-zA-Z]+\.[a-z0-9]+(-[a-z0-9]+)*$/;

// Words the app never uses when it describes a candle (wording rules).
const FORBIDDEN =
  /\b(caused?|causes|causing|root cause|fix|fixed|fixes|solve|solved|solution|confirm|confirmed|proven|proof|diagnos\w*|safe|safety|should|must|always|never|correct|wrong|good|bad|best|better|worse|ideal|optimal|perfect|recommended|ready|cured|pass|passed|fail|failed|complete|completed|finished)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

function tick(itemId: string, issue: FixIssue, over: Partial<ChecklistTick> = {}): ChecklistTick {
  return { itemId, issue, label: `Snapshot of ${itemId}`, checked: true, ...over };
}

describe("built-in things to check", () => {
  it("has 4 to 7 items for every issue", () => {
    for (const issue of FIX_ISSUES) {
      const n = checklistFor(issue).length;
      expect(n, issue).toBeGreaterThanOrEqual(4);
      expect(n, issue).toBeLessThanOrEqual(7);
    }
  });

  it("uses unique, well-formed ids that start with their issue", () => {
    const seen = new Set<string>();
    for (const issue of FIX_ISSUES) {
      for (const item of checklistFor(issue)) {
        expect(item.id).toMatch(ID_PATTERN);
        expect(item.id.startsWith(`${issue}.`)).toBe(true);
        expect(item.issue).toBe(issue);
        expect(seen.has(item.id), item.id).toBe(false);
        seen.add(item.id);
      }
    }
  });

  it("keeps the order of the messages keys", () => {
    for (const issue of FIX_ISSUES) {
      const keys = Object.keys(MESSAGES.candleFixChecks[issue]);
      expect(checklistFor(issue).map((i) => i.id)).toEqual(keys.map((k) => `${issue}.${k}`));
    }
  });

  it("has plain, short, neutral text: no verdict words, no emoji", () => {
    for (const issue of FIX_ISSUES) {
      for (const item of checklistFor(issue)) {
        expect(item.text.length, item.id).toBeGreaterThan(0);
        expect(item.text.length, item.id).toBeLessThanOrEqual(120);
        expect(item.text, item.id).not.toMatch(FORBIDDEN);
        expect(item.text, item.id).not.toMatch(EMOJI);
        expect(item.text, item.id).toBe(item.text.trim());
        expect(item.text[0], item.id).toBe(item.text[0]!.toUpperCase());
      }
    }
  });

  it("the scan itself catches a verdict word", () => {
    expect(FORBIDDEN.test("This is the root cause")).toBe(true);
    expect(FORBIDDEN.test("Pour temperature as recorded on the batch")).toBe(false);
  });

  it("returns copies, so a caller cannot change the lists", () => {
    const first = checklistFor("frosting");
    first[0]!.text = "changed";
    first.pop();
    expect(checklistFor("frosting")[0]!.text).not.toBe("changed");
    expect(checklistFor("frosting").length).toBe(first.length + 1);
  });
});

describe("checklistItemById", () => {
  it("finds every item of every issue", () => {
    for (const issue of FIX_ISSUES) {
      for (const item of checklistFor(issue)) {
        expect(checklistItemById(item.id)).toEqual(item);
      }
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(checklistItemById("frosting.no-such-item")).toBeUndefined();
    expect(checklistItemById("")).toBeUndefined();
  });
});

describe("checklistView", () => {
  it("groups the chosen issues in FIX_ISSUES order, ignoring duplicates", () => {
    const view = checklistView(["soot", "frosting", "soot", "frosting"], []);
    expect(view.groups.map((g) => g.issue)).toEqual(["frosting", "soot"]);
    expect(view.groups[0]!.rows.map((r) => r.item.id)).toEqual(
      checklistFor("frosting").map((i) => i.id),
    );
    expect(view.noLongerListed).toEqual([]);
  });

  it("shows no groups when no issue is chosen, and keeps every tick", () => {
    const t = tick("frosting.pour-temperature", "frosting");
    const view = checklistView([], [t]);
    expect(view.groups).toEqual([]);
    expect(view.noLongerListed).toEqual([t]);
  });

  it("rows without a tick show the current text and a null tick", () => {
    const view = checklistView(["cracking"], []);
    for (const row of view.groups[0]!.rows) {
      expect(row.tick).toBeNull();
      expect(row.label).toBe(row.item.text);
    }
  });

  it("uses the tick's label snapshot when the text was reworded since", () => {
    const id = checklistFor("tunneling")[0]!.id;
    const t = tick(id, "tunneling", { label: "An older wording of this item", note: "Seen twice" });
    const view = checklistView(["tunneling"], [t]);
    const row = view.groups[0]!.rows[0]!;
    expect(row.tick).toEqual(t);
    expect(row.label).toBe("An older wording of this item");
    expect(row.item.text).not.toBe(row.label);
    expect(view.groups[0]!.rows.slice(1).every((r) => r.tick === null)).toBe(true);
  });

  it("moves ticks of an issue that is no longer chosen to noLongerListed, in stored order", () => {
    const a = tick(checklistFor("soot")[1]!.id, "soot");
    const b = tick(checklistFor("frosting")[0]!.id, "frosting");
    const c = tick(checklistFor("soot")[0]!.id, "soot");
    const view = checklistView(["frosting"], [a, b, c]);
    expect(view.groups[0]!.rows[0]!.tick).toEqual(b);
    expect(view.noLongerListed).toEqual([a, c]);
  });

  it("keeps a tick whose id is unknown", () => {
    const unknown = tick("frosting.written-by-a-newer-app", "frosting");
    const view = checklistView(["frosting"], [unknown]);
    expect(view.noLongerListed).toEqual([unknown]);
    expect(view.groups[0]!.rows.every((r) => r.tick === null)).toBe(true);
  });

  it("matches by item id inside the group, whatever the stored issue says", () => {
    const id = checklistFor("frosting")[0]!.id;
    const t = tick(id, "other");
    const view = checklistView(["frosting"], [t]);
    expect(view.groups[0]!.rows[0]!.tick).toEqual(t);
    expect(view.noLongerListed).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const issues: FixIssue[] = ["soot", "frosting"];
    const ticks = [tick("soot.wick-size", "soot")];
    const issuesCopy = structuredClone(issues);
    const ticksCopy = structuredClone(ticks);
    checklistView(issues, ticks);
    expect(issues).toEqual(issuesCopy);
    expect(ticks).toEqual(ticksCopy);
  });
});
