# CandleLab Studio v0.1 — Architecture and File Ownership

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
