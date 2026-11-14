# UX Playbook Skill

## Purpose

One set of defaults for building interfaces that work on phones, don't look AI-generated, and behave correctly. Covers mobile/responsive layout, first-run experience, visual polish, interaction states, and common component patterns, with a final review checklist.

## When to Use

Whenever building, reviewing, restyling or fixing any app or web UI: layouts, mobile, onboarding, dashboards, landing/pricing pages, buttons and states, forms, tables and other common components. Apply the matching sections without being asked; when reviewing existing UI, go through the Final Checklist.

## Installed Version

- Claude skill: `ux-playbook` (call with `/ux-playbook` or "use the UX playbook").
- Approved 2026-10-27 as one grouped skill. It replaces five earlier separate Claude skills: mobile-responsive-ux, first-run-ux, de-ai-visual-polish, interaction-states, ui-component-patterns.

## Source

Adapted from the UX lessons in the Reels of the Facebook page **Design Motion** (designmotionhq, 34K followers), all 50 reels loaded on 2026-10-27. Rules are rewritten in our own words with implementation details added. Research findings: [[Chat Sessions/2026-10-27 - Design Motion Reels UX Study|Design Motion Reels UX Study]].

These are source-derived guidelines, not tested outputs.

## Playbook

### 1. Mobile and responsive

Most AI-built apps are designed at laptop width and break on a phone. Check every screen at **375px wide** before calling it done.

#### Tables on a phone (restructure, don't shrink)
A 6-column table at 375px forces a sideways swipe, and users never find the hidden columns.
- **Rank** the columns: decide which 2-3 drive a decision.
- **Stack** each row into a card below ~640px: primary field as the title, key fields as label/value pairs, actions at the bottom.
- **Slot** secondary values into fixed positions (top right for status or amount, a subtitle line for the rest).
- **Label** values inside the card, since the header row is gone.
- **Reveal** the remaining columns in a detail view or expandable row.
- **Breakpoint** deliberately: switch layouts at a set width, not by squeezing.
- Never rely on horizontal scroll for core data.

#### Inputs are at least 16px
iOS Safari zooms the whole page when the user focuses an input with a font size under 16px, and doesn't zoom back out.
- Set `font-size: 16px` (or larger) on every `input`, `select` and `textarea` at mobile widths.
- Do not fix this with `maximum-scale=1`; that blocks accessibility zoom.
- Add the right keyboard: `inputmode="numeric"`, `"decimal"`, `"email"`, `"tel"`, plus `autocomplete` values (`cc-number`, `one-time-code`, `email`, `name`) and `enterkeyhint="next"` / `"done"`.

#### Touch targets are 44px on touch devices only
```css
@media (pointer: coarse) {
  button, a, [role=button], input[type=checkbox] { min-height: 44px; min-width: 44px; }
}
```
Keep at least 8px between adjacent tap targets. Pad the hit box, not the icon.

#### Hover is dead on touch
- Phones fake a sticky hover on tap. Wrap hover styles in `@media (hover: hover) { ... }`.
- Anything shown only on hover (row actions, card buttons) needs a real home on touch: visible by default or in a kebab menu.

#### Bottom bars clear the home indicator
- Add `viewport-fit=cover` to the viewport meta tag.
- Pad fixed bottom elements: `padding-bottom: calc(12px + env(safe-area-inset-bottom));`
- Leave matching bottom padding on scrolling content so the last item isn't hidden behind the bar.

#### Big numbers stay on one line
- Use `white-space: nowrap` and scale with `font-size: clamp(...)`, or abbreviate (€5.3M) at small widths.
- In KPI grids, drop to 2 columns (not 4) below ~480px.

### 2. First run

A new user decides in the first minute whether the app is worth it. Replace tours and walls of prompts with small, well-timed defaults.

#### Onboarding: build the first run, not a tour
1. **One question before value.** Ask only the single question that personalizes the app (e.g. "What are you saving for?"), with an obvious skip.
2. **Checklist starting at 1 of 3.** The first item is already done (account created). Progress that has started gets finished.
3. **Empty states with a button.** Never show a blank list. Explain what goes here in one line and give the action to add the first item.
4. **One coach mark, near the trigger.** At most one tip, pointing at the control it describes, shown when relevant.
5. **Skip that remembers.** Keep progress and let the user resume from the checklist later.

#### Blank documents and editors
1. **Cursor starts in the title.** Autofocus the title on creation.
2. **Secondary actions wait for hover** (icon, cover, comment), so the page stays calm.
3. **One grey hint line,** like "Press '/' for commands".
4. **Pale placeholder text** that disappears the moment the user types.
5. **Starting points that fold away.** Offer 3-4 templates on an empty doc; hide them on the first keystroke.

#### Permission prompts: you get one real shot
1. **Ask right after the related action,** never on launch.
2. **Show your own card before the system dialog** (a soft ask), so a "no" doesn't burn the system prompt.
3. **Say what they get,** concretely: "Get a reminder at 8 pm", not "Enable notifications".
4. **Provide a way back.** If permission is off, show what's missing and a button that links to Settings.
5. **One permission at a time, when needed.** Ask for the camera when the user taps Scan.

