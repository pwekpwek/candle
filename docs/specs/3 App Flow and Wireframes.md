# CandleLab Studio — 3 App Flow and Wireframes (v0.1)

**Status:** Draft 2026-11-14, awaiting owner review. Nothing here is built yet.

Wireframes show structure and content order. Colour, type and component styling follow the [[Projects/apps/candle/Brand/Brand Guide|design direction]] (warm neutral dashboard, one accent), whose tokens are still open. The dashboard concept image is not in the vault yet, so nothing here depends on it.

## Sitemap

| Route | Screen | Notes |
| --- | --- | --- |
| `/` | Saved formulas | Home. Empty state on first run. |
| `/formulas/new` | Formula editor (new) | Restores an unsaved draft if one exists. |
| `/formulas/[formulaId]` | Formula page | Latest version: results, measured weights, version history. |
| `/formulas/[formulaId]/versions/[versionId]` | Version view | Read-only results and measured weights for any version. |
| `/formulas/[formulaId]/revise?from=[versionId]` | Formula editor (revise) | Pre-filled from the chosen version. |
| `/materials` | Material library | Add and edit open in a drawer (desktop) or bottom sheet (phone). |
| `/backup` | Backup and restore | Export, restore, last backup date. |

Scaling is a dialog on the formula and version pages, not a route.

## Navigation

- **Desktop (≥ 1024px):** left sidebar with the product name, Formulas, Materials, Backup and restore. Content beside it.
- **Tablet (640 to 1023px):** sidebar collapses to icons with labels on focus and hover.
- **Phone (< 640px):** bottom bar with the same three destinations, padded for the home indicator. Page content keeps matching bottom padding.
- Future modules are not shown until they exist (D-10).

## Flows

### F1 — Create and save
1. Saved formulas → "New formula". Cursor starts in the name field.
2. Choose a wax. If the library is empty, the picker's first row is "Add a wax", which asks for a name only and selects it.
3. Enter batch size (mode defaults to Total mixture), fragrance percentage and basis. The explanation sentence updates live.
4. Add oils. One oil needs no parts. A second oil reveals parts fields for both.
5. Results appear when inputs are valid.
6. "Save formula" → button shows a spinner in place, then the app moves to the formula page with a confirmation: "Saved as version 1" and the actions "Enter measured weights" and "Back to saved formulas".
7. On validation failure: nothing is saved, focus moves to the first problem field, and its message is shown.

### F2 — Reopen
Saved formulas → tap a formula → formula page shows the latest version. Figures are read from the saved version, never recalculated from current material data.

### F3 — Record measured weights
On the formula or version page, each component row has a "Measured" field. Typing autosaves after a short pause. A status pill shows Saving, Saved, or Error with Retry. The actual blend card fills in when every wax and oil has a value.

### F4 — Revise
Formula page → "Revise" → editor pre-filled from that version, with a banner "Revising version 2. Saving creates version 3." Optional "What changed?" note. Save → formula page shows the new version. The earlier version stays in history.

### F5 — Scale
Formula page → "Scale" → dialog with the options for the version's sizing mode, a live preview of new planned weights, and any rounding warning. "Save as new version" creates it and opens it.

### F6 — Export backup
Backup and restore → "Export backup" → file downloads. The page shows "Last backup: today, 14:05 · 12 formulas, 31 versions". If an unsaved draft exists, the page says it is not included.

### F7 — Restore
1. "Restore from backup" → choose file.
2. The app checks the file. On any problem: "This file can't be restored" with the specific reason. Nothing is changed.
3. Preview: counts of items to add, identical items to skip, and conflicts. Choice of "Add to what's here" (default) or "Replace everything on this device".
4. Conflicts, if any, offer "Keep this device's copy" (default) or "Use the backup's copy".
5. "Replace everything" first downloads a safety backup of current data, then requires typing REPLACE.
6. Confirm → progress → result summary with "Open saved formulas".

### F8 — Manage materials
Material library → tabs or filter by type → add, edit, archive. Archiving a material used by saved formulas explains: "Used in 3 formulas. They keep their saved details."

## Wireframes

### Saved formulas — desktop

```
+----------------+----------------------------------------------------------------+
| CandleLab      | Saved formulas                                 [ + New formula ]|
|                | Last backup: 3 days ago · Back up now                           |
| > Formulas     |                                                                |
|   Materials    | [ Search formulas          ]   Show: (Active) Archived          |
|   Backup       |----------------------------------------------------------------|
|                | Name                 Version  Fragrance            Total  Updated|
|                | Lavender Vanilla     v3       8% of wax weight   1800.0 g  2h ago|
|                | Citrus Test          v1       9% of total mix     250.0 g  Nov 12|
|                | Unscented Pillar     v2       0%                  300.0 g  Nov 10|
+----------------+----------------------------------------------------------------+
```

