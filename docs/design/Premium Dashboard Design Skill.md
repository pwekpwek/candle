# Premium Dashboard Design Skill

## Purpose

Design and build a dashboard that looks and behaves like a polished commercial SaaS product. One skill with five modes: full blueprint, animated charts, dark mode, empty states, and a build roadmap.

## When to Use

- Starting a new dashboard or app shell and the visual system is still open.
- Adding charts, a dark theme or empty states to an existing dashboard.
- Planning the order of work for a dashboard build.

Use it together with [[AI/Skills/UX Playbook Skill|UX Playbook]], which holds the detailed interface rules. This skill decides **what to produce and in what order**. The UX Playbook decides **what good looks like**.

## Source

Five prompt templates supplied by the owner on 2026-11-14, numbered 1, 2, 3, 5 and 7 in the original set. Items 4 and 6 were not supplied. Item 7 mentions loading animations, so one of the missing items may cover them, but that is not confirmed. The original prompts are kept word for word under Master Prompts.

These are source-derived guidelines, not tested outputs.

## Required Inputs

- The product or app, its users, and the two or three decisions the dashboard must help them make.
- Existing brand direction, if any: palette, typography, reference images.
- The real metrics and data shapes (for charts), with realistic sample values.
- The feature list, so every empty list and first-run screen is known (for empty states).
- The stack and component library in use.
- Supported screen widths. Default: desktop and 375px.

If the brand direction or metrics are missing, say so and propose defaults. Do not invent metrics.

## Rules

- **Premium means restraint.** The expensive look comes from spacing, alignment, type hierarchy and consistency. It does not come from gradients, glow, glass effects or decoration.
- **The UX Playbook wins on any conflict.** One flat accent colour, one dominant metric, shadows only on floating layers, no nested cards, tabular numbers, no gradient text.
- **Tokens before screens.** Define colour, type, spacing, radius and elevation as named tokens first. Every component uses tokens, never raw values.
- **Light and dark are designed together** from the same token names, so a screen never has to be restyled twice.
- **Accessibility is part of polish.** Text contrast at WCAG AA, visible focus, colour never the only signal, motion disabled under `prefers-reduced-motion`.
- **Motion has a job.** Animate to show where something came from or that data changed. Keep it under about 400 ms. Never loop, bounce or delay access to content.
- **Charts tell one thing each.** Zero baseline for bars, one accent with the rest grey, direct labels instead of a legend where possible, a table or small multiples past five series.
- **Every empty state has an action.** One line that says what belongs here, and a button that adds the first item.
- **Check at 375px** before calling any screen done.
- **Be honest about time.** A 30-minute roadmap produces a credible first pass from ready-made components. It does not produce a finished product. Say what the first pass will and will not include.
- **Code must run.** When a mode asks for code, deliver complete components with realistic sample data, not fragments.

## Workflow

Pick the mode that matches the request. For a new dashboard, run them in this order.

### Mode 1 — Blueprint

1. State the users and the decisions the dashboard supports. Pick the one headline metric.
2. Lay out the structure: navigation, page header, primary region, secondary region, and how each collapses on a phone.
3. Set the visual hierarchy: what the eye reaches first, second and third.
4. Define tokens: palette (neutrals, one accent, status colours), type scale of about six sizes and two weights, spacing scale, radius, elevation.
5. List the components and their states: navigation, cards, tables, forms, buttons, dialogs, toasts.
6. Set chart styles, if the dashboard has charts.
7. Write the implementation sequence.

### Mode 2 — Animated charts

1. Confirm each metric, its unit and its real data shape. Choose the chart form by the question it answers.
2. Build with the project's chart library, or plain SVG for simple cases.
3. Add entrance animation once on first view, interactive tooltips reachable by keyboard and touch, and responsive sizing.
4. Add loading, empty and error states for each chart.
5. Respect reduced motion and check both themes.

### Mode 3 — Dark mode

1. Start from the light tokens. Give every token a dark value.
2. Surfaces are near-black, never pure black. Lighter surface means higher elevation.
3. Three tiers of text at roughly 92%, 65% and 45% white.
4. Desaturate and slightly lighten the accent. Borders are low-alpha white hairlines.
5. Shadows barely show on dark, so use surface steps and borders for depth.
6. Check contrast for text, focus rings, charts and status colours. Dim photos slightly.

### Mode 5 — Empty states

1. List every place that can be empty: first run, no results, filtered to nothing, error, no permission.
2. For each, write one line saying what belongs here, and the action that fills it.
3. Use a small icon or simple illustration in the same style everywhere. Skip it when space is tight.
4. First-run states may offer an example or template. "No results" states offer a way to clear the filter.
5. Keep layout, type and button placement identical across all empty states.

### Mode 7 — Build roadmap

1. Sequence: tokens and theme, shell and navigation, primary screen, data components, charts, dark mode, empty states, loading states, responsive pass.
2. Name the component to use for each step.
3. State what a first pass in the available time includes, and what needs a second pass.

## Output Structure

| Mode | Deliverable |
| --- | --- |
| Blueprint | Layout description, hierarchy, token table, component list with states, chart style notes, numbered implementation plan |
| Animated charts | Complete components with sample data, plus notes on states and reduced motion |
| Dark mode | Token table with light and dark values, component style notes, contrast results |
| Empty states | Table of every empty state: where, message, action, icon |
| Build roadmap | Ordered steps with component per step, time per step, and what is left for later |

End every run with the UX Playbook final checklist.

## Master Prompts

Original wording, preserved. Replace the bracketed text.

**1. Premium dashboard blueprint**

> Act as a senior UI/UX designer. Create a complete dashboard blueprint for [MY APP OR PRODUCT] with the look and feel of a $30,000 SaaS product.
> Define the layout, visual hierarchy, color palette, components, chart styles, and step-by-step implementation plan.
> Make it modern, intuitive, polished, and production-ready.

**2. Animated data visualization builder**

> Act as a data visualization expert. Build animated charts for [MY METRICS] on my dashboard.
> Include smooth entrance animations, interactive tooltips, responsive sizing, and polished styling.
> Provide complete, functional, production-ready code.

**3. Premium dark-mode dashboard designer**

> Act as a senior UI designer. Create a premium dark-mode dashboard for [MY PRODUCT].
> Define the exact color palette, backgrounds, typography, contrast, borders, shadows, and component styles.
> Ensure the interface is consistent, accessible, and visually polished.

**5. Professional empty-state designer**

> Act as a UX designer. Create professional empty states for [DASHBOARD FEATURE].
> Include engaging messages, helpful illustrations or icons, clear calls to action, and guidance for users.
> Make every empty state feel intentional, useful, and visually consistent.

**7. Complete dashboard build roadmap**

> Act as a SaaS product designer and frontend architect. Create a 30-minute build roadmap for [MY DASHBOARD].
> Cover the layout, navigation, charts, dark mode, empty states, and loading animations.
> Provide the implementation sequence, recommended components, and realistic expectations for achieving a polished result.

## Related

[[AI/Skills/UX Playbook Skill|UX Playbook]] · [[AI/Skills/Development Workflow Skill|Development Workflow]] · [[AI/Skills/Index|Skills Index]]
