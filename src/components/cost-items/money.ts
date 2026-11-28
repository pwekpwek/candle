import { centavosToInput, parseMoney } from "@/lib/cost";

export type MoneyMessages = { invalid: string; decimals: string; range: string };

/**
 * Pesos as typed, to whole centavos. Blank is `{}` (the caller decides whether
 * that is allowed). All the arithmetic is `parseMoney`'s.
 */
export function parseMoneyField(
  text: string,
  messages: MoneyMessages,
): { value?: number; error?: string; blank?: true } {
  const trimmed = text.trim();
  const result = parseMoney(trimmed);
  if (result.ok) return { value: result.value };
  if (result.reason === "empty") return { blank: true };
  if (result.reason === "range") return { error: messages.range };
  // A third decimal place is its own message; anything else is a format problem.
  if (/^[₱\s]*[\d,]*\.\d{3,}$/.test(trimmed)) return { error: messages.decimals };
  return { error: messages.invalid };
}

/** Stored centavos back into the text a maker types. */
export function moneyToInput(centavos: number | undefined): string {
  return centavos === undefined ? "" : centavosToInput(centavos);
}
