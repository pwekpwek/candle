/** TrueCandle Cost parsing of what the maker types. bigint only, no floating point. */
import { MAX_LABOUR_HOURS_X100, MAX_MONEY_CENTAVOS } from "@/lib/types";
import type { ParseResult } from "./contract";

type Hundredths = { ok: true; value: bigint } | { ok: false; reason: "empty" | "format" };

const GROUPED = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;
const PLAIN = /^(\d+)(?:\.(\d{1,2}))?$/;
const BARE_DECIMAL = /^\.(\d{1,2})$/;
const PESO = "₱";

/** Digits with at most 2 decimals, as hundredths. `commas` allows thousands groups. */
function toHundredths(text: string, commas: boolean): Hundredths {
  if (text === "") return { ok: false, reason: "empty" };
  const bare = BARE_DECIMAL.exec(text);
  if (bare) return { ok: true, value: BigInt(bare[1].padEnd(2, "0")) };
  const m = (commas ? GROUPED : PLAIN).exec(text);
  if (!m) return { ok: false, reason: "format" };
  const whole = BigInt(m[1].replace(/,/g, ""));
  const frac = BigInt((m[2] ?? "").padEnd(2, "0") || "0");
  return { ok: true, value: whole * BigInt(100) + frac };
}

function inRange(value: bigint, max: number): ParseResult<number> {
  if (value > BigInt(max)) return { ok: false, reason: "range" };
  return { ok: true, value: Number(value) };
}

export function parseMoney(text: string): ParseResult<number> {
  let t = text.trim();
  if (t === "") return { ok: false, reason: "empty" };
  if (t.startsWith(PESO)) {
    t = t.slice(PESO.length).trim();
    if (t === "") return { ok: false, reason: "format" };
  }
  const h = toHundredths(t, true);
  if (!h.ok) return h;
  return inRange(h.value, MAX_MONEY_CENTAVOS);
}

export function parseHours(text: string): ParseResult<number> {
  const h = toHundredths(text.trim(), false);
  if (!h.ok) return h;
  return inRange(h.value, MAX_LABOUR_HOURS_X100);
}

export function parsePercent(text: string, maxBp: number): ParseResult<number> {
  const original = text.trim();
  let t = original;
  if (t.endsWith("%")) t = t.slice(0, -1).trim();
  if (t === "" && original !== "") return { ok: false, reason: "format" };
  const h = toHundredths(t, false);
  if (!h.ok) return h;
  return inRange(h.value, maxBp);
}

export function parseWholeNumber(text: string, min: number, max: number): ParseResult<number> {
  const t = text.trim();
  if (t === "") return { ok: false, reason: "empty" };
  if (!/^\d+$/.test(t)) return { ok: false, reason: "format" };
  const v = BigInt(t);
  if (v < BigInt(min) || v > BigInt(max)) return { ok: false, reason: "range" };
  return { ok: true, value: Number(v) };
}
