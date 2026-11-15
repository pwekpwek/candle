import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { evaluateFormula } from "@/lib/gramguard";
import type { Issue, Plan, PlanInput } from "@/lib/gramguard";
import { PlanSummaryLine, ResultsPanel } from "@/components/results";
import {
  WE_1,
  WE_2,
  WE_5,
  WE_6,
  WE_7_0_01G,
  WE_7_0_1G,
  WE_7_1G,
  WE_9A,
  WE_10,
  WE_11,
} from "../../fixtures/worked-examples";
import { fieldsForInput, lookup, okPlan } from "../gramguard/helpers";

const NAMES: Record<string, string> = {
  "wax-a": "Soy 464",
  "wax-soy": "Soy",
  "wax-coconut": "Coconut",
  "oil-1": "Lavender",
  "oil-a": "Lavender",
  "oil-b": "Vanilla",
  "oil-c": "Cedar",
};

/** Visible text of a table row: its non-empty cells joined by one space. */
function rowText(name: string | RegExp): string {
  const row = screen.getByRole("row", { name });
  return Array.from((row as HTMLTableRowElement).cells)
    .map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

function renderInput(input: PlanInput, extra: { warnings?: Issue[] } = {}) {
  const plan = okPlan(input);
  render(<ResultsPanel plan={plan} names={NAMES} {...extra} />);
  return plan;
}

function evaluated(input: PlanInput) {
  const ev = evaluateFormula(fieldsForInput(input), lookup);
  expect(ev.plan).not.toBeNull();
  return ev;
}

describe("ResultsPanel: WE-5 (vessels, three oils)", () => {
  it("renders every figure as the spec prints it", () => {
    renderInput(WE_5.input);
    expect(rowText(/^Soy 464/)).toBe("Soy 464 1000.0 g");
    expect(rowText(/^Fragrance/)).toBe("Fragrance 80.0 g");
    expect(rowText(/^Lavender/)).toBe("Lavender 50.00% 40.0 g");
    expect(rowText(/^Vanilla/)).toBe("Vanilla 33.33% 26.7 g");
    expect(rowText(/^Cedar/)).toBe("Cedar 16.67% 13.3 g");
    expect(rowText(/^Total mixture/)).toBe("Total mixture 1080.0 g");
    expect(screen.getByText("8% of wax weight")).toBeInTheDocument();
    expect(screen.getByText("= 7.41% of total mixture")).toBeInTheDocument();
  });

  it("has no effective line and no notices", () => {
    renderInput(WE_5.input);
    expect(screen.queryByText(/Planned weights give/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("orders rows wax, fragrance, oils, total", () => {
    renderInput(WE_5.input);
    const names = screen
      .getAllByRole("row")
      .map((r) => (r as HTMLTableRowElement).cells[0].textContent);
    expect(names.slice(1)).toEqual([
      "Soy 464",
      "Fragrance",
      "Lavender",
      "Vanilla",
      "Cedar",
      "Total mixture",
    ]);
  });
});

describe("ResultsPanel: effective percentage", () => {
  it("WE-1 shows the effective line", () => {
    renderInput(WE_1.input);
    expect(screen.getByText("8% of wax weight")).toBeInTheDocument();
    expect(screen.getByText("= 7.41% of total mixture")).toBeInTheDocument();
    expect(
      screen.getByText("Planned weights give 7.99% of wax weight."),
    ).toBeInTheDocument();
    expect(rowText(/^Soy 464/)).toBe("Soy 464 463.0 g");
    expect(rowText(/^Fragrance/)).toBe("Fragrance 37.0 g");
  });

  it("WE-2 (total basis) names the equivalent on wax weight", () => {
    renderInput(WE_2.input);
    expect(screen.getByText("8% of total mixture")).toBeInTheDocument();
    expect(screen.getByText("= 8.70% of wax weight")).toBeInTheDocument();
    expect(screen.queryByText(/Planned weights give/)).toBeNull();
  });

  it("WE-6 (total basis) names the equivalent on wax weight", () => {
    renderInput(WE_6.input);
    expect(screen.getByText("9% of total mixture")).toBeInTheDocument();
    expect(screen.getByText("= 9.89% of wax weight")).toBeInTheDocument();
  });
});

describe("ResultsPanel: WE-7 rounding", () => {
  it("at 1 g shows whole grams and the CALC-13 warning", () => {
    const ev = evaluated(WE_7_1G.input);
    render(
      <ResultsPanel plan={ev.plan} names={NAMES} warnings={ev.warnings} />,
    );
    expect(rowText(/^Soy 464/)).toBe("Soy 464 47 g");
    expect(rowText(/^Fragrance/)).toBe("Fragrance 3 g");
    expect(rowText(/^Lavender/)).toBe("Lavender 66.67% 2 g");
    expect(rowText(/^Vanilla/)).toBe("Vanilla 33.33% 1 g");
    expect(rowText(/^Total mixture/)).toBe("Total mixture 50 g");
    expect(
      screen.getByText(
        "At 1 g precision this small batch can't hit 6%. Planned weights give 6.38% of wax weight. Use 0.1 g or 0.01 g precision, or a larger batch.",
      ),
    ).toBeInTheDocument();
    // The effective line under the figures says the same thing.
    expect(
      screen.getByText("Planned weights give 6.38% of wax weight."),
    ).toBeInTheDocument();
  });

  it("at 0.1 g shows tenths, 5.93% effective, no warning", () => {
    const ev = evaluated(WE_7_0_1G.input);
    render(
      <ResultsPanel plan={ev.plan} names={NAMES} warnings={ev.warnings} />,
    );
    expect(rowText(/^Fragrance/)).toBe("Fragrance 2.8 g");
    expect(rowText(/^Lavender/)).toBe("Lavender 66.67% 1.9 g");
    expect(rowText(/^Vanilla/)).toBe("Vanilla 33.33% 0.9 g");
    expect(screen.getByText(/^47\.2 g$/)).toBeInTheDocument();
    expect(
      screen.getByText("Planned weights give 5.93% of wax weight."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/can't hit/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("at 0.01 g shows hundredths, no warning", () => {
    const ev = evaluated(WE_7_0_01G.input);
    render(
      <ResultsPanel plan={ev.plan} names={NAMES} warnings={ev.warnings} />,
    );
    expect(rowText(/^Fragrance/)).toBe("Fragrance 2.83 g");
    expect(rowText(/^Lavender/)).toBe("Lavender 66.67% 1.89 g");
    expect(rowText(/^Vanilla/)).toBe("Vanilla 33.33% 0.94 g");
    expect(screen.getByText(/^47\.17 g$/)).toBeInTheDocument();
    expect(screen.queryByText(/can't hit/)).toBeNull();
  });
});

describe("ResultsPanel: wax blend and unscented", () => {
  it("WE-10 shows shares and the wax total", () => {
    renderInput(WE_10.input);
    expect(rowText(/^Soy/)).toBe("Soy 70.00% 509.1 g");
    expect(rowText(/^Coconut/)).toBe("Coconut 30.00% 218.2 g");
    expect(rowText(/^Wax total/)).toBe("Wax total 727.3 g");
    expect(rowText(/^Fragrance/)).toBe("Fragrance 72.7 g");
    // A single oil shows no share.
    expect(rowText(/^Lavender/)).toBe("Lavender 72.7 g");
    expect(rowText(/^Total mixture/)).toBe("Total mixture 800.0 g");
  });

  it("WE-11 shows 0.0 g fragrance, no oil rows, and the CALC-17 note", () => {
    const plan = okPlan(WE_11.input);
    const note: Issue = { rule: "CALC-17", field: "oils", severity: "note" };
    render(<ResultsPanel plan={plan} names={NAMES} warnings={[note]} />);
    expect(rowText(/^Fragrance/)).toBe("Fragrance 0.0 g");
    expect(rowText(/^Soy 464/)).toBe("Soy 464 300.0 g");
    expect(screen.getAllByRole("row")).toHaveLength(1 + 3);
    expect(
      screen.getByText(
        "This formula is unscented (0% fragrance), so the oils listed are ignored.",
      ),
    ).toBeInTheDocument();
    // Informational, not a warning treatment.
    expect(
      screen
        .getByText(/This formula is unscented/)
        .closest("[data-variant]"),
    ).toHaveAttribute("data-variant", "info");
  });
});

describe("ResultsPanel: no figures", () => {
  it("plan null shows only the incomplete line", () => {
    const { container } = render(<ResultsPanel plan={null} names={NAMES} />);
    expect(
      screen.getByText(
        "Results appear when the batch size, fragrance percentage and wax are filled in.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("V-14 and V-15 errors replace the figures", () => {
    const errors: Issue[] = [
      { rule: "V-14", field: "result", severity: "error" },
      {
        rule: "V-15",
        field: "result",
        severity: "error",
        materialName: "Lavender",
      },
    ];
    render(<ResultsPanel plan={null} names={NAMES} errors={errors} />);
    expect(
      screen.getByText(
        "This leaves no wax. Lower the fragrance percentage or raise the batch size.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.queryByRole("table")).toBeNull();
    expect(
      screen.getByText(
        "Lavender rounds to 0 g at this precision. Use a finer precision or a larger batch.",
      ),
    ).toBeInTheDocument();
  });

  it("errors win even if a stale plan is passed", () => {
    const plan = okPlan(WE_5.input);
    render(
      <ResultsPanel
        plan={plan}
        names={NAMES}
        errors={[{ rule: "V-14", field: "result", severity: "error" }]}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("ResultsPanel: warnings", () => {
  it("renders V-08 and V-09 texts as warning notices above the figures", () => {
    const warnings: Issue[] = [
      { rule: "V-08", field: "fragrancePct", severity: "warning" },
      {
        rule: "V-09",
        field: "waxes",
        severity: "warning",
        maxBp: 600,
        waxName: "Soy 464",
      },
    ];
    renderInput(WE_5.input, { warnings });
    const v08 = screen.getByText(
      "This is above common usage levels. Check your wax supplier's maximum fragrance load.",
    );
    expect(v08.closest("[data-variant]")).toHaveAttribute(
      "data-variant",
      "warning",
    );
    expect(
      document.querySelectorAll('[data-variant="warning"]'),
    ).toHaveLength(2);
    const table = screen.getByRole("table");
    expect(
      v08.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("ResultsPanel: compareTo (scale preview)", () => {
  it("shows before and after for WE-5 to WE-9a", () => {
    const before = okPlan(WE_5.input);
    const after = okPlan(WE_9A.input);
    render(
      <ResultsPanel plan={after} compareTo={before} names={NAMES} />,
    );
    const pair = (a: string, b: string) =>
      new RegExp(`${a.replace(".", "\\.")} g\\s*→\\s*to\\s*${b.replace(".", "\\.")} g`);
    expect(rowText(/^Soy 464/)).toMatch(pair("1000.0", "1666.7"));
    expect(rowText(/^Fragrance/)).toMatch(pair("80.0", "133.3"));
    expect(rowText(/^Lavender/)).toMatch(pair("40.0", "66.7"));
    expect(rowText(/^Vanilla/)).toMatch(pair("26.7", "44.4"));
    expect(rowText(/^Cedar/)).toMatch(pair("13.3", "22.2"));
    expect(rowText(/^Total mixture/)).toMatch(pair("1080.0", "1800.0"));
  });

  it("falls back to new figures only when the plans do not line up", () => {
    const before = okPlan(WE_1.input);
    const after = okPlan(WE_5.input);
    render(<ResultsPanel plan={after} compareTo={before} names={NAMES} />);
    expect(rowText(/^Total mixture/)).toBe("Total mixture 1080.0 g");
    expect(screen.queryByText("to")).toBeNull();
  });
});

describe("ResultsPanel: structure", () => {
  it("has a heading, a captioned table and units on every weight", () => {
    const plan = okPlan(WE_5.input);
    render(<ResultsPanel plan={plan} names={NAMES} />);
    expect(
      screen.getByRole("heading", { name: "Planned weights" }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", {
      name: "Planned weights by component",
    });
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(
      within(table).getByRole("rowheader", { name: "Cedar" }),
    ).toBeInTheDocument();
    const weights = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => (r as HTMLTableRowElement).cells[2].textContent);
    for (const w of weights) expect(w).toMatch(/^\d+\.\d g$/);
    expect(table.textContent).not.toMatch(/,/);
  });

  it("accepts a name function and a custom heading, and keeps full names in a title", () => {
    const plan = okPlan(WE_5.input);
    render(
      <ResultsPanel
        plan={plan}
        names={(id) => `Long material name for ${id}`}
        heading="Scaled weights"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Scaled weights" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle("Long material name for oil-a"),
    ).toBeInTheDocument();
  });
});

describe("PlanSummaryLine", () => {
  it("renders the phone summary for WE-5", () => {
    const plan: Plan = okPlan(WE_5.input);
    const { container } = render(<PlanSummaryLine plan={plan} />);
    expect(container.textContent).toBe("Wax 1000.0 g · Fragrance 80.0 g");
  });

  it("renders nothing, or the placeholder, without a plan", () => {
    const { container, rerender } = render(<PlanSummaryLine plan={null} />);
    expect(container.textContent).toBe("");
    rerender(<PlanSummaryLine plan={null} placeholder="Fill in the batch" />);
    expect(container.textContent).toBe("Fill in the batch");
  });
});
