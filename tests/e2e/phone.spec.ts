import { test, expect, type Page } from "@playwright/test";
import {
  SLOW,
  WE5,
  enterWE8,
  expectClearOfFixedBars,
  expectInputsAtLeast16,
  expectNoSideScroll,
  expectPlanned,
  expectTapHeight,
  expectWE5Panel,
  expectWE8Figures,
  fillWE5,
  measuredInput,
  waitForHeading,
} from "./helpers-flow";

test.use({
  viewport: { width: 375, height: 812 },
  hasTouch: true,
  isMobile: true,
});

/** Layout checks that apply to every screen. */
async function checkScreen(page: Page, where: string) {
  await expectNoSideScroll(page, where);
  await expectClearOfFixedBars(page, where);
  await expectInputsAtLeast16(page, where);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function checkNavTargets(page: Page, where: string) {
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Formulas", "Materials", "Backup and restore"]) {
    await expectTapHeight(nav.getByRole("link", { name }), `${where}: nav ${name}`);
  }
}

// TEST-28: create, measure, reload and reopen at 375px.
test("phone: create, measure, reload and reopen at 375px", async ({ page }) => {
  test.setTimeout(240_000);

  // List (first run).
  await page.goto("/");
  await waitForHeading(page, "Saved formulas");
  await expect(page.getByText("Your formulas will live here.")).toBeVisible({
    timeout: SLOW,
  });
  await checkScreen(page, "list (empty)");
  await checkNavTargets(page, "list");
  await page.getByRole("link", { name: "New formula" }).first().tap();
  await expect(page).toHaveURL(/\/formulas\/new$/, { timeout: SLOW });
  await waitForHeading(page, "New formula");

  // Editor: fill WE-5, with the fixed Save bar over the page.
  await fillWE5(page);
  await expectWE5Panel(page);
  await expectInputsAtLeast16(page, "editor (filled)");
  const saveBar = page.getByRole("button", { name: "Save formula" });
  await expect(saveBar).toBeVisible();
  await expectTapHeight(saveBar, "editor: Save formula");
  const bar = await saveBar.boundingBox();
  expect(bar!.y + bar!.height, "Save sits above the phone nav").toBeLessThanOrEqual(
    (await page.getByRole("navigation", { name: "Main" }).boundingBox())!.y + 0.5,
  );
  await checkScreen(page, "editor");
  await page.getByLabel("Notes", { exact: true }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const notes = (await page.getByLabel("Notes", { exact: true }).boundingBox())!;
  const barTop = (await saveBar.boundingBox())!.y;
  expect(notes.y + notes.height, "Notes field is above the Save bar").toBeLessThanOrEqual(
    barTop + 0.5,
  );

  // Save by tapping the Save button in the fixed bar.
  await saveBar.tap();
  await expect(page).toHaveURL(/\/formulas\/[^/?]+(\?saved=1)?$/, { timeout: SLOW });
  await expect(page.getByText("Saved as version 1")).toBeVisible({ timeout: SLOW });
  await waitForHeading(page, WE5.name);

  // Formula page: tap targets, then measure.
  await expectTapHeight(
    page.getByRole("button", { name: "Revise", exact: true }).or(
      page.getByRole("link", { name: "Revise", exact: true }),
    ),
    "formula: Revise",
  );
  await expectTapHeight(
    page.getByRole("button", { name: "Scale", exact: true }),
    "formula: Scale",
  );
  await expectTapHeight(measuredInput(page, WE5.wax), "formula: measured input");
  await checkNavTargets(page, "formula");
  await enterWE8(page);
  await expectWE8Figures(page);
  await checkScreen(page, "formula page (measured)");

  // Scale dialog: open it, check it, close it.
  await page.getByRole("button", { name: "Scale", exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: "Scale version 1" });
  await expect(dialog).toBeVisible({ timeout: SLOW });
  await expectNoSideScroll(page, "scale dialog");
  await expectInputsAtLeast16(page, "scale dialog");
  await dialog.getByRole("button", { name: "Cancel" }).tap();
  await expect(dialog).toBeHidden();

  // Reload and reopen from the list.
  await page.reload();
  await waitForHeading(page, WE5.name);
  await expectWE8Figures(page);
  await checkScreen(page, "formula page (reloaded)");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Formulas" })
    .tap();
  await waitForHeading(page, "Saved formulas");
  const row = page.getByTestId("formula-row");
  await expect(row).toHaveCount(1, { timeout: SLOW });
  await expectTapHeight(row.getByRole("link", { name: WE5.name }), "list: formula link");
  await checkScreen(page, "list (one formula)");
  await row.getByRole("link", { name: WE5.name }).tap();
  await waitForHeading(page, WE5.name);
  await expectPlanned(page, { "Soy 464": "1000.0 g", "Total mixture": "1080.0 g" });
  await expectWE8Figures(page);
  await checkScreen(page, "formula page (reopened)");

  // Backup page.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Backup and restore" })
    .tap();
  await waitForHeading(page, "Backup and restore");
  await expectTapHeight(
    page.getByRole("button", { name: "Export backup" }),
    "backup: Export backup",
  );
  await expectTapHeight(
    page.getByRole("button", { name: "Choose backup file" }),
    "backup: Choose backup file",
  );
  await checkScreen(page, "backup page");
});
