import path from "node:path";
import { test, expect } from "@playwright/test";
import { messageForCheckFailure } from "@/lib/messages";
import { fillValidFormula, listedNames, saveButton, expectSavedAs } from "./helpers-checks";

// TEST-32: a malformed backup shows its reason and leaves the formula list unchanged.
// Expected refusals come from tests/fixtures/backups/README.md, worded by messageForCheckFailure.
test.setTimeout(120_000);

const DIR = path.join(process.cwd(), "tests", "fixtures", "backups");

const invalid = (kind: string, problem: string) =>
  new RegExp(
    String.raw`This backup is damaged: 1 record is invalid \(first: ${kind} \S+, ${problem}\)\.`,
  );

const CASES: { file: string; refusal: string; expected: string | RegExp }[] = [
  {
    file: "bad-01-not-json.json",
    refusal: "not-backup",
    expected: messageForCheckFailure({ code: "not-backup" }),
  },
  {
    file: "bad-02-wrong-format.json",
    refusal: "not-backup",
    expected: messageForCheckFailure({ code: "not-backup" }),
  },
  {
    file: "bad-03-newer-version.json",
    refusal: "newer",
    expected: messageForCheckFailure({ code: "newer" }),
  },
  { file: "bad-04-missing-field.json", refusal: "invalid", expected: invalid("formula version", "missing targets") },
  { file: "bad-05-wrong-type.json", refusal: "invalid", expected: invalid("formula", "name has the wrong type") },
  { file: "bad-06-negative-weight.json", refusal: "invalid", expected: invalid("measurement", "negative weight") },
  {
    file: "bad-07-count-mismatch.json",
    refusal: "incomplete",
    expected: messageForCheckFailure({ code: "incomplete" }),
  },
  {
    file: "bad-08-checksum-mismatch.json",
    refusal: "checksum",
    expected: messageForCheckFailure({ code: "checksum" }),
  },
  {
    file: "bad-09-truncated.json",
    refusal: "not-backup",
    expected: messageForCheckFailure({ code: "not-backup" }),
  },
  {
    file: "bad-10-duplicate-ids.json",
    refusal: "duplicates",
    expected: messageForCheckFailure({ code: "duplicates" }),
  },
  {
    file: "bad-11-orphaned-version.json",
    refusal: "orphans",
    expected: messageForCheckFailure({ code: "orphans", versions: 1, measurements: 0, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0 }),
  },
];

for (const c of CASES) {
  test(`${c.file} is refused (${c.refusal}) and the list is unchanged`, async ({ page }) => {
    await fillValidFormula(page, "Keep me");
    await saveButton(page).click();
    await expectSavedAs(page, 1);
    const before = await listedNames(page);
    expect(before).toEqual(["Keep me"]);

    await page.goto("/backup");
    await expect(page.getByRole("heading", { level: 1, name: "Backup and restore" })).toBeVisible({
      timeout: 60_000,
    });
    await page.locator("input[type=file]").setInputFiles(path.join(DIR, c.file));

    const alert = page.getByText("This file can't be restored");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    const notice = page.getByRole("alert").filter({ hasText: "This file can't be restored" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(c.expected);
    await expect(notice).toContainText("Nothing on this device was changed.");
    // No preview or Restore button for a refused file.
    await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);

    expect(await listedNames(page)).toEqual(before);
  });
}
