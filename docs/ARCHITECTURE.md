# CandleLab Studio — Architecture and File Ownership (v0.1 to v0.3 CandleFix)

Read this before any task. The specs are in `docs/specs/`. The task list is `docs/specs/6 Implementation Plan.md`. Progress is in `docs/BUILD-STATE.md`.

## Ground rules

1. **Next.js here is version 16 and differs from older versions.** Before writing route or config code, read the relevant guide under `node_modules/next/dist/docs/` (see `AGENTS.md`).
2. **Contracts are fixed.** `src/lib/types.ts` and the three `contract.ts` files are the interfaces every module is written against. Do not edit them. If one is wrong or incomplete, stop and report it to the orchestrator.
3. **Stay in your files.** Each task owns the files listed below. Do not edit another task's files, `package.json`, `package-lock.json`, the tokens, or the specs. Do not run `npm install` unless your task says so. If you need a change elsewhere, report it.
4. **Client-only data (TRD-01).** Every page that reads or writes formulas is a client component (`"use client"`). No route handler, server action or server component touches formula data. No environment variables. No third-party scripts, analytics or remote requests (TRD-05, PRD-03).
5. **One calculation path (TRD-03).** All arithmetic comes from `@/lib/gramguard`. No screen does its own maths, rounding or number formatting.
6. **Only `@/lib/db` and `@/lib/backup` touch IndexedDB (TRD-04).**
7. **Wording (PRD-32).** User-facing text comes from `@/lib/messages`. Nothing may state or imply that a candle, fragrance level or wick is safe or compliant.
8. **Design.** Follow `docs/design/blueprint.md`. Token names only, never raw colour values. Check every screen at 375px.
9. **Done means:** `npm run lint`, `npm run typecheck` and `npm test` pass, and your acceptance check is met. Do not commit. The orchestrator reviews and commits each wave.
10. **Never claim a check you did not run.** Report commands and real results.

## Conventions

- Imports use the `@/` alias for `src/`.
- Quantities are integers: milligrams (`…Mg`), hundredths of a percent (`…Bp` for requested percentages, `…X100` for computed ones), hundredths of a part (`…X100`).
- Minus signs in formatted output are the ASCII hyphen-minus.
- Tests live in `tests/unit/<area>/*.test.ts(x)`. Data-layer tests import `fake-indexeddb/auto` and open a uniquely named database per test.
- End-to-end selectors: prefer roles and labels. Where a stable hook is needed use `data-testid` in kebab case.

## Modules and owners

