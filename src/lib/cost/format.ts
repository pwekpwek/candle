/** TrueCandle Cost formatting. Integer maths only; ASCII hyphen-minus for negatives. */
import type { PriceUnit } from "@/lib/types";
import type { Fraction } from "./contract";
import { roundCentavos } from "./rational";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

function withCommas(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function centavosText(centavos: bigint): string {
  const negative = centavos < ZERO;
  const a = negative ? -centavos : centavos;
  const pesos = a / HUNDRED;
  const cents = (a % HUNDRED).toString().padStart(2, "0");
  return `${negative ? "-" : ""}₱${withCommas(pesos.toString())}.${cents}`;
}

export function formatPeso(value: Fraction): string {
  return centavosText(roundCentavos(value));
}

export function formatCentavos(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) throw new RangeError("centavos must be a safe integer.");
  return centavosText(BigInt(centavos));
}

/** Hundredths as typed: trailing zeros dropped. */
function hundredths(value: number): string {
  if (!Number.isSafeInteger(value)) throw new RangeError("value must be a safe integer.");
  const negative = value < 0;
  const a = BigInt(negative ? -value : value);
  const whole = (a / HUNDRED).toString();
  const frac = (a % HUNDRED).toString().padStart(2, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export function formatBp(bp: number): string {
  return `${hundredths(bp)}%`;
}

export function formatHours(hoursX100: number): string {
  return hundredths(hoursX100);
}

export function formatMargin(margin: Fraction): string {
  const scaled = roundCentavos({ n: margin.n * BigInt(10_000), d: margin.d });
  const negative = scaled < ZERO;
  const a = negative ? -scaled : scaled;
  const whole = (a / HUNDRED).toString();
  const frac = (a % HUNDRED).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}%`;
}

export function formatUnitPrice(unitPrice: Fraction, unit: PriceUnit): string {
  return `${formatPeso(unitPrice)} ${unit === "kg" ? "per kg" : "each"}`;
}

export function centavosToInput(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new RangeError("centavos must be a non-negative safe integer.");
  }
  const b = BigInt(centavos);
  return `${(b / HUNDRED).toString()}.${(b % HUNDRED).toString().padStart(2, "0")}`;
}
