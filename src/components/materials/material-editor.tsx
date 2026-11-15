"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MESSAGES } from "@/lib/messages";
import { MaterialForm, type FormOutcome, type FormTarget } from "./material-form";

const M = MESSAGES.materials;

interface MaterialEditorProps {
  /** Null keeps the drawer closed. */
  target: FormTarget | null;
  /** Formulas that use the material being edited. */
  usedIn: number;
  onDone: (outcome: FormOutcome) => void;
  onClose: () => void;
}

/**
 * The editor for adding and editing: a right drawer from 640px up and a bottom
 * sheet on phones (the Sheet's responsive side).
 */
export function MaterialEditor({ target, usedIn, onDone, onClose }: MaterialEditorProps) {
  const title = !target
    ? ""
    : target.kind === "edit"
      ? M.editTitle[target.material.type]
      : target.type
        ? M.addTitle[target.type]
        : M.addTitleGeneric;
  const key = !target
    ? "closed"
    : target.kind === "edit"
      ? target.material.id
      : `add-${target.type ?? "any"}`;

  return (
    <Sheet open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="responsive" aria-describedby={undefined} data-testid="material-editor">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {target ? (
          <MaterialForm
            key={key}
            target={target}
            usedIn={usedIn}
            onDone={onDone}
            onCancel={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
