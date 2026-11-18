import { expect, type Locator, type Page } from "@playwright/test";

/** Figures of the worked examples, typed from docs/specs/2 Calculation Rules.md. */
export const WE5 = {
  name: "Lavender Vanilla Cedar",
  wax: "Soy 464",
  oils: [
    { name: "Lavender", parts: "3" },
    { name: "Vanilla", parts: "2" },
    { name: "Cedar", parts: "1" },
  ],
  // WE-5 planned weights.
  planned: {
    "Soy 464": "1000.0 g",
    Lavender: "40.0 g",
    Vanilla: "26.7 g",
    Cedar: "13.3 g",
    Fragrance: "80.0 g",
    "Total mixture": "1080.0 g",
  },
} as const;

/** WE-8 measured weights. */
export const WE8 = {
  "Soy 464": "1003.2",
  Lavender: "40.4",
  Vanilla: "26.1",
  Cedar: "13.9",
} as const;

/** Slow first compile of a route in dev mode. */
export const SLOW = 30_000;

export async function waitForHeading(page: Page, name: string | RegExp) {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({
    timeout: SLOW,
  });
}

/** The picker block that carries this label ("Wax", "Oil 1"). */
function picker(page: Page, label: string): Locator {
  return page.getByTestId("material-picker").filter({
    has: page.getByRole("combobox", { name: label, exact: true }),
  });
}

/** Creates a material with the picker's quick-add and checks it is selected. */
async function quickAdd(
  page: Page,
  label: string,
  kind: "wax" | "oil",
  name: string,
) {
  const box = picker(page, label);
  const group = `Add ${kind === "wax" ? "a wax" : "an oil"}`;
  const open = box.getByRole("button", { name: group });
  // Empty library: the form is already open. Otherwise open it behind its button.
  const nameField = box.getByLabel(`${group}: name`);
  await expect(open.or(nameField)).toBeVisible({ timeout: SLOW });
  if (await open.isVisible()) await open.click();
  await nameField.fill(name);
  await box.getByRole("button", { name: "Add and select" }).click();
  await expect(box.getByRole("combobox", { name: label, exact: true })).toHaveValue(
    /.+/,
    { timeout: SLOW },
  );
  await expect(
    box.getByRole("combobox", { name: label, exact: true }).locator("option:checked"),
  ).toHaveText(name);
}

/** Opens the editor from the list ("New formula") and waits for it. */
export async function openNewFormula(page: Page) {
  await page.goto("/");
  await waitForHeading(page, "Saved formulas");
  await page.getByRole("link", { name: "New formula" }).first().click();
  await expect(page).toHaveURL(/\/formulas\/new$/, { timeout: SLOW });
  await waitForHeading(page, "New formula");
}

/**
 * Fills the editor with WE-5 through the controls: Vessels mode, 6 x 180 g,
 * 8% of wax weight, 0.1 g, Soy 464 and Lavender 3 / Vanilla 2 / Cedar 1.
 * The material library must be empty, so every material is quick-added.
 */
export async function fillWE5(page: Page) {
  await page.getByLabel("Name", { exact: true }).fill(WE5.name);
  await page.getByRole("radio", { name: "Vessels", exact: true }).check();
  await page.getByLabel("Number of vessels").fill("6");
  await page.getByLabel("Fill weight per vessel (g)").fill("180");
  await page.getByLabel("Fragrance percentage (%)").fill("8");
  await page.getByRole("radio", { name: "of wax weight" }).check();
  await page.getByRole("radio", { name: "0.1 g" }).check();

  await quickAdd(page, "Wax", "wax", WE5.wax);

  await quickAdd(page, "Oil 1", "oil", WE5.oils[0].name);
  await page.getByRole("button", { name: "+ Add oil" }).click();
  await quickAdd(page, "Oil 2", "oil", WE5.oils[1].name);
  await page.getByRole("button", { name: "+ Add oil" }).click();
  await quickAdd(page, "Oil 3", "oil", WE5.oils[2].name);

  for (const [i, oil] of WE5.oils.entries()) {
    await page.getByLabel(`Parts (Oil ${i + 1})`).fill(oil.parts);
  }
}

/** A row of a table by the name in its first cell. */
export function rowOf(scope: Locator, name: string): Locator {
  return scope.getByRole("row").filter({
    has: scope.page().getByRole("rowheader", { name, exact: true }),
  });
}

/** The editor's results panel shows the WE-5 figures. */
export async function expectWE5Panel(page: Page) {
  const panel = page.getByRole("region", { name: "Planned weights" }).locator("visible=true");
  for (const [name, grams] of Object.entries(WE5.planned)) {
    await expect(rowOf(panel, name)).toContainText(grams, { timeout: SLOW });
  }
}

/** Saves a version from the editor and waits for the confirmation on the formula page. */
export async function saveFromEditor(page: Page, saveButton?: () => Promise<void>) {
  if (saveButton) await saveButton();
  else await page.getByRole("button", { name: "Save formula" }).click();
  await expect(page).toHaveURL(/\/formulas\/[^/?]+(\?saved=1)?$/, { timeout: SLOW });
  await expect(page.getByText("Saved as version 1")).toBeVisible({ timeout: SLOW });
}

export function measuredInput(page: Page, name: string): Locator {
  // Next keeps hidden routes mounted: only look at the visible one.
  return page.getByLabel(`Measured weight for ${name}`).locator("visible=true");
}

/** Types the WE-8 weights and waits for the autosave pill to say Saved. */
export async function enterWE8(page: Page) {
  for (const [name, grams] of Object.entries(WE8)) {
    await measuredInput(page, name).fill(grams);
  }
  // Leaving the last field saves at once; an earlier field's blur has already
  // shown "Saved", so wait for this one to settle.
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-state="saved"]')).toHaveText("Saved", {
    timeout: SLOW,
  });
}

