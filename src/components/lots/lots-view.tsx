"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { PlusIcon, TagIcon } from "lucide-react";
import { formatProducedOn } from "@/components/batches/text";
import { EmptyState } from "@/components/common/empty-state";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getDataLayer } from "@/lib/db";
import type { MaterialLotListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import type { Material, Supplier } from "@/lib/types";
import { materialFromParam } from "./form-model";
import { LotForm, type LotOutcome } from "./lot-form";
import {
  ArchivedTag,
  ConfirmDelete,
  RowActions,
  SELECT_CLASS,
  ShowArchivedToggle,
  StatusLine,
  codeOf,
  type Status,
} from "./shared";

const L = MESSAGES.lots;

type Loaded =
  | { ok: true; items: MaterialLotListItem[]; materials: Material[]; suppliers: Supplier[] }
  | { ok: false };
type Editor = { kind: "add" } | { kind: "edit"; item: MaterialLotListItem } | null;

interface LotsViewProps {
  /** The `?material=` value, or null. Unknown ids mean "all materials". */
  initialMaterialId: string | null;
}

/** The lot list (`/materials/lots`): filter by material, add, edit, archive, delete when unused. */
export function LotsView({ initialMaterialId }: LotsViewProps) {
  const [filter, setFilter] = useState(initialMaterialId ?? "");
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [deleting, setDeleting] = useState<MaterialLotListItem | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const [items, materials, suppliers] = await Promise.all([
        layer.materialLots.listItems(),
        layer.materials.list({ includeArchived: true }),
        layer.suppliers.list({ includeArchived: true }),
      ]);
      return { ok: true, items, materials, suppliers };
    } catch {
      return { ok: false };
    }
  }, [reload]);

  const materials = loaded?.ok ? loaded.materials : [];
  // An id that is not a material here (a stale link) is the same as no filter.
  const materialFilter = loaded?.ok ? materialFromParam(filter, materials.map((m) => m.id)) : filter;
  const filterMaterial = materials.find((m) => m.id === materialFilter);
  // New lots can only be added for a material that is not archived.
  const defaultMaterialId = filterMaterial && filterMaterial.archivedAt === null ? filterMaterial.id : "";

  function openAdd() {
    setStatus(null);
    setEditor({ kind: "add" });
  }

  function onSaved(outcome: LotOutcome) {
    setStatus({
      variant: "success",
      name: outcome.lot.code,
      text: outcome.kind === "added" ? L.addedDone : L.savedDone,
    });
    setEditor(null);
    setReload((n) => n + 1);
  }

  async function toggleArchive(item: MaterialLotListItem) {
    if (busyId) return;
    const archived = item.lot.archivedAt !== null;
    setBusyId(item.lot.id);
    setStatus(null);
    try {
      await getDataLayer().materialLots.setArchived(item.lot.id, !archived);
      setStatus({
        variant: "success",
        name: item.lot.code,
        text: archived ? L.unarchivedDone : L.archivedDone,
      });
    } catch {
      setStatus({ variant: "error", name: item.lot.code, text: L.archiveFailed });
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    await getDataLayer().materialLots.delete(deleting.lot.id);
    setStatus({ variant: "success", name: deleting.lot.code, text: L.deletedDone });
    setDeleting(null);
    setReload((n) => n + 1);
  }

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {L.loading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        title={L.loadFailedTitle}
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {L.retry}
          </Button>
        }
      >
        {L.loadFailed}
      </Notice>
    );
  } else if (loaded.items.length === 0) {
    body = (
      <EmptyState
        icon={TagIcon}
        title={L.empty.title}
        description={L.empty.description}
        action={<Button onClick={openAdd}>{L.empty.action}</Button>}
      />
    );
  } else {
    const byMaterial = loaded.items.filter(
      (i) => materialFilter === "" || i.lot.materialId === materialFilter,
    );
    const visible = byMaterial.filter((i) => showArchived || i.lot.archivedAt === null);
    body = (
      <>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <Field label={L.filterMaterialLabel} className="w-full sm:w-72">
            {(c) => (
              <select
                {...c}
                className={SELECT_CLASS}
                value={materialFilter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">{L.filterAllMaterials}</option>
                {loaded.materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <ShowArchivedToggle label={L.showArchived} checked={showArchived} onChange={setShowArchived} />
        </div>
        {visible.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {visible.map((item) => (
              <LotRow
                key={item.lot.id}
                item={item}
                busy={busyId === item.lot.id}
                onEdit={() => {
                  setStatus(null);
                  setEditor({ kind: "edit", item });
                }}
                onToggleArchive={() => void toggleArchive(item)}
                onDelete={() => {
                  setStatus(null);
                  setDeleting(item);
                }}
              />
            ))}
          </ul>
        ) : filterMaterial && byMaterial.length === 0 ? (
          <EmptyState
            icon={TagIcon}
            title={L.materialEmpty(filterMaterial.name)}
            action={
              filterMaterial.archivedAt === null ? <Button onClick={openAdd}>{L.addLot}</Button> : undefined
            }
          />
        ) : (
          <p className="py-8 text-sm text-text-secondary">{L.allArchived}</p>
        )}
      </>
    );
  }

  const editing = editor?.kind === "edit" ? editor.item.lot : null;

  return (
    <>
      <PageHeader
        title={L.title}
        description={L.description}
        action={
          <>
            <Button asChild variant="ghost">
              <Link href="/materials">{L.materialsLink}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/materials/suppliers">{L.suppliersLink}</Link>
            </Button>
            <Button onClick={openAdd}>
              <PlusIcon aria-hidden="true" strokeWidth={1.75} />
              {L.addLot}
            </Button>
          </>
        }
      />
      <StatusLine status={status} />
      {body}
      <Sheet open={editor !== null} onOpenChange={(open) => (open ? undefined : setEditor(null))}>
        <SheetContent side="responsive" aria-describedby={undefined} data-testid="lot-editor">
          <SheetHeader>
            <SheetTitle>{editing ? L.editTitle : L.addTitle}</SheetTitle>
          </SheetHeader>
          {editor && loaded?.ok ? (
            <LotForm
              key={editing?.id ?? "add"}
              editing={editing}
              materials={loaded.materials}
              suppliers={loaded.suppliers}
              lots={loaded.items.map((i) => i.lot)}
              defaultMaterialId={defaultMaterialId}
              onDone={onSaved}
              onCancel={() => setEditor(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDelete
        open={deleting !== null}
        title={L.deleteTitle}
        body={deleting ? L.deleteBody(deleting.lot.code) : ""}
        confirm={L.deleteConfirm}
        cancel={L.cancel}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        failureFor={(error) => (codeOf(error) === "in-use" ? L.deleteInUse : L.deleteFailed)}
      />
    </>
  );
}

function LotRow({
  item,
  busy,
  onEdit,
  onToggleArchive,
  onDelete,
}: {
  item: MaterialLotListItem;
  busy: boolean;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const { lot, material, supplier, batchCount } = item;
  const archived = lot.archivedAt !== null;
  return (
    <li
      data-testid="lot-row"
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:p-4",
        archived && "text-text-secondary",
      )}
    >
      <div className="min-w-0">
        <h2 className="inline text-base font-semibold break-words text-foreground">{lot.code}</h2>
        {archived ? <ArchivedTag>{L.archivedTag}</ArchivedTag> : null}
        <p className="text-sm break-words text-text-secondary">
          {material ? `${material.name} · ${MESSAGES.materials.typeTag[material.type]}` : "—"}
        </p>
        <p className="text-sm break-words text-text-secondary">{supplier ? supplier.name : L.noSupplier}</p>
        <p className="text-sm text-text-secondary">
          {lot.receivedOn ? L.received(formatProducedOn(lot.receivedOn)) : L.receivedUnknown}
        </p>
        <p className="text-sm text-text-secondary">{L.usedIn(batchCount)}</p>
        {lot.notes ? (
          <p className="mt-1 text-sm break-words whitespace-pre-wrap text-text-secondary">{lot.notes}</p>
        ) : null}
      </div>
      <RowActions
        labels={{
          edit: L.edit,
          archive: L.archive,
          unarchive: L.unarchive,
          delete: L.delete,
          editLabel: L.editLabel(lot.code),
          archiveLabel: L.archiveLabel(lot.code),
          unarchiveLabel: L.unarchiveLabel(lot.code),
          deleteLabel: L.deleteLabel(lot.code),
          usedHint: L.usedHint,
        }}
        archived={archived}
        canDelete={batchCount === 0}
        busy={busy}
        onEdit={onEdit}
        onToggleArchive={onToggleArchive}
        onDelete={onDelete}
      />
    </li>
  );
}
