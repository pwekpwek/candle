# CandleLab Studio — 6 Implementation Plan (v0.1)

**Status:** Plan written 2026-11-14. Not started. No application code exists. The build begins only when the owner gives an explicit go-ahead.

This plan follows [[AI/AI Rules/Claude Golden Rules|Claude Golden Rules]] rule 1: one orchestrator, small tasks, the cheapest model that can do each task reliably.

## How the work is split

- **28 tasks:** 19 on Sonnet, 4 on Haiku, 5 on Fable 5.2.
- **Fable 5.2 is used only for** the module contracts, the design blueprint, the integration review, and the final first-hand verification and handoff.
- **Every task is done when** lint, type check and its own tests pass, and the orchestrator has reviewed the diff against the spec.
- **Escalation:** Haiku moves to Sonnet after one failed attempt. Sonnet moves to Fable 5.2 after two failed attempts, or sooner if the failure exposes a gap in the spec, which the orchestrator resolves and writes back into the spec.
- **No conflicting edits:** each task owns a named set of files. Shared files (contracts, schemas, messages, tokens, `package.json`) are changed only by their owning task or by the orchestrator. The orchestrator commits after each wave.
- **Spec in the repo:** T01 copies this spec pack into `docs/specs/` so each agent reads only the sections its task names, and Codex gets the spec alongside the code.

Change from the breakdown first shown in chat: T02b was added after the owner supplied the [[AI/Skills/Premium Dashboard Design Skill|Premium Dashboard Design]] skill, so the visual system is decided once before any screen is built.

## Foundation

| # | Task and outcome | Needs | Done when | Model and why |
| --- | --- | --- | --- | --- |
| T01 | Scaffold Next.js, TypeScript strict, Tailwind, ESLint, Vitest, Playwright, npm scripts, git repo on `feat/v0.1-gramguard`, spec copied to `docs/specs/`, reference script saved to `tests/reference/` | none | `npm ci`, lint, typecheck, an empty test run and build all pass | **Sonnet.** Toolchain wiring on Windows has version quirks that need real debugging, but no design judgement |
| T02 | Module contracts: record types from the Data Model and function signatures for the engine, repositories and backup, with no implementations | T01 | Types compile, and every later task can be written against them without asking questions | **Fable 5.2.** These interfaces decide how every module fits together |
| T02b | Design blueprint: run modes 1, 3 and 5 of the Premium Dashboard Design skill. Token table for light and dark (palette, type scale, spacing, radius, elevation), component style notes, one consistent empty-state pattern. Saved as `docs/design/blueprint.md` and a tokens stylesheet | T01 | Tokens exist under names every screen can use, contrast is checked at AA in both themes, and the result passes the UX Playbook visual checklist | **Fable 5.2.** Brand tokens are open (B-2), the result is inherited by every screen, and the brief is a judgement call |
| T03 | shadcn/ui setup on the T02b tokens, app shell with sidebar and phone bottom bar, route skeletons, storage-unavailable screen | T01, T02b | Navigation works at desktop and 375px with no horizontal scroll (PRD-01, PRD-02) | **Sonnet.** Standard interface work once tokens exist |
| T04 | Zod schemas for every record and the backup envelope | T02 | Schemas accept valid samples and reject each out-of-range field | **Haiku.** Mechanical translation of types that already exist |
| T05 | Message constants: every validation, warning and empty-state text from the spec | T02 | Each V-01 to V-17 and CALC-13/14 message exists once, word for word | **Haiku.** Pure transcription |
| T06 | Worked-example fixtures: WE-1 to WE-13 as typed test data | T02 | Every figure in section 9 of Calculation Rules is present and matches | **Haiku.** Pure transcription, and written by a different agent than the engine so tests cannot mirror the implementation |

## Calculation engine

| # | Task and outcome | Needs | Done when | Model and why |
| --- | --- | --- | --- | --- |
| T07 | Engine tests written from the spec: TEST-01 to TEST-11, including the property test and floating-point cases | T02, T06 | Tests compile against the contracts and fail only because the engine is not there yet | **Sonnet.** Test design needs judgement about edge cases. Runs in parallel with T08 |
| T08 | Engine core: parsing, formatting, sizing modes, both bases, rounding, largest-remainder split, effective percentage, rounding warning (CALC-01 to CALC-17) | T02 | TEST-01 to TEST-06, TEST-10 and TEST-11 pass with integer arithmetic only | **Sonnet.** Fully specified with test vectors and a reference script |
| T09 | Engine: planned versus measured, off-target flags, scaling, all validation rules (CALC-18 to CALC-27, V-01 to V-17) | T08, T05 | TEST-07 to TEST-09 pass | **Sonnet.** Same reasoning as T08 |

