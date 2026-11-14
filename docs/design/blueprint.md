# CandleLab Studio — Design Blueprint (v0.1)

Task T02b. Produced with modes 1 (blueprint), 3 (dark mode) and 5 (empty states) of `Premium Dashboard Design Skill.md`, under the rules of `UX Playbook Skill.md` (both in this folder). Resolves blocker B-2 and decision D-15.

Tokens live in `src/app/tokens.css`. Tailwind names are mapped in `src/app/globals.css`. **Screens use token names only, never raw colour values.**

## 1. Who it is for and what leads

- **Users:** a beginner at a workbench with a phone and a 1 g scale, and an experienced maker with a 0.01 g scale and multi-oil blends.
- **Decisions the interface supports:** what to weigh out, whether what was weighed matches the plan, and which version to make again.
- **The hero is the planned weight.** On the editor and formula page, grams per component are the largest, darkest numbers on screen. v0.1 has no charts and no KPI tiles.
- **Direction:** a warm, neutral working tool. Paper-coloured page, white cards with hairline borders, one burnt-amber accent. Premium comes from spacing, alignment and consistency, not decoration.

## 2. Layout

| Width | Navigation | Content |
| --- | --- | --- |
| ≥ 1024px | Left sidebar, 240px, `bg-muted`, product name on top, three destinations | Max width 1120px, 32px side padding |
| 640–1023px | Sidebar collapses to a 64px icon rail. Labels show on hover and focus, and are always in `aria-label` | 24px side padding |
| < 640px | Fixed bottom bar, three destinations with icon and label, padded with `env(safe-area-inset-bottom)` | 16px side padding, bottom padding equal to the bar so nothing hides under it |

Page anatomy, top to bottom: page header (title `text-xl font-semibold`, one line of context in `text-text-secondary`, primary action on the right; on phones the action sits under the title or in the header row if short), then the primary region, then secondary regions.

- **Editor, desktop:** two columns. Inputs left (max 560px), results right in a sticky card.
- **Editor, phone:** one column, results under the inputs, and a fixed summary bar above the bottom navigation with the headline weights and Save.
- **Tables** become labelled cards below 640px (FLOW-05). No core data behind horizontal scroll.

Eye order: page title → primary action → the numbers → supporting text.

## 3. Tokens

### Colour

| Token (Tailwind name) | Use | Light | Dark |
| --- | --- | --- | --- |
| `background` | Page | `#FAF8F4` | `#14120F` |
| `card` | Cards, tables, inputs | `#FFFFFF` | `#1C1916` |
| `popover` | Menus, dialogs, drawers, sheets | `#FFFFFF` | `#25211C` |
| `muted` | Sidebar, table header, quiet fills | `#F3EFE8` | `#191613` |
| `secondary` | Secondary button fill | `#F3EFE8` | `#25211C` |
| `foreground` | Primary text, numbers | `#1F1B16` | `#E3DED7` (92% warm white) |
| `text-secondary` | Supporting text | `#5A5247` | `#ABA7A1` (66%) |
| `muted-foreground` | Captions, hints, placeholders | `#746B5E` | `#918D86` (52%) |
| `primary` | The one accent: primary button, links, focus ring, active nav text | `#9A4A12` | `#E2A06C` |
| `primary-foreground` | Text on `primary` | `#FFFFFF` | `#1A120A` |
| `accent` | Selected nav item, menu row hover | `#F6E9DC` | `#33251A` |
| `border` | Hairlines | `#E3DCD1` | warm white 9% |
| `input` | Outlines of inputs, selects, checkboxes | `#8C8375` | warm white 36% |
| `ring` | Focus outline | `#9A4A12` | `#E2A06C` |
| `destructive` / `destructive-soft` | Errors, permanent delete | `#B3261E` / `#FBEAE8` | `#F2877E` / `#3A1C19` |
| `warning` / `warning-soft` | Warnings (V-08, V-09, CALC-13), backup reminder | `#7A4F00` / `#FBF0D9` | `#E5B567` / `#33290F` |
| `success` / `success-soft` | Saved confirmations | `#2C6A3A` / `#E6F2E7` | `#86C594` / `#18301E` |
| `overlay` | Behind dialogs and sheets | ink 40% | black 60% |

Rules: one accent. No gradients, no glow, no coloured icon tiles (FLOW-10). Status colour is always joined by words or an icon (PRD-29). A notice is a `*-soft` fill with a 1px border in the status colour at low strength and text in `foreground`, with the status colour on the icon and the first words.

