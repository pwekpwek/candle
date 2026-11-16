"use client";

import type { ReactNode } from "react";
import { Field } from "@/components/common/field";
import { Input } from "@/components/ui/input";

export interface NumberFieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Message to show, already gated by blur or Save. */
  error?: string;
  /** Decorative unit after the control ("g", "%"). Put it in the label too. */
  unit?: ReactNode;
  /** `numeric` for whole numbers (vessel count). */
  inputMode?: "decimal" | "numeric";
  /** Key the Save button uses to move focus to the first problem. */
  dataField: string;
  /** Accessible name when the visible label is shared by several rows. */
  ariaLabel?: string;
  className?: string;
}

/** A text input with a decimal keypad, a real label above and its message below (FLOW-02). */
export function NumberField({
  label,
  value,
  onChange,
  onBlur,
  error,
  unit,
  inputMode = "decimal",
  dataField,
  ariaLabel,
  className,
}: NumberFieldProps) {
  return (
    <Field label={label} unit={unit} error={error} className={className}>
      {(c) => (
        <Input
          {...c}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          data-field={dataField}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      )}
    </Field>
  );
}
