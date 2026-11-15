import type { CanonicalJson, Sha256Hex } from "./contract";

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function write(value: unknown, path: string, stack: Set<object>): string {
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`canonicalJson: non-finite number at ${path}`);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TypeError(`canonicalJson: cannot serialise ${typeof value} at ${path}`);
  }
  if (value === null) return "null";
  const obj = value as object;
  if (stack.has(obj)) throw new TypeError(`canonicalJson: circular reference at ${path}`);
  stack.add(obj);
  try {
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (let i = 0; i < obj.length; i++) {
        const item: unknown = obj[i];
        parts.push(item === undefined ? "null" : write(item, `${path}[${i}]`, stack));
      }
      return `[${parts.join(",")}]`;
    }
    if (!isPlainObject(obj)) {
      throw new TypeError(`canonicalJson: unsupported object at ${path}`);
    }
    const record = obj as Record<string, unknown>;
    // Default sort compares UTF-16 code units, which is the required order.
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const item = record[key];
      if (item === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${write(item, `${path}.${key}`, stack)}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    stack.delete(obj);
  }
}

/** DATA-16. Sorted keys at every depth, no whitespace. Throws TypeError on values JSON cannot hold faithfully. */
export const canonicalJson: CanonicalJson = (value) => write(value, "$", new Set());

/** Lower-case hex SHA-256 of the UTF-8 bytes, via Web Crypto. */
export const sha256Hex: Sha256Hex = async (text) => {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};
