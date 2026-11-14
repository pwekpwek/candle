# Build State — CandleLab Studio v0.1

The single place that says where the build is. **Each wave runs in its own chat** (owner's instruction, 2026-11-15). A chat reads this file, does its wave, updates this file, commits, and stops. The lead orchestrator chat then checks the commit and starts the next wave's chat.

## How a wave chat works

1. Read `docs/ARCHITECTURE.md`, this file, and your wave's rows in `docs/specs/6 Implementation Plan.md`. Read only the spec sections your tasks name.
2. You are that wave's orchestrator. Give each task to a subagent on the model the plan assigns (Haiku, Sonnet). Run tasks in parallel only when their files do not overlap (see the ownership table). Brief each subagent with: its task row, the files it owns, the spec sections to read, the contracts to code against, and its acceptance check.
3. Escalate only with a reason: Haiku to Sonnet after one failed attempt, Sonnet to the strongest model after two, or sooner when the failure exposes a gap in the spec. Record every escalation below.
4. Review each diff against the spec yourself. Then run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` and read the output.
5. Update the wave table and the log below. Commit on `feat/v0.1-gramguard` with a message starting with the wave and task numbers. Then push the branch as described under GitHub.
6. Stop. Report: tasks done, models used, escalations, commands with real results, the commit SHA, and anything the next wave must know. Do not start the next wave.

Never claim a check that was not run. If a task cannot meet its acceptance check, say so and leave it marked incomplete.

## Fixed facts

- Repository folder: `G:\Users\Jubert Cute\Downloads\jun\yalen\candle`. Branch `feat/v0.1-gramguard`. Pushed to `origin` (see GitHub below).
- **B-1 is cleared:** pushes go to `pwekpwek/candle` as the `pwekpwek` account (see GitHub below). Never push as `jubert-natura`.
- Node v24.14.1, npm 11.11.0. Next 16.4.6, React 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3, Vitest 5.1.0, Playwright 1.65.1, Dexie 4.4.7, Zod 4.6.7.
- Playwright's Chromium **is installed** (wave 3, `npx playwright install chromium`). `npm run test:e2e` runs the shell spec.
- `npm run typecheck` runs `next typegen` first (the `pretypecheck` script). That is expected.
- D-1 to D-14 are accepted. D-15: light and dark tokens, follow the device setting, no toggle.

## Waves

| Wave | Tasks | Status | Commit |
| --- | --- | --- | --- |
| 1 | T01 scaffold | Done | `1192b4a` |
| 2 | T02 contracts, T02b design blueprint | Done | `25af9d0` |
| 3 | T03 shell, T04 Zod schemas, T05 messages, T06 fixtures, T08 engine core | Done | The commit titled "Wave 3 (T03, T04, T05, T06, T08)" (`git log --oneline`) |
| 4 | T07 engine tests, T09 engine validation, T10 Dexie repositories | Not started | |
| 5 | T11 version save, T12 backup export, T16 materials, T17 results panel | Not started | |
| 6 | T13 bad backup fixtures, T14 restore checks and plan, T18 editor, T19 list, T20 formula page | Not started | |
| 7 | T15 restore apply, T21 revise and scale | Not started | |
| 8 | T22 backup page | Not started | |
| 9 | T23, T24 end-to-end tests | Not started | |
| 10 | T25 integration review, T26 final run, T27 handoff | Not started | |

## Wave 3 handover

Superseded. The wave 3 chat resumed and finished: all five tasks are reviewed and committed (see the log). The scratch file `tests/unit/_tmp/cross.test.ts` mentioned in the earlier snapshot was the orchestrator's own cross-check and has been deleted.

## GitHub

**B-1 is cleared (2026-11-15).** The GitHub CLI is signed in as `pwekpwek`, which is the active account and the one to push with. `jubert-natura` is still stored in the CLI but must not be used. `origin` is `https://github.com/pwekpwek/candle.git`. **The repository is public** (made public on 2026-11-15 at the owner’s request, after the owner was told it contains the spec pack, two skill notes and a local folder path). Never commit credentials, real customer data or anything else that must stay private. Branch `feat/v0.1-gramguard` was first pushed at commit `90d733c810f86fdc7193ef204fdc67a0928420b5` (waves 1 to 3) and tracks `origin/feat/v0.1-gramguard`. It is the only branch, so GitHub shows it as the default branch.

To push: check `gh auth status` shows `pwekpwek` as the active account, then `git -c credential.helper= -c credential.helper="!gh auth git-credential" push`. Each wave chat pushes after its commit. The `pwekpwek` token has no `workflow` scope, so a push that adds files under `.github/workflows/` will be refused.

Lead orchestrator check of `90d733c` on 2026-11-15: `npm run lint`, `npm run typecheck`, `npm test` (11 files, 281 tests), `npm run build` and `npm run test:e2e` (10 tests) all passed.

## Notes for coming waves

- **Wave 3, T03:** installs the UI dependencies (shadcn/ui pieces, `lucide-react`, `dexie-react-hooks`). It is the only task in that wave allowed to run `npm install`. shadcn must not overwrite the tokens: `src/app/tokens.css` stays the only source of colour values, and no `.dark` class variant is added (D-15). `next.config.ts` has `cacheComponents: true`; route skeletons with dynamic segments must build under it (read the Next 16 docs in `node_modules/next/dist/docs/`).
- **Wave 3, T08** exports only the parsing, formatting and planning functions. The full `GramGuardEngine` check in `index.ts` is completed by T09 in wave 4.
- **Wave 3, T06 and wave 4, T07** must be written from the spec, not from the engine code, so the tests cannot mirror the implementation.
- **CALC-13** looks at the fragrance total only (see "Decisions made during the build" in `docs/ARCHITECTURE.md`). The Calculation Rules file itself still says "the fragrance total or any component"; the decision is recorded in the contract and the architecture note, not in the spec file.
- **Wave 4, `tsconfig.json` target is ES2017**, so BigInt literals (`1n`, `10n ** 3n`) fail with TS2737. T08 used `BigInt(1)` calls instead. T09 must do the same (or the owner raises the target to ES2020). `src/lib/gramguard/fixed.ts` exports `toSafeInt`, `toBig`, `divHalfUp` and `divHalfAwayFromZero` for T09 to reuse.
- **Wave 4, `computePlan` throws `RangeError`** for input `evaluateFormula` would reject first (non-integers, no waxes, scented with no oils, parts summing to 0, total-basis percentage of 100% or more). Call it only after validation. A `zero-component` result lists waxes first, then oils, in input order. `index.ts` ends with `_engineCoreCheck: Pick<GramGuardEngine, …16 names>`; T09 widens it to the full `GramGuardEngine`.
- **Wave 4, T07** can use `tests/fixtures/worked-examples.ts` (`ALL_WORKED_EXAMPLES`, `ALL_SCALE_EXAMPLES`, `ALL_MEASURED_EXAMPLES`, `WE_13`). Its plan and scale entries were cross-checked against `computePlan` in wave 3 (17 of 17 match). The WE-8 comparison, the partial case and the WE-13 rows are checked against the spec text only.
- **Schemas (T04)** are strict and add rules beyond the types: oils empty when `fragranceBp` is 0 and at least one when above 0; `totalMg = waxTotalMg + fragranceTotalMg`; component ids unique per version; vessel count × fill at most 1 000 000 g. Ids use `z.uuid()`, which checks the version and variant digits, so test data must use real v4 UUIDs (`crypto.randomUUID()`), not made-up ones such as `0000…0001`. `partsX100` is 1 to 999999 even for a single-row blend, so the editor (T18) must store 100 for a single row.
- **Messages (T05)** wording written because the specs have none (review before release): the CALC-17 note, the total-basis `basisExplanation`, singular forms in the restore messages, the orphan-measurement clause, `editor.saveFailed`, `storage.blockedWhatToTry`, the backup draft and replace texts, the add-wick and add-vessel rows. Restore failure reasons from `RestoreResult` (busy, stale, storage, mismatch, no-safety) have no wording yet: T22 needs them. The CALC-13 sentence follows the spec exactly ("can't hit 6%"), so it names no basis after the percentage. Two strings contain "safe" because spec 3 does ("somewhere safe", "safety backup"); the messages test lists them as explicit exceptions.
- **Shell (T03):** three nav destinations (Formulas, Materials, Backup and restore), as spec 3 and the blueprint say. "New formula" is a button in the Formulas page header. Shell strings still carry `TODO(T05)` and are not yet wired to `@/lib/messages`; the storage-blocked explanation text is written in the component. `--bottom-bar-height` is available for T18's fixed phone summary bar. Dynamic route skeletons use `use(params)` inside Suspense (Cache Components); a page that reads `useSearchParams` needs Suspense too. New dependencies: `shadcn`, `radix-ui`, `class-variance-authority`, `cn` (shadcn's own class-merge package), `tw-animate-css`, `lucide-react`, `dexie-react-hooks`. `globals.css` gained only two imports (`tw-animate-css`, `shadcn/tailwind.css`); the colour variables and `.dark` variant that shadcn injects were removed again.