| Path | Owner | Contents |
| --- | --- | --- |
| `src/lib/types.ts` | T02 | Record types, constants |
| `src/lib/gramguard/contract.ts` | T02 | Engine types and signatures |
| `src/lib/db/contract.ts` | T02 | Data-layer interfaces |
| `src/lib/backup/contract.ts` | T02 | Backup and restore signatures |
| `src/app/tokens.css`, `src/app/globals.css`, `docs/design/blueprint.md` | T02b | Design tokens |
| `src/components/ui/*`, `src/components/shell/*`, `src/components/common/*`, `src/app/layout.tsx`, route skeleton `page.tsx` files, `src/lib/utils.ts`, `src/lib/time.ts`, `components.json` | T03 | shadcn/ui, app shell, shared UI pieces |
| `src/lib/schemas/*` | T04 | Zod schemas |
| `src/lib/messages.ts` | T05 | Every user-facing message |
| `tests/fixtures/worked-examples.ts` | T06 | WE-1 to WE-13 as data |
| `tests/unit/gramguard/*` | T07 | Engine tests |
| `src/lib/gramguard/{fixed,format,plan}.ts`, `index.ts` | T08 | Parsing, formatting, planning |
| `src/lib/gramguard/{measure,scale,validate,from-version}.ts` (and exports added to `index.ts`) | T09 | Measured comparison, scaling, validation |
| `src/lib/db/{db,errors,materials,formulas,drafts,meta,example,index}.ts`, `tests/unit/db/*` | T10 | Dexie schema and repositories |
| `src/lib/db/{versions,measurements}.ts` (wired into `index.ts`), `tests/unit/db/versions*.test.ts` | T11 | Version save, measurements, delete |
| `src/lib/backup/{canonical,export}.ts`, `index.ts` | T12 | Backup export |
| `tests/fixtures/backups/*` | T13 | Good and malformed backup files |
| `src/lib/backup/{check,plan}.ts` | T14 | Restore checks and plan |
| `src/lib/backup/apply.ts` | T15 | Restore apply |
| `src/components/materials/*`, `src/app/materials/page.tsx` | T16 | Material library, picker |
| `src/components/results/*` | T17 | Results panel |
| `src/components/editor/*`, `src/app/formulas/new/page.tsx`, `src/app/formulas/[formulaId]/revise/page.tsx` | T18 | Formula editor |
| `src/components/formulas/list/*`, `src/app/page.tsx` | T19 | Saved formulas list |
| `src/components/formulas/detail/*`, `src/app/formulas/[formulaId]/page.tsx`, `…/versions/[versionId]/page.tsx` | T20 | Formula page, version view, measured weights |
| `src/components/scale/*` | T21 | Scale dialog, revise wiring |
| `src/components/backup/*`, `src/app/backup/page.tsx` | T22 | Backup and restore page |
| `tests/e2e/*` | T23, T24 | Playwright flows |
| `src/lib/db/batches.ts`, batch parts of `src/lib/{types.ts,db,backup,schemas}` | v0.2 BatchTrace | Batch record, schema 2, backup format 2 |
| `src/components/batches/*`, `src/app/batches/**` | v0.2 BatchTrace | Batch screens |
| `src/lib/db/{cure-plans,production-plans,schedule}.ts`, CurePilot parts of `src/lib/{types.ts,db,backup,schemas}`, `src/lib/schedule/contract.ts` | v0.2 CurePilot (lead) | Cure plans, planned production, schema 3, backup format 3 |
| `src/lib/schedule/{dates,schedule,index}.ts` | v0.2 CurePilot | Pure date and schedule logic |
| `src/components/schedule/**`, `src/app/schedule/**`, `src/app/batches/[batchId]/cure-plan/**` | v0.2 CurePilot | Curing section, cure-plan editor, planned production, Schedule page, nav count |
| `src/lib/db/{burn-sessions,burn-photos}.ts`, `src/lib/backup/photos.ts`, `src/lib/schemas/burn.ts`, BurnMatrix parts of `src/lib/{types.ts,db,backup}`, `src/lib/burnmatrix/contract.ts`, `src/lib/photos/contract.ts` | v0.2 BurnMatrix (lead) | Burn sessions and photos, schema 4, backup format 4, contracts |
| `src/lib/burnmatrix/{calc,comparison,csv,index}.ts` | v0.2 BurnMatrix | Weight loss, rates, totals, comparison model, CSV |
| `src/lib/photos/{prepare,index}.ts`, `src/components/burn/photos/**` | v0.2 BurnMatrix | Photo shrinking and the photo gallery |
| `src/components/burn/session/**`, `src/app/burn-tests/new/**`, `src/app/burn-tests/[sessionId]/page.tsx`, `src/app/burn-tests/[sessionId]/edit/**` | v0.2 BurnMatrix | Burn tests section on the batch page, session editor and page |
| `src/components/burn/{compare,report,list,export}/**`, `src/app/burn-tests/page.tsx`, `src/app/burn-tests/compare/**`, `src/app/burn-tests/[sessionId]/report/**` | v0.2 BurnMatrix | Burn tests list, comparison, printable reports, CSV download, backup file size |
| `src/lib/db/{suppliers,material-lots,batch-trace}.ts`, lot links in `src/lib/db/batches.ts`, `src/lib/schemas/lots.ts`, v0.3 parts of `src/lib/{types.ts,db,backup,schemas}`, `src/lib/batchtrace/contract.ts` | v0.3 lots (lead) | Suppliers, lots, batch lot links, schema 5, backup format 5, contract |
| `src/lib/batchtrace/{query,csv,index}.ts` | v0.3 lots | Batch search, filters, URL state, batch CSV |
| `src/components/lots/**`, `src/app/materials/{lots,suppliers}/**`, links in `src/components/materials/materials-view.tsx` | v0.3 lots | Suppliers and lots in the material library |
| `src/components/batches/**`, `src/app/batches/**` (v0.3 parts) | v0.3 lots | Lot pickers in the batch form, Lots on the batch page, search, filters and CSV on the Batches list |
| `src/lib/db/{investigations,investigation-photos,corrective-experiments}.ts`, CandleFix parts of `src/lib/{types.ts,db,backup,schemas}` (`src/lib/schemas/candlefix.ts`), `src/lib/candlefix/contract.ts` | v0.3 CandleFix (lead) | Investigations, their photos, corrective experiments, schema 6, backup format 6, integrity links, contracts |
| `src/lib/candlefix/{checklists,comparison,timeline,index}.ts`, `MESSAGES.candleFixChecks` | v0.3 CandleFix | Built-in things to check, before-and-after model, timeline |
| `src/components/candlefix/{investigation/**,batch-section.tsx,index.ts}`, `src/app/investigations/new/**`, `src/app/investigations/[investigationId]/page.tsx`, `…/edit/**`, generalised `src/components/burn/photos/**` | v0.3 CandleFix | Investigations section on the batch page, investigation editor and page, photos |
| `src/components/candlefix/{experiments,compare,list}/**`, `src/app/investigations/page.tsx`, `…/experiments/**`, `…/compare/**` | v0.3 CandleFix | Corrective experiments, before-and-after view, all-investigations list |

