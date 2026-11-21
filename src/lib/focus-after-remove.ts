/**
 * Keeps keyboard focus useful after a row is removed from a list.
 *
 * Call it from the Remove button's click handler, right after the state change.
 * It reads the row's place in the list now, then after React has re-rendered it
 * focuses the Remove button of the row that took the removed row's place, else
 * the previous row's, else the section's Add button.
 *
 * Mark each row's Remove button `data-row-remove` and each Add button
 * `data-add-row`. Rows are the `li` children of the list.
 */
export function focusAfterRemove(removeButton: HTMLElement): void {
  const row = removeButton.closest("li");
  const list = row?.parentElement ?? null;
  const section = removeButton.closest("section");
  if (!row || !list) return;
  const index = Array.from(list.children).indexOf(row);

  requestAnimationFrame(() => {
    if (list.isConnected) {
      const rows = Array.from(list.children).filter((el) => el.tagName === "LI");
      const target = rows[Math.min(index, rows.length - 1)];
      if (target) {
        const own = Array.from(target.querySelectorAll<HTMLElement>("[data-row-remove]")).find(
          (el) => el.closest("li") === target,
        );
        const fallback = target.querySelector<HTMLElement>("input, select, textarea, button");
        const el = own ?? fallback;
        if (el) {
          el.focus();
          return;
        }
      }
    }
    const add = Array.from(section?.querySelectorAll<HTMLElement>("[data-add-row]") ?? []).find(
      (el) => !list.contains(el) && !el.hasAttribute("disabled"),
    );
    add?.focus();
  });
}
