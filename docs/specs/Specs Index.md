# CandleLab Studio — Spec Pack (v0.1 Foundation and GramGuard)

Created 2026-11-14 at the owner's request to define the specification before any code is written.

**Status: Draft, awaiting owner review. No application code exists yet.** Build starts after the owner confirms the decisions below and blocker B-1 is cleared.

## The Pack

| # | Doc | Answers |
| --- | --- | --- |
| 1 | [[Projects/apps/candle/Specs/1 PRD\|PRD]] | Who v0.1 is for, what is in and out, the beginner workflow, requirements and acceptance |
| 2 | [[Projects/apps/candle/Specs/2 Calculation Rules\|Calculation Rules]] | Percentage bases, rounding, blends, target versus actual, scaling, validation, worked examples |
| 3 | [[Projects/apps/candle/Specs/3 App Flow and Wireframes\|App Flow and Wireframes]] | Sitemap, flows, desktop and phone wireframes, screen states, interface rules |
| 4 | [[Projects/apps/candle/Specs/4 Data Model\|Data Model]] | Records and IDs, immutable versions, snapshots, backup file, restore rules |
| 5 | [[Projects/apps/candle/Specs/5 TRD and Test Plan\|TRD and Test Plan]] | Stack, build slices, test plan, definition of done, risks |
| 6 | [[Projects/apps/candle/Specs/6 Implementation Plan\|Implementation Plan]] | 28 build tasks with dependencies, acceptance checks, the model for each, and the running order |

These cover the first three v0.1 items in [[Projects/apps/candle/Tasks|Tasks]] (requirements and wireframes, calculation rules, local data model), accepted by the owner on 2026-11-14.

## Decisions needing owner confirmation

**Accepted by the owner on 2026-11-14.** All fourteen proposed answers below were accepted as written ("Accept all"). They are now the agreed rules for the v0.1 build. Where the numbered specs still say "Proposed" next to D-1 to D-14, read it as accepted.

Each has a proposed answer already written into the specs. Confirm or change them before build.

| ID | Decision | Proposed |
| --- | --- | --- |
| D-1 | Default percentage basis for a new formula | Percentage of wax weight, always labelled, with the other basis shown as an equivalent |
| D-2 | Default precision | 0.1 g, with 1 g and 0.01 g selectable per formula |
| D-3 | Wax blends (more than one wax by ratio) in v0.1 | Yes. It reuses the oil-blend rule |
| D-4 | Dye and other additives | Out of v0.1. Makers record them in notes |
| D-5 | Fragrance percentage limits | Hard limit 0 to 50%. Warning above 12% of wax weight and above a wax's recorded supplier maximum |
| D-6 | Thresholds | Rounding warning when rounding moves a weight more than 2%. Off-target flag beyond the larger of one precision step or 2% |
| D-7 | Measured weights per version | One record per version in the v0.1 interface. The data model allows more |
| D-8 | Deleting formulas | Archive by default. Permanent delete with a confirmation that names what is removed |
| D-9 | Restore default | Add to what's here, keep this device's copy on conflict. "Replace everything" available with an automatic safety backup |
| D-10 | Navigation | Show only built modules. No placeholders for later modules |
| D-11 | Stack specifics | Dexie, Zod, Vitest, Playwright, npm, Node 24, client-only data |
| D-12 | First run | Offer an example formula alongside "New formula" |
| D-13 | Overage or waste allowance | Out of v0.1 |
| D-14 | Units | Grams only. Vessel capacity in mL is informational |

## Blockers and gaps

- **B-1 — GitHub access.** On 2026-11-14 the signed-in GitHub account `jubert-natura` could not see `pwekpwek/candle`. Create the repository, add that account as a collaborator, or sign the GitHub CLI in as the owning account.
- **B-2 — Design tokens.** Colour, typography and the dashboard concept image are still open in the [[Projects/apps/candle/Brand/Brand Guide|Brand Guide]]. The wireframes define structure only. Build can start with neutral tokens and be restyled, or wait for these.

- **D-15 — Dark mode in v0.1 (open, raised 2026-11-14 after acceptance).** Not in the accepted spec. Proposed: define light and dark tokens together and follow the device's setting, with no in-app toggle. Needs the owner's answer before task T02b in the [[Projects/apps/candle/Specs/6 Implementation Plan|Implementation Plan]].
- B-2 is planned to be settled by task T02b using the [[AI/Skills/Premium Dashboard Design Skill|Premium Dashboard Design]] skill.

## Authority and Drift Rule

- For v0.1 behaviour these specs are the reference. [[Projects/apps/candle/Overview|Overview]] holds product-wide scope, [[Projects/apps/candle/Tasks|Tasks]] holds checklists, [[Projects/apps/candle/Current Context|Current Context]] holds status.
- Specs hold no checklists, no library version numbers and no deployment URLs. Those belong in Tasks and in the development handoff notes under `Sessions/`.
- Items marked **Proposed** or listed above are open. Do not build against a different answer without recording the change here first.
- If the build has to deviate from a rule, update the spec in the same session and say so in the handoff note.
- The worked examples in Calculation Rules were computed with exact integer arithmetic and checked by script on 2026-11-14. If a rule changes, recompute the affected examples before changing code.

## Related

[[Projects/apps/candle/Projects Index|Project index]] · [[Projects/apps/candle/Claude Development Handoff|Development handoff instructions]] · [[Projects/apps/candle/Overview|Overview]]
