"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  /** Names the group for assistive technology ("Sizing mode"). */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * 2 to 4 options that switch a mode (blueprint section 4). Built on native
 * radio inputs inside a radiogroup, so the browser provides the keyboard
 * behaviour: Tab enters the group at the selected option, the arrow keys move
 * and select, and the focus ring shows on the selected segment.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full gap-1 rounded-md bg-muted p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative flex min-h-9 cursor-pointer items-center justify-center rounded-sm border px-3 text-sm select-none pointer-coarse:min-h-11",
              selected
                ? "border-input bg-card font-semibold text-foreground"
                : "border-transparent text-text-secondary hover:text-foreground",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="peer absolute inset-0 m-0 cursor-[inherit] appearance-none rounded-sm opacity-0 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
