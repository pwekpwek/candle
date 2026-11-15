"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { PackageIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Button } from "@/components/ui/button";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import type { Material, MaterialType } from "@/lib/types";
import { MaterialEditor } from "./material-editor";
import type { FormOutcome, FormTarget } from "./material-form";

const M = MESSAGES.materials;

type Filter = "all" | MaterialType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: M.filterAll },
  { value: "wax", label: M.filterWax },
  { value: "fragranceOil", label: M.filterOils },
  { value: "wick", label: M.filterWicks },
  { value: "vessel", label: M.filterVessels },
];

type Loaded =
  | { ok: true; materials: Material[]; counts: Map<string, number> }
  | { ok: false };

/** What the maker is told after a save or an archive change. */
type Status = { name: string; text: string; note?: string } | null;

/** The material library (F8): list, type filter, archived toggle and editor. */
export function MaterialsView() {
  const [filter, setFilter] = useState<Filter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<FormTarget | null>(null);
  const [status, setStatus] = useState<Status>(null);
  // Bumped after a change and by Try again, so the list refreshes even if the live query is slow.
  const [reload, setReload] = useState(0);

  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const [materials, counts] = await Promise.all([
        layer.materials.list({ includeArchived: true }),
        layer.materials.usageCounts(),
      ]);
      return { ok: true, materials, counts };
    } catch {
      return { ok: false };
    }
  }, [reload]);

  const counts = loaded?.ok ? loaded.counts : undefined;

  function openAdd() {
    setStatus(null);
    setEditor({ kind: "add", type: filter === "all" ? null : filter });
  }

  function onDone(outcome: FormOutcome) {
    const text =
      outcome.kind === "added"
        ? M.addedDone
        : outcome.kind === "edited"
          ? M.savedDone
          : outcome.kind === "archived"
            ? M.archivedDone
            : M.unarchivedDone;
    const used = counts?.get(outcome.material.id) ?? 0;
    setStatus({
      name: outcome.material.name,
      text,
      note: outcome.kind === "archived" && used > 0 ? M.archiveUsedIn(used) : undefined,
    });
    setEditor(null);
    setReload((n) => n + 1);
  }

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {M.loading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        title={M.loadFailedTitle}
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {M.retry}
          </Button>
        }
      >
        {M.loadFailed}
      </Notice>
    );
  } else if (loaded.materials.length === 0) {
    body = (
      <EmptyState
        icon={PackageIcon}
        title={M.empty.title}
        description={M.empty.description}
        action={<Button onClick={openAdd}>{M.empty.action}</Button>}
      />
    );
  } else {
    const visible = loaded.materials
      .filter((m) => filter === "all" || m.type === filter)
      .filter((m) => showArchived || m.archivedAt === null);
    body = (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <SegmentedControl
            label={M.filterLabel}
            options={FILTERS}
            value={filter}
            onChange={setFilter}
          />
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-foreground pointer-coarse:min-h-11">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-4 accent-primary"
            />
            {M.showArchived}
          </label>
        </div>
        {visible.length > 0 ? (
          <MaterialTable
            materials={visible}
            counts={loaded.counts}
            onOpen={(material) => {
              setStatus(null);
              setEditor({ kind: "edit", material });
            }}
          />
        ) : filter === "all" ? (
          <p className="py-8 text-sm text-text-secondary">{M.allArchived}</p>
        ) : (
          <EmptyState
            icon={PackageIcon}
            title={M.typeEmpty(M.typeName[filter])}
            action={<Button onClick={openAdd}>{M.typeAdd(M.typeName[filter])}</Button>}
          />
        )}
      </>
    );
  }

  const editingId = editor?.kind === "edit" ? editor.material.id : null;
  const usedIn = editingId ? (counts?.get(editingId) ?? 0) : 0;

  return (
    <>
      <PageHeader
        title={M.title}
        description={M.description}
        action={
          <Button onClick={openAdd}>
            <PlusIcon aria-hidden="true" strokeWidth={1.75} />
            {M.addMaterial}
          </Button>
        }
      />
      <div aria-live="polite">
        {status ? (
          <Notice variant="success" className="mb-4">
            <span className="font-semibold">{status.name}</span> {status.text}
            {status.note ? ` ${status.note}` : ""}
          </Notice>
        ) : null}
      </div>
      {body}
      <MaterialEditor
        target={editor}
        usedIn={usedIn}
        onDone={onDone}
        onClose={() => setEditor(null)}
      />
    </>
  );
}

interface MaterialTableProps {
  materials: Material[];
  counts: Map<string, number>;
  onOpen: (material: Material) => void;
}

/**
 * One structure for both layouts (FLOW-05): a table from 640px, labelled cards
 * below it. The name is a real button, so every row is keyboard reachable; a
 * click anywhere on the row opens it too.
 */
function MaterialTable({ materials, counts, onOpen }: MaterialTableProps) {
  const head = "px-3 py-2 text-left text-sm font-semibold text-text-secondary sm:table-cell";
  return (
    <div className="sm:overflow-hidden sm:rounded-lg sm:border sm:border-border sm:bg-card">
      <div role="table" className="sm:table sm:w-full">
        <div role="rowgroup" className="max-sm:sr-only sm:table-header-group sm:bg-muted">
          <div role="row" className="sm:table-row">
            <span role="columnheader" className={head}>{M.columnName}</span>
            <span role="columnheader" className={head}>{M.columnType}</span>
            <span role="columnheader" className={head}>{M.columnSupplier}</span>
            <span role="columnheader" className={cn(head, "sm:text-right")}>{M.columnUsedIn}</span>
          </div>
        </div>
        <div role="rowgroup" className="flex flex-col gap-3 sm:table-row-group">
          {materials.map((material) => {
            const count = counts.get(material.id) ?? 0;
            const archived = material.archivedAt !== null;
            return (
              <div
                key={material.id}
                role="row"
                data-testid="material-row"
                onClick={() => onOpen(material)}
                className={cn(
                  "grid cursor-pointer grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-3 hover:bg-muted",
                  "sm:table-row sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:[&>*]:border-t sm:[&>*]:border-border",
                  archived && "text-text-secondary",
                )}
              >
                <span role="cell" className="min-w-0 sm:table-cell sm:px-3 sm:py-1">
                  <button
                    type="button"
                    className="min-h-11 max-w-full rounded-sm text-left text-base font-semibold break-words text-foreground underline-offset-4 hover:underline"
                  >
                    {material.name}
                  </button>
                  {archived ? (
                    <span className="ml-2 inline-block rounded-sm border border-border px-1.5 text-xs font-semibold text-text-secondary">
                      {M.archivedTag}
                    </span>
                  ) : null}
                </span>
                <span role="cell" className="text-sm text-text-secondary sm:table-cell sm:px-3 sm:py-3">
                  {M.typeTag[material.type]}
                </span>
                <span
                  role="cell"
                  className={cn(
                    "col-span-2 text-sm text-text-secondary sm:table-cell sm:px-3 sm:py-3",
                    !material.supplier && "max-sm:hidden",
                  )}
                >
                  {material.supplier ?? M.noSupplier}
                </span>
                <span
                  role="cell"
                  className="col-span-2 text-sm text-text-secondary sm:table-cell sm:px-3 sm:py-3 sm:text-right sm:tabular-nums"
                >
                  <span className="sm:hidden">{M.usedIn(count)}</span>
                  <span className="max-sm:hidden">{count}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
