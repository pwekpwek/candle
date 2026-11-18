import { test, expect } from "@playwright/test";
import {
  INCOMPLETE,
  amountField,
  fragranceField,
  listedNames,
  nameField,
  openNewEditor,
  quickAdd,
  saveButton,
} from "./helpers-checks";

// TEST-29. Expected texts come from the Calculation Rules (V-01, V-04, V-07, incomplete input).
const V01 = "Use numbers only, with a period for decimals (for example 462.5). No commas.";
const V04 =
  "This formula rounds to 0.1 g. Enter 500.5 or 500.6, or switch precision to 0.01 g.";
const V07 = "Enter a fragrance percentage between 0 and 50.";

test.setTimeout(120_000);
test.use({ viewport: { width: 1280, height: 500 } });

async function expectPanelEmpty(page: import("@playwright/test").Page) {
  const panel = page.locator("[data-field=result]");
  await expect(panel).toContainText(INCOMPLETE);
  const text = (await panel.innerText()).replace(INCOMPLETE, "");
  expect(text).not.toMatch(/\d\s*g\b/);
}

test("1,000 shows V-01 after blur and is not read as a weight", async ({ page }) => {
  await openNewEditor(page);
  await quickAdd(page, "Wax", "wax", "Soy 464");
  await quickAdd(page, "Oil 1", "oil", "Lavender");
  await fragranceField(page).fill("8");
  await amountField(page).fill("1,000");
  // No message while typing, before the first blur (FLOW-06).
  await expect(amountField(page)).not.toHaveAttribute("aria-invalid", "true");
  await fragranceField(page).focus();
  await expect(amountField(page)).toHaveAccessibleDescription(V01);
  await expect(amountField(page)).toHaveAttribute("aria-invalid", "true");
  await expectPanelEmpty(page);

  // Fixing it brings the figures back: 1000 g total, 8% of wax weight = 74.1 g.
  await amountField(page).fill("1000");
  await expect(page.locator("[data-field=result]")).toContainText("1000.0 g", { timeout: 20_000 });
  await expect(page.locator("[data-field=result]")).toContainText("74.1 g", { timeout: 20_000 });
});

test("500.55 at 0.1 g shows V-04 and fragrance 80 shows V-07", async ({ page }) => {
  await openNewEditor(page);
  await amountField(page).fill("500.55");
  await fragranceField(page).fill("80");
  await nameField(page).focus();
  await expect(amountField(page)).toHaveAccessibleDescription(V04);
  await expect(fragranceField(page)).toHaveAccessibleDescription(V07);
  await expectPanelEmpty(page);
});

test("Save with problems focuses the first problem, scrolls to it, saves nothing, and typing clears it", async ({
  page,
}) => {
  await openNewEditor(page);
  await quickAdd(page, "Wax", "wax", "Soy 464");
  await quickAdd(page, "Oil 1", "oil", "Lavender");
  await nameField(page).fill("Never saved");
  await amountField(page).fill("1,000");
  await fragranceField(page).fill("80");

  // Work from the bottom of the page so the first problem is off screen.
  await saveButton(page).scrollIntoViewIfNeeded();
  await fragranceField(page).focus();
  await saveButton(page).scrollIntoViewIfNeeded();
  await saveButton(page).click();

  await expect(amountField(page)).toBeFocused();
  await expect(amountField(page)).toBeInViewport();
  await expect(amountField(page)).toHaveAccessibleDescription(V01);
  await expect(fragranceField(page)).toHaveAccessibleDescription(V07);
  await expectPanelEmpty(page);
  await expect(page).toHaveURL(/\/formulas\/new$/);

  // Typing a valid value clears that field's message on the next keystroke.
  await amountField(page).fill("");
  await amountField(page).pressSequentially("1");
  await expect(amountField(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(amountField(page)).not.toHaveAccessibleDescription(V01);
  // The other problem is still shown.
  await expect(fragranceField(page)).toHaveAccessibleDescription(V07);

  // Nothing was saved.
  expect(await listedNames(page)).toEqual([]);
  await expect(page.getByText("Your formulas will live here.")).toBeVisible();
});

test("an empty name is the first problem in screen order", async ({ page }) => {
  await openNewEditor(page);
  await amountField(page).fill("1,000");
  await amountField(page).focus();
  await saveButton(page).click();
  await expect(nameField(page)).toBeFocused();
  await expect(nameField(page)).toHaveAccessibleDescription("Give this formula a name.");
});
