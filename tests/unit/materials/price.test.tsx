import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MaterialsView } from "@/components/materials";
import { getDataLayer, openDatabase } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";

const M = MESSAGES.materials;

beforeEach(async () => {
  const db = openDatabase();
  await Promise.all(db.tables.map((table) => table.clear()));
  db.close();
});
afterEach(() => cleanup());

const repo = () => getDataLayer().materials;

async function renderLibrary() {
  render(<MaterialsView />);
  await waitFor(() => expect(screen.queryByText(M.loading)).not.toBeInTheDocument());
}

const pressSave = () => fireEvent.click(screen.getByRole("button", { name: M.save }));
const priceField = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

async function openRow(name: string) {
  fireEvent.click(await screen.findByRole("button", { name }));
  return screen.findByRole("dialog");
}

describe("default price on materials", () => {
  it("labels the field per kg for wax and oil and each for wicks and vessels, with the note", async () => {
    await repo().create({ type: "wax", name: "Demo Wax" });
    await repo().create({ type: "fragranceOil", name: "Demo Oil" });
    await repo().create({ type: "wick", name: "Demo Wick" });
    await repo().create({ type: "vessel", name: "Demo Jar" });
    await renderLibrary();
    for (const [name, label] of [
      ["Demo Wax", M.priceLabelKg],
      ["Demo Oil", M.priceLabelKg],
      ["Demo Wick", M.priceLabelEach],
      ["Demo Jar", M.priceLabelEach],
    ] as const) {
      const dialog = await openRow(name);
      expect(priceField(label)).toBeInTheDocument();
      expect(within(dialog).getByText(new RegExp(M.priceNote))).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: M.cancel }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
  });

  it("saves the price as whole centavos and shows it per kg or each in the list", async () => {
    await repo().create({ type: "wax", name: "Demo Wax" });
    await repo().create({ type: "vessel", name: "Demo Jar" });
    await renderLibrary();

    await openRow("Demo Wax");
    fireEvent.change(priceField(M.priceLabelKg), { target: { value: "1850" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openRow("Demo Jar");
    fireEvent.change(priceField(M.priceLabelEach), { target: { value: "38.5" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const saved = await repo().list();
    expect(saved.find((m) => m.name === "Demo Wax")?.defaultPriceCentavos).toBe(185000);
    expect(saved.find((m) => m.name === "Demo Jar")?.defaultPriceCentavos).toBe(3850);
    const prices = (await screen.findAllByTestId("material-price")).map((n) => n.textContent);
    expect(prices).toContain("₱1,850.00 per kg");
    expect(prices).toContain("₱38.50 each");
  });

  it("shows a stored price in the field and clears it when the field is blanked", async () => {
    await repo().create({ type: "wax", name: "Demo Wax", defaultPriceCentavos: 185050 });
    await renderLibrary();
    await openRow("Demo Wax");
    expect(priceField(M.priceLabelKg).value).toBe("1850.50");
    fireEvent.change(priceField(M.priceLabelKg), { target: { value: "" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [saved] = await repo().list();
    expect(saved.defaultPriceCentavos).toBeUndefined();
  });

  it("saves a material with no price when the field is blank", async () => {
    await repo().create({ type: "wick", name: "Demo Wick" });
    await renderLibrary();
    await openRow("Demo Wick");
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [saved] = await repo().list();
    expect(saved.defaultPriceCentavos).toBeUndefined();
  });

  it.each([
    ["abc", M.priceInvalid],
    ["-5", M.priceInvalid],
    ["12.345", M.priceDecimals],
    ["10000000.01", M.priceRange],
  ])("refuses %s with a field error and saves nothing", async (text, message) => {
    await repo().create({ type: "wax", name: "Demo Wax" });
    await renderLibrary();
    await openRow("Demo Wax");
    fireEvent.change(priceField(M.priceLabelKg), { target: { value: text } });
    pressSave();
    const field = priceField(M.priceLabelKg);
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(field).toHaveFocus();
    expect(field.getAttribute("aria-describedby")).toBeTruthy();
    const [stored] = await repo().list();
    expect(stored.defaultPriceCentavos).toBeUndefined();
  });

  it("accepts the largest price, 10,000,000.00", async () => {
    await repo().create({ type: "wax", name: "Demo Wax" });
    await renderLibrary();
    await openRow("Demo Wax");
    fireEvent.change(priceField(M.priceLabelKg), { target: { value: "10000000.00" } });
    pressSave();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const [saved] = await repo().list();
    expect(saved.defaultPriceCentavos).toBe(1_000_000_000);
  });

  it("links to Packaging and items next to Lots and Suppliers", async () => {
    await renderLibrary();
    const link = screen.getByRole("link", { name: MESSAGES.costItems.title });
    expect(link).toHaveAttribute("href", "/materials/items");
  });
});