### 3. Visual polish (de-AI the look)

AI-built UIs share recognizable tells: purple gradients, glowing blobs, four identical KPI tiles, shadows on everything, emoji greetings, adjective headlines.

#### Dashboards
1. **One flat accent.** No decorative gradients. Grey UI, one brand color for what matters.
2. **The number is the hero.** Drop colored icon tiles beside KPIs.
3. **One primary, three secondary.** One large headline metric, smaller supporting ones.
4. **Shadow only on what floats.** Menus, popovers and dialogs get shadows; page cards use a hairline border or nothing.
5. **Copy with a shape.** Replace "Welcome back, Jordan 👋" with the insight: "Revenue up 12% this week, driven by Pro plans."

#### Landing pages
1. **Outcome-first headline in plain text.** "Close the month in one afternoon", not "Supercharge your workflow with AI". No gradient text.
2. **Color goes on the product,** not a purple blob behind the hero. Show a real product screenshot.
3. **One primary button** plus a text link ("See how it works →").
4. **One specific quote beats a logo wall:** name, role, and a result with a unit.
5. **Show the product,** not three icon cards saying Fast / Secure / Easy.

#### Pricing pages
Highlight one recommended tier, make differences scannable, use a monthly/annual toggle that shows the saving, keep badges to one, give each tier a specific button label.

#### Dense, expensive-feeling tools (Linear style)
Compact density, tabular numbers, one accent color, full keyboard support with visible shortcuts, strict grid alignment.

#### Typography
- A fixed size scale (~6 sizes), 2 weights (regular + semibold), tighter tracking on large headings, looser on small caps labels.
- Line height ~1.5 for body, ~1.1-1.2 for headings; body measure 60-75 characters.
- Text color in 3 tiers (primary, secondary, muted).
- `font-variant-numeric: tabular-nums` anywhere numbers are compared or update live.

#### Number formatting
- Tabular figures; right-align numbers, left-align text.
- Relative time for recent events ("2h ago"), absolute dates for older ones, full timestamp on hover.
- Pin the currency symbol and align decimals in columns.

#### Border radius
- Radius scales with element size.
- Nested: inner radius = outer radius − padding. Focus rings: outer radius = inner + gap.
- No radius on edges that touch the container or screen edge.
- Let the card clip its image (`overflow: hidden`).

#### Cards
One card per entity. One treatment (border OR shadow OR background). Whole card is the click target when it has one action. Never nest cards. Fixed media aspect ratio. Deliberate dark-mode version.