## Routes

| Route | Screen |
| --- | --- |
| `/` | Saved formulas |
| `/formulas/new` | Editor (new). `?example=1` starts from the example |
| `/formulas/[formulaId]` | Formula page, latest version |
| `/formulas/[formulaId]/versions/[versionId]` | Read-only version view |
| `/formulas/[formulaId]/revise?from=[versionId]` | Editor (revise) |
| `/materials` | Material library |
| `/backup` | Backup and restore |
| `/batches` | Batches list (v0.2). v0.3: search and filters in the URL (`?q=&formula=&from=&to=&lot=&supplier=&cure=yes\|no&burn=yes\|no`), Export CSV |
| `/materials/lots` | Lots of library materials, `?material=[materialId]` filters (v0.3) |
| `/materials/suppliers` | Suppliers (v0.3) |
| `/batches/new?version=[versionId]` | Create batch from a saved version (v0.2) |
| `/batches/[batchId]` | Batch detail and edit, with its Curing section (v0.2) |
| `/batches/[batchId]/cure-plan` | Cure-plan editor (v0.2 CurePilot) |
| `/schedule` | Schedule: overdue, due today, upcoming, done (v0.2 CurePilot) |
| `/schedule/plan/new?version=[versionId]` | Plan production of a saved version (v0.2 CurePilot) |
| `/schedule/plan/[planId]` | Planned production entry: edit, delete, Create batch (v0.2 CurePilot) |
| `/batches/new?version=[versionId]&plan=[planId]` | Create batch from a planned production entry (v0.2 CurePilot) |
| `/burn-tests` | All burn tests, pick up to 4 to compare (v0.2 BurnMatrix) |
| `/burn-tests/new?batch=[batchId]` | Record a burn test for a batch (v0.2 BurnMatrix) |
| `/burn-tests/[sessionId]` | Burn test: candles, burns, figures, photos (v0.2 BurnMatrix) |
| `/burn-tests/[sessionId]/edit` | Edit a burn test (v0.2 BurnMatrix) |
| `/burn-tests/[sessionId]/report` | Printable report of one burn test (v0.2 BurnMatrix) |
| `/burn-tests/compare?sessions=a,b,c,d` | Comparison of 1 to 4 burn tests (v0.2 BurnMatrix) |
| `/burn-tests/compare/report?sessions=…` | Printable comparison report (v0.2 BurnMatrix) |
| `/investigations` | All investigations, `?archived=1` shows archived ones; reached from the Batches page header (v0.3 CandleFix) |
| `/investigations/new?batch=[batchId]` | Record an issue on a batch (v0.3 CandleFix) |
| `/investigations/[investigationId]` | Investigation: observed issues, photos, things to check, hypotheses, corrective experiments, timeline (v0.3 CandleFix) |
| `/investigations/[investigationId]/edit` | Edit an investigation (v0.3 CandleFix) |
| `/investigations/[investigationId]/experiments/new?hypothesis=[hypothesisId]` | New corrective experiment (v0.3 CandleFix) |
| `/investigations/[investigationId]/experiments/[experimentId]` | Edit or delete a corrective experiment (v0.3 CandleFix) |
| `/investigations/[investigationId]/compare` | Before-and-after view (v0.3 CandleFix) |

