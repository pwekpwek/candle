import { test, expect, type Page } from "@playwright/test";

const TOP_LEVEL = [
  { name: "Formulas", path: "/", heading: "Saved formulas" },
  { name: "Materials", path: "/materials", heading: "Materials" },
  { name: "Backup and restore", path: "/backup", heading: "Backup and restore" },
  { name: "Batches", path: "/batches", heading: "Batches" },
  { name: "Schedule", path: "/schedule", heading: "Schedule" },
] as const;

const ALL_ROUTES = [
  "/",
  "/formulas/new",
  "/formulas/abc",
  "/formulas/abc/versions/v1",
  "/formulas/abc/revise",
  "/materials",
  "/backup",
  "/schedule",
  "/schedule/plan/new",
  "/schedule/plan/abc",
  "/batches/abc/cure-plan",
];

async function expectOnlyCurrent(page: Page, currentName: string) {
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const item of TOP_LEVEL) {
    const link = nav.getByRole("link", { name: item.name });
    if (item.name === currentName) {
      await expect(link).toHaveAttribute("aria-current", "page");
    } else {
      await expect(link).not.toHaveAttribute("aria-current", "page");
    }
  }
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("desktop (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("sidebar navigates between every top-level route and aria-current follows", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("CandleLab Studio");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    await expect(page.getByText("CandleLab Studio", { exact: true })).toBeVisible();
    await expectOnlyCurrent(page, "Formulas");

    for (const item of [TOP_LEVEL[1], TOP_LEVEL[2], TOP_LEVEL[3], TOP_LEVEL[4], TOP_LEVEL[0]]) {
      await nav.getByRole("link", { name: item.name }).click();
      await expect(page).toHaveURL(item.path);
      await expect(
        page.getByRole("heading", { level: 1, name: item.heading }),
      ).toBeVisible();
      await expectOnlyCurrent(page, item.name);
    }
  });

  test("sidebar is 240px wide and nothing scrolls sideways", async ({ page }) => {
    await page.goto("/");
    const box = await page.locator("aside").boundingBox();
    expect(box?.width).toBe(240);
    await expectNoHorizontalScroll(page);
  });

  test("formula routes keep Formulas current and reach the editor", async ({
    page,
  }) => {
    await page.goto("/");
    // On an empty home page "New formula" is both the page-header action and the
    // empty-state call to action. Scope to the header, which is always rendered.
    await page
      .locator("main header")
      .getByRole("link", { name: "New formula" })
      .click();
    await expect(page).toHaveURL("/formulas/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "New formula" }),
    ).toBeVisible();
    await expectOnlyCurrent(page, "Formulas");

    for (const path of [
      "/formulas/abc",
      "/formulas/abc/versions/v1",
      "/formulas/abc/revise",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectOnlyCurrent(page, "Formulas");
    }
  });

  test("nav links are reachable by keyboard with a visible focus outline", async ({
    page,
  }) => {
    await page.goto("/");
    // Readiness: the nav is first rendered as a server fallback and swapped for
    // the live one when React hydrates, which drops focus from a fallback link.
    // The home page only leaves its "Loading" state after hydration (it is a
    // client-side Dexie read), so wait for that before touching the keyboard.
    await expect(page.getByRole("status").filter({ hasText: /loading/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Saved formulas" })).toBeVisible();
    const link = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Materials" });
    await link.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Tab");
    await expect(
      page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Backup and restore" }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/materials");
  });
});

test.describe("tablet (800px)", () => {
  test.use({ viewport: { width: 800, height: 900 } });

  test("icon rail is 64px, labelled, and shows the label on focus", async ({
    page,
  }) => {
    await page.goto("/");
    const box = await page.locator("aside").boundingBox();
    expect(box?.width).toBe(64);
    const link = page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Materials" });
    await link.focus();
    await expect(link.locator("span")).toHaveCSS("opacity", "1");
    await expectNoHorizontalScroll(page);
  });
});

test.describe("phone (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("bottom bar navigates and aria-current follows", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    await expect(page.locator("aside")).toBeHidden();
    await expectOnlyCurrent(page, "Formulas");

    for (const item of [TOP_LEVEL[1], TOP_LEVEL[2], TOP_LEVEL[3], TOP_LEVEL[4], TOP_LEVEL[0]]) {
      await nav.getByRole("link", { name: item.name }).click();
      await expect(page).toHaveURL(item.path);
      await expect(
        page.getByRole("heading", { level: 1, name: item.heading }),
      ).toBeVisible();
      await expectOnlyCurrent(page, item.name);
    }
  });

  test("the bar sits at the bottom and content is padded to clear it", async ({
    page,
  }) => {
    await page.goto("/");
    const bar = await page.getByRole("navigation", { name: "Main" }).boundingBox();
    expect(bar).not.toBeNull();
    expect(bar!.y + bar!.height).toBeCloseTo(812, 0);
    const padding = await page
      .locator("main")
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    expect(padding).toBeGreaterThanOrEqual(bar!.height);
  });

  test("no horizontal page scroll on any route", async ({ page }) => {
    for (const path of ALL_ROUTES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe("storage blocked", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      IDBFactory.prototype.open = function () {
        throw new DOMException("blocked for test", "SecurityError");
      };
    });
  });

  test("shows the full-page explanation and carries on to the calculator", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "This browser can't store data right now.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);

    await page.getByRole("link", { name: "Carry on without saving" }).click();
    await expect(page).toHaveURL("/formulas/new");
    await expect(
      page.getByRole("heading", { level: 1, name: "New formula" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Not saving.");

    // Dismissal lasts for the session: moving around does not bring it back.
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Materials" })
      .click();
    await expect(page).toHaveURL("/materials");
    await expect(page.getByTestId("storage-blocked")).toHaveCount(0);
  });
});

test("working storage never shows the blocked screen", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Saved formulas" }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("storage-blocked")).toHaveCount(0);
});