### Saved formulas — phone (375px), rows become cards

```
+-----------------------------------+
| Saved formulas        [ + New ]   |
| Last backup: 3 days ago · Back up |
| [ Search formulas              ]  |
| +-------------------------------+ |
| | Lavender Vanilla           v3 | |
| | 8% of wax weight              | |
| | Total 1800.0 g · 2h ago       | |
| +-------------------------------+ |
| +-------------------------------+ |
| | Citrus Test                v1 | |
| | 9% of total mixture           | |
| | Total 250.0 g · Nov 12        | |
| +-------------------------------+ |
|-----------------------------------|
|  Formulas   Materials   Backup    |
+-----------------------------------+
```

### Saved formulas — first run (empty)

```
+-----------------------------------+
| Saved formulas                    |
|                                   |
|  Your formulas will live here.    |
|  Work out wax and fragrance       |
|  weights, then save them to       |
|  reuse and revise.                |
|                                   |
|  [ New formula ]                  |
|  Start from an example            |
+-----------------------------------+
```

### Formula editor — desktop (inputs left, live results right)

```
+----------------+----------------------------------+-----------------------------+
| CandleLab      | New formula                      | Planned weights             |
|                | Name                             |                             |
|                | [ Lavender Vanilla            ]  | Wax                         |
|                |                                  |   Soy 464        1000.0 g   |
|                | Batch size                       | Fragrance           80.0 g  |
|                | (Total mixture) Vessels  Wax     |   Lavender   50.00%  40.0 g |
|                | Vessels [ 6 ] x Fill [ 180 ] g   |   Vanilla    33.33%  26.7 g |
|                | = 1080.0 g total mixture         |   Cedar      16.67%  13.3 g |
|                |                                  | --------------------------- |
|                | Fragrance                        | Total mixture     1080.0 g  |
|                | [ 8    ] %  (of wax weight)      |                             |
|                |             of total mixture     | 8% of wax weight            |
|                | 8 g of fragrance for every 100 g | = 7.41% of total mixture    |
|                | of wax. That is 7.41% of the     |                             |
|                | total mixture.                   |                             |
|                |                                  |                             |
|                | Precision  1 g  (0.1 g)  0.01 g  |                             |
|                |                                  |                             |
|                | Wax                              |                             |
|                | [ Soy 464                    v ] |                             |
|                | + Add another wax                |                             |
|                |                                  |                             |
|                | Fragrance oils            Parts  |                             |
|                | [ Lavender             v ] [ 3 ] |                             |
|                | [ Vanilla              v ] [ 2 ] |                             |
|                | [ Cedar                v ] [ 1 ] |                             |
|                | + Add oil                        |                             |
|                |                                  |                             |
|                | Wick [ optional v ]              |                             |
|                | Vessel [ optional v ]            |                             |
|                | Notes [                       ]  |                             |
|                |                                  |                             |
|                | [ Save formula ]   Cancel        |                             |
+----------------+----------------------------------+-----------------------------+
```

### Formula editor — phone (375px)

Single column. Results sit below the inputs. A fixed summary bar keeps the headline figures and Save in reach.

```
+-----------------------------------+
| < New formula                     |
| Name                              |
| [ Lavender Vanilla             ]  |
| Batch size                        |
| [ Total ][ Vessels ][ Wax ]       |
| Vessels [ 6 ]   Fill [ 180 ] g    |
| = 1080.0 g total mixture          |
| Fragrance                         |
| [ 8 ] %                           |
| [ of wax weight ][ of total mix ] |
| 8 g of fragrance for every 100 g  |
| of wax. That is 7.41% of the      |
| total mixture.                    |
| Precision [ 1 g ][ 0.1 g ][0.01 g]|
| Wax                               |
| [ Soy 464                     v ] |
| + Add another wax                 |
| Fragrance oils                    |
| [ Lavender              v ]       |
|   Parts [ 3 ]            Remove   |
| [ Vanilla               v ]       |
|   Parts [ 2 ]            Remove   |
| + Add oil                         |
| Planned weights                   |
| +-------------------------------+ |
| | Soy 464            1000.0 g   | |
| | Lavender  50.00%     40.0 g   | |
| | Vanilla   33.33%     26.7 g   | |
| | Cedar     16.67%     13.3 g   | |
| | Total mixture      1080.0 g   | |
| +-------------------------------+ |
|-----------------------------------|
| Wax 1000.0 g · Fragrance 80.0 g   |
| [          Save formula         ] |
+-----------------------------------+
```