## Decisions made during the build

Recorded here as they are made, then written back into the spec and the handoff note.

- **D-15 (dark mode):** light and dark tokens together, follow the device setting, no in-app toggle.
- **CALC-13 scope:** the rounding warning looks at the fragrance total only. The rule text also says "or any component", but worked example WE-7 at 0.1 g (a component moved 3.6%, no warning) and the warning's own wording only fit the fragrance total. The worked examples are the test vectors, so they win.
- **Requested versus computed percentages:** a percentage the maker typed shows as typed ("8%", "8.25%"). A computed percentage always shows 2 decimals ("7.41%"), per CALC-11.
- **Draft shape:** `Draft.fields` holds the editor's typed field object rather than a flat string map. The Data Model marks its field names as indicative, and drafts are never exported.
- **Formula conflicts on restore** compare name, notes and archived state only. `latestVersionNumber` and timestamps are bookkeeping.
- **Editor notes** are stored on the version (`inputs.notes`). The formula's own notes are edited on the formula page (PRD-17).
- **"Start from an example"** adds four example materials to the library and opens the editor pre-filled with worked example WE-5. Nothing is saved until the maker presses Save.
- **Result-level errors (V-14, V-15)** show their message in the results panel in place of figures.
- **CALC-17 note (wave 4):** the "oils ignored" note appears only when fragrance is 0 and at least one oil row has a material chosen. A row with no material is a blank placeholder, not an oil the maker listed.
- **Oil rows while fragrance is invalid (wave 4):** not validated, so a fresh editor shows no oil errors before a percentage is typed.
- **Measured weights (wave 4):** at most 2 decimals whatever the formula precision (V-16). "1.234" is refused, not rounded.
- **Page state across navigations (wave 6):** Next.js keeps a route's component state when the maker navigates away (`cacheComponents`, React Activity). Pages that must start from what is saved (the editor, the formula page, the version view) key their root on `useRouter().bfcacheId`. Details in `docs/BUILD-STATE.md`.
- **Routing after a save (wave 6):** the editor lands on `/formulas/{id}?saved={n}`; the formula page shows "Saved as version n" and removes the parameter.
- **Version identity on restore (wave 6):** two copies of a version are the same version when they match apart from `number` and `originalNumber`, which are display labels a restore may change.
- **Where formula actions live (wave 6):** rename, notes, archive, unarchive and permanent delete are on the formula page's more-actions menu. The saved formulas list only filters.
- **Restore integrity (v0.3 fix, 2026-11-28):** required links are judged on the data that will exist after the chosen mode, in the plan (`RestorePlan.problems`) and again inside the apply transaction before anything is cleared or written (`src/lib/backup/integrity.ts`). Replace needs every parent in the file; Merge may use the device's records and ignores problems the device already had. Ownership counts too (a batch's version belongs to its formula, a linked lot is of its component's material). Soft links stay unchecked. A refusal is `RestoreResult` reason "integrity" and changes nothing, meta included.
- **Restore staleness (wave 7):** a restore plan keeps what it was built from. Applying it re-plans inside the transaction (merge) or compares the device with the safety backup (replace), and refuses as "stale" when the result would differ. Nothing is written in that case.
- **Scaling (wave 7):** the Scale dialog opens from the formula page and from any version view, for the version on screen. A scaled version records its source version and factor; the source is never changed.
- **Replace everything (wave 8):** the backup of current data is exported and downloaded before anything is written; if that download fails, nothing is replaced. The confirmation requires typing REPLACE.

## v0.2 BatchTrace decisions (2026-11-18)

Full plan and compatibility notes: `docs/v0.2-batchtrace.md`.

