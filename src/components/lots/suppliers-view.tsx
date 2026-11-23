"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { PlusIcon, StoreIcon } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getDataLayer } from "@/lib/db";
import type { SupplierListItem } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { SupplierForm, type SupplierOutcome } from "./supplier-form";
import {
  ArchivedTag,
  ConfirmDelete,
  RowActions,
  ShowArchivedToggle,
  StatusLine,
  codeOf,
  type Status,
} from "./shared";

const S = MESSAGES.suppliers;

type Loaded = { ok: true; items: SupplierListItem[] } | { ok: false };
type Editor = { kind: "add" } | { kind: "edit"; item: SupplierListItem } | null;

/** The supplier list (`/materials/suppliers`): add, edit, archive, delete when unused. */
export function SuppliersView() {
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [deleting, setDeleting] = useState<SupplierListItem | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      return { ok: true, items: await getDataLayer().suppliers.listItems() };
    } catch {
      return { ok: false };
    }
  }, [reload]);

  function openAdd() {
    setStatus(null);
    setEditor({ kind: "add" });
  }

  function onSaved(outcome: SupplierOutcome) {
    setStatus({
      variant: "success",
      name: outcome.supplier.name,
      text: outcome.kind === "added" ? S.addedDone : S.savedDone,
    });
    setEditor(null);
    setReload((n) => n + 1);
  }

  async function toggleArchive(item: SupplierListItem) {
    if (busyId) return;
    const archived = item.supplier.archivedAt !== null;
    setBusyId(item.supplier.id);
    setStatus(null);
    try {
      await getDataLayer().suppliers.setArchived(item.supplier.id, !archived);
      setStatus({
        variant: "success",
        name: item.supplier.name,
        text: archived ? S.unarchivedDone : S.archivedDone,
      });
    } catch {
      setStatus({ variant: "error", name: item.supplier.name, text: S.archiveFailed });
    } finally {
      setBusyId(null);
      setReload((n) => n + 1);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    await getDataLayer().suppliers.delete(deleting.supplier.id);
    setStatus({ variant: "success", name: deleting.supplier.name, text: S.deletedDone });
    setDeleting(null);
    setReload((n) => n + 1);
  }

  let body;
  if (loaded === undefined) {
    body = (
      <p role="status" className="text-sm text-text-secondary">
        {S.loading}
      </p>
    );
  } else if (!loaded.ok) {
    body = (
      <Notice
        variant="error"
        title={S.loadFailedTitle}
        action={
          <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
            {S.retry}
          </Button>
        }
      >
        {S.loadFailed}
      </Notice>
    );
  } else if (loaded.items.length === 0) {
    body = (
      <EmptyState
        icon={StoreIcon}
        title={S.empty.title}
        description={S.empty.description}
        action={<Button onClick={openAdd}>{S.empty.action}</Button>}
      />
    );
  } else {
    const visible = loaded.items.filter((i) => showArchived || i.supplier.archivedAt === null);
    body = (
      <>
        <div className="mb-4">
          <ShowArchivedToggle label={S.showArchived} checked={showArchived} onChange={setShowArchived} />
        </div>
        {visible.length === 0 ? (
          <p className="py-8 text-sm text-text-secondary">{S.allArchived}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((item) => {
              const { supplier } = item;
              const archived = supplier.archivedAt !== null;
              return (
                <li
                  key={supplier.id}
                  data-testid="supplier-row"
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:p-4",
                    archived && "text-text-secondary",
                  )}
                >
                  <div className="min-w-0">
                    <h2 className="inline text-base font-semibold break-words text-foreground">
                      {supplier.name}
                    </h2>
                    {archived ? <ArchivedTag>{S.archivedTag}</ArchivedTag> : null}
                    <p className="text-sm text-text-secondary">{S.lotCount(item.lotCount)}</p>
                    {item.batchCount > 0 ? (
                      <p className="text-sm text-text-secondary">{S.batchCount(item.batchCount)}</p>
                    ) : null}
                    {supplier.notes ? (
                      <p className="mt-1 text-sm break-words whitespace-pre-wrap text-text-secondary">
                        {supplier.notes}
                      </p>
                    ) : null}
                  </div>
                  <RowActions
                    labels={{
                      edit: S.edit,
                      archive: S.archive,
                      unarchive: S.unarchive,
                      delete: S.delete,
                      editLabel: S.editLabel(supplier.name),
                      archiveLabel: S.archiveLabel(supplier.name),
                      unarchiveLabel: S.unarchiveLabel(supplier.name),
                      deleteLabel: S.deleteLabel(supplier.name),
                      usedHint: S.usedHint,
                    }}
                    archived={archived}
                    canDelete={item.lotCount === 0 && item.batchCount === 0}
                    busy={busyId === supplier.id}
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
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  const suppliers = loaded?.ok ? loaded.items.map((i) => i.supplier) : [];
  const editing = editor?.kind === "edit" ? editor.item.supplier : null;

  return (
    <>
      <PageHeader
        title={S.title}
        description={S.description}
        action={
          <>
            <Button asChild variant="ghost">
              <Link href="/materials">{S.backToMaterials}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/materials/lots">{S.lotsLink}</Link>
            </Button>
            <Button onClick={openAdd}>
              <PlusIcon aria-hidden="true" strokeWidth={1.75} />
              {S.addSupplier}
            </Button>
          </>
        }
      />
      <StatusLine status={status} />
      {body}
      <Sheet open={editor !== null} onOpenChange={(open) => (open ? undefined : setEditor(null))}>
        <SheetContent side="responsive" aria-describedby={undefined} data-testid="supplier-editor">
          <SheetHeader>
            <SheetTitle>{editing ? S.editTitle : S.addTitle}</SheetTitle>
          </SheetHeader>
          {editor ? (
            <SupplierForm
              key={editing?.id ?? "add"}
              editing={editing}
              suppliers={suppliers}
              onDone={onSaved}
              onCancel={() => setEditor(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDelete
        open={deleting !== null}
        title={S.deleteTitle}
        body={deleting ? S.deleteBody(deleting.supplier.name) : ""}
        confirm={S.deleteConfirm}
        cancel={S.cancel}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        failureFor={(error) => (codeOf(error) === "in-use" ? S.deleteInUse : S.deleteFailed)}
      />
    </>
  );
}
