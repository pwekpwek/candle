import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/formulas/new", heading: /./ },
  { path: "/materials", heading: /./ },
];

test.describe("focus ring (desktop 1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const { path } of PAGES) {
    test(`every focused control on ${path} shows the global outline`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: /loading/i })).toHaveCount(0);

      let checked = 0;
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const tag = el.tagName.toLowerCase();
          if (!["button", "a", "input", "select", "textarea"].includes(tag)) return null;
          const cs = getComputedStyle(el);
          return {
            desc: `${tag}${el.id ? "#" + el.id : ""} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}"`,
            style: cs.outlineStyle,
            width: parseFloat(cs.outlineWidth),
          };
        });
        if (!info) continue;
        checked++;
        expect(info.style, info.desc).not.toBe("none");
        expect(info.width, info.desc).toBeGreaterThanOrEqual(2);
      }
      expect(checked).toBeGreaterThan(5);
    });
  }
});