### Contrast (WCAG 2.1, computed 2026-11-15)

Text needs 4.5:1. Control outlines and focus rings need 3:1.

| Pair | Light | Dark |
| --- | --- | --- |
| `foreground` on `background` / `card` / `muted` | 16.1 / 17.1 / 14.9 | 14.0 / 13.2 / 13.6 |
| `text-secondary` on `background` / `card` / `muted` | 7.3 / 7.7 / 6.7 | 7.6 / 7.3 / 7.4 |
| `muted-foreground` on `background` / `card` / `muted` | 4.9 / 5.2 / 4.6 | 5.1 / 5.0 / 5.1 |
| `muted-foreground` on `popover` | 5.2 | 4.8 |
| `primary` on `background` / `card` / `muted` | 5.9 / 6.3 / 5.5 | 8.4 / 7.9 / 8.1 |
| `primary-foreground` on `primary` | 6.3 | 8.4 |
| `primary` on `accent` | 5.2 | 6.7 |
| `destructive` on `card` / on `destructive-soft` | 6.5 / 5.6 | 7.1 / 6.3 |
| `destructive-foreground` on `destructive` | 6.5 | 7.8 |
| `warning` on `card` / on `warning-soft` | 7.1 / 6.3 | 9.3 / 7.6 |
| `success` on `card` / on `success-soft` | 6.5 / 5.6 | 8.7 / 7.0 |
| `input` outline on `card` / `background` | 3.7 / 3.5 | 3.1 / 3.1 |
| `ring` on `background` | 5.9 | 8.4 |

All pairs pass AA in both themes.

### Type

Geist (self-hosted at build by `next/font`, no remote request at run time), falling back to the system UI font. Two weights: 400 and 600.

| Tailwind | Size / line | Use |
| --- | --- | --- |
| `text-xs` | 12 / 16 | Captions, small-caps labels (`uppercase tracking-wide`) |
| `text-sm` | 14 / 20 | Supporting text, table cells, help text |
| `text-base` | 16 / 24 | Body, **every input**, buttons |
| `text-lg` | 18 / 24 | Section headings |
| `text-xl` | 22 / 28 | Page titles (`tracking-tight`) |
| `text-2xl` | 28 / 32 | Headline figure where one is needed |

Numbers use the `tabular` class and are right-aligned. Text is left-aligned (FLOW-04). Every weight carries "g". Every fragrance percentage is followed by its basis in words (FLOW-01).

### Space, shape, elevation

- **Spacing:** Tailwind's 4px scale. Use 4, 8, 12, 16, 24, 32, 48. Field to field 16. Section to section 32. Card padding 16 on phones, 24 from 640px.
- **Radius:** `rounded-sm` 6px for chips, `rounded-md` 8px for buttons and inputs, `rounded-lg` 12px for cards, `rounded-xl` 16px for dialogs and sheets. No radius on edges that touch the screen edge (bottom bar, sheet bottom).
- **Elevation:** cards have a 1px `border` and no shadow. `shadow-popover` for menus and popovers. `shadow-dialog` for dialogs, drawers and sheets. In dark mode depth comes from the surface steps.
- **Motion:** 150ms for hover and focus, 200ms for sheets, drawers and dialogs. Nothing loops. All motion is removed under `prefers-reduced-motion` (handled globally).

## 4. Components and states

| Component | Style and states |
| --- | --- |
| Button, primary | `bg-primary text-primary-foreground`, 40px high (44px on touch), `rounded-md`, `font-semibold`. One per view. Busy: spinner replaces the label's icon slot, width locked, `aria-busy`, further presses ignored (FLOW-07). Buttons stay enabled and explain what is missing when pressed (FLOW-08). |
| Button, secondary | `bg-secondary`, 1px `border`. |
| Button, quiet / link | Text in `primary`, underline on hover. For "Cancel", "Start from an example", "Back up now". |
| Button, destructive | `bg-destructive text-destructive-foreground`. Only inside a confirmation. |
| Field | Label above (`text-sm font-semibold`), control 40px (44px touch) with 1px `border-input` on `bg-card`, help text below in `text-muted-foreground`. Error: border and message in `destructive`, an icon before the message, `aria-invalid` and `aria-describedby`. Number fields are `type="text"` with `inputmode="decimal"` (or `numeric` for whole numbers), right-aligned, with the unit shown after the field. |
| Segmented control | 2–4 options that switch a mode (sizing mode, basis, precision, type filter). A radio group underneath. Selected: `bg-card`, `font-semibold`, 1px `border-input`; track `bg-muted`. |
| Card | `bg-card`, 1px `border`, `rounded-lg`. Never nested. When a card has one action the whole card is the target. |
| Table | Header `bg-muted text-xs uppercase`. One hairline between rows, row hover `bg-muted` (inside `@media (hover: hover)`). Numbers right. Becomes cards below 640px. |
| Notice | Inline, above the thing it concerns. Variants: warning, error, success, info (`bg-muted`). Icon, text, optional action. |
| Status pill | Autosave state on measured weights: Saving…, Saved, Error with Retry. Text plus icon, in an `aria-live="polite"` region. |
| Dialog | Centered, max 480px, `rounded-xl`, `shadow-dialog`, over `overlay`. Title, body, actions right-aligned with the primary last. Full-width sheet from the bottom on phones. |
| Drawer / sheet | Material editor: right drawer 420px on desktop, bottom sheet on phones. |
| Navigation item | Icon and label. Active: `bg-accent`, text `foreground`, icon `primary`, `aria-current="page"`. |
| Toast | Not used in v0.1. Confirmations appear inline where the action happened. |