- **Batch identity:** UUID; display title is the optional label or `Batch` + first 8 id characters. No batch numbers, so restore never renumbers batches.
- **Source link:** `formulaId` and `versionId` are fixed at creation; planned weights are read from the version's stored `targets`, never copied or recalculated.
- **Archived formula:** batches stay visible and editable, with a "Formula archived" badge; new batches are still allowed.
- **Deleting a formula with batches is refused** (`DataError("in-use")`, DATA-12). Deleting the batches first allows it.
- **Schema 2** adds only the `batches` store. **Backup format 2** adds `batches`; format 1 files are migrated in memory after their own checksum is verified.
- **Production date** is a local calendar date; the screens refuse future dates, the data layer only checks the format.
- **Page header actions wrap** on narrow screens (`PageHeader`), since the formula page now has four actions.
- **Dev indicator off** (`devIndicators: false`): in development it covered the phone bar's first item. Development only.

## v0.2 CurePilot decisions (2026-11-19)

Full design and compatibility notes: `docs/v0.2-curepilot.md`.

- **Milestones are day offsets** from the batch's production date; due dates are never stored. Moving the production date moves every open milestone; a milestone marked done keeps its `doneOn`.
- **One cure plan per batch:** store `curePlans`, whose `id` is the batch id. Cure time is the plan's single `cureEnd` milestone; planned burn tests are `burnTest` milestones. Two devices that planned the same batch meet as an ordinary restore conflict.
- **Planned production** (`productionPlans`) links a version, not a batch. "Create batch" from an entry writes the batch and sets the entry's `batchId` in one transaction. Batches still never have future dates.
- **Reminders are in-app only:** the Schedule page and a nav count of overdue and due-today items, computed on the device. No push or email (no backend).
- **Deletes:** a batch's cure plan is deleted with the batch, and an entry that made it becomes open again; a formula's open entries are deleted with the formula (a formula with batches still cannot be deleted). Archiving a formula changes nothing in the schedule.
- **Schema 3** adds `curePlans` and `productionPlans` only. **Backup format 3** adds both; formats 1 and 2 are migrated in memory after their own checksum is verified. Orphan checks cover a cure plan's batch and an entry's version and batch.
- **Wording:** curing is scheduling information only; nothing says a candle is cured, ready or safe.

## v0.2 BurnMatrix decisions (2026-11-19)

Full design and compatibility notes: `docs/v0.2-burnmatrix.md`.

- **Session = one dated test on one batch**, with 1 to 8 candles side by side. Each candle has its own wick (a library wick, whose name is snapshotted, or free text), 0 to 40 burns and its own cold and hot throw notes. Burns record duration and optional weights, melt pool, flame, soot and notes. The maker's conclusion is free text. The app gives no pass or fail.
- **Photos** are stored on the device as JPEG `Uint8Array`, shrunk to at most 1600 px and 1 MiB when added (metadata dropped), up to 12 per session, write-once. They are in backups as base64 with their own SHA-256.
- **Planned burn test link** is a soft link to a `burnTest` milestone. Saving a linked session marks it done on the test date in the same transaction. Removing the milestone or the cure plan clears the link. Unlinking or deleting a session leaves the milestone as it is. A restore never refuses a file over it.
- **Batch delete is refused** (`in-use`) while the batch has burn sessions. Deleting a session deletes its photos after confirmation.
- **Storage full** has its own error code, `storage-full`, mapped from `QuotaExceededError` in every repository.
- **Schema 4** adds `burnSessions` and `burnPhotos` only. **Backup format 4** adds both. Formats 1 to 3 are migrated in memory after their own checksum is verified. `MAX_BACKUP_BYTES` is 256 MiB, and export reports the file size.
- **Reports** are printable pages (browser Print / Save as PDF) plus a CSV; there is no PDF library. The burn tests list is reached from the Batches page and each batch's Burn tests section, not from the nav.
- **Wording:** observations only. The messages test scans every string for verdict words.

## v0.2 integration decisions (2026-11-21)

Plan, findings and how to rerun: `docs/v0.2-integration-qa.md`.