## Data layer, backup and restore

| # | Task and outcome | Needs | Done when | Model and why |
| --- | --- | --- | --- | --- |
| T10 | Dexie schema and repositories for materials, formulas, drafts, meta, change counter, with tests | T04 | Create, edit, archive and draft round trips pass in fake-indexeddb (TEST-16) | **Sonnet.** Standard persistence code |
| T11 | Version save transaction, revision and scale copy rules, measurements, formula delete | T10 | TEST-12 to TEST-15, TEST-17 and TEST-18 pass, including two saves at once | **Sonnet.** Rules are spelled out in DATA-07 to DATA-12. First candidate for escalation if the concurrency test is flaky |
| T12 | Backup export: consistent snapshot, sorted-key JSON, SHA-256 checksum, file name | T10, T04 | Export of a seeded database validates against the envelope schema (DATA-15 to DATA-18) | **Sonnet.** Small, but checksum canonicalisation is easy to get subtly wrong |
| T13 | Malformed backup fixtures: one file per failure listed in TEST-23 | T12 | Eleven bad files exist, each broken in exactly one way | **Haiku.** Repetitive edits to a known-good sample |
| T14 | Restore checks and plan as pure functions: all checks, new/identical/conflict classes, version renumbering plan | T04, T12 | TEST-23 passes, and plans for merge cases match DATA-19 to DATA-22 | **Sonnet.** Hardest logic in v0.1, but pure functions with a detailed spec. Escalates if two attempts fail |
| T15 | Restore apply: single transaction, replace-everything with safety backup, post-commit count check | T11, T13, T14 | TEST-19 to TEST-22 and TEST-24 to TEST-26 pass, including the interrupted import | **Sonnet.** Gets the closest orchestrator review because it carries the data-loss risk |

## Interface

| # | Task and outcome | Needs | Done when | Model and why |
| --- | --- | --- | --- | --- |
| T16 | Material library page, edit drawer and phone sheet, archive, "used in" count, picker with quick-add | T03, T10 | PRD-04 to PRD-07 work at desktop and 375px | **Sonnet.** Standard feature work |
| T17 | Results panel: planned weights, shares, effective percentage, warnings. Reused by editor, version view and scale preview | T03, T08 | Renders WE-5 and WE-7 figures and warnings exactly | **Sonnet.** Standard component |
| T18 | Formula editor: inputs, basis control with live explanation, validation behaviour, draft autosave and restore, save with double-submit guard | T09, T11, T16, T17 | PRD-08 to PRD-14 and PRD-19 work, results stay empty while input is invalid | **Sonnet.** Largest interface task, but every rule is written down |
| T19 | Saved formulas list: search, archive filter, card layout on phones, empty state, example formula, last-backup line | T03, T11 | List, empty state and example work at both widths (PRD-18) | **Sonnet.** Standard feature work |
| T20 | Formula page and read-only version view: version history, measured weights with autosave status, actual blend | T09, T11, T17 | WE-8 figures appear, planned figures never change, PRD-16, PRD-17, PRD-20, PRD-21 | **Sonnet.** Standard feature work |
| T21 | Revise flow and scale dialog with live preview | T18, T20 | WE-9a figures in preview and saved version, source version unchanged (PRD-15, PRD-22, PRD-23) | **Sonnet.** Builds on finished parts |
| T22 | Backup and restore page: export, file check, preview, conflict choice, replace confirmation, result summary | T03, T12, T15 | PRD-24 to PRD-27 work, bad files show their reason | **Sonnet.** Standard feature work on top of tested logic |

## Verification and handoff

