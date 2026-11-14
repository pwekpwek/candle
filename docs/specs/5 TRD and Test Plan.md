# CandleLab Studio — 5 TRD and Test Plan (v0.1)

**Status:** Draft 2026-11-14, awaiting owner review. Nothing here is built yet. Exact library versions are chosen and pinned in the lockfile when the project is scaffolded, and recorded in the development handoff note, not here.

## Stack

From the [[Projects/apps/candle/Overview|Overview]], with the specifics proposed for confirmation (D-11):

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js (App Router) with TypeScript in strict mode | Stated in the Overview. Deploys to Vercel without extra configuration. |
| Styling and components | Tailwind CSS and shadcn/ui | Stated in the Overview. |
| Storage | IndexedDB through Dexie | Transactions, indexes and schema upgrades with little code. |
| Validation | Zod | One schema set for forms and for checking backup files. |
| Unit and integration tests | Vitest, with fake-indexeddb for the data layer | Fast, runs the calculation and restore rules without a browser. |
| End-to-end tests | Playwright | Real browser, 375px viewport, and a clean profile for the restore test. |
| Lint and types | ESLint, `tsc --noEmit` | |
| Package manager | npm with a committed lockfile | npm is installed on the development machine. pnpm is not. |
| Runtime | Node 24 | Installed on the development machine (v24.14.1, npm 11.11.0). |

- **TRD-01 — Client-only data.** All pages that read or write formulas are client components. No route handler, server action or server component receives formula data. No environment variables are needed in v0.1.
- **TRD-02 — Calculation engine is a pure module** with no UI, storage or framework imports, so the worked examples can be tested directly and the same code serves later modules.
- **TRD-03 — One calculation path.** The editor, the scale preview, saving and tests all call the same engine. No screen does its own arithmetic.
- **TRD-04 — Data layer is the only code that touches IndexedDB.** It enforces the write rules in the [[Projects/apps/candle/Specs/4 Data Model|Data Model]].
- **TRD-05 — No third-party scripts, analytics or remote fonts** in v0.1.

## Proposed layout

```
src/
  app/                      routes from the sitemap
  components/               shell, editor, results, materials, backup
  lib/
    gramguard/              calculation engine + parsing/formatting (pure)
    db/                     Dexie schema, repositories, transactions
    backup/                 export, validate, plan, restore
    schemas/                Zod schemas shared by forms and backup
tests/
  unit/                     engine, parsing, backup validation, repositories
  e2e/                      Playwright flows
```

## Repository and branching

- Repository: `pwekpwek/candle` (private), per the [[Projects/apps/candle/Claude Development Handoff|development handoff]].
- **Blocker B-1:** on 2026-11-14 the signed-in GitHub account `jubert-natura` could not see `pwekpwek/candle` (not found). The repository needs to be created, or that account added as a collaborator, or the GitHub CLI switched to the owning account, before anything can be pushed.
- Work happens on a feature branch (proposed name `feat/v0.1-gramguard`). For the first commit with no base branch, push the tested feature branch and record the commit URL. Otherwise open a PR.
- Claude implements and records. Codex verifies independently and handles Vercel with the owner. Nothing is deployed by the implementation step.

## Commands the repository must support

| Purpose | Command |
| --- | --- |
| Install from lockfile | `npm ci` |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Unit and integration tests | `npm test` |
| End-to-end tests | `npm run test:e2e` |
| Production build | `npm run build` |
| Local run | `npm run dev` |

## Build slices

Each slice ends with its own tests passing. The order keeps arithmetic and data integrity ahead of interface work.

1. **Scaffold.** Project, tooling, the commands above, empty app shell with navigation at desktop and 375px.
2. **Calculation engine.** Parsing, the rules, formatting. All worked examples as tests.
3. **Data layer.** Schema, repositories, version save transaction, drafts, measurements.
4. **Material library.** List, add, edit, archive, quick-add from a picker.
5. **GramGuard editor and results.** Inputs, live results, validation, draft restore, save.
6. **Formula page.** Version history, read-only version view, measured weights, actual blend.
7. **Revise and scale.**
8. **Backup and restore.** Export, validation, preview, merge, replace, result summary.
9. **Round-trip verification** and the development handoff note.

## Test plan

Automated results, independent review, functional checks and visual checks are reported separately, per the [[AI/Skills/QA and Regression Testing Skill|QA and Regression Testing]] skill. A check that was not run is recorded as not run.

### Calculation (unit)

| ID | Covers | Method |
| --- | --- | --- |
| TEST-01 | Percentage of wax weight, total and wax known (WE-1, WE-3) | Exact match to worked examples |
| TEST-02 | Percentage of total mixture, total and wax known (WE-2, WE-4) | Exact match |
| TEST-03 | Basis conversion table (CALC-04) | Exact match |
| TEST-04 | Multi-oil split, remainder and tie handling (WE-5, WE-6, WE-12) | Exact match, and components always sum to the total |
| TEST-05 | Small-blend rounding at all three precisions, warning threshold (WE-7) | Exact match, warning on and off |
| TEST-06 | Wax blend (WE-10), unscented (WE-11) | Exact match |
| TEST-07 | Planned versus measured, partial entry, off-target flags (WE-8) | Exact match |
| TEST-08 | Scaling by vessels, amount and multiplier, and that rounded weights are not multiplied (WE-9) | Exact match |
| TEST-09 | Every validation rule V-01 to V-17 and the WE-13 table | Each invalid input returns its rule, no result produced |
| TEST-10 | Property check: for random valid inputs, wax + fragrance = total and components sum to their totals | Randomised |
| TEST-11 | No floating-point drift: 0.1 g and 0.01 g cases that fail with naive arithmetic | Targeted cases |

