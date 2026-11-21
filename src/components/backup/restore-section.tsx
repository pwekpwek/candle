"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Notice } from "@/components/common/notice";
import { Button } from "@/components/ui/button";
import {
  MAX_BACKUP_BYTES,
  applyRestore,
  checkBackupText,
  deviceIdsOf,
  exportBackup,
  planRestore,
  readDeviceData,
} from "@/lib/backup";
import type {
  CheckFailure,
  ConflictPolicy,
  DeviceData,
  ExportedBackup,
  RestoreMode,
  RestorePlan,
} from "@/lib/backup";
import { MESSAGES, messageForCheckFailure, restoreSummary } from "@/lib/messages";
import { DATA_STORES, type BackupCounts, type BackupEnvelope } from "@/lib/types";
import { backupDatabase } from "./database";
import { downloadText } from "./download";
import { FocusRegion } from "./focus-region";
import { formatExportedAt } from "./format";
import { ReplaceDialog } from "./replace-dialog";

const B = MESSAGES.backup;
const S = MESSAGES.storage;

type Loaded = { envelope: BackupEnvelope; fileName: string };

/** The reasons `applyRestore` gives, plus "safety" for a failed first download. */
type FailReason = "busy" | "stale" | "storage" | "mismatch" | "no-safety" | "safety";

type Outcome =
  | { kind: "check"; failure: CheckFailure; key: number }
  | { kind: "storage"; key: number }
  | { kind: "done"; plan: RestorePlan; key: number }
  | { kind: "fail"; reason: FailReason; mode: RestoreMode; key: number };

const OPTION_ROW =
  "flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground pointer-coarse:min-h-11 has-disabled:cursor-not-allowed has-disabled:opacity-50";

function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  disabled,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="grid gap-1 border-0 p-0">
      <legend className="mb-1 text-sm font-semibold text-foreground">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className={OPTION_ROW}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function deviceCountsOf(device: DeviceData): BackupCounts {
  return {
    materials: device.materials.length,
    formulas: device.formulas.length,
    formulaVersions: device.formulaVersions.length,
    measurements: device.measurements.length,
    batches: device.batches.length,
    curePlans: device.curePlans.length,
    productionPlans: device.productionPlans.length,
    burnSessions: device.burnSessions.length,
    burnPhotos: device.burnPhotos.length,
  };
}

function tallyCounts(plan: RestorePlan, field: "identical" | "conflict"): BackupCounts {
  return {
    materials: plan.tally.materials[field],
    formulas: plan.tally.formulas[field],
    formulaVersions: plan.tally.formulaVersions[field],
    measurements: plan.tally.measurements[field],
    batches: plan.tally.batches[field],
    curePlans: plan.tally.curePlans[field],
    productionPlans: plan.tally.productionPlans[field],
    burnSessions: plan.tally.burnSessions[field],
    burnPhotos: plan.tally.burnPhotos[field],
  };
}

const total = (c: BackupCounts) => DATA_STORES.reduce((sum, store) => sum + c[store], 0);

/** The result sentences (PRD-26, Step 5), one per line. */
function resultLines(plan: RestorePlan): string[] {
  if (plan.mode === "replace") {
    return [B.replaceSummary(plan.fileName, plan.expectedCounts)];
  }
  const lines = [restoreSummary(plan)];
  const replaced = B.replacedSentence(plan.replaced);
  if (replaced) lines.push(replaced);
  if (plan.renumbered.length > 3) {
    lines.push(B.renumberedMany(plan.renumbered.length));
  } else {
    for (const r of plan.renumbered) {
      lines.push(B.renumberedSentence(r.formulaName, r.from, r.to));
    }
  }
  return lines;
}

function failText(reason: FailReason, mode: RestoreMode): string {
  switch (reason) {
    case "busy":
      return B.failBusy;
    case "stale":
      return B.failStale;
    case "storage":
      return B.failStorage;
    case "mismatch":
      return mode === "replace" ? B.failMismatchReplace : B.failMismatch;
    case "no-safety":
      return B.failNoSafety;
    case "safety":
      return B.safetyExportFailed;
  }
}