| # | Task and outcome | Needs | Done when | Model and why |
| --- | --- | --- | --- | --- |
| T23 | End-to-end round trip and the 375px pass (TEST-27, TEST-28) | T19 to T22 | Both pass in Playwright, including restore in a clean browser context | **Sonnet.** Browser tests need debugging skill, not architecture |
| T24 | End-to-end validation, double save, empty states, bad restore (TEST-29 to TEST-32) | T19 to T22 | All four pass | **Sonnet.** Same reasoning. Runs in parallel with T23 |
| T25 | Integration review and fixes: arithmetic against the reference script, version immutability, restore integrity, UX Playbook checklist at desktop and 375px in both themes, wording check | all above | No open Critical or High finding, or each one explicitly recorded | **Fable 5.2.** Cross-cutting judgement over the whole system |
| T26 | Final run on the exact commit: `npm ci`, lint, typecheck, unit, end-to-end, build. Commit and push the feature branch | T25, GitHub access | All pass on the pushed SHA, with commands and results captured | **Fable 5.2 (orchestrator, directly).** Six commands. Delegating costs more than running them, and the evidence must be first-hand |
| T27 | Handoff note under `Projects/apps/candle/Sessions/`, read back, Tasks and Current Context updated | T26 | Note path, commit URL and full SHA returned to the owner | **Fable 5.2 (orchestrator, directly).** Short, and it reports what the orchestrator verified itself |

## Running order

| Wave | Tasks in parallel |
| --- | --- |
| 1 | T01 |
| 2 | T02, T02b |
| 3 | T03, T04, T05, T06, T08 |
| 4 | T07, T09, T10 |
| 5 | T11, T12, T16, T17 |
| 6 | T13, T14, T18, T19, T20 |
| 7 | T15, T21 |
| 8 | T22 |
| 9 | T23, T24 |
| 10 | T25, then T26, then T27 |

## How the dashboard skill applies to v0.1

| Skill mode | Use in v0.1 |
| --- | --- |
| 1 Blueprint | T02b. Resolves blocker B-2 by setting tokens and component styles |
| 2 Animated charts | Not used. v0.1 has no charts. Applies from the modules that have metrics to plot |
| 3 Dark mode | T02b defines dark values for every token. Whether v0.1 ships a dark theme is decision D-15 |
| 5 Empty states | T02b sets the pattern. T16, T19, T20 and T22 apply it to the states listed in App Flow and Wireframes |
| 7 Build roadmap | Replaced by this plan |

## Open points

- **B-1 GitHub access.** `jubert-natura` could not see `pwekpwek/candle` on 2026-11-14. Waves 1 to 9 and T25 can run locally. Only the push in T26 needs it.
- **D-15 Dark mode in v0.1.** Not in the accepted spec. Proposed: T02b defines both token sets and v0.1 follows the device's light or dark setting, with no in-app toggle. Needs the owner's answer before T02b.
- **Vercel and Preview** stay with Codex, per the development handoff. No task here deploys.
- **The last v0.1 item in Tasks** (validation with real makers and the competitor check) is not in this plan because it needs people, not code.

## Appendix — reference arithmetic script

The worked examples in [[Projects/apps/candle/Specs/2 Calculation Rules|Calculation Rules]] were produced with this script (Node, no dependencies). T01 saves it as `tests/reference/worked-examples.mjs`. T25 runs it to check the engine independently.

