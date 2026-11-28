"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { PlusIcon, TagsIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import {
  ArchivedTag,
  ConfirmDelete,
  RowActions,
  ShowArchivedToggle,
  StatusLine,
  type Status,
} from "@/components/lots/shared";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatUnitPrice, fraction } from "@/lib/cost";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import type { CostItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ItemForm, type ItemOutcome } from "./item-form";

const C = MESSAGES.costItems;

type Loaded = { ok: true; items: CostItem[] } | { ok: false };
type Editor = { kind: "add" } | { kind: "edit"; item: CostItem } | null;

/** Packaging and other items (`/materials/items`): add, edit, archive, delete. */
export function ItemsView() {
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [deleting, setDeleting] = useState<{ item: CostItem; sheets: number } | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, items: await getDataLayer().costItems.list({ includeArchived: true }) };
    } catch {
      return { ok: false };
    }
  }, [reload]);

  function openAdd() {
    setStatus(null);
    setEditor({ kind: "add" });
  }

  function onSaved(outcome: ItemOutcome) {
    setStatus({
      variant: "success",
      name: outcome.item.name,
      text: outcome.kind === "added" ? C.addedDone : C.savedDone,
    });
    setEditor(null);
    setReload((n) => n + 1);
  }

  async function toggleArchive(item: CostItem) {
    if (busyId) return;
    const archived = item.archivedAt !== null;
    setBusyId(item.id);
    setStatus(null);
    try {
      await getDataLayer().costItems.setArchived(item.id, !archived);
      setStatus({
        variant: "success",
        name: item.name,
        text: archived ? C.unarchivedDone : C.archivedDone,
      });
    } catch {
      setStatus({ variant: "error", name: item.name, text: C.archiveFailed });
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  }

  async function askDelete(item: CostItem) {
    setStatus(null);
    let sheets = 0;
    try {
      sheets = (await getDataLayer().costItems.usage(item.id)).sheets;
    } catch {
      // The count only words the confirmation; the delete itself is checked by the data layer.
    }
    setDeleting({ item, sheets });
  }

  async function confirmDelete() {
    if (!deleting) return;
    await getDataLayer().costItems.delete(deleting.item.id);
    setStatus({ variant: "success", name: deleting.item.name, text: C.deletedDone });
    setDeleting(null);
    setReload((n) => n + 1);
  }

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {C.loading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        title={C.loadFailedTitle}
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {C.retry}
          </Button>
        }
      >
        {C.loadFailed}
      </Notice>
    );
  } else if (loaded.items.length === 0) {
    body = (
      <EmptyState
        icon={TagsIcon}
        title={C.empty.title}
        description={C.empty.description}
        action={<Button onClick={openAdd}>{C.empty.action}</Button>}
      />
    );
  } else {
    const visible = loaded.items.filter((i) => showArchived || i.archivedAt === null);
    body = (
      <>
        <div className="mb-4">
          <ShowArchivedToggle label={C.showArchived} checked={showArchived} onChange={setShowArchived} />
        </div>
        {visible.length === 0 ? (
          <p className="py-8 text-sm text-text-secondary">{C.allArchived}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onEdit={() => {
                  setStatus(null);
                  setEditor({ kind: "edit", item });
                }}
                onToggleArchive={() => void toggleArchive(item)}
                onDelete={() => void askDelete(item)}
              />
            ))}
          </ul>
        )}
      </>
    );
  }

  const editing = editor?.kind === "edit" ? editor.item : null;

  return (
    <>
      <PageHeader
        title={C.title}
        description={C.description}
        action={
          <>
            <Button asChild variant="ghost">
              <Link href="/materials">{C.materialsLink}</Link>
            </Button>
            <Button onClick={openAdd}>
              <PlusIcon aria-hidden="true" strokeWidth={1.75} />
              {C.addItem}
            </Button>
          </>
        }
      />
      <StatusLine status={status} />
      {body}
      <Sheet open={editor !== null} onOpenChange={(open) => (open ? undefined : setEditor(null))}>
        <SheetContent side="responsive" aria-describedby={undefined} data-testid="item-editor">
          <SheetHeader>
            <SheetTitle>{editing ? C.editTitle : C.addTitle}</SheetTitle>
          </SheetHeader>
          {editor && loaded?.ok ? (
            <ItemForm
              key={editing?.id ?? "add"}
              editing={editing}
              items={loaded.items}
              onDone={onSaved}
              onCancel={() => setEditor(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDelete
        open={deleting !== null}
        title={C.deleteTitle}
        body={deleting ? C.deleteBody(deleting.item.name, deleting.sheets) : ""}
        confirm={C.deleteConfirm}
        cancel={C.cancel}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        failureFor={() => C.deleteFailed}
      />
    </>
  );
}

function ItemRow({
  item,
  busy,
  onEdit,
  onToggleArchive,
  onDelete,
}: {
  item: CostItem;
  busy: boolean;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const archived = item.archivedAt !== null;
  return (
    <li
      data-testid="item-row"
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:p-4",
        archived && "text-text-secondary",
      )}
    >
      <div className="min-w-0">
        <h2 className="inline text-base font-semibold break-words text-foreground">{item.name}</h2>
        {archived ? <ArchivedTag>{C.archivedTag}</ArchivedTag> : null}
        <p data-testid="item-price" className="text-sm text-text-secondary tabular-nums">
          {formatUnitPrice(fraction(item.unitCentavos), "piece")}
        </p>
        {item.notes ? (
          <p className="mt-1 text-sm break-words whitespace-pre-wrap text-text-secondary">{item.notes}</p>
        ) : null}
      </div>
      <RowActions
        labels={{
          edit: C.edit,
          archive: C.archive,
          unarchive: C.unarchive,
          delete: C.delete,
          editLabel: C.editLabel(item.name),
          archiveLabel: C.archiveLabel(item.name),
          unarchiveLabel: C.unarchiveLabel(item.name),
          deleteLabel: C.deleteLabel(item.name),
          usedHint: "",
        }}
        archived={archived}
        canDelete
        busy={busy}
        onEdit={onEdit}
        onToggleArchive={onToggleArchive}
        onDelete={onDelete}
      />
    </li>
  );
}
