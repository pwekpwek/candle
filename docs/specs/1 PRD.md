# CandleLab Studio — 1 PRD (v0.1 Foundation and GramGuard)

**Status:** Draft 2026-11-14, awaiting owner review. Nothing here is built yet.

## Problem

Candle makers work out wax and fragrance weights by hand, in spreadsheets or in single-purpose calculators. Three things go wrong:

1. "8% fragrance" means two different amounts depending on whether it is a percentage of the wax or of the whole mixture. Tools rarely say which they use.
2. What was actually weighed is not recorded next to what was planned, so a good candle cannot be reproduced and a bad one cannot be explained.
3. Formulas get overwritten when they are tweaked or scaled, so the earlier version is lost.

## Goal for v0.1

One complete local workflow in a browser: create a formula, see planned weights with the percentage basis spelled out, save it, reopen it, record measured weights, revise it, scale it, and back up and restore everything. No account, no server.

## Users

| User | Situation | What they need from v0.1 |
| --- | --- | --- |
| Beginner maker | Kitchen scale reading 1 g, mostly on a phone at the workbench, one wax and one oil, unsure what the percentage means. | A calculator that explains the basis in plain words, tells them exactly what to weigh, and keeps what they made. |
| Experienced maker or small business | 0.01 g scale, multi-oil blends, test batches scaled up to production runs. | Exact blend splits, planned versus measured, version history that survives revisions, and a backup they control. |

## Scope

| In v0.1 | Out of v0.1 |
| --- | --- |
| Responsive app shell | Accounts, sign-in, sync, sharing |
| Material library: wax, fragrance oil, wick, vessel | Costs and prices (v0.3 TrueCandle Cost) |
| GramGuard editor with both percentage bases | Batches, lot codes, suppliers per lot (v0.2 and v0.3 BatchTrace) |
| Multi-oil blends, wax blends (D-3) | Dye, UV inhibitor and other additives (D-4) |
| Planned and measured weights, actual blend | Overage or waste allowance (D-13) |
| Saved formulas with immutable versions | Ounces, pounds, volume-based dosing |
| Scaling into a new version | Curing, burn tests, scent panels, defects |
| Backup export and restore | Photos and file attachments |
| Example formula on first run (D-12) | Analytics or tracking of any kind |

## Beginner workflow

The acceptance checks in the requirements below follow this path.

1. **Open the app.** The saved formulas page is empty. It explains itself in one line and offers "New formula" and "Start from an example".
2. **Create.** Name the formula. Pick or quick-add a wax and an oil without leaving the editor. Enter batch size and fragrance percentage. The basis is stated in words next to the field, with the equivalent on the other basis.
3. **Read the results.** Planned grams for each wax and oil appear as soon as inputs are valid.
4. **Save.** The formula is saved as version 1. The page confirms it and offers the next step.
5. **Reopen.** Close the browser, come back, and open the formula from the list. Figures are identical.
6. **Measure.** Type what the scale showed next to each planned weight. The actual blend appears once all weights are in.
7. **Revise.** Change something (percentage, oil ratio, a material). Saving creates version 2. Version 1 still opens, unchanged.
8. **Scale.** Choose a new batch size or vessel count. A new version is created with recomputed weights.
9. **Back up and restore.** Export one file. On another browser or device, restore it and find every formula, version and measurement.

## Functional requirements

### App shell
- **PRD-01** Navigation offers Formulas, Materials, and Backup and restore. Desktop uses a sidebar. Phones use a bottom bar that clears the home indicator. Only built modules appear (D-10).
- **PRD-02** Every screen works at 375px wide with no horizontal page scroll, and on desktop.
- **PRD-03** The app works without any network request after the page has loaded. No formula data leaves the device.

### Material library
- **PRD-04** Makers can add, edit, archive and unarchive materials of four types: wax, fragrance oil, wick, vessel. Only the name is required.
- **PRD-05** Optional fields: supplier and notes for all types. Wax: supplier maximum fragrance percentage with its basis. Vessel: capacity in mL and default fill weight in grams. Wick: size or series text.
- **PRD-06** A material can be created from inside the formula editor with only a name, then filled in later.
- **PRD-07** Editing or archiving a material never changes a saved formula version. Archived materials are hidden from pickers but still show in the versions that used them.

### GramGuard editor and results
- **PRD-08** Inputs: formula name, sizing mode and amount, fragrance percentage, percentage basis, precision, one or more waxes, zero or more oils with parts, optional wick, optional vessel, optional notes.
- **PRD-09** The basis control is a labelled two-option choice ("of wax weight" / "of total mixture"). Beneath it a live sentence explains the current choice, for example: "8% of wax weight: 8 g of fragrance for every 100 g of wax. That is 7.41% of the total mixture."
- **PRD-10** Results update as the maker types, follow [[Projects/apps/candle/Specs/2 Calculation Rules|Calculation Rules]] exactly, and show grams with units on every figure.
- **PRD-11** Results list planned grams per component, wax total, fragrance total, total mixture, and each oil's share of the blend.
- **PRD-12** Invalid or incomplete input shows a field-level message and an empty results panel, never partial figures.
- **PRD-13** Unsaved work in the editor survives a reload as a draft. The editor says when a draft was restored and lets the maker discard it.

