"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { MoreHorizontalIcon } from "lucide-react";
import { Notice, type NoticeVariant } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { formatAbsoluteDate } from "@/lib/time";
import type { Formula, FormulaVersion, LinkedMaterial, MeasurementEntry } from "@/lib/types";
import { DeleteFormulaDialog, EditDetailsDialog } from "./detail-dialogs";
import { MeasuredSection } from "./measured-weights";
import { originHeader, sizingText } from "./text";
import { VersionHistory } from "./version-history";

const F = MESSAGES.formula;
const E = MESSAGES.editor;

export type FormulaDetailProps = {
  formulaId: string;
  /** Omit for the latest version (the formula page); pass an id for the version view. */
  versionId?: string;
};

type Loaded =
  | {
      status: "ok";
      formula: Formula;
      /** Highest number first. */
      versions: FormulaVersion[];
      /** materialId to the library's current name (archived materials included). */
      libraryNames: Map<string, string>;
    }
  | { status: "missing" }
  | { status: "error" };

type Note = { variant: NoticeVariant; text: string } | null;

/**
 * The formula page (latest version) and the read-only version view (F2, F3).
 * Planned figures are read from the saved version, never recalculated. The
 * Scale button (T21) goes in the actions row of `Header`, between Revise and
 * the more-actions menu.
 */
export function FormulaDetail({ formulaId, versionId }: FormulaDetailProps) {
  const [reload, setReload] = useState(0);
  const loaded = useLiveQuery<Loaded>(async () => {
    try {
      const layer = getDataLayer();
      const formula = await layer.formulas.get(formulaId);
      if (!formula) return { status: "missing" };
      const [versions, materials] = await Promise.all([
        layer.versions.listByFormula(formulaId),
        layer.materials.list({ includeArchived: true }),
      ]);
      return {
        status: "ok",
        formula,
        versions,
        libraryNames: new Map(materials.map((m) => [m.id, m.name])),
      };
    } catch {
      return { status: "error" };
    }
  }, [formulaId, reload]);

  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={F.loadingTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {F.loading}
        </p>
      </>
    );
  }

  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={F.loadingTitle} />
        <Notice
          variant="error"
          title={F.loadFailedTitle}
          action={
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              {F.tryAgain}
            </Button>
          }
        >
          {F.loadFailed}
        </Notice>
      </>
    );
  }

  if (loaded.status === "missing") return <NotFound versionView={false} />;

  const { formula, versions } = loaded;
  const version = versionId
    ? versions.find((v) => v.id === versionId)
    : (versions.find((v) => v.number === formula.latestVersionNumber) ?? versions[0]);
  if (!version) {
    return <NotFound versionView={versionId !== undefined} formulaId={formula.id} />;
  }

  return (
    <FormulaBody
      formula={formula}
      versions={versions}
      version={version}
      libraryNames={loaded.libraryNames}
      isVersionView={versionId !== undefined}
      onChanged={() => setReload((n) => n + 1)}
    />
  );
}