### Data and versions (integration, fake-indexeddb)

| ID | Covers |
| --- | --- |
| TEST-12 | Saving creates version 1. Revising creates version 2. Version 1 is byte-for-byte unchanged. |
| TEST-13 | Editing, renaming and archiving a material leaves saved versions' names and weights unchanged. |
| TEST-14 | Two saves started together produce consecutive version numbers. |
| TEST-15 | A failed save transaction writes nothing and keeps the draft. |
| TEST-16 | Drafts survive a reload and are removed on save or discard. |
| TEST-17 | Measurements save, reload, and never alter the version record. |
| TEST-18 | Deleting a formula removes its versions, measurements and draft together. |

### Backup and restore (integration)

| ID | Covers |
| --- | --- |
| TEST-19 | Export then restore into an empty database reproduces every record exactly. |
| TEST-20 | Restoring the same file twice changes nothing the second time. |
| TEST-21 | Merge into existing data: new added, identical skipped, conflicts follow the chosen policy. |
| TEST-22 | Version number clash is renumbered, keeps `originalNumber`, and parent links still resolve. |
| TEST-23 | Malformed files are refused with nothing written: not JSON, wrong format tag, newer format version, missing field, wrong type, negative weight, count mismatch, checksum mismatch, truncated file, duplicate IDs, orphaned version. |
| TEST-24 | Interrupted import: an error thrown partway through the write leaves the database identical to before. |
| TEST-25 | Replace everything: safety backup is produced first, and the result equals the backup exactly. |
| TEST-26 | A version conflict keeps this device's copy and is reported. |

### End to end (Playwright)

| ID | Covers |
| --- | --- |
| TEST-27 | **Round trip.** Create the WE-5 formula, save, enter WE-8 measurements, reload, check figures, scale to 10 vessels and check WE-9a, export, open a new browser context with empty storage, restore, check both versions and the measurements, open version 1. |
| TEST-28 | The same create, measure and reopen path at 375px. No horizontal page scroll, bottom bar does not cover content, inputs at least 16px. |
| TEST-29 | Validation in the interface: commas rejected, focus moves to the first problem, results panel empty while invalid. |
| TEST-30 | Double-tapping Save creates one version. |
| TEST-31 | Empty states: first run, empty material library, no backup yet. |
| TEST-32 | Restore of a malformed file shows the reason and leaves the formula list unchanged. |

### Manual checks

Recorded with observed outcomes in the handoff note:

- Desktop and 375px pass over the saved formulas list, editor, results and material library against the UX Playbook final checklist.
- Decimal keypad appears on a phone-sized touch emulation, and on a real phone if one is available.
- Keyboard-only pass through create, save and restore.
- Wording check: no screen claims a candle or fragrance level is safe.

## Definition of done for the v0.1 build

1. `npm ci`, lint, type check, unit tests, end-to-end tests and production build all pass on the exact commit, with commands and results recorded.
2. Every worked example in [[Projects/apps/candle/Specs/2 Calculation Rules|Calculation Rules]] is an automated test and passes.
3. The round trip (TEST-27) passes.
4. Desktop and 375px checks are recorded.
5. The tested commit is pushed to the feature branch. Its full SHA, branch and URL are recorded.
6. The development handoff note is saved under `Projects/apps/candle/Sessions/`, read back, and linked from Current Context.
7. Task checkboxes are ticked only where their criteria are met.
8. Preview is marked pending for Codex. No deployment is made by the implementation step.

## Risks

| Risk | Mitigation |
| --- | --- |
| Browser storage is cleared and formulas are lost | Backup file, reminder, persistent-storage request, plain wording on the backup page. |
| A rounding or basis mistake goes unnoticed | Integer arithmetic, worked examples as tests, property test, independent Codex review. |
| Restore corrupts existing data | Full validation before writing, one transaction, post-commit count check, safety backup before replace. |
| Makers misread the basis | Basis in words everywhere, live explanation, equivalent shown, tested in prototype validation. |
| Scope grows into costing or batches | Out-of-scope list in the PRD. Data model already leaves room for batches. |
| Repository access (B-1) blocks the handoff | Resolve before build starts. |

## Open

Decision D-11 and blocker B-1 in the [[Projects/apps/candle/Specs/Specs Index|Specs Index]]. Hosting details and PWA installability remain open in the Overview.

## Related

[[Projects/apps/candle/Specs/1 PRD|PRD]] · [[Projects/apps/candle/Specs/2 Calculation Rules|Calculation Rules]] · [[Projects/apps/candle/Specs/3 App Flow and Wireframes|App Flow and Wireframes]] · [[Projects/apps/candle/Specs/4 Data Model|Data Model]] · [[AI/Skills/Development Workflow Skill|Development Workflow]]
