import { emptyEditorFields, fieldsFromVersion } from "@/lib/gramguard";
import type { EditorFields } from "@/lib/gramguard";
import { getDataLayer } from "@/lib/db";

export function newRowId(): string {
  return crypto.randomUUID();
}

export type EditorTarget =
  | { mode: "new"; example?: boolean }
  | { mode: "revise"; formulaId: string; fromVersionId: string | null };

/** What the form starts from. `pristine` is the untouched state; `fields` is where typing begins. */
export type EditorStart = {
  mode: "new" | "revise";
  /** Draft key: "new" or the formula id. */
  draftKey: string;
  /** The version being revised, null for a new formula. */
  baseVersionId: string | null;
  formulaName: string | null;
  /** Revise only. */
  revising: { fromNumber: number; nextNumber: number } | null;
  pristine: EditorFields;
  fields: EditorFields;
  /** ISO time of the restored draft, or null. */
  restoredAt: string | null;
  fromExample: boolean;
};

export type LoadResult =
  | { status: "ready"; start: EditorStart }
  | { status: "notFound" }
  | { status: "error" };

/** A draft written by an older build, or damaged, must never break the editor. */
function usableDraft(fields: unknown): fields is EditorFields {
  if (typeof fields !== "object" || fields === null) return false;
  const f = fields as Partial<EditorFields>;
  return (
    Array.isArray(f.waxes) &&
    Array.isArray(f.oils) &&
    typeof f.name === "string" &&
    typeof f.amount === "string" &&
    typeof f.fragrancePct === "string"
  );
}

async function readDraft(key: string) {
  try {
    const draft = await getDataLayer().drafts.get(key);
    return draft && usableDraft(draft.fields) ? draft : undefined;
  } catch {
    return undefined;
  }
}

async function loadNew(example: boolean): Promise<LoadResult> {
  const pristine = emptyEditorFields(newRowId);
  const base = {
    mode: "new" as const,
    draftKey: "new",
    baseVersionId: null,
    formulaName: null,
    revising: null,
    pristine,
  };
  if (example) {
    try {
      const fields = await getDataLayer().example.prepare(newRowId);
      return {
        status: "ready",
        start: { ...base, fields, restoredAt: null, fromExample: true },
      };
    } catch {
      // Fall through to a blank editor: the example is a convenience.
    }
  }
  const draft = await readDraft("new");
  if (draft) {
    return {
      status: "ready",
      start: {
        ...base,
        fields: { ...pristine, ...draft.fields },
        restoredAt: draft.updatedAt,
        fromExample: false,
      },
    };
  }
  return {
    status: "ready",
    start: { ...base, fields: pristine, restoredAt: null, fromExample: false },
  };
}

async function loadRevise(formulaId: string, fromVersionId: string | null): Promise<LoadResult> {
  try {
    const { formulas, versions } = getDataLayer();
    const formula = await formulas.get(formulaId);
    if (!formula) return { status: "notFound" };
    let version;
    if (fromVersionId) {
      version = await versions.get(fromVersionId);
      if (version && version.formulaId !== formulaId) version = undefined;
    } else {
      version = (await versions.listByFormula(formulaId))[0];
    }
    if (!version) return { status: "notFound" };

    const pristine: EditorFields = {
      ...fieldsFromVersion(version, newRowId),
      name: formula.name,
    };
    const draft = await readDraft(formulaId);
    const restore = draft && draft.baseVersionId === version.id ? draft : undefined;
    return {
      status: "ready",
      start: {
        mode: "revise",
        draftKey: formulaId,
        baseVersionId: version.id,
        formulaName: formula.name,
        revising: { fromNumber: version.number, nextNumber: formula.latestVersionNumber + 1 },
        pristine,
        // Revising never renames: the name always comes from the formula.
        fields: restore ? { ...pristine, ...restore.fields, name: formula.name } : pristine,
        restoredAt: restore ? restore.updatedAt : null,
        fromExample: false,
      },
    };
  } catch {
    return { status: "error" };
  }
}

export function loadEditor(target: EditorTarget): Promise<LoadResult> {
  return target.mode === "new"
    ? loadNew(target.example === true)
    : loadRevise(target.formulaId, target.fromVersionId);
}