#### Dark mode
1. Near-black surfaces (e.g. #0f1115), never pure #000.
2. Lighter surface = higher elevation.
3. Three tiers of white text (~92%, ~65%, ~45% opacity).
4. Desaturate and slightly lighten the accent.
5. Hairlines as alpha white (`rgba(255,255,255,.08)`).
6. Dim photos (`filter: brightness(.9)`); redraw illustrations for dark.

### 4. Interaction states

Most bugs users feel are state bugs: double charges, silent saves, buttons that won't say why they're off.

#### Critical submit buttons (no double submit)
1. **One intent, one request.** On the first tap, mark the button busy and ignore further taps.
2. **Spinner in place, width locked.**
3. **Guard it beyond the UI** with an in-flight flag and an idempotency key.
4. **Resolve to a check or an error,** never back to idle silently.
5. **Re-enable on the response,** not on a timer.

#### Disabled vs busy
- A `disabled` button drops out of tab order and can't show a tooltip, so users never learn why.
- Prefer keeping the button live: on click, validate and explain what's missing (focus the first problem field).
- If it must look unavailable, use `aria-disabled="true"` plus visible explanation text.
- Busy is not disabled: use `aria-busy` during work.

#### Behind a click
Validate on the client, then send. The server re-validates (never trust the client). Write in a transaction (all or nothing). Render the server's response as the truth. For speed, update optimistically, then reconcile or roll back with a message.

#### Copy to clipboard
Flip to a check instantly, hold ~2s, fade back. Copy the raw value. Announce "Copied" via `aria-live`. If the Clipboard API is unavailable, fall back to selecting the text; never fake success.

#### Autosave
Debounce (~800ms). Status pill as a state machine: Saving… → Saved → Offline (queued) → Error with retry. Queue offline edits and replay in order. Detect two-tab conflicts. Warn with `beforeunload` only while unsaved changes exist.

#### Bulk actions
Tri-state header checkbox. "Select all" selects the page, then offers "Select all 247". Shift-click selects a range. Selection persists across pages. Destructive actions echo the count ("Delete 12 members") and offer undo.

#### Settings pages
One apply model per section (instant or explicit Save). Clear groups; search past ~20 settings. Mark changed values. Danger zone with type-to-confirm.

#### Success screens
Be specific ("Invoice sent to Northwind Labs, €3,450"), give the next step as a button, show what's at stake ("Due Oct 12"), close the loop, and save celebration for rare milestones.

#### Notification badges
Pinned to the icon corner. Dot for "new", number only when the count matters, capped at 99+. One signal per row. Opening clears it. Animate count changes; never blink. Badge only what needs a decision.

#### Scroll position
Restore scroll on Back. Use `scroll-margin-top` so sticky headers don't hide anchor targets. Keep footer links reachable with infinite scroll.

### 5. Component patterns

#### Search (travel/booking style)
Full-screen sheet on mobile; one step at a time (where → when → who) with completed steps collapsing to a tappable summary; live count on the button ("Show 248 stays"); Map/List pill in the thumb zone; recent searches as the empty state.

#### Command palette (feels instant)
Cached results first, refreshed in place; thin progress line instead of a spinner; bottom action bar with the primary action and shortcut; secondary actions in a side panel; blur the background rather than dim it.

#### Forms
1. **Real labels above fields.** Placeholders are not labels.
2. **Scold late, praise early.** Validate on blur; clear errors on the next keystroke once fixed.
3. **Submit stays reachable;** on submit, focus the first invalid field.
4. **Support autofill** with correct `autocomplete` and `name`.
5. **Right keyboard per field.**

#### Checkout
Order summary visible beside the form, card brand shown on the first digit, validate on blur, wallets above the card form, one column with labels above fields.

#### Selection controls
Switch = takes effect immediately. Checkbox = multiple choices or saved on submit. Radio = one of several, all visible. Segmented control = 2-4 options that switch a view. Whole row is the tap target.

#### Modal vs sheet vs drawer
Modal for short blocking decisions, bottom sheet on mobile, side drawer for editing alongside content. Sheets get snap points and flick-to-dismiss; drawers cap at ~400-480px; never stack sheets.

#### Charts
Zero baseline for bars; one accent color, rest grey; direct labels instead of a legend; small multiples or a table past 5 series; annotate spikes and dips.

#### Data tables
Numbers right, text left. One hairline between rows, hover highlights. Density toggle. Sticky header (and first column when wide). Truncate with ellipsis and tooltip; never wrap. Row actions on hover/focus, kebab on touch. Sort arrow only on the active column.

#### Real data (names, emails, long words)
Flex children need `min-width: 0` or the ellipsis never fires. Truncate the middle of emails and filenames. Tabular numbers so values don't twitch. `overflow-wrap: anywhere` for long unbroken strings.

#### File and folder trees
Indent with guide lines; rotate the chevron (~150ms) instead of swapping icons; full arrow-key support; lazy-load children inline; spring-load folders while dragging (~600ms).

#### Kanban
Lift the card on drag, leave a placeholder, WIP limits on columns, collapsible columns, swimlanes.

#### Calendar week view
"Now" line; overlapping events side by side; snap to 15 minutes; color stripe per calendar; height = duration; all-day events pinned on top.

#### Chat UI
Group consecutive messages, optimistic send with pending state, typing indicator, timestamps at group boundaries (exact on hover), scroll anchored to bottom unless the user scrolled up, growing composer.

#### AI prompt input
Focus ring instead of a border swap; grows with text while the toolbar stays put; uploads as in-place chips with progress; suggestion chips when empty; Send disabled when empty and becomes Stop while generating.

#### Voice message button
Instant feedback on press, slide past a cancel line to delete, slide up to lock, live waveform (flat line = muted mic), scrubbable playback with 1.5x speed.

#### Avatars
Image → initials → icon fallback; deterministic color from the name; two initials; overlapping stacks capped ("+3"); presence dot on the ring.

#### Resizable panels
Wide grab zone, min/max clamp, snap open or collapsed past a threshold, overlay during drag, resize cursor on the body, size persisted across reloads.

#### Pull to refresh
Threshold, resistance, stretch turns into the spinner, haptic tick at the threshold, overshoot then settle, list stays scrollable.

#### Page transitions
View Transitions API: shared `view-transition-name`, unique per list item, root wipe for full pages, grow from the tapped button, cross-document where supported.

#### CSS `:has()` for state without JavaScript
`.plan:has(:checked)` highlights the selected card, `.field:has(:user-invalid)` styles the whole field, `.app:has(aside)` adjusts layout, `body:has(dialog[open])` locks page scroll.

## Final Checklist

**Mobile (at 375px):** no horizontal page scroll, no table needing a swipe, no input under 16px, tap targets 44px+, hover-only content has a touch home, nothing under the bottom bar, no wrapped numbers.

**First run:** no tour longer than one tip, no blank list without an action, title focused on new docs, no permission asked before the related action.

**Visual:** no gradient blobs or gradient text, one accent, one dominant KPI, shadows only on floating layers, tabular numbers, consistent radius, no nested cards, dark mode not pure black.

**States:** no double-submit path, every disabled control explains itself, every save shows its state, destructive actions have undo or confirmation, success screens offer a next step.

Back to [[AI/Skills/Index|Skills Index]].
