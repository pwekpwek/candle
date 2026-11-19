import { readFileSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";
import {
  SLOW,
  WE5,
  addCurePlan,
  buildWE5,
  createBatch,
  waitForHeading,
} from "./helpers-schedule";

export { SLOW, WE5, waitForHeading };

/** Next keeps hidden routes mounted: only look at visible fields. */
const vis = (l: Locator) => l.locator("visible=true");

/** A field by its full accessible label ("Candle 1, burn 2: Duration (minutes)"). */
export function field(page: Page, label: string): Locator {
  return vis(page.getByLabel(label, { exact: true }));
}

export function burnField(page: Page, candle: number, burn: number, name: string): Locator {
  return field(page, `Candle ${candle}, burn ${burn}: ${name}`);
}

export function candleField(page: Page, candle: number, name: string): Locator {
  return field(page, `Candle ${candle}: ${name}`);
}

export const candleEditors = (p: Page) => p.getByTestId("candle-editor").filter({ visible: true });

export type BurnSpec = {
  minutes: string;
  before?: string;
  after?: string;
  diameter?: string;
  depth?: string;
  flame?: string;
  soot?: "None seen" | "Light" | "Moderate" | "Heavy";
  notes?: string;
};

export type CandleSpec = {
  label?: string;
  /** A wick typed as free text. */
  wickText?: string;
  /** A wick chosen from the library, by name. */
  wickLibrary?: string;
  burns?: BurnSpec[];
  coldThrow?: string;
  hotThrow?: string;
  notes?: string;
};

export type SessionSpec = {
  date?: string;
  label?: string;
  planned?: RegExp | string;
  candles: CandleSpec[];
  conclusion?: string;
  notes?: string;
};

export async function fillBurn(page: Page, c: number, b: number, burn: BurnSpec) {
  await burnField(page, c, b, "Duration (minutes)").fill(burn.minutes);
  if (burn.before !== undefined) await burnField(page, c, b, "Weight before (g)").fill(burn.before);
  if (burn.after !== undefined) await burnField(page, c, b, "Weight after (g)").fill(burn.after);
  if (burn.diameter !== undefined) await burnField(page, c, b, "Melt pool diameter (mm)").fill(burn.diameter);
  if (burn.depth !== undefined) await burnField(page, c, b, "Melt pool depth (mm)").fill(burn.depth);
  if (burn.flame !== undefined) await burnField(page, c, b, "Flame height (mm)").fill(burn.flame);
  if (burn.soot !== undefined) await burnField(page, c, b, "Soot seen").selectOption({ label: burn.soot });
  if (burn.notes !== undefined) await burnField(page, c, b, "Burn notes (optional)").fill(burn.notes);
}

/** Fills candle number `n` (1-based). The candle editor must already exist. */
export async function fillCandle(page: Page, n: number, candle: CandleSpec) {
  if (candle.label !== undefined) await candleField(page, n, "Candle label").fill(candle.label);
  if (candle.wickLibrary !== undefined) {
    await candleField(page, n, "Wick").selectOption({ label: candle.wickLibrary });
  } else if (candle.wickText !== undefined) {
    const wick = candleField(page, n, "Wick");
    // With no library wicks the editor starts in "type a name" mode already.
    if (await wick.count()) await wick.selectOption({ label: "Type a wick name instead" });
    await candleField(page, n, "Wick name").fill(candle.wickText);
  }
  const burns = candle.burns ?? [];
  for (const [i, burn] of burns.entries()) {
    await candleEditors(page).nth(n - 1).getByRole("button", { name: "Add burn" }).click();
    await expect(burnField(page, n, i + 1, "Duration (minutes)")).toBeVisible();
    await fillBurn(page, n, i + 1, burn);
  }
  if (candle.coldThrow !== undefined) await candleField(page, n, "Cold throw (optional)").fill(candle.coldThrow);
  if (candle.hotThrow !== undefined) await candleField(page, n, "Hot throw (optional)").fill(candle.hotThrow);
  if (candle.notes !== undefined) await candleField(page, n, "Candle notes (optional)").fill(candle.notes);
}

export async function openNewSession(page: Page, batchId: string) {
  await page.goto(`/burn-tests/new?batch=${batchId}`);
  await waitForHeading(page, "Record burn test");
  await expect(field(page, "Test date")).toBeVisible({ timeout: SLOW });
}

/** Fills the whole editor for `spec` (the editor must be open and show one candle). */
export async function fillSession(page: Page, spec: SessionSpec) {
  if (spec.date !== undefined) await field(page, "Test date").fill(spec.date);
  if (spec.label !== undefined) await field(page, "Label (optional)").fill(spec.label);
  if (spec.planned !== undefined) {
    const select = field(page, "Planned burn test (optional)");
    const option = select.locator("option", { hasText: spec.planned });
    await select.selectOption({ value: (await option.first().getAttribute("value")) ?? "" });
  }
  for (const [i, candle] of spec.candles.entries()) {
    if (i > 0) {
      await page.getByRole("button", { name: "Add candle" }).click();
      await expect(candleEditors(page)).toHaveCount(i + 1);
    }
    await fillCandle(page, i + 1, candle);
  }
  if (spec.conclusion !== undefined) await field(page, "Your conclusion (optional)").fill(spec.conclusion);
  if (spec.notes !== undefined) await field(page, "Notes (optional)").fill(spec.notes);
}

/** Saves a new session from the editor and waits for the session page. Returns the session id. */
export async function saveSession(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Save burn test" }).click();
  await expect(page).toHaveURL(/\/burn-tests\/(?!new)[0-9a-f-]{36}/, { timeout: SLOW });
  await expect(page.getByText("Burn test saved")).toBeVisible({ timeout: SLOW });
  return new URL(page.url()).pathname.split("/")[2];
}

/** Records a complete session through the screens. Ends on the session page; returns its id. */
export async function createSession(page: Page, batchId: string, spec: SessionSpec): Promise<string> {
  await openNewSession(page, batchId);
  await fillSession(page, spec);
  return saveSession(page);
}

/** Creates a wick on /materials (the library must not be empty or empty: both work). */
export async function createWick(page: Page, name: string) {
  await page.goto("/materials");
  await waitForHeading(page, "Materials");
  await page.getByRole("button", { name: "Add material" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: SLOW });
  await dialog.getByRole("radio", { name: "Wick", exact: true }).check();
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Added.")).toBeVisible({ timeout: SLOW });
}

/** WE-5 formula and a batch made `daysAgo` days ago. Returns the batch id and the formula URL. */
export async function seedBatch(
  page: Page,
  opts: { daysAgo: number; label: string; burnTestOffset?: string },
) {
  await buildWE5(page);
  const formulaUrl = page.url().split("?")[0];
  const id = await makeBatch(page, formulaUrl, opts);
  return { id, formulaUrl, produced: isoOffset(-opts.daysAgo) };
}

/** Another batch of the same formula. */
export async function makeBatch(
  page: Page,
  formulaUrl: string,
  opts: { daysAgo: number; label: string; burnTestOffset?: string },
): Promise<string> {
  const id = await createBatch(page, formulaUrl, { date: isoOffset(-opts.daysAgo), label: opts.label });
  if (opts.burnTestOffset !== undefined) {
    await addCurePlan(page, id, { rows: [{ kind: "burnTest", offset: opts.burnTestOffset }] });
  }
  return id;
}

function isoOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A generated JPEG (never a real photo): gradient and shapes drawn on a canvas in the page. */
export async function makeJpeg(page: Page, seed: number, width = 640, height = 480): Promise<Buffer> {
  const b64 = await page.evaluate(
    ({ seed, width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, `hsl(${(seed * 67) % 360} 70% 55%)`);
      g.addColorStop(1, `hsl(${(seed * 67 + 120) % 360} 70% 35%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) / (3 + (seed % 3)), 0, Math.PI * 2);
      ctx.fill();
      return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    },
    { seed, width, height },
  );
  return Buffer.from(b64, "base64");
}

export async function makePng(page: Page, seed: number): Promise<Buffer> {
  const b64 = await page.evaluate((seed) => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = `hsl(${(seed * 90) % 360} 60% 50%)`;
    ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = "#fff";
    ctx.fillRect(40, 40, 120, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  }, seed);
  return Buffer.from(b64, "base64");
}

/** Adds `count` generated images on the session page and waits until the count shows. */
export async function addPhotos(page: Page, count: number, startAt = 0, total = count) {
  const files = [];
  for (let i = 0; i < count; i++) {
    const seed = startAt + i + 1;
    // Mix JPEG and PNG on purpose: the app converts both.
    const odd = seed % 2 === 0;
    files.push(
      odd
        ? { name: `generated-${seed}.png`, mimeType: "image/png", buffer: await makePng(page, seed) }
        : { name: `generated-${seed}.jpg`, mimeType: "image/jpeg", buffer: await makeJpeg(page, seed, 400, 300) },
    );
  }
  await page.getByTestId("photo-input").setInputFiles(files);
  await expect(page.getByText(`${total} of 12`, { exact: true })).toBeVisible({ timeout: SLOW });
}

/** Words the app must never write (observations only, no verdicts). */
export const VERDICT_WORDS = /\b(passed|failed|safe|cured|best)\b/i;

export async function expectNoVerdicts(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  const hit = text.match(VERDICT_WORDS);
  expect(hit, `${where}: visible text has a verdict word (${hit?.[0]})`).toBeNull();
}

/** Page-level sideways scroll check for any width. */
export async function expectNoPageScroll(page: Page, where: string) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(m.scrollWidth, `${where}: scrollWidth`).toBeLessThanOrEqual(m.innerWidth);
}

/** Minimal RFC 4180 parser (quotes, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function readText(file: string): string {
  return readFileSync(file, "utf8");
}
