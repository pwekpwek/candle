"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { batchTitle } from "@/components/batches/text";
import { Field } from "@/components/common/field";
import { Notice } from "@/components/common/notice";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseWholeNumber } from "@/lib/cost";
import { DataError, getDataLayer } from "@/lib/db";
import type { CreateCostSheetRequest } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { MAX_CANDLES, MAX_COST_SHEET_TITLE_LENGTH } from "@/lib/types";
import { sheetHref } from "./text";

const M = MESSAGES.cost;

type Basis = { kind: "version"; id: string } | { kind: "batch"; id: string };

type Source = {
  description: string;
  /** Prefilled candle counts (batch counts, or the vessel count of a vessel-sized version). */
  candles: string;
  sellable: string | null;
  hint: string | undefined;
};

type Loaded = { status: "ok"; source: Source } | { status: "missing" } | { status: "error" };

type Errors = { title?: string; candles?: string; sellable?: string };

async function loadSource(basis: Basis): Promise<Loaded> {
  try {
    const layer = getDataLayer();
    if (basis.kind === "batch") {
      const item = await layer.batches.get(basis.id);
      if (!item) return { status: "missing" };
      const { batch } = item;
      return {
        status: "ok",
        source: {
          description: M.newDescriptionBatch(batchTitle(batch)),
          candles: batch.candlesMade === undefined ? "" : String(batch.candlesMade),
          sellable: batch.sellable === undefined ? null : String(batch.sellable),
          hint: undefined,
        },
      };
    }
    const version = await layer.versions.get(basis.id);
    if (!version) return { status: "missing" };
    const formula = await layer.formulas.get(version.formulaId);
    if (!formula) return { status: "missing" };
    const sizing = version.inputs.sizing;
    const vessels = sizing.mode === "vessels" ? sizing.count : null;
    return {
      status: "ok",
      source: {
        description: M.newDescriptionVersion(version.number, formula.name),
        candles: vessels === null ? "" : String(vessels),
        sellable: null,
        hint: vessels === null ? undefined : M.candlesHintVessels(vessels),
      },
    };
  } catch {
    return { status: "error" };
  }
}

/** `/costs/new?version=<id>` or `?batch=<id>`: title, candles made and sellable. */
export function NewCostSheet({ versionId, batchId }: { versionId: string; batchId: string }) {
  const basis: Basis | null = batchId ? { kind: "batch", id: batchId } : versionId ? { kind: "version", id: versionId } : null;
  const basisKind = basis?.kind ?? null;
  const basisId = basis?.id ?? null;
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);

  useEffect(() => {
    if (basisKind === null || basisId === null) return;
    let live = true;
    void loadSource({ kind: basisKind, id: basisId }).then((result) => {
      if (live) setLoaded(result);
    });
    return () => {
      live = false;
    };
  }, [basisKind, basisId, reload]);

  if (basisKind === null || basisId === null) {
    return (
      <>
        <PageHeader title={M.newMissingTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{M.newNoBasisBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/costs">{M.backToSheets}</Link>
          </Button>
        </div>
      </>
    );
  }
  if (loaded === undefined) {
    return (
      <>
        <PageHeader title={M.newTitle} />
        <p role="status" className="text-sm text-text-secondary">
          {M.newLoading}
        </p>
      </>
    );
  }
  if (loaded.status === "error") {
    return (
      <>
        <PageHeader title={M.newTitle} />
        <Notice
          variant="error"
          action={
            <Button variant="outline" onClick={() => setReload((n) => n + 1)}>
              {M.tryAgain}
            </Button>
          }
        >
          {M.newLoadFailed}
        </Notice>
      </>
    );
  }
  if (loaded.status === "missing") {
    return (
      <>
        <PageHeader title={M.newMissingTitle} />
        <p className="max-w-[44ch] text-sm text-text-secondary">{M.newMissingBody}</p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/costs">{M.backToSheets}</Link>
          </Button>
        </div>
      </>
    );
  }
  return <NewForm basis={{ kind: basisKind, id: basisId }} source={loaded.source} />;
}

function NewForm({ basis, source }: { basis: Basis; source: Source }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Chosen before the first attempt and reused on every retry, so a retry cannot make a second sheet.
  const [sheetId] = useState(() => crypto.randomUUID());
  const submitting = useRef(false);

  const [title, setTitle] = useState("");
  const [candles, setCandles] = useState(source.candles);
  // null: Sellable follows Candles made until the maker types in it.
  const [sellableTyped, setSellableTyped] = useState<string | null>(source.sellable);
  const sellable = sellableTyped ?? candles;
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  useEffect(() => {
    if (focusTick === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick]);

  function validate(): { errors: Errors; candles?: number; sellable?: number } {
    const found: Errors = {};
    if (title.trim().length > MAX_COST_SHEET_TITLE_LENGTH) found.title = M.errTitleLong(MAX_COST_SHEET_TITLE_LENGTH);
    const c = parseWholeNumber(candles, 1, MAX_CANDLES);
    if (!c.ok) {
      found.candles =
        c.reason === "empty" ? M.errCandlesRequired : c.reason === "format" ? M.errCandlesWhole : M.errCandlesRange(MAX_CANDLES);
    }
    const s = parseWholeNumber(sellable, 0, MAX_CANDLES);
    if (!s.ok) {
      found.sellable =
        s.reason === "empty" ? M.errSellableRequired : s.reason === "format" ? M.errSellableWhole : M.errCandlesRange(MAX_CANDLES);
    } else if (c.ok && s.value > c.value) {
      found.sellable = M.errSellableOver;
    }
    return { errors: found, ...(c.ok ? { candles: c.value } : {}), ...(s.ok ? { sellable: s.value } : {}) };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const result = validate();
    setErrors(result.errors);
    setFailure(null);
    if (Object.keys(result.errors).length > 0 || result.candles === undefined || result.sellable === undefined) {
      setFocusTick((n) => n + 1);
      return;
    }
    submitting.current = true;
    setBusy(true);
    const trimmed = title.trim();
    const request: CreateCostSheetRequest = {
      sheetId,
      basis: basis.kind === "batch" ? { kind: "batch", batchId: basis.id } : { kind: "version", versionId: basis.id },
      ...(trimmed ? { title: trimmed } : {}),
      candlesMade: result.candles,
      sellable: result.sellable,
    };
    try {
      await getDataLayer().costSheets.create(request);
      router.push(`${sheetHref(sheetId)}/edit`);
    } catch (error) {
      setFailure(error instanceof DataError && error.code === "invalid" ? M.createInvalid : M.createFailed);
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={M.newTitle} description={source.description} />
      <form ref={formRef} onSubmit={submit} noValidate className="grid max-w-md gap-4">
        {failure ? <Notice variant="error">{failure}</Notice> : null}
        <Field label={M.titleLabel} hint={M.titleHint} error={errors.title}>
          {(c) => <Input {...c} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label={M.candlesLabel} hint={source.hint ?? M.candlesHint} error={errors.candles}>
          {(c) => (
            <Input {...c} inputMode="numeric" value={candles} onChange={(e) => setCandles(e.target.value)} />
          )}
        </Field>
        <Field label={M.sellableLabel} hint={M.sellableHint} error={errors.sellable}>
          {(c) => (
            <Input {...c} inputMode="numeric" value={sellable} onChange={(e) => setSellableTyped(e.target.value)} />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" busy={busy}>
            {M.createButton}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/costs">{M.cancel}</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
