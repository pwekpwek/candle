import { test, expect } from "@playwright/test";

// TEST-31: first run, empty material library, no backup yet.
test.setTimeout(120_000);

test("first run: the list explains itself and offers both ways to start", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Saved formulas" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Your formulas will live here.")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("Work out wax and fragrance weights, then save them to reuse and revise."),
  ).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "New formula" }).first()).toHaveAttribute(
    "href",
    "/formulas/new",
  );
  await expect(main.getByRole("link", { name: "Start from an example" })).toHaveAttribute(
    "href",
    "/formulas/new?example=1",
  );
  await expect(page.getByTestId("formula-row")).toHaveCount(0);
});

test("empty material library", async ({ page }) => {
  await page.goto("/materials");
  await expect(page.getByRole("heading", { level: 1, name: "Materials" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("No materials yet.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Add the waxes, oils, wicks and vessels you use.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add material" }).first()).toBeVisible();
});

test("no backup yet", async ({ page }) => {
  await page.goto("/backup");
  await expect(page.getByRole("heading", { level: 1, name: "Backup and restore" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("No backup yet.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Export backup" }).first()).toBeVisible();
});

test("Start from an example opens the editor filled with WE-5", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your formulas will live here.")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Start from an example" }).click();
  await expect(page).toHaveURL(/\/formulas\/new/);

  const editor = page.getByRole("heading", { level: 1, name: "New formula" });
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Name", { exact: true }).filter({ visible: true })).toHaveValue(
    "Lavender Vanilla Cedar (example)",
    { timeout: 30_000 },
  );
  await expect(page.getByLabel("Number of vessels").filter({ visible: true })).toHaveValue("6");
  await expect(page.getByLabel("Fill weight per vessel (g)").filter({ visible: true })).toHaveValue(
    "180",
  );
  await expect(page.getByLabel("Fragrance percentage (%)").filter({ visible: true })).toHaveValue(
    "8",
  );
  // Three oils, one wax.
  const selects = page.getByTestId("material-picker").filter({ visible: true });
  await expect(selects.filter({ has: page.getByText("Oil 1", { exact: true }) })).toHaveCount(1);
  await expect(selects.filter({ has: page.getByText("Oil 2", { exact: true }) })).toHaveCount(1);
  await expect(selects.filter({ has: page.getByText("Oil 3", { exact: true }) })).toHaveCount(1);
  await expect(selects.filter({ has: page.getByText("Oil 4", { exact: true }) })).toHaveCount(0);

  const panel = page.locator("[data-field=result]").filter({ visible: true });
  await expect(panel).toContainText("1000.0 g");
  await expect(panel).toContainText("80.0 g");
  await expect(panel).toContainText("1080.0 g");
});
