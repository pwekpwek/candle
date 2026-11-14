# Build State — CandleLab Studio v0.1

The single place that says where the build is. **Each wave runs in its own chat** (owner's instruction, 2026-11-15). A chat reads this file, does its wave, updates this file, commits, and stops. The lead orchestrator chat then checks the commit and starts the next wave's chat.

## How a wave chat works

1. Read `docs/ARCHITECTURE.md`, this file, and your wave's rows in `docs/specs/6 Implementation Plan.md`. Read only the spec sections your tasks name.
2. You are that wave's orchestrator. Give each task to a subagent on the model the plan assigns (Haiku, Sonnet). Run tasks in parallel only when their files do not overlap (see the ownership table). Brief each subagent with: its task row, the files it owns, the spec sections to read, the contracts to code against, and its acceptance check.
3. Escalate only with a reason: Haiku to Sonnet after one failed attempt, Sonnet to the strongest model after two, or sooner when the failure exposes a gap in the spec. Record every escalation below.
4. Review each diff against the spec yourself. Then run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` and read the output.
5. Update the wave table and the log below. Commit on `feat/v0.1-gramguard` with a message starting with the wave and task numbers. **Do not push** (blocker B-1).
6. Stop. Report: tasks done, models used, escalations, commands with real results, the commit SHA, and anything the next wave must know. Do not start the next wave.

Never claim a check that was not run. If a task cannot meet its acceptance check, say so and leave it marked incomplete.

## Fixed facts

- Repository folder: `G:\Users\Jubert Cute\Downloads\jun\yalen\candle`. Branch `feat/v0.1-gramguard`. Nothing is pushed.
- **B-1 is open:** the signed-in GitHub account `jubert-natura` cannot see `pwekpwek/candle` (checked 2026-11-15, not found). Build and test locally. The owner must be told before the push step.
- Node v24.14.1, npm 11.11.0. Next 16.4.6, React 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3, Vitest 5.1.0, Playwright 1.65.1, Dexie 4.4.7, Zod 4.6.7.
- Playwright browsers are **not installed yet**. Wave 9 runs `npx playwright install chromium` first.
- `npm run typecheck` runs `next typegen` first (the `pretypecheck` script). That is expected.
- D-1 to D-14 are accepted. D-15: light and dark tokens, follow the device setting, no toggle.

## Waves

| Wave | Tasks | Status | Commit |
| --- | --- | --- | --- |
| 1 | T01 scaffold | Done | `1192b4a` |
| 2 | T02 contracts, T02b design blueprint | Done | `25af9d0` |
| 3 | T03 shell, T04 Zod schemas, T05 messages, T06 fixtures, T08 engine core | **In progress, uncommitted** (see "Wave 3 handover") | |
| 4 | T07 engine tests, T09 engine validation, T10 Dexie repositories | Not started | |
| 5 | T11 version save, T12 backup export, T16 materials, T17 results panel | Not started | |
| 6 | T13 bad backup fixtures, T14 restore checks and plan, T18 editor, T19 list, T20 formula page | Not started | |
| 7 | T15 restore apply, T21 revise and scale | Not started | |
| 8 | T22 backup page | Not started | |
| 9 | T23, T24 end-to-end tests | Not started | |
| 10 | T25 integration review, T26 final run, T27 handoff | Not started | |

## Wave 3 handover (2026-11-15)

The wave 3 chat stopped partway. Its work is in the working tree, **uncommitted and not yet reviewed**. A new chat finishes the wave. State measured by the lead orchestrator:

| Task | On disk | Still to do |
| --- | --- | --- |
| T08 engine core | `src/lib/gramguard/{fixed,format,plan,index}.ts` and `__tests__/` | Review against the spec and `tests/reference/worked-examples.mjs` |
| T04 Zod schemas | `src/lib/schemas/*`, `tests/unit/schemas/*` | Review |
| T06 fixtures | `tests/fixtures/worked-examples.ts` | Check every figure against section 9 of the Calculation Rules |
| T03 shell | `components.json`, `src/lib/utils.ts`, `src/components/{ui,common,shell}/`, `tests/unit/{time,db}/`, changes to `package.json`, `package-lock.json`, `globals.css` | Confirm what is finished. `src/app/` still has only the default `page.tsx`, so route skeletons, the layout wiring and `tests/e2e/shell.spec.ts` are likely missing. Confirm shadcn left `tokens.css` as the only source of colour and added no `.dark` variant. Confirm whether Playwright's Chromium is installed |
| T05 messages | Nothing. `src/lib/messages.ts` does not exist | The whole task |

Checks run on this uncommitted tree: `npm test` passed (10 files, 232 tests). `npx tsc --noEmit` reported no errors. `npm run lint` **failed** with 5 `no-explicit-any` errors, all in `tests/unit/_tmp/cross.test.ts`, a scratch file that should be deleted or fixed. `npm run build` and `npm run test:e2e` were not run.

## GitHub

`origin` is set to `https://github.com/pwekpwek/candle.git` (owner's instruction, 2026-11-15). The signed-in account `jubert-natura` still gets "Repository not found" from both `gh` and `git ls-remote`, and has no pending invitation. Nothing can be pushed until the repository exists and that account is a collaborator, or `gh` is signed in as the owning account. Check again with `gh repo view pwekpwek/candle` before the push step.

## Notes for coming waves

- **Wave 3, T03:** installs the UI dependencies (shadcn/ui pieces, `lucide-react`, `dexie-react-hooks`). It is the only task in that wave allowed to run `npm install`. shadcn must not overwrite the tokens: `src/app/tokens.css` stays the only source of colour values, and no `.dark` class variant is added (D-15). `next.config.ts` has `cacheComponents: true`; route skeletons with dynamic segments must build under it (read the Next 16 docs in `node_modules/next/dist/docs/`).
- **Wave 3, T08** exports only the parsing, formatting and planning functions. The full `GramGuardEngine` check in `index.ts` is completed by T09 in wave 4.
- **Wave 3, T06 and wave 4, T07** must be written from the spec, not from the engine code, so the tests cannot mirror the implementation.
- **CALC-13** looks at the fragrance total only (see "Decisions made during the build" in `docs/ARCHITECTURE.md`).

## Log

- **2026-11-15, wave 1.** T01 on Sonnet. `npm ci`, lint, typecheck, test (1 test), build and test:e2e (1 trivial test) all passed. `@types/node` raised to 24 for Vitest 5. `pretypecheck` added. Vitest config is `vitest.config.mts`.
- **2026-11-15, wave 2.** T02 and T02b by the lead orchestrator. Spec pack copied to `docs/specs/`, UX Playbook and Premium Dashboard Design skills to `docs/design/`, reference script extracted to `tests/reference/worked-examples.mjs` and run: every figure matches section 9 of the Calculation Rules. Contracts: `src/lib/types.ts`, `src/lib/gramguard/contract.ts`, `src/lib/db/contract.ts`, `src/lib/backup/contract.ts`. Tokens: `src/app/tokens.css`, mapped in `src/app/globals.css`, with measured AA contrast in `docs/design/blueprint.md`. One spec gap found and resolved (CALC-13 scope).
