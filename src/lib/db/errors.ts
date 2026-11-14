import type { z } from "zod";
import type { DataErrorCode, DataErrorLike } from "./contract";

/** The one error type every data-layer function throws (contract, DataErrorLike). */
export class DataError extends Error implements DataErrorLike {
  readonly code: DataErrorCode;

  constructor(code: DataErrorCode, message: string) {
    super(message);
    this.name = "DataError";
    this.code = code;
  }
}

/**
 * Turns anything thrown into a DataError. A DataError passes through (also
 * when Dexie wrapped it in `inner`); everything else is an IndexedDB or
 * Dexie failure and becomes "storage".
 */
export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  const inner = (error as { inner?: unknown } | null)?.inner;
  if (inner instanceof DataError) return inner;
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new DataError("storage", `Storage failure. ${detail}`);
}

/** Runs a repository operation and reports every failure as a DataError. */
export async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toDataError(error);
  }
}

/** Validates with a Zod schema. A failure throws DataError("invalid"). */
export function parseRecord<S extends z.ZodType>(
  schema: S,
  value: unknown,
  what: string,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new DataError("invalid", `Invalid ${what}. ${detail}`);
  }
  return result.data;
}

export function notFound(what: string, id: string): DataError {
  return new DataError("not-found", `${what} ${id} does not exist.`);
}