### Formula page: results and measured weights — desktop

```
+----------------+----------------------------------------------------------------+
| CandleLab      | Lavender Vanilla                    [ Revise ] [ Scale ] [ ... ]|
|                | Version 2 · revised from v1 · Nov 13 · 6 vessels x 180.0 g      |
|                |                                                                |
|                | Planned blend                  | Actual blend                   |
|                | 8% of wax weight               | 8.01% of wax weight            |
|                | = 7.41% of total mixture       | = 7.42% of total mixture       |
|                |                                                                |
|                | Component      Planned    Measured        Difference     Saved |
|                | Soy 464       1000.0 g    [ 1003.2 ] g    +3.2 g  +0.32%        |
|                | Lavender        40.0 g    [ 40.4   ] g    +0.4 g  +1.00%        |
|                | Vanilla         26.7 g    [ 26.1   ] g    0.6 g under  -2.25%   |
|                | Cedar           13.3 g    [ 13.9   ] g    0.6 g over   +4.51%   |
|                | Fragrance       80.0 g       80.4 g       +0.4 g  +0.50%        |
|                | Total mixture 1080.0 g     1083.6 g       +3.6 g  +0.33%        |
|                |                                                                |
|                | Versions                                                       |
|                | v2  Revision: cedar added  Nov 13   1080.0 g   8% of wax weight |
|                | v1  First version          Nov 12   1080.0 g   8% of wax weight |
+----------------+----------------------------------------------------------------+
```

After scaling to 10 vessels the list gains "v3  Scaled x1.67 from v2  1800.0 g" and the page shows version 3 with empty measured fields.

### Results and measured weights — phone

Each component is a card with labelled values. No sideways scrolling.

```
+-----------------------------------+
| < Lavender Vanilla         [...]  |
| Version 2 · Nov 13                |
| [ Revise ]  [ Scale ]             |
| Planned: 8% of wax weight         |
|  = 7.41% of total mixture         |
| Actual: 8.01% of wax weight       |
|  = 7.42% of total mixture         |
| +-------------------------------+ |
| | Vanilla                       | |
| | Planned              26.7 g   | |
| | Measured        [ 26.1 ] g    | |
| | 0.6 g under plan (-2.25%)     | |
| +-------------------------------+ |
| ...                               |
| Versions                          |
| v2 Revision · Nov 13            > |
| v1 First version · Nov 12       > |
+-----------------------------------+
```

### Scale dialog

```
+---------------------------------------+
| Scale version 2                       |
| Vessels  [ 10 ]   Fill [ 180 ] g      |
| New total mixture: 1800.0 g           |
|                                       |
| Soy 464      1000.0 g  ->  1666.7 g   |
| Lavender       40.0 g  ->    66.7 g   |
| Vanilla        26.7 g  ->    44.4 g   |
| Cedar          13.3 g  ->    22.2 g   |
|                                       |
| Percentage, basis and ratios stay the |
| same. This saves as version 3.        |
| [ Save as new version ]   Cancel      |
+---------------------------------------+
```

### Material library — desktop, and the edit drawer

```
+----------------+-----------------------------------------+----------------------+
| CandleLab      | Materials              [ + Add material]| Edit wax             |
|                | (All) Wax  Oils  Wicks  Vessels         | Name                 |
|                |-----------------------------------------| [ Soy 464         ]  |
|                | Name          Type    Supplier   Used in| Supplier (optional)  |
|                | Soy 464       Wax     —          3      | [                 ]  |
|                | Lavender      Oil     —          2      | Supplier max         |
|                | CD 10         Wick    —          1      | fragrance (optional) |
|                | 8 oz tumbler  Vessel  —          2      | [ 10 ] % of wax wt v |
|                |                                         | Notes                |
|                |                                         | [                 ]  |
|                |                                         | [ Save ]  Archive    |
+----------------+-----------------------------------------+----------------------+
```

On a phone the list becomes cards (name, type, "Used in 3 formulas") and the editor opens as a bottom sheet.

Phone (375px): cards, with the editor as a bottom sheet.