### Saving, versions, revisions
- **PRD-14** Saving a new formula creates version 1. A saved version is immutable.
- **PRD-15** "Revise" opens the editor pre-filled from a chosen version. Saving creates the next version with an optional change note. The source version is unchanged.
- **PRD-16** The formula page lists every version with number, date, origin (first, revision, scaled), change note and headline figures. Any version opens read-only with its original figures.
- **PRD-17** Formula name and notes can be edited without creating a version.
- **PRD-18** Formulas can be archived and unarchived. Permanent deletion requires confirmation that names the formula and counts its versions and measurements (D-8).
- **PRD-19** Save is protected against double submission and always resolves to a visible success or error.

### Measured weights
- **PRD-20** Each version has a measured-weights record where the maker enters actual grams per component (D-7). Entries autosave with a visible state (Saving, Saved, Error with retry).
- **PRD-21** Per-component difference and the actual blend follow the calculation rules. Planned figures never change when measurements are entered.

### Scaling
- **PRD-22** From any version the maker can scale by new vessel count, new amount, or multiplier. A preview shows the new planned weights before saving.
- **PRD-23** Saving the scale creates a new version marked as scaled, with its source version and factor.

### Backup and restore
- **PRD-24** "Export backup" downloads one file with all materials, formulas, versions and measurements. The page shows when the last backup was made.
- **PRD-25** "Restore" validates the file fully before writing anything, previews what will be added, skipped or in conflict, and applies the change all-or-nothing. Behaviour for duplicates, malformed files and interruption is defined in [[Projects/apps/candle/Specs/4 Data Model|Data Model]].
- **PRD-26** After a restore the page states exactly what happened and offers "Open saved formulas".
- **PRD-27** The app reminds the maker to back up when there are unsaved-to-backup changes, since browser storage can be cleared.

## Non-functional requirements

- **PRD-28 Privacy.** No accounts, no analytics, no third-party requests carrying user data.
- **PRD-29 Accessibility.** Real labels on every field, visible focus, full keyboard operation, errors tied to their fields, colour never the only signal, text contrast at WCAG AA.
- **PRD-30 Browsers.** Current Chrome, Edge, Firefox and Safari on desktop, Chrome on Android, Safari on iOS.
- **PRD-31 Performance.** Results update within 100 ms of a keystroke with 10 oils. The saved formulas list stays responsive with 500 formulas.
- **PRD-32 Wording.** The app describes arithmetic and records. It never states or implies that a candle, fragrance level or wick is safe or compliant. Warnings refer makers to their supplier's guidance.

## v0.1 acceptance (round trip)

Mirrors the "Verify a complete round trip" task in [[Projects/apps/candle/Tasks|Tasks]]:

1. Save a three-oil formula matching worked example WE-5.
2. Enter the measured weights from WE-8 and confirm the actual blend figures.
3. Reload. Planned and measured figures are unchanged.
4. Create a scaled revision to 10 vessels and confirm WE-9a figures.
5. Export a backup, open a fresh browser profile, restore, and confirm both versions and the measurements are present and correct.
6. Confirm version 1 still opens with its original figures.

## Prototype validation (after build)

Questions for the maker sessions in the last v0.1 task:

- Can a beginner say in their own words what "8% of wax weight" will make them weigh, and how it differs from "of total mixture"?
- Can they record measured weights for a small batch on a phone without help?
- Can they find and reopen an earlier version after revising?
- Can they restore their formulas on a second device from the backup file?
- Do experienced makers trust the rounding and the way blends add up?
- Which of these tasks do Formula Studio, Craftybase, Pour & Track, Batchora, CandleSmart and Pourwick already do well? Run the same tasks there before committing to differentiators.

## Open

Decisions D-3, D-4, D-7, D-8, D-10, D-12 and D-13 in the [[Projects/apps/candle/Specs/Specs Index|Specs Index]].

## Related

[[Projects/apps/candle/Specs/2 Calculation Rules|Calculation Rules]] · [[Projects/apps/candle/Specs/3 App Flow and Wireframes|App Flow and Wireframes]] · [[Projects/apps/candle/Specs/4 Data Model|Data Model]] · [[Projects/apps/candle/Specs/5 TRD and Test Plan|TRD and Test Plan]] · [[Projects/apps/candle/Overview|Overview]]