/** Planned and measured figures that WE-8 expects (docs/specs/2 Calculation Rules.md, WE-8). */
export async function expectWE8Figures(page: Page) {
  for (const [name, grams] of Object.entries(WE8)) {
    await expect(measuredInput(page, name)).toHaveValue(grams, { timeout: SLOW });
  }
  const table = page.getByRole("table", { name: "Measured weights" }).locator("visible=true");
  await expect(rowOf(table, "Soy 464")).toContainText("+3.2 g +0.32%");
  await expect(rowOf(table, "Lavender")).toContainText("+0.4 g +1.00%");
  await expect(rowOf(table, "Vanilla")).toContainText("0.6 g under plan");
  await expect(rowOf(table, "Cedar")).toContainText("0.6 g over plan");
  await expect(rowOf(table, "Fragrance")).toContainText("80.4 g");
  await expect(rowOf(table, "Total mixture")).toContainText("1083.6 g");
  await expectWE8ActualBlend(page);
}

export async function expectWE8ActualBlend(page: Page) {
  const actual = page.getByRole("region", { name: "Actual blend" }).locator("visible=true");
  await expect(actual).toContainText("8.01% of wax weight");
  await expect(actual).toContainText("7.42% of total mixture");
}

/** The planned column of the measured-weights table (stored targets only). */
export async function expectPlanned(
  page: Page,
  planned: Record<string, string>,
) {
  const table = page.getByRole("table", { name: "Measured weights" }).locator("visible=true");
  for (const [name, grams] of Object.entries(planned)) {
    await expect(rowOf(table, name)).toContainText(grams, { timeout: SLOW });
  }
}

/** WE-9a: scaling to 10 vessels (docs/specs/2 Calculation Rules.md). */
export const WE9A = {
  "Soy 464": "1666.7 g",
  Lavender: "66.7 g",
  Vanilla: "44.4 g",
  Cedar: "22.2 g",
  "Total mixture": "1800.0 g",
} as const;

/** Opens the Scale dialog, scales to 10 vessels, checks the preview, saves. */
export async function scaleToTen(page: Page) {
  await page.getByRole("button", { name: "Scale", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Scale version 1" });
  await expect(dialog).toBeVisible({ timeout: SLOW });
  await dialog.getByLabel("Vessels", { exact: true }).fill("10");
  for (const grams of Object.values(WE9A)) {
    await expect(dialog).toContainText(grams);
  }
  await dialog.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.getByText("Saved as version 2")).toBeVisible({ timeout: SLOW });
}

export async function expectEmptyMeasured(page: Page) {
  for (const name of Object.keys(WE8)) {
    await expect(measuredInput(page, name)).toHaveValue("");
  }
}

/** Phone layout checks (TEST-28). */
export async function expectNoSideScroll(page: Page, where: string) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
  }));
  expect(m.innerWidth, `${where}: innerWidth`).toBe(375);
  expect(m.clientWidth, `${where}: clientWidth`).toBe(375);
  expect(m.scrollWidth, `${where}: scrollWidth`).toBeLessThanOrEqual(m.innerWidth);
}

/**
 * Scrolls to the bottom and checks that the last interactive element in main
 * sits above every fixed bar at the bottom of the screen.
 */
export async function expectClearOfFixedBars(page: Page, where: string) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const r = await page.evaluate(() => {
    const visible = (el: Element) => {
      const b = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return b.width > 0 && b.height > 0 && s.visibility !== "hidden";
    };
    const fixed = [...document.querySelectorAll("body *")].filter(
      (el) => getComputedStyle(el).position === "fixed" && visible(el),
    );
    const bars = fixed.filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight / 2,
    );
    const barTop = Math.min(
      window.innerHeight,
      ...bars.map((el) => el.getBoundingClientRect().top),
    );
    const main = document.querySelector("main");
    const items = [
      ...(main?.querySelectorAll("a, button, input, select, textarea") ?? []),
    ].filter(
      (el) =>
        visible(el) &&
        !fixed.some((f) => f.contains(el)) &&
        (el as HTMLInputElement).type !== "file" &&
        (el as HTMLInputElement).type !== "radio",
    );
    const lastBottom = Math.max(0, ...items.map((el) => el.getBoundingClientRect().bottom));
    return { barTop, lastBottom, bars: bars.length, items: items.length };
  });
  expect(r.bars, `${where}: a fixed bottom bar exists`).toBeGreaterThan(0);
  expect(r.items, `${where}: main has interactive elements`).toBeGreaterThan(0);
  expect(r.lastBottom, `${where}: last control above the fixed bars`).toBeLessThanOrEqual(
    r.barTop + 0.5,
  );
}

/** Every visible text input, textarea and select is at least 16px (FLOW-02). */
export async function expectInputsAtLeast16(page: Page, where: string) {
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")]
      .filter((el) => {
        const t = (el as HTMLInputElement).type;
        if (["radio", "checkbox", "file", "hidden"].includes(t)) return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      })
      .map((el) => ({
        id: el.id || el.getAttribute("aria-label") || el.tagName,
        px: parseFloat(getComputedStyle(el).fontSize),
      })),
  );
  for (const s of sizes) {
    expect(s.px, `${where}: font size of ${s.id}`).toBeGreaterThanOrEqual(16);
  }
  return sizes.length;
}

/** A tap target is at least 44px tall (FLOW-03). */
export async function expectTapHeight(target: Locator, what: string) {
  const box = await target.boundingBox();
  expect(box, `${what}: has a box`).not.toBeNull();
  expect(box!.height, `${what}: height`).toBeGreaterThanOrEqual(44);
}