## Log

- **2026-11-15, wave 1.** T01 on Sonnet. `npm ci`, lint, typecheck, test (1 test), build and test:e2e (1 trivial test) all passed. `@types/node` raised to 24 for Vitest 5. `pretypecheck` added. Vitest config is `vitest.config.mts`.
- **2026-11-15, wave 2.** T02 and T02b by the lead orchestrator. Spec pack copied to `docs/specs/`, UX Playbook and Premium Dashboard Design skills to `docs/design/`, reference script extracted to `tests/reference/worked-examples.mjs` and run: every figure matches section 9 of the Calculation Rules. Contracts: `src/lib/types.ts`, `src/lib/gramguard/contract.ts`, `src/lib/db/contract.ts`, `src/lib/backup/contract.ts`. Tokens: `src/app/tokens.css`, mapped in `src/app/globals.css`, with measured AA contrast in `docs/design/blueprint.md`. One spec gap found and resolved (CALC-13 scope).
- **2026-11-15, wave 3.** Run in its own chat. T08 engine core (Sonnet), T03 shadcn and shell (Sonnet), T04 schemas (Haiku), T06 fixtures (Haiku), T05 messages (Haiku, after T08). No escalations: every Haiku output passed review. A usage-limit error stopped T03 and T05 part-way; both were resumed with their work intact. One review fix by the orchestrator: the WE-9d fixture's `input` carried the source amount (333.3 g) instead of the scaled 500.0 g; after the fix all 17 plan and scale fixtures matched `computePlan`. Commands on the final tree: `npm run lint` clean; `npm run typecheck` clean; `npm test` 11 files, 281 tests passed; `npm run build` passed (4 static routes, 3 partial-prerender dynamic routes); `npm run test:e2e` 10 passed (Chromium installed this wave).