```js
// Reference arithmetic for the GramGuard spec worked examples.
// Weights: integer milligrams (BigInt). Percent: integer hundredths of a percent (8% = 800).
const mg = (g) => BigInt(Math.round(g * 1000));
const g = (m, unit) => {
  const dp = unit === 1000n ? 0 : unit === 100n ? 1 : 2;
  return (Number(m) / 1000).toFixed(dp);
};
const roundHalfUp = (n, d) => (2n * n + d) / (2n * d); // positive rationals n/d -> nearest integer, half up
const roundToUnit = (n, d, unit) => roundHalfUp(n, d * unit) * unit;

function split({ mode, amount, pct, basis, unit }) {
  // mode: 'total' (amount = total mixture) | 'wax' (amount = wax weight)
  let fo, wax, total, exactFoN, exactFoD;
  if (mode === 'total') {
    [exactFoN, exactFoD] = basis === 'wax' ? [amount * pct, 10000n + pct] : [amount * pct, 10000n];
    fo = roundToUnit(exactFoN, exactFoD, unit);
    total = amount; wax = total - fo;
  } else {
    [exactFoN, exactFoD] = basis === 'wax' ? [amount * pct, 10000n] : [amount * pct, 10000n - pct];
    fo = roundToUnit(exactFoN, exactFoD, unit);
    wax = amount; total = wax + fo;
  }
  return { fo, wax, total, exactFo: Number(exactFoN) / Number(exactFoD) / 1000 };
}

function apportion(total, parts, unit) {
  const sum = parts.reduce((a, b) => a + b, 0n);
  const rows = parts.map((p, i) => {
    const n = total * p; const d = sum * unit;
    return { i, floor: (n / d) * unit, rem: n % d, exact: Number(n) / Number(sum) / 1000 };
  });
  let left = (total - rows.reduce((a, r) => a + r.floor, 0n)) / unit;
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const r of order) { if (left <= 0n) break; r.floor += unit; left--; }
  return rows.map((r) => ({ grams: r.floor, exact: r.exact }));
}

const pctStr = (x) => (Math.round(x * 100 + 1e-9) / 100).toFixed(2);

function show(label, s, unit, oils, waxes) {
  console.log(`\n${label}`);
  console.log(`  exact FO=${s.exactFo.toFixed(5)}  FO=${g(s.fo, unit)}  wax=${g(s.wax, unit)}  total=${g(s.total, unit)}`);
  const effWax = (Number(s.fo) / Number(s.wax)) * 100, effTot = (Number(s.fo) / Number(s.total)) * 100;
  console.log(`  effective: ${pctStr(effWax)}% of wax, ${pctStr(effTot)}% of total`);
  if (oils) console.log('  oils :', apportion(s.fo, oils, unit).map((r) => g(r.grams, unit)).join(' | '));
  if (waxes) console.log('  waxes:', apportion(s.wax, waxes, unit).map((r) => g(r.grams, unit)).join(' | '));
}

const U1 = 1000n, U01 = 100n, U001 = 10n;
show('WE-1', split({ mode: 'total', amount: mg(500), pct: 800n, basis: 'wax', unit: U01 }), U01);
show('WE-2', split({ mode: 'total', amount: mg(500), pct: 800n, basis: 'total', unit: U01 }), U01);
show('WE-3', split({ mode: 'wax', amount: mg(1000), pct: 1000n, basis: 'wax', unit: U01 }), U01);
show('WE-4', split({ mode: 'wax', amount: mg(450), pct: 1000n, basis: 'total', unit: U01 }), U01);
show('WE-5', split({ mode: 'total', amount: mg(1080), pct: 800n, basis: 'wax', unit: U01 }), U01, [3n, 2n, 1n]);
show('WE-6 at 0.1', split({ mode: 'total', amount: mg(250), pct: 900n, basis: 'total', unit: U01 }), U01, [50n, 30n, 20n]);
show('WE-6 at 0.01', split({ mode: 'total', amount: mg(250), pct: 900n, basis: 'total', unit: U001 }), U001, [50n, 30n, 20n]);
show('WE-7 at 1', split({ mode: 'total', amount: mg(50), pct: 600n, basis: 'wax', unit: U1 }), U1, [2n, 1n]);
show('WE-7 at 0.1', split({ mode: 'total', amount: mg(50), pct: 600n, basis: 'wax', unit: U01 }), U01, [2n, 1n]);
show('WE-7 at 0.01', split({ mode: 'total', amount: mg(50), pct: 600n, basis: 'wax', unit: U001 }), U001, [2n, 1n]);
show('WE-9a', split({ mode: 'total', amount: mg(1800), pct: 800n, basis: 'wax', unit: U01 }), U01, [3n, 2n, 1n]);
show('WE-9b', split({ mode: 'total', amount: mg(540), pct: 800n, basis: 'wax', unit: U01 }), U01, [3n, 2n, 1n]);
show('WE-9c', split({ mode: 'total', amount: mg(625), pct: 800n, basis: 'wax', unit: U01 }), U01);
show('WE-10', split({ mode: 'total', amount: mg(800), pct: 1000n, basis: 'wax', unit: U01 }), U01, [1n], [70n, 30n]);
show('WE-11', split({ mode: 'total', amount: mg(300), pct: 0n, basis: 'wax', unit: U01 }), U01);
show('WE-12', split({ mode: 'total', amount: mg(100), pct: 825n, basis: 'wax', unit: U001 }), U001, [60n, 40n]);
```

## Related

[[Projects/apps/candle/Specs/Specs Index|Specs Index]] · [[Projects/apps/candle/Specs/5 TRD and Test Plan|TRD and Test Plan]] · [[Projects/apps/candle/Claude Development Handoff|Development handoff instructions]] · [[AI/AI Rules/Claude Golden Rules|Claude Golden Rules]]
