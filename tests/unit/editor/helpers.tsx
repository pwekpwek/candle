import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import { getDataLayer, openDatabase } from "@/lib/db";

/** Empties every table the editor touches (it uses the singleton on the default database). */
export async function resetDb() {
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const textbox = (name: string | RegExp) =>
  screen.getByRole("textbox", { name }) as HTMLInputElement;

export function typeInto(name: string | RegExp, value: string) {
  fireEvent.change(textbox(name), { target: { value } });
}

export const NAME = "Name";
export const AMOUNT = "Total mixture weight (g)";
export const COUNT = "Number of vessels";
export const FILL = "Fill weight per vessel (g)";
export const PCT = "Fragrance percentage (%)";

export const saveButton = () => screen.getByRole("button", { name: "Save formula" });

/** Picks a material in a labelled picker once its list has loaded. */
export async function choose(label: string, materialName: string) {
  const select = (await screen.findByRole("combobox", { name: label })) as HTMLSelectElement;
  const option = await waitFor(() => {
    const found = within(select)
      .getAllByRole("option")
      .find((o) => o.textContent === materialName);
    expect(found).toBeTruthy();
    return found as HTMLOptionElement;
  });
  fireEvent.change(select, { target: { value: option.value } });
}

export const resultsPanel = () => screen.getByRole("region", { name: "Planned weights" });

export async function waitForDraft(key: string, timeout = 3000) {
  return waitFor(
    async () => {
      const draft = await getDataLayer().drafts.get(key);
      expect(draft).toBeDefined();
      return draft;
    },
    { timeout },
  );
}

export async function waitForEditor() {
  await screen.findByRole("button", { name: "Save formula" });
}