```
+-----------------------------------+
| Materials               [ + Add ] |
| [All][Wax][Oils][Wicks][Vessels]  |
| +-------------------------------+ |
| | Soy 464                   Wax | |
| | Used in 3 formulas            | |
| +-------------------------------+ |
| +-------------------------------+ |
| | Lavender                  Oil | |
| | Used in 2 formulas            | |
| +-------------------------------+ |
|===================================|
| Edit wax                      [x] |
| Name                              |
| [ Soy 464                      ]  |
| Supplier (optional)               |
| [                              ]  |
| Supplier max fragrance (optional) |
| [ 10 ] %  [ of wax weight     v ] |
| [ Save ]                Archive   |
+-----------------------------------+
```

### Backup and restore

```
+-------------------------------------------------------------+
| Backup and restore                                          |
| Your formulas are stored in this browser only. Clearing     |
| browser data removes them. Keep a backup file somewhere safe.|
|                                                             |
| Back up                                                     |
| Last backup: 3 days ago · 4 changes since                   |
| [ Export backup ]                                           |
|                                                             |
| Restore                                                     |
| [ Choose backup file ]                                      |
|                                                             |
|   candlelab-backup-20261114-140512.json                     |
|   Exported Nov 14, 14:05 · 12 formulas · 31 versions        |
|   Will add 9 formulas, 22 versions, 14 materials            |
|   Already here: 3 formulas, 9 versions                      |
|   Conflicts: 1 material   (Keep this device's copy v)       |
|   (o) Add to what's here   ( ) Replace everything           |
|   [ Restore ]   Cancel                                      |
+-------------------------------------------------------------+
```

## Screen states

| Screen | State | Behaviour |
| --- | --- | --- |
| Saved formulas | Empty | One-line explanation, "New formula", "Start from an example". |
| Saved formulas | No search match | "No formulas match 'xyz'." with Clear search. |
| Editor | Draft restored | Banner: "Restored your unsaved draft from Nov 14, 13:40." with Discard. |
| Editor | Incomplete | Results panel shows the "Results appear when…" line. |
| Editor | Rounding warning | Inline notice above results (CALC-13). |
| Editor | Saving | Button busy, width locked, further taps ignored. |
| Editor | Save failed | Error next to the button with Retry. Draft is kept. |
| Editor | Leaving with changes | Draft is saved, so no blocking prompt. |
| Formula page | No measurements | Measured fields empty, actual blend card asks for weights. |
| Formula page | Measurement save failed | Pill shows Error with Retry. Typed value stays in the field. |
| Material picker | Empty library | First row "Add a wax" / "Add an oil". |
| Material library | Empty | "Add the waxes, oils, wicks and vessels you use." with Add material. |
| Backup | Never backed up | "No backup yet." |
| Restore | Invalid file | Specific reason. Nothing changed. |
| Restore | Storage unavailable (private mode, quota) | "This browser can't store data right now." with what to try. |
| Any | Storage blocked at start | Full-page explanation. The calculator still works without saving. |

## Interface rules

Applied from the [[AI/Skills/UX Playbook Skill|UX Playbook]]:

- **FLOW-01** Every fragrance percentage is followed by its basis in words. Every weight carries "g".
- **FLOW-02** Number inputs are text fields with `inputmode="decimal"` (whole-number fields use `numeric`), at least 16px font, with real labels above them.
- **FLOW-03** Tap targets are at least 44px on touch devices with 8px between them.
- **FLOW-04** Numbers are right-aligned with tabular figures. Text is left-aligned.
- **FLOW-05** Tables become labelled cards below 640px. No core data behind horizontal scroll.
- **FLOW-06** Validate on blur, clear the error on the next valid keystroke, focus the first problem on save.
- **FLOW-07** Save and Restore buttons guard against double submission and resolve to success or error.
- **FLOW-08** Buttons stay enabled and explain what is missing when pressed, instead of sitting disabled without a reason.
- **FLOW-09** Destructive actions (permanent delete, replace everything) require confirmation that names what is affected.
- **FLOW-10** One accent colour, hairline borders on cards, shadows only on dialogs, drawers and menus. No gradients, no decorative icon tiles.
- **FLOW-11** Hover-only actions have a visible home on touch (the "..." menu).

## Open

Decisions D-10 and D-12 in the [[Projects/apps/candle/Specs/Specs Index|Specs Index]]. Colour tokens, typography and the dashboard concept image are open in the Brand Guide.

## Related

[[Projects/apps/candle/Specs/1 PRD|PRD]] · [[Projects/apps/candle/Specs/2 Calculation Rules|Calculation Rules]] · [[Projects/apps/candle/Specs/4 Data Model|Data Model]] · [[Projects/apps/candle/Specs/5 TRD and Test Plan|TRD and Test Plan]]