/** F7, PRD-25, PRD-26: choose a file, check it, preview, choose, restore, result. */
export function RestoreSection({
  onRestored,
  onBusyChange,
}: {
  onRestored: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [policy, setPolicy] = useState<ConflictPolicy>("keepDevice");
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const applyingRef = useRef(false);
  const token = useRef(0);
  const keyCounter = useRef(0);
  const nextKey = () => (keyCounter.current += 1);

  function clearAll() {
    token.current += 1; // drop any check or plan still in flight
    setLoaded(null);
    setPlan(null);
    setMode("merge");
    setPolicy("keepDevice");
    setChecking(false);
    setPlanning(false);
  }

  function storageProblem(error: unknown) {
    console.error(error);
    setOutcome({ kind: "storage", key: nextKey() });
  }

  async function onFile(file: File) {
    const mine = ++token.current;
    setOutcome(null);
    setLoaded(null);
    setPlan(null);
    setMode("merge");
    setPolicy("keepDevice");
    setChecking(true);
    const notBackup = () =>
      setOutcome({ kind: "check", failure: { code: "not-backup" }, key: nextKey() });
    try {
      if (file.size > MAX_BACKUP_BYTES) {
        notBackup();
        return;
      }
      let text: string;
      try {
        text = await file.text();
      } catch {
        if (mine === token.current) notBackup();
        return;
      }
      let device: DeviceData;
      try {
        device = await readDeviceData(backupDatabase());
      } catch (error) {
        if (mine === token.current) storageProblem(error);
        return;
      }
      const result = await checkBackupText(text, file.size, deviceIdsOf(device));
      if (mine !== token.current) return;
      if (!result.ok) {
        setOutcome({ kind: "check", failure: result.failure, key: nextKey() });
        return;
      }
      setLoaded({ envelope: result.envelope, fileName: file.name });
      setPlan(
        planRestore(result.envelope, device, {
          mode: "merge",
          policy: "keepDevice",
          fileName: file.name,
        }),
      );
    } finally {
      if (mine === token.current) setChecking(false);
    }
  }

  /** Plans again from a fresh read of the device. */
  async function replan(from: Loaded, nextMode: RestoreMode, nextPolicy: ConflictPolicy) {
    const mine = ++token.current;
    setPlanning(true);
    try {
      const device = await readDeviceData(backupDatabase());
      if (mine !== token.current) return;
      setPlan(
        planRestore(from.envelope, device, {
          mode: nextMode,
          policy: nextPolicy,
          fileName: from.fileName,
        }),
      );
    } catch (error) {
      if (mine === token.current) storageProblem(error);
    } finally {
      if (mine === token.current) setPlanning(false);
    }
  }

  function changeMode(next: RestoreMode) {
    if (!loaded || next === mode) return;
    setMode(next);
    setOutcome(null);
    void replan(loaded, next, policy);
  }

  function changePolicy(next: ConflictPolicy) {
    if (!loaded || next === policy) return;
    setPolicy(next);
    setOutcome(null);
    void replan(loaded, mode, next);
  }

  async function execute() {
    if (applyingRef.current || !plan || !loaded) return;
    applyingRef.current = true;
    setApplying(true);
    onBusyChange(true);
    setOutcome(null);
    const db = backupDatabase();
    try {
      let usePlan = plan;
      let safetyBackup: ExportedBackup | undefined;
      if (plan.mode === "replace") {
        // The backup of current data goes to the maker first (DATA-23).
        try {
          safetyBackup = await exportBackup(db);
          downloadText(safetyBackup.fileName, safetyBackup.json);
        } catch (error) {
          console.error(error);
          setOutcome({ kind: "fail", reason: "safety", mode: "replace", key: nextKey() });
          return;
        }
        // Plan again from data read after that export, so the stale check is current.
        try {
          const device = await readDeviceData(db);
          usePlan = planRestore(loaded.envelope, device, {
            mode: "replace",
            policy,
            fileName: loaded.fileName,
          });
        } catch (error) {
          storageProblem(error);
          return;
        }
      }
      const result = await applyRestore(db, usePlan, { safetyBackup });
      if (result.ok) {
        clearAll();
        setOutcome({ kind: "done", plan: result.plan, key: nextKey() });
        await onRestored().catch(() => {});
      } else {
        console.error(`Restore refused (${result.reason}): ${result.detail}`);
        setOutcome({ kind: "fail", reason: result.reason, mode: usePlan.mode, key: nextKey() });
        // After a mismatch the device changed, so the old plan no longer fits.
        if (result.reason === "mismatch") await replan(loaded, mode, policy);
      }
    } finally {
      applyingRef.current = false;
      setApplying(false);
      onBusyChange(false);
    }
  }

  function pressRestore() {
    if (!plan || applyingRef.current) return;
    if (plan.mode === "replace") setConfirmOpen(true);
    else void execute();
  }

  const disabled = applying || checking;
  const policyShown =
    plan !== null &&
    plan.mode === "merge" &&
    plan.tally.materials.conflict +
      plan.tally.formulas.conflict +
      plan.tally.measurements.conflict >
      0;

  function renderOutcome(o: Outcome): ReactNode {
    switch (o.kind) {
      case "check":
        return (
          <Notice
            variant="error"
            title={B.cantRestoreTitle}
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInput.current?.click()}
              >
                {B.chooseAnother}
              </Button>
            }
          >
            <span className="grid gap-1">
              <span>{messageForCheckFailure(o.failure)}</span>
              <span>{B.nothingChanged}</span>
            </span>
          </Notice>
        );
      case "storage":
        return (
          <Notice variant="error" title={S.blockedTitle}>
            <span className="grid gap-1">
              <span>{S.blockedWhatToTry}</span>
              <span>{B.nothingChanged}</span>
            </span>
          </Notice>
        );
      case "done":
        return (
          <Notice
            variant="success"
            title={B.resultTitle}
            action={
              <Button asChild variant="secondary">
                <Link href="/">{B.openSaved}</Link>
              </Button>
            }
          >
            <span className="grid gap-1">
              {resultLines(o.plan).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          </Notice>
        );
      case "fail":
        return (
          <Notice
            variant={o.reason === "mismatch" ? "error" : "warning"}
            title={o.reason === "safety" ? undefined : B.failTitle}
            action={
              o.reason === "stale" && loaded ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => {
                    setOutcome(null);
                    void replan(loaded, mode, policy);
                  }}
                >
                  {B.recheck}
                </Button>
              ) : undefined
            }
          >
            {failText(o.reason, o.mode)}
          </Notice>
        );
    }
  }

  return (
    <section aria-labelledby="restore-heading" className="grid gap-3 border-t border-border pt-6">
      <h2 id="restore-heading" className="text-base font-semibold text-foreground">
        {B.restoreHeading}
      </h2>
      <div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const input = event.target;
            const file = input.files?.[0];
            try {
              input.value = ""; // lets the same file be chosen again
            } catch {
              /* some browsers refuse; harmless */
            }
            if (file) void onFile(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          {B.chooseFile}
        </Button>
      </div>

      {checking ? (
        <p role="status" className="text-sm text-text-secondary">
          {B.checking}
        </p>
      ) : null}

      {outcome ? <FocusRegion key={outcome.key}>{renderOutcome(outcome)}</FocusRegion> : null}

      {loaded && plan ? (
        <div className="grid gap-4 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-1 text-sm tabular-nums">
            <p className="font-semibold break-all text-foreground">{loaded.fileName}</p>
            <p className="text-text-secondary">
              {B.exportedLine(
                formatExportedAt(loaded.envelope.exportedAt),
                plan.fileCounts.formulas,
                plan.fileCounts.formulaVersions,
              )}
            </p>
            {plan.mode === "replace" ? (
              <p className="text-foreground">{B.previewReplace(plan.added)}</p>
            ) : (
              <>
                <p className="text-foreground">{B.previewAdd(plan.added)}</p>
                {total(tallyCounts(plan, "identical")) > 0 ? (
                  <p className="text-text-secondary">
                    {B.previewAlreadyHere(tallyCounts(plan, "identical"))}
                  </p>
                ) : null}
                {total(tallyCounts(plan, "conflict")) > 0 ? (
                  <p className="text-text-secondary">
                    {B.previewConflicts(tallyCounts(plan, "conflict"))}
                  </p>
                ) : null}
                {plan.versionConflictsKept > 0 ? (
                  <p className="text-text-secondary">
                    {B.previewVersionConflicts(plan.versionConflictsKept)}
                  </p>
                ) : null}
                {plan.renumbered.length > 0 ? (
                  <p className="text-text-secondary">
                    {B.previewRenumbered(plan.renumbered.length)}
                  </p>
                ) : null}
              </>
            )}
            {plan.missingMaterialIds.length > 0 ? (
              <p className="text-text-secondary">
                {B.previewMissingMaterials(plan.missingMaterialIds.length)}
              </p>
            ) : null}
            {plan.burnChecks.datesBeforeBatch > 0 ? (
              <p className="text-text-secondary">
                {B.previewBurnDatesBeforeBatch(plan.burnChecks.datesBeforeBatch)}
              </p>
            ) : null}
            {plan.burnChecks.sharedPlannedTests > 0 ? (
              <p className="text-text-secondary">
                {B.previewSharedPlannedTests(plan.burnChecks.sharedPlannedTests)}
              </p>
            ) : null}
          </div>

          <RadioGroup
            legend={B.modeLegend}
            name="restore-mode"
            value={mode}
            disabled={disabled || planning}
            onChange={changeMode}
            options={[
              { value: "merge", label: B.addToWhatsHere },
              { value: "replace", label: B.replaceEverything },
            ]}
          />
          {policyShown ? (
            <RadioGroup
              legend={B.policyLegend}
              name="restore-policy"
              value={policy}
              disabled={disabled || planning}
              onChange={changePolicy}
              options={[
                { value: "keepDevice", label: B.keepDeviceCopy },
                { value: "useBackup", label: B.useBackupCopy },
              ]}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              busy={applying}
              disabled={planning || checking}
              onClick={pressRestore}
            >
              {B.restore}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                clearAll();
                setOutcome(null);
              }}
            >
              {B.cancel}
            </Button>
          </div>
          {applying ? (
            <p role="status" className="text-sm text-text-secondary">
              {B.dontCloseTab}
            </p>
          ) : null}
        </div>
      ) : null}

      {plan ? (
        <ReplaceDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          deviceCounts={deviceCountsOf(plan.basis.device)}
          onConfirm={() => {
            setConfirmOpen(false);
            void execute();
          }}
        />
      ) : null}
    </section>
  );
}