function NotFound({
  versionView,
  formulaId,
}: {
  versionView: boolean;
  formulaId?: string;
}) {
  return (
    <>
      <PageHeader title={versionView ? F.notFoundVersionTitle : F.notFoundTitle} />
      <p className="max-w-[44ch] text-sm text-text-secondary">{F.notFoundBody}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button asChild>
          <Link href="/">{E.backToSaved}</Link>
        </Button>
        {formulaId ? (
          <Button asChild variant="link">
            <Link href={`/formulas/${formulaId}`}>{F.openLatest}</Link>
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** What the maker is shown once a version has loaded. */
function FormulaBody({
  formula,
  versions,
  version,
  libraryNames,
  isVersionView,
  onChanged,
}: {
  formula: Formula;
  versions: FormulaVersion[];
  version: FormulaVersion;
  libraryNames: Map<string, string>;
  isVersionView: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [now] = useState(() => new Date());
  const [note, setNote] = useState<Note>(null);
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);

  const latest = versions[0];
  const here = isVersionView
    ? `/formulas/${formula.id}/versions/${version.id}`
    : `/formulas/${formula.id}`;

  // F1 step 6: "?saved=N" shows the confirmation once, then leaves the URL clean.
  const [savedVersion] = useState<number | null>(() => {
    const n = Number(searchParams.get("saved"));
    return searchParams.get("saved") !== null && Number.isInteger(n) && n > 0 ? n : null;
  });
  const hasSavedParam = searchParams.get("saved") !== null;
  useEffect(() => {
    if (hasSavedParam) router.replace(here);
  }, [hasSavedParam, router, here]);

  const [measurement, setMeasurement] = useState<
    | { state: "loading" }
    | { state: "error" }
    | { state: "ready"; entries: readonly MeasurementEntry[] }
  >({ state: "loading" });
  const [measurementTry, setMeasurementTry] = useState(0);
  useEffect(() => {
    let live = true;
    getDataLayer()
      .measurements.getForVersion(version.id)
      .then((record) => {
        if (live) setMeasurement({ state: "ready", entries: record?.entries ?? [] });
      })
      .catch(() => {
        if (live) setMeasurement({ state: "error" });
      });
    return () => {
      live = false;
    };
  }, [version.id, measurementTry]);

  async function toggleArchive() {
    const archiving = formula.archivedAt === null;
    try {
      await getDataLayer().formulas.setArchived(formula.id, archiving);
      setNote({
        variant: "success",
        text: archiving ? F.archivedDone : F.unarchivedDone,
      });
      onChanged();
    } catch {
      setNote({ variant: "error", text: F.archiveFailed });
    }
  }

  function focusFirstMeasured() {
    rootRef.current?.querySelector<HTMLInputElement>("[data-measured-input]")?.focus();
  }

  /** The library's current name, only when it differs from the snapshot (DATA-11). */
  const hintFor = (materialId: string, snapshotName: string): string | undefined => {
    const current = libraryNames.get(materialId);
    return current !== undefined && current !== snapshotName ? current : undefined;
  };
  const nowCalled: Record<string, string> = {};
  for (const c of [...version.inputs.waxes, ...version.inputs.oils]) {
    const hint = hintFor(c.materialId, c.snapshot.name);
    if (hint) nowCalled[c.componentId] = hint;
  }

  const summary = [
    F.headerVersion(version.number),
    originHeader(version, versions),
    formatAbsoluteDate(version.createdAt, now),
    sizingText(version.inputs.sizing, version.inputs.precisionMg),
  ]
    .filter((part) => part !== "")
    .join(F.detailSeparator);

  return (
    <div ref={rootRef}>
      <PageHeader
        title={formula.name}
        description={
          <>
            {summary}
            {formula.archivedAt !== null ? (
              <span className="ml-2 rounded-sm border border-border px-1.5 py-0.5 text-xs font-semibold text-text-secondary">
                {F.archivedBadge}
              </span>
            ) : null}
          </>
        }
        action={
          <>
            <Button asChild>
              <Link href={`/formulas/${formula.id}/revise?from=${version.id}`}>
                {F.revise}
              </Link>
            </Button>
            {/* T21: the Scale button goes here, between Revise and the menu. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={F.moreActions}>
                  <MoreHorizontalIcon aria-hidden="true" strokeWidth={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setDialog("edit")}>
                  {F.editDetails}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void toggleArchive()}>
                  {formula.archivedAt === null ? F.archive : F.unarchive}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDialog("delete")}
                >
                  {F.deletePermanently}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {note ? (
          <Notice variant={note.variant}>{note.text}</Notice>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {savedVersion !== null ? (
          <Notice
            variant="success"
            title={E.savedAsVersion(savedVersion)}
            action={
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                <Button variant="outline" size="sm" onClick={focusFirstMeasured}>
                  {E.enterMeasured}
                </Button>
                <Button asChild variant="link" size="sm">
                  <Link href="/">{E.backToSaved}</Link>
                </Button>
              </div>
            }
          />
        ) : null}
        {version.id !== latest.id ? (
          <Notice
            variant="info"
            action={
              <Button asChild variant="link" size="sm">
                <Link href={`/formulas/${formula.id}`}>{F.openLatest}</Link>
              </Button>
            }
          >
            {F.notLatestNotice(version.number, latest.number)}
          </Notice>
        ) : null}
      </div>

      {measurement.state === "ready" ? (
        <MeasuredSection
          key={version.id}
          version={version}
          initialEntries={measurement.entries}
          nowCalled={nowCalled}
        />
      ) : measurement.state === "error" ? (
        <Notice
          variant="error"
          title={F.loadFailedTitle}
          className="mt-6"
          action={
            <Button variant="outline" onClick={() => setMeasurementTry((n) => n + 1)}>
              {F.tryAgain}
            </Button>
          }
        >
          {F.loadFailed}
        </Notice>
      ) : (
        <p role="status" className="mt-6 text-sm text-text-secondary">
          {F.loading}
        </p>
      )}

      <DetailsSection
        formula={formula}
        version={version}
        hintFor={hintFor}
        className="mt-8"
      />

      <VersionHistory
        formula={formula}
        versions={versions}
        currentId={version.id}
        now={now}
        className="mt-8"
      />

      <EditDetailsDialog
        formula={formula}
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
        onSaved={() => {
          setNote({ variant: "success", text: F.detailsSaved });
          onChanged();
        }}
      />
      <DeleteFormulaDialog
        formula={formula}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onDeleted={() => router.replace("/")}
      />
    </div>
  );
}

function DetailsSection({
  formula,
  version,
  hintFor,
  className,
}: {
  formula: Formula;
  version: FormulaVersion;
  hintFor: (materialId: string, snapshotName: string) => string | undefined;
  className?: string;
}) {
  const headingId = useId();
  const linked = (item: LinkedMaterial | null) => {
    if (item === null) return F.noneSet;
    const hint = hintFor(item.materialId, item.snapshot.name);
    return (
      <>
        {item.snapshot.name}
        {hint ? (
          <span className="ml-2 text-xs text-muted-foreground">{F.nowCalled(hint)}</span>
        ) : null}
      </>
    );
  };
  const rows: { label: string; value: ReactNode }[] = [
    { label: E.wickLabel, value: linked(version.inputs.wick) },
    { label: E.vesselLabel, value: linked(version.inputs.vessel) },
  ];
  if (version.inputs.notes) {
    rows.push({ label: F.versionNotesLabel, value: version.inputs.notes });
  }
  if (version.changeNote) {
    rows.push({ label: F.changeNoteLabel, value: version.changeNote });
  }
  if (formula.notes) {
    rows.push({ label: F.formulaNotesLabel, value: formula.notes });
  }
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="mb-2 text-lg font-semibold">
        {F.detailsHeading}
      </h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-text-secondary">{row.label}</dt>
            <dd className="min-w-0 wrap-anywhere whitespace-pre-wrap">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
