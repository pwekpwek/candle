import { test, expect, type Page } from "@playwright/test";
import {
  amountField,
  expectSavedAs,
  fillValidFormula,
  fragranceField,
  listedNames,
  saveButton,
} from "./helpers-checks";

// TEST-30: double-tapping Save creates one version (PRD-19).
test.setTimeout(120_000);

const versionRows = (page: Page) =>
  page.getByRole("heading", { level: 2, name: "Versions" }).locator("xpath=..").getByRole("listitem").filter({ visible: true });

async function expectOneVersion(page: Page, n: number) {
  await expect(page).toHaveURL(/\/formulas\/[^/?]+(\?.*)?$/, { timeout: 30_000 });
  await expectSavedAs(page, n);
  await expect(versionRows(page)).toHaveCount(n);
  await expect(versionRows(page).first()).toContainText(`v${n}`);
}

test("two fast clicks on Save create one formula with version 1", async ({ page }) => {
  await fillValidFormula(page, "Double click");
  const save = saveButton(page);
  const first = save.click({ noWaitAfter: true });
  const second = save.click({ noWaitAfter: true, timeout: 2000 }).catch(() => undefined);
  await Promise.all([first, second]);
  await expectOneVersion(page, 1);
  expect(await listedNames(page)).toEqual(["Double click"]);
  await expect(page.getByTestId("formula-row").filter({ visible: true }).first()).toContainText("v1");
});

test("dblclick on Save creates one version", async ({ page }) => {
  await fillValidFormula(page, "Dbl");
  await saveButton(page).dblclick({ noWaitAfter: true });
  await expectOneVersion(page, 1);
  expect(await listedNames(page)).toEqual(["Dbl"]);
});

test("Enter in a field plus a click creates one version", async ({ page }) => {
  await fillValidFormula(page, "Enter plus click");
  await fragranceField(page).focus();
  await page.keyboard.press("Enter");
  await saveButton(page).click({ noWaitAfter: true, timeout: 2000 }).catch(() => undefined);
  await expectOneVersion(page, 1);
  expect(await listedNames(page)).toEqual(["Enter plus click"]);
});

test("a double-tapped Save on a revision creates only version 2", async ({ page }) => {
  await fillValidFormula(page, "Revised once");
  await saveButton(page).click();
  await expectOneVersion(page, 1);

  await page.getByRole("link", { name: "Revise" }).click();
  await expect(page.getByText("Revising version 1. Saving creates version 2.")).toBeVisible({
    timeout: 30_000,
  });
  await amountField(page).fill("1200");
  const save = saveButton(page);
  await Promise.all([
    save.click({ noWaitAfter: true }),
    save.click({ noWaitAfter: true, timeout: 2000 }).catch(() => undefined),
  ]);
  await expectOneVersion(page, 2);
  const rows = page.getByTestId("formula-row").filter({ visible: true });
  expect(await listedNames(page)).toEqual(["Revised once"]);
  await expect(rows.first()).toContainText("v2");
});

test("a double-tapped Save as new version in the scale dialog adds one version", async ({
  page,
}) => {
  await fillValidFormula(page, "Scaled once");
  await saveButton(page).click();
  await expectOneVersion(page, 1);

  await page.getByRole("button", { name: "Scale", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Scale version 1" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Amount (g)").fill("2000");
  const save = dialog.getByRole("button", { name: "Save as new version" });
  await Promise.all([
    save.click({ noWaitAfter: true }),
    save.click({ noWaitAfter: true, timeout: 2000 }).catch(() => undefined),
  ]);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expectSavedAs(page, 2);
  await expect(versionRows(page)).toHaveCount(2);
  await expect(versionRows(page).first()).toContainText("v2");
  expect(await listedNames(page)).toEqual(["Scaled once"]);
});
