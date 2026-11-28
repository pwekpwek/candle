import { z } from "zod";
import {
  FIX_ISSUES,
  HYPOTHESIS_STATUSES,
  MAX_CHECK_ID_LENGTH,
  MAX_CHECK_LABEL_LENGTH,
  MAX_CHECK_NOTE_LENGTH,
  MAX_CHECKS,
  MAX_EXPERIMENT_CHANGE_LENGTH,
  MAX_EXPERIMENT_SESSIONS,
  MAX_FIX_TEXT_LENGTH,
  MAX_HYPOTHESES,
  MAX_HYPOTHESIS_TEXT_LENGTH,
  MAX_INVESTIGATION_TITLE_LENGTH,
  MAX_OTHER_ISSUE_LENGTH,
} from "@/lib/types";
import { isJpeg, isUint8Array, PHOTO_BASE_FIELDS, PhotoBase64Schema } from "./burn";
import { IdSchema, IsoDateSchema, NullableTimestampSchema, TimestampSchema, hasUniqueKeys } from "./primitives";

/**
 * v0.3 CandleFix schemas (docs/v0.3-candlefix.md). Strings are stored trimmed
 * by the repositories; these schemas check the trimmed length.
 */

function trimmedLength(max: number, what: string) {
  return z.string().refine(
    (value) => value.trim().length >= 1 && value.trim().length <= max,
    { error: `${what} must be 1 to ${max} characters after trimming.` },
  );
}

const FixTextSchema = trimmedLength(MAX_FIX_TEXT_LENGTH, "Text");

export const FixIssueSchema = z.enum(FIX_ISSUES);
export const HypothesisStatusSchema = z.enum(HYPOTHESIS_STATUSES);

/** A built-in check item id, "<issue>.<slug>". Not checked against the current lists (soft). */
export const CheckItemIdSchema = z
  .string()
  .min(1)
  .max(MAX_CHECK_ID_LENGTH)
  .regex(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/, { error: "Check item id is not valid." });

export const ChecklistTickSchema = z.strictObject({
  itemId: CheckItemIdSchema,
  issue: FixIssueSchema,
  label: trimmedLength(MAX_CHECK_LABEL_LENGTH, "Check label"),
  checked: z.boolean(),
  note: trimmedLength(MAX_CHECK_NOTE_LENGTH, "Check note").optional(),
});

export const HypothesisSchema = z.strictObject({
  id: IdSchema,
  text: trimmedLength(MAX_HYPOTHESIS_TEXT_LENGTH, "Hypothesis"),
  status: HypothesisStatusSchema,
  notes: FixTextSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

/** True when the issues are unique and in FIX_ISSUES order. */
export function issuesInOrder(issues: readonly string[]): boolean {
  let last = -1;
  for (const issue of issues) {
    const at = (FIX_ISSUES as readonly string[]).indexOf(issue);
    if (at <= last) return false;
    last = at;
  }
  return true;
}

/** Store `investigations`. */
export const InvestigationSchema = z
  .strictObject({
    id: IdSchema,
    batchId: IdSchema,
    observedOn: IsoDateSchema,
    title: trimmedLength(MAX_INVESTIGATION_TITLE_LENGTH, "Title").optional(),
    issues: z
      .array(FixIssueSchema)
      .min(1)
      .max(FIX_ISSUES.length)
      .refine(issuesInOrder, { error: "Issues must be unique and in the fixed order." }),
    otherIssue: trimmedLength(MAX_OTHER_ISSUE_LENGTH, "Other issue").optional(),
    notes: FixTextSchema.optional(),
    checks: z
      .array(ChecklistTickSchema)
      .max(MAX_CHECKS)
      .refine((checks) => hasUniqueKeys(checks.map((c) => c.itemId)), {
        error: "Each thing to check appears once.",
      }),
    hypotheses: z
      .array(HypothesisSchema)
      .max(MAX_HYPOTHESES)
      .refine((list) => hasUniqueKeys(list.map((h) => h.id)), { error: "Hypothesis ids must be unique." }),
    archivedAt: NullableTimestampSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .refine((inv) => inv.issues.includes("other") === (inv.otherIssue !== undefined), {
    error: "The other issue's text is given exactly when Other is chosen.",
    path: ["otherIssue"],
  });

const INVESTIGATION_PHOTO_FIELDS = { id: IdSchema, investigationId: IdSchema, ...PHOTO_BASE_FIELDS };

/** Store `investigationPhotos`: the record with its JPEG bytes. */
export const InvestigationPhotoSchema = z
  .strictObject({
    ...INVESTIGATION_PHOTO_FIELDS,
    bytes: z.custom<Uint8Array>(isUint8Array, { error: "bytes must be a Uint8Array." }),
  })
  .refine((photo) => photo.bytes.length === photo.byteLength, {
    error: "byteLength does not match the bytes.",
    path: ["byteLength"],
  })
  .refine((photo) => isJpeg(photo.bytes), { error: "The photo is not a JPEG.", path: ["bytes"] });

/** An investigation photo in a backup file (base64 bytes, checked by the restore step). */
export const InvestigationPhotoBackupSchema = z.strictObject({
  ...INVESTIGATION_PHOTO_FIELDS,
  dataBase64: PhotoBase64Schema,
});

/** Store `correctiveExperiments`. */
export const CorrectiveExperimentSchema = z.strictObject({
  id: IdSchema,
  investigationId: IdSchema,
  hypothesisId: IdSchema,
  followUpBatchId: IdSchema,
  burnSessionIds: z
    .array(IdSchema)
    .max(MAX_EXPERIMENT_SESSIONS)
    .refine(hasUniqueKeys, { error: "A burn test is listed once." }),
  change: trimmedLength(MAX_EXPERIMENT_CHANGE_LENGTH, "Change").optional(),
  notes: FixTextSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
