import { expect, type Locator, type Page } from "@playwright/test";

export const INCOMPLETE =
  "Results appear when the batch size, fragrance percentage and wax are filled in.";

/** One material picker (select plus quick-add), found by its visible label. */
export function picker(page: Page, label: string): Locator {
  return page
    .getByTestId("material-picker")
    .filter({ visible: true })
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
}

/** Creates a material through the picker's quick-add and checks it got selected. */
export async function quickAdd(
  page: Page,
  label: "Wax" | "Oil" | "Oil 1",
  type: "wax" | "oil",
  name: string,
) {
  const holder = picker(page, label);
  // The select is disabled while the library loads; the quick-add opens by itself only after that.
  await expect(holder.getByRole("combobox")).toBeEnabled({ timeout: 30_000 });
  const group = holder.getByRole("group", {
    name: type === "wax" ? "Add a wax" : "Add an oil",
  });
  if (!(await group.isVisible())) {
    await holder
      .getByRole("button", { name: type === "wax" ? "Add a wax" : "Add an oil" })
      .click();
  }
  await group.getByRole("textbox").fill(name);
  await group.getByRole("button", { name: "Add and select" }).click();
  await expect(holder.getByRole("combobox")).toContainText(name, { timeout: 15_000 });
}

export function nameField(page: Page) {
  return page.getByLabel("Name", { exact: true }).filter({ visible: true });
}
export function amountField(page: Page) {
  return page.getByLabel("Total mixture weight (g)").filter({ visible: true });
}
export function fragranceField(page: Page) {
  return page.getByLabel("Fragrance percentage (%)").filter({ visible: true });
}
export function saveButton(page: Page) {
  return page.getByRole("button", { name: "Save formula" }).filter({ visible: true });
}

export async function openNewEditor(page: Page) {
  await page.goto("/formulas/new");
  await expect(page.getByRole("heading", { level: 1, name: "New formula" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(nameField(page)).toBeFocused({ timeout: 15_000 });
}

/** Fills a complete, valid new formula (1000 g total, 8%, one wax, one oil) with new materials. */
export async function fillValidFormula(page: Page, name = "Test formula") {
  await openNewEditor(page);
  await nameField(page).fill(name);
  await amountField(page).fill("1000");
  await fragranceField(page).fill("8");
  await quickAdd(page, "Wax", "wax", "Soy 464");
  await quickAdd(page, "Oil 1", "oil", "Lavender");
}

/** Waits until the saved formula page shows "Saved as version N". */
export async function expectSavedAs(page: Page, n: number) {
  await expect(page.getByText(`Saved as version ${n}`)).toBeVisible({ timeout: 30_000 });
}

/** Names of the rows on the saved formulas list, in screen order. */
export async function listedNames(page: Page): Promise<string[]> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Saved formulas" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Loading your formulas…")).toHaveCount(0, { timeout: 15_000 });
  const rows = page.getByTestId("formula-row").filter({ visible: true });
  const count = await rows.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push((await rows.nth(i).getByRole("link").first().innerText()).trim());
  }
  return names;
}
