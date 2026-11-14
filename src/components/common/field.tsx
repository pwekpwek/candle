"use client";

import { useId, type ReactNode } from "react";
import { CircleAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** Props to spread on the control (input, textarea, select) inside a Field. */
export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

interface FieldProps {
  label: ReactNode;
  /** Help text below the control, in muted-foreground. */
  hint?: ReactNode;
  /** Error message. Sets aria-invalid and shows an icon before the text. */
  error?: ReactNode;
  /** Unit shown after the control ("g", "%"). Decorative: put it in the label too. */
  unit?: ReactNode;
  className?: string;
  /** Render the control with the wiring props spread onto it. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label above, control, then hint and error below (blueprint section 4).
 * The label is tied to the control with htmlFor, the hint and error with
 * aria-describedby, and an error sets aria-invalid.
 *
 *   <Field label="Batch size" error={err}>
 *     {(c) => <Input {...c} inputMode="decimal" />}
 *   </Field>
 */
export function Field({
  label,
  hint,
  error,
  unit,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = Boolean(error);
  const describedBy =
    [hasError ? errorId : null, hint ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const control = children({
    id,
    "aria-describedby": describedBy,
    "aria-invalid": hasError ? true : undefined,
  });

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      {unit ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{control}</div>
          <span aria-hidden="true" className="text-sm text-text-secondary">
            {unit}
          </span>
        </div>
      ) : (
        control
      )}
      {hasError ? (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <CircleAlertIcon
            aria-hidden="true"
            strokeWidth={1.75}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