Icons: `lucide-react`, 16px in text and 20px in navigation, stroke 1.75, coloured like the text beside them. Never inside a coloured tile.

## 5. Empty states (one pattern)

Component `EmptyState`: `{ icon, title, description, action, secondaryAction? }`.

Layout, identical everywhere: inside the region it replaces, left-aligned, 48px vertical padding (32px on phones), maximum width 44ch. A 20px icon in `muted-foreground`, then the title (`text-base font-semibold`), then one line of description (`text-sm text-text-secondary`), then the primary button and an optional quiet link beside it. No illustration, no tile.

| Where | When | Title | Description | Action |
| --- | --- | --- | --- | --- |
| Saved formulas | First run | Your formulas will live here. | Work out wax and fragrance weights, then save them to reuse and revise. | **New formula** · Start from an example |
| Saved formulas | Search has no match | No formulas match "xyz". | — | **Clear search** |
| Saved formulas | Archived filter, none archived | No archived formulas. | Archived formulas are kept here until you restore or delete them. | **Show active formulas** |
| Material library | Empty | No materials yet. | Add the waxes, oils, wicks and vessels you use. | **Add material** |
| Material library | Type filter has none | No {type} yet. | — | **Add {type}** |
| Material picker | Library has none of that type | — | — | First row is "Add a wax" / "Add an oil" |
| Results panel | Inputs incomplete or invalid | — | Results appear when the batch size, fragrance percentage and wax are filled in. | — (text only, no numbers) |
| Formula page | No measured weights | — | Enter all measured weights to see the actual blend. | — (the fields are the action) |
| Backup | Never backed up | No backup yet. | — | **Export backup** |
| Restore | Invalid file | This file can't be restored | The specific reason. Nothing was changed. | **Choose another file** |
| Any | Storage blocked | This browser can't store data right now. | What to try. The calculator still works without saving. | — |

Exact wording comes from `src/lib/messages.ts`.

## 6. Dark mode (D-15)

Both themes are defined in the same token names, so no screen is styled twice. v0.1 follows `prefers-color-scheme`. There is no in-app toggle. Do not add a `.dark` class strategy. Tailwind's `dark:` variant follows the media query, but screens should not need it: use tokens.

Surfaces are near-black and warm, never `#000`. Text is warm white at 92%, 66% and 52%. The accent is lighter and less saturated and carries dark text. Hairlines are low-alpha warm white.

## 7. UX Playbook final checklist (design level)

| Check | Result |
| --- | --- |
| No horizontal page scroll at 375px, tables become cards | Specified in sections 2 and 4. Verified per screen in T23 to T25 |
| Inputs at least 16px | Enforced globally in `globals.css` |
| Tap targets 44px on touch | Enforced globally for `pointer: coarse` |
| Hover-only content has a touch home | Row actions live in a visible "…" menu (FLOW-11) |
| Nothing under the bottom bar | Content padding equals bar height plus the safe area |
| No gradients or gradient text, one accent | Yes |
| Shadows only on floating layers | Yes |
| Tabular numbers, consistent radius, no nested cards | Yes |
| Dark mode not pure black | `#14120F` |
| Every empty state has an action | Section 5 |
| No double-submit path, every save shows its state | Button and status pill rules in section 4 |
| Destructive actions confirmed by name | Dialog rule, FLOW-09 |

Screen-level results are recorded in the development handoff after T25.
