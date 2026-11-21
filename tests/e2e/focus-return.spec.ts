import { test, expect } from "@playwright/test";
import { SLOW, addPhotos, createSession, seedBatch, waitForHeading } from "./helpers-burn";
import { cureRows, fillCureForm } from "./helpers-schedule";

test.use({ viewport: { width: 1280, height: 800 } });

const activeIsBody = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.activeElement === document.body);

test("dialogs give focus back to what opened them; removing a row keeps focus on the page", async ({ page }) => {
  test.setTimeout(300_000);
  const batch = await seedBatch(page, { daysAgo: 4, label: "FR-01" });
  await createSession(page, batch.id, {
    label: "Focus burn",
    candles: [{ label: "F1", wickText: "Cotton 8", burns: [{ minutes: "60" }] }],
  });
  await waitForHeading(page, "Focus burn");
  await expect(page.getByText("0 of 12")).toBeVisible({ timeout: SLOW });

  // Burn test delete dialog: Enter opens, Escape returns to the Delete button.
  const del = page.getByRole("button", { name: "Delete", exact: true });
  await del.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep burn test" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(del).toBeFocused();

  // Photo viewer: Escape returns to the thumbnail.
  await addPhotos(page, 1);
  const thumb = page.getByRole("button", { name: /^Open photo 1 of 1$/ });
  await expect(thumb).toBeVisible({ timeout: SLOW });
  await thumb.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Photo 1 of 1" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(thumb).toBeFocused();

  // Photo delete confirmation: first focus is the safe Keep button.
  await thumb.focus();
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Delete photo" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("heading", { name: "Delete this photo?" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep photo" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(thumb).toBeFocused();

  // Cure plan editor: removing a milestone leaves focus on the remaining row.
  await page.goto(`/batches/${batch.id}/cure-plan`);
  await waitForHeading(page, /cure plan/i);
  await fillCureForm(page, {
    rows: [
      { kind: "check", label: "First", offset: "3" },
      { kind: "check", label: "Second", offset: "5" },
    ],
  });
  await expect(cureRows(page)).toHaveCount(2);
  const remove = page.getByRole("button", { name: "Remove milestone 1" });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(cureRows(page)).toHaveCount(1);
  await expect.poll(() => activeIsBody(page)).toBe(false);
  await expect(cureRows(page).first().locator(":focus")).toHaveCount(1);
  // And with the last row gone, focus lands on an Add button.
  await page.keyboard.press("Enter");
  await expect(cureRows(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add burn test" })).toBeFocused();
});