- **Burn test dates follow the batch:** a burn test is never dated before its batch's production date, in the data layer as well as the screens. `batches.update` refuses a production date later than the earliest burn test; `burnSessions.create` and `update` refuse a test date before the production date. Both throw `invalid`. A restore does not check this rule (recorded for v0.3).
- **One focus style, really:** focusable controls must not carry `outline-none`. In Tailwind 4 it is `outline-style: none` in the utilities layer and beats the global `:focus-visible` outline in the base layer. Only non-interactive programmatic focus targets (`tabIndex={-1}` result regions, the dialog container) keep it.
- **Stored records are never refused for the date rule or a shared link (M-1, M-2):** a date already stored is accepted on edit, and so is a session's existing link to a planned burn test that another session shares. Only new or changed values must follow the rules. A restore never refuses a file over either one. Its preview counts them instead (`RestorePlan.burnChecks`).
- **Focus is returned:** the shared `DialogContent` returns focus to whatever opened it. Row removal moves focus with `focusAfterRemove` (`data-row-remove` / `data-add-row`).
- **E2E port:** `playwright.config.ts` reads `E2E_PORT` (default 3000), so a second checkout or QA run can use its own dev server.
- **Upgrade chain:** schema changes are proven with `tests/upgrade-chain/`, which serves real builds of every schema in one Chromium profile on port 3000 and diffs every store. Reuse it for the next schema.

## v0.3 lots and suppliers decisions (2026-11-21)

Full design and compatibility notes: `docs/v0.3-lots.md`.

- **Suppliers** are their own device-only list (name, contact notes). **Lots** belong to one material (fixed at creation) and optionally one supplier, with a code, an optional received date and notes. No quantities or stock.
- **Lot links on batches** are optional, one per component (wax and oil rows by `componentId`, the wick and vessel by part). A link stores the lot id plus a snapshot of the code and supplier. Snapshots never change by themselves; screens show "now recorded as …" when the lot differs. `BatchInput.lots` left out on update keeps the stored links.
- **Archive and delete:** a lot a batch uses, and a supplier a lot or batch snapshot names, can only be archived (`in-use` on delete). Unused ones can be deleted after confirmation.
- **Schema 5** adds `suppliers` and `materialLots` only; batches gain an optional `lots` field, so no records move. **Backup format 5** adds both stores; formats 1 to 4 are read, their batches checked without `lots`. Orphan checks: a lot's material and supplier, a batch's linked lot.
- **Search and filters** run in memory over `batchTrace.read()`; their state lives in the URL and the list writes it with `router.replace`. The CSV is one row per component of each filtered batch.
- The material's v0.1 free-text `supplier` field stays as a library note, separate from the supplier list (owner decision for later).

## v0.3 CandleFix decisions (2026-11-28)

Full design and compatibility notes: `docs/v0.3-candlefix.md`.

- **An investigation belongs to one batch** (fixed at creation); its exact formula version is the batch's immutable version. It holds the observed date (never before the batch's production date, in the data layer too), 1–10 issues from a fixed list (`FIX_ISSUES`, "other" with its own text), notes, ticked or noted **things to check** and the maker's **hypotheses**. Up to 12 photos in `investigationPhotos`, through the BurnMatrix photo pipeline.
- **Things to check are prompts, not a diagnosis.** Built-in lists per issue (`@/lib/candlefix`, text in `MESSAGES.candleFixChecks`); ids `<issue>.<slug>` never change. A tick stores the label it was ticked with, so a rewording never changes history; ticks for an issue no longer chosen are kept and shown apart.
- **Hypotheses are the maker's words**, always labelled "Hypothesis", with a maker-set neutral status (open, testing, fits, doesNotFit, setAside; never "confirmed" or "proven"), shown in their own dashed block apart from observations.
- **Corrective experiments** (`correctiveExperiments`, its own store) link one hypothesis to one follow-up batch (any batch but the investigated one) and 0–8 of that batch's burn tests. Investigation, hypothesis and follow-up batch are fixed at creation.
- **Delete rules:** a batch with an investigation, or that is a follow-up batch, cannot be deleted (`in-use`); a burn test an experiment lists cannot be deleted; a hypothesis an experiment follows cannot be removed. Deleting an investigation deletes its photos and experiments after a confirmation that counts them. Investigations can be archived.
- **Schema 6** adds `investigations`, `investigationPhotos`, `correctiveExperiments` (experiments index `*burnSessionIds`). **Backup format 6** adds the three stores; formats 1 to 5 are read. Restore integrity adds: investigation→batch, photo→investigation, experiment→investigation, →a hypothesis of it, →follow-up batch (not the original), →each listed burn test of the follow-up batch.
- **Wording:** the CandleFix sections are scanned for judgement and diagnosis words (`tests/unit/messages/messages.test.ts`).
